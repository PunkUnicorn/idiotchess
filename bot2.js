////const TAFFY = require('taffy');

////var games = TAFFY();

////function dbMakeKey(userid, channelid) {
////    return [userid, channelid].join("-");
////}

////function dbAddGameAuthor(authorid, channelid, stuff) {
////    if (typeof stuff === 'undefined') stuff = {};
////    const key = dbMakeKey(authorid, channelid);
////    games.insert({
////        key,
////        isAuthor: true,
////        channelid,

////        authorid
////    }).update(stuff);
////}

////function dbUpdateGameTarget(authorid, channelid, targetid, targetStuff) {
////    if (typeof targetStuff === 'undefined') targetStuff = {};

////    const targetkey = dbMakeKey(targetid, channelid);
////    const authorkey = dbMakeKey(authorid, channelid);

////    games.insert({
////        key: targetkey,
////        isAuthor: false,
////        channelid,

////        targetid,
////        authorkey
////    }).update(targetStuff);

////    games({ key: authorkey })
////        .update({ targetid, targetkey })
////}

/////* updates all properties for where this user is an author or target */
////function dbUpdateForGame(userid, channelid, game) {
////    if (typeof game === 'undefined') game = BLANK_GAME;
////    games( dbGetGameUserKeys(userid, channelid) ).update(game);
////}

/////* gets all game rows where the user is an author or target */
////function dbGetGameUserKeys(userid, channelid) {
////    const findKey = { key: dbMakeKey(userid, channelid) };

////    const keys = games(findKey)
////        .select('authorkey', 'targetkey', 'key')[0]
////        .filter(f => typeof f !== 'undefined');

////    return keys;
////}

/////* updates individual user properties e.g. */
////function dbUpdateForUser(userid, channelid, updates) {
////    const key = dbMakeKey(userid, channelid);
////    games({ key }).update(updates);
////}

/////* removes all traces of the game a user is an author or target of */
////function dbRemoveGame(userid, channelid) {
////    games(dbGetGameUserKeys(userid, channelid)).remove();
////}

////function pretty(data) {
////    return JSON.parse(data().stringify());
////}

////function runTests() {
////    dbAddGameAuthor(1, 20, { stuff: 'stuff1' });
////    dbUpdateGameTarget(1, 20, 300, { targetstuff: 'targetstuff1' });
////    console.log('\n', 'first', pretty(games));

////    dbAddGameAuthor(4, 50, { stuff: 'stuffA' });
////    dbUpdateGameTarget(4, 50, 600, { targetstuff: 'targetstuff2' });
////    console.log('\n', 'second', pretty(games));

////    dbAddGameAuthor(7, 80, { stuff: 'stuff()' });
////    console.log('\n', 'third', pretty(games));

////    const gamekeys = dbGetGameUserKeys(1, 20);
////    console.log('\n', 'gamekeys 1, 20', gamekeys);
////    console.log('\n', 'games for keys', gamekeys.join(" and "), JSON.parse(games({ key: gamekeys }).stringify()));

////    dbUpdateForUser(4, 50, { stuff: 'NOT STUFFA' });
////    console.log('\n', 'gamekeys 4, 50', pretty(games));

////    console.log('\n', '--------------------------- >-8 ------------------------------', '\n');


////    process.exit(0);
////    return 0;
////}

//runTests();
const repo = require('./libOldBookRepository.js');

//const Discord = require('discord.io');
const logger = require('winston');
const Chess = require('./chess.js').Chess;
const chessy = require('./chessy.js')

const Discord = require('discord.js');

var auth = null;
try {
    auth = require('./../auth.json');
}
catch (error) {
    auth = require('./auth.json');
}

repo.runTests();

/* note these suit of functions to be promoted to own file and required('./...')'d in */



function debugDump(bot, channelID, shitToDump) {
    console.log('debugDump', shitToDump, 'channelID', channelID);
    
    //bot.channels
    //    .find('id', channelID)
    //    .send(JSON.stringify(shitToDump));
}



/* Negociation types */
const NT_GAME = 1, NT_DRAW = 2, NT_MODECHANGE = 3;

/* Negociation state */
const NS_INVITED = 1, NS_ACCEPTED = 2, NS_REJECTED = 3;


function endOpenedNegociations(bot, xgameData, newgame) {
    // it's gone sour, cold war begins
    const msg = '<@!' + newgame.data.userID  + '> to <@!' + newgame.data.target.id + '>';
    debugDump(bot, newgame.data.channelID, { warning:'negociation has timed out between: ' + msg });

    bot.channels.find('id', newgame.data.channelID)
        .send('Invite from ' + msg + ' has timed out.')
        .then(function (result) {
            result.react(broken_heart)
                .then(function (resukt) {
                    // close the negociations (remove game obj etc)
                    removeGame(bot, gameData, newgame.key);
                });            
            
        }).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });
    
}

function closeGame(bot, gameData, closerID, game) {
    const msg = '<@!' + game.data.userID + '> and <@!' + game.data.target.id + '>';
    const entireMsg = 'Game between ' + msg + ' has been cancelled by ' + '<@!' + closerID + '>';
    debugDump(bot, game.data.channelID, { warning: entireMsg });

    bot.channels.find('id', game.data.channelID)
        .send(entireMsg)
        .then(function (result) {
            result.react(broken_heart);

            // close the negociations (remove game obj etc)
            removeGame(bot, gameData, game.key);
        }).catch(function (error) { debugDump(bot, game.data.channelID, error); });
}

function isExistingGameSameAsNewGame(newgame, existingGame) {
    return existingGame !== null && typeof existingGame !== 'undefined' && existingGame.key === newgame.key;
}

function flipYourShit(newgame, error) {
    debugDump(bot, newgame.data.channelID, {
        error: 'cant send challenge message from <@!' + newgame.data.target.id + '> to <@!' + newgame.data.userID + '>',
        sorryDaveICantLetYouDoThat: true
    });
}

/* destroy the invite timer, and also optionally update the properties in the last parameter while setting the timer to null */
function destroyInviteTimer(channelid, messageauthorid, alsoupdatethese) {
    if (typeof alsoupdatethese === 'undefined') {
        alsoupdatethese = {};
    }

    const user = repo.dbGetForUser(messageauthorid, channelid);

    if (user.timer !== null) {
        clearInterval(user.timer);
        alsoupdatethese.timer = null;
        repo.dbUpdateForUser(channelid, messageauthorid, alsoupdatethese);
    }
}

function cancelGameNegociation(channelid, messageauthorid, optionalGameKeysInThisChannel) {
    const game = typeof gameKeysInThisChannel === 'undefined'
        ? repo.dbGetGame(repo.dbGetGameUserKeys(channelid, messageauthorid))
        : repo.dbGetGame(optionalGameKeysInThisChannel);

    return tellUsers(
        channelid,
        [messageauthorid, game.targetid],
        'Invitation cancelled by <@!' + messageauthorid + '>',
        broken_heart);
}

function timeoutOpenedNegociations(message, channelid, messageauthorid, targetid) {
    const timeoutMsg = 'Invitation timedout';
    return tellUsers(channelid, [messageauthorid, target], timeoutMsg, broken_heart, message);
}

function openGameNegociation(message, channelid, messageauthorid, targetid, invitetimeoutmins) {

    return message.react(love_letter)
        .then(function (reaction) {
            // Invite message
            message.channel
                .send('<@!' + targetid + '> You have been challenged by <@!' + messageauthorid + '>, do you accept?')
                .then(function (challengeMessage) {

                    // OK accept emojii
                    challengeMessage.react(ok)
                        .then(function (okEmojiReaction) {

                            // Cross reject emoji
                            challengeMessage.react(cross3)
                                .then(function (crossEmojiReaction) {

                                    // Timeout timer
                                    const timer = setInterval(
                                        function (channelid, messageauthorid, targetid) {
                                            destroyInviteTimer(channelid, messageauthorid);
                                            timeoutOpenedNegociations(message, channelid, messageauthorid, targetid)
                                                .catch(console.log);
                                        }, invitetimeoutmins * 1000 * 60, channelid, messageauthorid, targetid);

                                    const challengemessageid = challengeMessage.id;
                                    const acceptemojireactionname = okEmojiReaction.emoji.name;
                                    const rejectemojureactionname = crossEmojiReaction.emoji.name;

                                    console.log('okEmojiReaction', okEmojiReaction);

                                    const newGameDataObj = {
                                        challengemessageid,
                                        acceptemojireactionname,
                                        rejectemojureactionname
                                    };

                                    console.log('newGameDataObj', newGameDataObj);

                                    repo.timerAdd(channelid, messageauthorid, timer);
                                    repo.dbAddGameAuthor(messageauthorid, channelid, newGameDataObj);
                                });
                        })
                });
        });
        //.catch(console.log);
}

function tellThemTheListOfGames(bot, xgameData, moveObjs) {
    const allTheirGames = gameData_getGamesForUser(bot, gameData, moveObjs.userID);
    const displayTheirGamesInProgress
        = allTheirGames
            .map(function (val) {

                const channel = bot.channels
                    .find(f => f.id == val.data.channelID)
                    .name;

                const target = val.data.target !== null
                    ? bot.users
                        .find(f => f.id == val.data.target.id)
                        .username
                    : 'N/A';

                return target + ' in ' + channel + ((moveObjs.channelID === val.data.channelID) ? ' <-- *You are here*' : '');
            });
    
    const msg = '*List:*  ' + displayTheirGamesInProgress.join(", ");
    bot.channels.find('id', moveObjs.channelID)
        .send(msg)
        .then(function (result) {
            result.react(information).catch(function (error) { debugDump(bot, moveObjs.channelID, error); });
        })
        .catch(function (error) { debugDump(bot, moveObjs.channelID, error); });
}

function tellUser(channelid, tellthisuserid, speak, optionalemoji, optionalmessage) {

    const channel = typeof optionalmessage === 'undefined'
        ? bot.channels.find('id', channelid)
        : message.channel;

    return channel.send('<@!' + tellthisuserid + '> ' + speak)
        .then(function (messageresult) {
            if (typeof optionalemoji !== 'undefined') {
                messageresult.react(optionalemoji);
            }
        })
        //.catch(console.log);
}

function tellUsers(channelid, userid_array, speak, optionalemoji, optionalmessage) {

    const channel = typeof optionalmessage === 'undefined'
        ? bot.channels.find('id', channelid)
        : message.channel;

    const addressStr = '<@!' + userid_array.join('> and <@!') + '>, ';

    return channel.send(addressStr + speak)
        .then(function (messageresult) {
            if (typeof optionalemoji !== 'undefined') {
                messageresult.react(optionalemoji);
            }
        });
        //.catch(console.log);
}


function showBoard(bot, gameData, existingGame) {
    bot.channels.find('id', existingGame.data.channelID)
        .send('```' + existingGame.chessjs.ascii() + '```')
        .catch(function (error) { debugDump(bot, existingGame.data.channelID, error); });
}

function chessyInfo(bot, gameData, channelID, userID, infoThing, fen) {
    const infoString = JSON.stringify(chessy.getInfo(fen, [infoThing]), null, '\t');

    bot.channels.find('id', channelID)
        .send('*Info for* **' + infoThing + '**' + '```' + infoString + '```')
        .catch (function (error) { debugDump(bot, inviteMessageGame.data.channelID, error); });
}

////function parseMessage(bot, messageuserid, channelid, content, allNonBotMentions, gameKeysInThisChannel) {
////    const decodeMe = content
////        .replace( /\<\@\![0-9]+\>/g, '') // remove mentions tags
////        .split(' ')
////        .filter(f => f.length > 0);

////    console.log(decodeMe);

////    var verb = '';
////    var target = (allNonBotMentions.length > 0)
////        ? allNonBotMentions[0] //only one mention is acknoledged 
////        : null;

////    /* play */
////    var restOfMessage = [];
////    var whitePlayer = null, blackPlayer = null;
////    var timeout = 1;

////    /* list mode */
////    var listThing = null;

////    /* info mode */
////    var infoThing = null;

////    var isTakeBack = false;
////    var isTimeout = false;
////    var isListMode = false;
////    var isInfoMode = false;

////    var prevTokens = [];
////    var prevToken = null;
////    decodeMe.forEach(token => {
////        const cleantoken = token
////            .toLowerCase()
////            .replace( /\!/g, '')
////            .replace( /\?/g, '')
////            .replace( /\./g, '');

////        if (cleantoken.length === 0)
////            return;


////        console.log('cleant', cleantoken);


////        if (isInfoMode) {
////            infoThing = cleantoken;
////            isInfoMode = false;
////            verb = 'info';
////        } else if (isListMode) {
////            listThing = cleantoken;
////            //verb = 'list';
////            isListMode = false;
////        } else if (isTimeout) {
////            timeout = parseInt(cleantoken, 10);
////            isTimeout = false;
////        } else if (isTakeBack) {
////            restOfMessage.push(cleantoken);
////        } else {
////            switch (cleantoken) {
////                case 'info':
////                    isInfoMode = true;
////                    verb = cleantoken;
////                    break;

////                case 'list':
////                    isListMode = true;
////                    verb = cleantoken;
////                    break;

////                case 'timeout':
////                    isTimeout = true;
////                    break;

////                case 'board':
////                case 'move':
////                case 'resign':
////                case 'draw':
////                case 'change':
////                case 'take':
////                    verb = cleantoken;
////                    break;

////                case 'undo':
////                    verb = cleantoken;
////                    isTakeBack = true;
////                    break;

////                case 'back':
////                    if (/* 'take back' */prevToken === 'take' || (/* or 'take [move|it] back' */prevTokens.length > 2 && prevTokens[1] !== 'take')) {
////                        isTakeBack = true;
////                        verb = 'undo';
////                    }
////                    break;

////                case 'play':
////                    verb = cleantoken;
////                    break;

////                case 'quit':
////                case 'cancel':
////                    verb = 'cancel';
////                    break;

////                default:
////                    restOfMessage.push(cleantoken);
////                    break;
////            }
////        } 

////        if (verb.length === 0) {
////            // if game already in play the default verb is 'move'
////            verb = (gameKeysInThisChannel.length > 0) ? 'move' : 'play';
////        }

////        // for newgames, see if the player side colour has been specified
////        if (verb === 'play') {
////            if (token === 'black') {
////                whitePlayer = target.id;
////                blackPlayer = messageuserid;
////            } else if (token === 'white') {
////                whitePlayer = messageuserid;
////                blackPlayer = (typeof target === 'undefined' || target === null)
////                    ? null
////                    : target.id;
////            }
////        }

////        prevToken = cleantoken;
////        prevTokens.push(cleantoken);
////    });

////    if (whitePlayer === null) {
////        whitePlayer = messageuserid;
////    }

////    if (blackPlayer === null) {
////        blackPlayer = (typeof target !== 'undefined' && target !== null)
////            ? target.id
////            : null;
////    }

////    return {
////        messageuserid, 
////        channelid, 
////        targetid: (target == null) ? null : target.id, 

////        restOfMessage, /* almost everything else from the message (after taking out at least the verb and user mentions) */
////        verb, /* command verb gleamed from the chat message */

////        /* Then depending on verb... */
        
////        /* play */
////        playerwhite: whitePlayer, /* userID of the white player */
////        playerblack: blackPlayer, /* userID of the black player */
////        timeout, /* how many minuets to wait for the game challenge to be accepted */

////        /* list */
////        listThing, /* word after the word 'list' */

////        /* info */
////        infoThing /* word after the word 'info' */
////    };
////}



/* end of 'require(...)' split */




/* 
 https://ascii.co.uk/art/chess
 
 Chess pieces by Joan G. Stark
                                                     _:_
                                                    '-.-'
                                           ()      __.'.__
                                        .-:--:-.  |_______|
                                 ()      \____/    \=====/
                                 /\      {====}     )___(
                      (\=,      //\\      )__(     /_____\
      __    |'-'-'|  //  .\    (    )    /____\     |   |
     /  \   |_____| (( \_  \    )__(      |  |      |   |
     \__/    |===|   ))  `\_)  /____\     |  |      |   |
    /____\   |   |  (/     \    |  |      |  |      |   |
     |  |    |   |   | _.-'|    |  |      |  |      |   |
     |__|    )___(    )___(    /____\    /____\    /_____\
    (====)  (=====)  (=====)  (======)  (======)  (=======)
    }===={  }====={  }====={  }======{  }======{  }======={
jgs(______)(_______)(_______)(________)(________)(_________)


*/

const parser = require('./libParseTheMessageOnTheLeftHandSide.js');


const love_letter = '\uD83D\uDC8C';// '\u1F48C';
const tick = '✔️';//'\uD83C\uDD97';//'\u1F197';
const cross1 = '✖️';//'\uD83D\uDEAB'; //'\u2717';//
const cross2 = '✗';
const cross3 = '❌';
const broken_heart = '💔';
const hearts = '💕';
const anger = '💢';
const bell = '🔔';
const warning = '⚠️';
const exclamation = '❗';
const question_mark = '❓';
const ok = '🆗';
const large_red_circle = '🔴';
const red_triangle = '🔺';
const information = 'ℹ️';

const EMOJI_ACCEPT_GAME = ok;


//const gameData = makeGameData();


// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});

logger.level = 'debug';

var bot = null;
var botInterval = setInterval(function () {
    clearInterval(botInterval);

    try {

        // Initialize Discord Bot
        bot = new Discord.Client();
        bot.login(auth.token);


        bot.on('ready', function () {
            logger.info('Connected');
            logger.info('Logged in as: ');
            logger.info(bot.username + ' - (' + bot.id + ')');
        });

        bot.on('messageReactionAdd', function (reaction, user) {
            if (user.id === bot.user.id) return;

            const key = repo.dbGetForUser(user.id, reaction.message.channel.id)

            if (key.length === 0) {
                return;
            }

            const author = repo.dbGetGame([key])[0];
            console.log(author);

            if (typeof author === 'undefined') {
                return;
            }

            if (user.id != /* ✔️ */ author.targetid) {
                return;
            }

            const isAcceptance = reaction.id === author.acceptemojireactionid;
            const isRejection = reaction.id === author.rejectemojureactionid;

            if (isAcceptance) {
                //it's ON!
                const chessjs = inviteMessageGame.chessjs = new Chess();
                reaction.message.channel.send("It's ON!")
                    .then(t => reaction.message.channel.send('```' + chessjs.ascii() + '```'))
                    .catch(function (error) { debugDump(bot, inviteMessageGame.data.channelID, error); })
                    .then(function () {
                        clearInterval(inviteMessageGame.data.timer);
                        inviteMessageGame.data.timer = null;
                        gameData_setGameState(bot, gameData, inviteMessageGame.key, NS_ACCEPTED);

                        const debugGame = gameData_getGamesForUserInThisChannel(bot, gameData, user.id, inviteMessageGame.data.channelID);
                        debugDump(bot, reaction.message.channel.id, { 'reactionComlete': true, dump: debugGame });
                    });
            } else if (isRejection) {
                cancelGameNegociation(reaction.message.channe.id, author.authorid);
            }
        });

        bot.on('message', function (message) {
            if (message.author.id === bot.user.id)
                return;

            const botMentions = message.mentions.users.filter(m => m.id === bot.user.id).array();

            // if this function is not applicable then get out of here ASAP, and don't clog up the indenting on your way out
            if (typeof botMentions === 'undefined' || botMentions === null || botMentions.length === 0) {
                return;
            }

            const messageauthorid = message.author.id;
            const channelid = message.channel.id;
            const content = message.content;

            console.log(messageauthorid, channelid, content, '<-------- on message');

            const allNonBotMentions
                = message.mentions.users
                    .filter(m => m.id !== bot.user.id && m.id !== messageauthorid).array();

            const gameKeysInThisChannel = repo.dbGetGameUserKeys(messageauthorid, channelid);

            const parsedMessage = parser.parseMessage(bot, messageauthorid, channelid, content, allNonBotMentions, gameKeysInThisChannel);

            processVerb(message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);

        });
    } catch (err) {
        console.log('err:', err);
    }

}, 1000);// * 15);

function processVerb(message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage) {
    const existingGame = repo.dbGetGame(gameKeysInThisChannel);
    const isExistingGame = existingGame.length > 0;

    switch (parsedMessage.verb) {
        case 'play':
            if (!isExistingGame) {
                if (parsedMessage.targetid == null) {

                    console.log('/* they want to play but have not said with who, abort... */');

                    tellUser(
                        channelid,
                        messageauthorid,
                        'I can\'t see who you want to play with' + '\n> @' + bot.user.username + ' play @their name',
                        information,
                        message)
                    .catch(console.log);

                } else {

                    console.log('/* no existing game, start a new one: make an invite */');

                    openGameNegociation(message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout)
                        .catch(function (err) { console.log(err); });

                }
            } else if (existingGame[0].state === NS_INVITED) {
                if (existingGame[0].authorid !== parsedMessage.messageauthorid) {

                    console.log('/* they have a game invite open w/ someone else, cancel that and make a new invite */');                    

                    cancelGameNegociation(channelid, messageauthorid, gameKeysInThisChannel)
                        .then(function (result) {
                            openGameNegociation(message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout)
                                .catch(console.log);
                        })
                        .catch(function (err) { console.log(err); });

                } else if (existingGame[0].authorid === parsedMessage.messageauthorid) {

                    console.log('/* they have aready invited this person, so reset the invite to these new parameters */');

                    reOpenGameNegociation(message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage.timeout)
                        .catch(function (err) { console.log(err); });

                } else if (existingGame[0].targetid === parsedMessage.messageauthorid) {

                    console.log('/* they are the target of an open invite, accept the invite */');

                    acceptGameNegociation(channelid, messageauthorid, gameKeysInThisChannel)
                        .catch(function (err) { console.log(err); });

                } 
            } else if (existingGame[0].state === NS_ACCEPTED) {
                console.log(' /* game in flow, take \'play\' to mean move a piece */');
                parsedMessage.verb = 'move';
                processVerb(message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);
                return;
            }
            break;

        case 'cancel':
            console.log('cancel', existingGame, userID)
            if (existingGame.length > 0) {
                switch (existingGame.state) {
                    //case NS_INVITED:
                        //endOpenedNegociations(bot, gameData, existingGame);
                        //break;

                    default:
                        closeGame(bot, gameData, userID, existingGame);
                        break;
                }
            }
            break;

        case 'list':
            switch (moveObjs.listThing) {
                case 'game':
                case 'games':
                    tellThemTheListOfGames(bot, gameData, moveObjs);
                    break;
            }
            break;

        case 'info':
            if (existingGame !== null && typeof existingGame !== 'undefined' && existingGame.chessjs != null) {
                chessyInfo(bot, gameData, moveObjs.channelID, moveObjs.userID, moveObjs.infoThing, existingGame.chessjs.fen());
            }
            break;

        case 'board':
            if (existingGame !== null && typeof existingGame !== 'undefined' ) {
                showBoard(bot, gameData, existingGame);
            }
            break;

        case 'move':
            if (existingGame !== null && typeof existingGame !== 'undefined' ) {
                if (existingGame.state === NS_ACCEPTED) {
                    const cleanMoveData = getCleanMoveData(bot, gameData, moveObjs.restOfMessage);
                    if (cleanMoveData.error) {
                        //bot.send. NOT A VALID MOVE DAVE
                    }
                    movePieceBoyakasha(bot, gameData, existingGame, cleanMoveData.cleanmove);
                }
            }
            break;

        default:
            break;
    }

}

function makeDebugMoveObj(moveObjs) {
    var target = (typeof moveObjs.target !== 'undefined' && moveObjs.target !== null)
        ? moveObjs.target
        : { username: '' };

    return {
        verb: moveObjs.verb,
        target: target.username,
        restOfMessage: moveObjs.restOfMessage.join(),
        playerwhite: moveObjs.playerwhite,
        playerblack: moveObjs.playerblack,
        timeout: moveObjs.timeout
    };
}


const static = require('node-static');
const fs = require('fs');
const http = require("http");
const url = require('url');
const safeStringify = require('fast-safe-stringify');

function adminDumpGames(bot, xgameData, res, reqData) {
    res.end( safeStringify(gameData.games) );
}

function adminDumpGame(bot, xgameData, res, reqData) {
    if (reqData.query.gamekey === 'undefined') {
        res.end();
        return;
    }

    const game = gameData.games.filter(f => f.key == reqData.query.gamekey);
    res.end('<html><body style="background-color:darkslategrey; color:burlywood"><div>' +
        safeStringify(game)
        + '</div></body></html>');
}

function adminDumpLogs(bot, xgameData, res) {
    //open bot.log
    //return the file
    fs.readFile('bot.log', function (err, data) {
        res.writeHead(200, {
            'Content-Type': 'text/html'
        });
        if (!err) {
            res.write(data);
            res.end();
        } else {
            res.end('error getting log file');
        }
    });
}

function adminSpeak(bot, xgameData, res, reqData) {
    console.log('adminSpeak', reqData);
    const channel = bot.channels.filter(f => f.id == reqData.query.channelid).array();
    if (channel.length == 0) {
        console.log('length===0', reqData);
        res.end('<html><body style="background-color:darkslategrey; color:burlywood"><div>' +
            'Failed - no channelid query string parameter specified'
            + '</div></body></html>');
        return;
    }

    if (reqData.query.say === 'undefined') {
        console.log('say === undefined', reqData);
        res.end('<html><body style="background-color:darkslategrey; color:burlywood"><div>' +
            'Failed - nothing to say, cant find say query string parameter'
            + '</div></body></html>');
        return;
    }

    console.log('reqData.query.say', reqData.query.say);
    channel[0].send(reqData.query.say).catch(function (error) { debugDump(bot, reqData.query.channelid, error); });
    res.end('<html><body style="background-color:darkslategrey; color:burlywood"><div>' +
        'WINNING' + ' idiotchess said ' + reqData.query.say
        + '</div></body></html>');
}

var htmlServerInterval = setInterval(function () {
    clearInterval(htmlServerInterval);
    const staticServer = new static.Server('./public');

    http.createServer(function (request, response) {
        try {
            const reqData = url.parse(request.url, true);
            staticServer.serve(request, response, function (e, res) {

                if (e && (e.status === 404)) { // If the file wasn't found
                    console.log(reqData.pathname);
                    switch (reqData.pathname) {
                        case '/gamesdata':
                            adminDumpGames(bot, gameData, response, reqData);
                            break;

                        case '/game':
                            adminDumpPlayers(bot, gameData, response, reqData);
                            break;

                        case '/logsdata':
                            adminDumpLogs(bot, gameData, response);
                            break;

                        case '/speak':
                            adminSpeak(bot, gameData, response, reqData);
                            break;
                    }
                }
            });

            //if (request.method === 'post') {
            //    switch (reqData.pathname ) {
            //        case '/speak':
            //            adminSpeak(bot, gameData, res, reqData);
            //    }
            //}
        } catch (err) {
            console.log('http err:', err);
        }

    }).listen(8081);

    // Console will print the message
    console.log('Server running at http://127.0.0.1:8081');
}, 1000 * 30);

console.log('Waiting for the machine to warm up a bit, please wait....');


/*iotchess\bot.js:220:23)
\bot.js:584:17)
otchess\bot.js:565:13)*/