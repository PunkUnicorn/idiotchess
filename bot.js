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


function makeGameKey(userID, targetid, channelID) {
    if (typeof userID === 'undefined') { console.log('makeGameKey(', userID, targetid, channelID); }
    if (typeof targetid === 'undefined') { console.log('makeGameKey(', userID, targetid, channelID); }
    if (typeof channelID === 'undefined') { console.log('makeGameKey(', userID, targetid, channelID); }
    return [userID.toString(), targetid.toString(), channelID.toString()].join();
}

function isGameDataObj(gameDataObj) {
    return typeof gameDataObj.games !== 'undefined';
}

function isGameInstanceObj(gameInstanceObj) {
    return typeof gameInstanceObj.playerwhite !== 'undefined';
}

function makePossibleNewGame(bot, xgameData, moveObjs) {
    const gamekey = makeGameKey(moveObjs.userID, moveObjs.target.id, moveObjs.channelID);
    const game = {
        key: gamekey,
        state: NS_INVITED,
        data: moveObjs,
        scorewhite: 0,
        scoreblack: 0,
        isPlaying: gameInstance_isPlaying,
        chessjs: null//,
        //chessy: null
    };
    return game;
}

function addNewGame(bot, gameData, game) {
    gameData.games.push(game);
    return game;
}

function removeGame(bot, xgameData, key)
{
    const gamekey = key;//makeGameKey(newgame.data.userID, newgame.data.target.id, newgame.data.channelID);
    gameData.games.splice(gameData.games.indexOf(gameData.games.filter(f => f.key === gamekey)), 1);
}

function gameInstance_isPlaying() {
    if (!isGameInstanceObj(this)) { throw 'wut? gameInstance_isPlaying() function expected to be called from a gameInstance object'; }

    var game = this;

    return (game.playerwhite !== null && game.playerblack !== null);
}

function gameData_isPlayer(game, userID) {
    if (!isGameDataObj(game)) { throw 'wut? gameData_isPlayer() function expected to be called from a gameData object'; }

    if (game.playerwhite !== null && game.playerwhite == userID)
        return true;

    if (game.playerblack !== null && game.playerblack == userID)
        return true;

    return false;
}

function gameData_getGames() {
    return gameData.games;
}

function gameData_getGamesForUser(bot, xgameData, userID) {
    console.log('gameData_getGamesForUser ==================>', userID);
    console.log('gameData_getGamesForUser ==================>', gameData.games);
    return gameData.games
        .filter(f => f.data.playerwhite == userID || f.data.playerblack == userID);
}

function gameData_setGameState(bot, xgameData, key, newState) {
    for (var i = gameData.games.length - 1; i >= 0; i--) {
        if (gameData.games[i].key === key) {
            gameData.games[i].state = newState;
            return;
        }
    }
}

function makeGameData() {
    return { games: [/*playerw, playerb, moves: [], fen of current board? */] };
}

function makeGameInstance() {
    return { scorewhite: 0, scoreblack: 0, playerwhite: null, playerblack: null, isPlaying: gameInstance_isPlaying };
}

function isValidNewGame(bot, xgameData, channelID, userID, moveObjs) {
    return typeof moveObjs.target !== 'undefined' && moveObjs.target !== null &&
        typeof moveObjs.playerwhite !== 'undefined' && moveObjs.playerwhite !== null &&
        typeof moveObjs.playerblack !== 'undefined' && moveObjs.playerblack !== null;
}


function gameData_getGamesForUserInThisChannel(bot, xgameData, messageSenderUserID, channelID) {
    //console.log('gameData_getGamesForUserInThisChannel -------------->', messageSenderUserID, channelID);
    var matches = gameData_getGamesForUser(bot, gameData, messageSenderUserID).filter(f => f.data.channelID == channelID);
    //console.log('gameData_getGamesForUserInThisChannel matches -------------->', matches);
    return matches;
}

function getExistingGame(bot, xgameData, targetID, messageSenderUserID, channelID) {
    // because we limit a user to one game per channel (*1), we can use the userID and channelID to get any existing running game
    //   FIND EXISTING GAME IN gameData

    if (targetID === null) {

        var matches = gameData_getGamesForUser(bot, gameData, messageSenderUserID).filter(f => f.data.channelID == channelID);

        if (matches === 0)
            return null;

        if (matches > 1) {
            const errorMsg = { error: '{<@!>' + messageSenderUserID + '} has more than one game in this channel.', sorryDaveICantLetYouDoThat: true };
            debugDump(bot, channelID, errorMsg);
            throw 'throwing up with ' + JSON.stringify(errorMsg);
        }

        return matches[0];

    } else {

        const gameKey = makeGameKey(messageSenderUserID, targetID, channelID);

        const existing = gameData.games.filter(f => f.key === gameKey);

        return (existing.length === 0)
            ? null
            : existing[0];

    }
}

function endOpenedNegociations(bot, xgameData, newgame) {
    // it's gone sour, cold war begins
    const msg = '<@!' + newgame.data.userID  + '> to <@!' + newgame.data.target.id + '>';
    debugDump(bot, newgame.data.channelID, { warning:'negociation has timed out between: ' + msg });

    bot.channels.find('id', newgame.data.channelID)
        .send('Invite from ' + msg + ' has timed out.')
        .then(function (result) {
            result.react(broken_heart);
        }).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });

    // close the negociations (remove game obj etc)
    removeGame(bot, gameData, newgame.key);
}

function closeGame(bot, gameData, closerID, game) {
    const msg = '<@!' + game.data.userID + '> and <@!' + game.data.target.id + '>';
    const entireMsg = 'Game between ' + msg + ' has been cancelled by ' + '<@!' + closerID + '>';
    debugDump(bot, game.data.channelID, { warning: entireMsg });

    bot.channels.find('id', game.data.channelID)
        .send(entireMsg)
        .then(function (result) {
            result.react(broken_heart);
        }).catch(function (error) { debugDump(bot, game.data.channelID, error); });

    // close the negociations (remove game obj etc)
    removeGame(bot, gameData, game.key);
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

function openGameNegociation(bot, xgameData, message, newgame, existingGame) {
    // check for existing game with that key
    //    reject game negociation if already a game

    // limit a user to only one game per channel (*1)
    //    then the game instance can be gleamed from the user id (who sent the message) and the channel id
    var isNewGame = !isExistingGameSameAsNewGame(newgame, existingGame)
    const otherGames = gameData_getGamesForUserInThisChannel(bot, gameData, newgame.data.userID, newgame.data.channelID);
    console.log('otherGames', otherGames);

    console.log('newgame.data.playerblack != existingGame.data.playerblack', newgame.data.playerblack, existingGame == null ? 'null' : existingGame.data.playerblack);
    console.log('newgame.data.playerwhite != existingGame.data.playerwhite) {', newgame.data.playerwhite, existingGame == null ? 'null' : existingGame.data.playerwhite);

    console.log('isNewGame ', isNewGame, 'otherGames.length > 0', otherGames.length > 0, 'existingGame === null', existingGame === null);
    var startingANewGameIsNotGoodRightNow = isNewGame && otherGames.length > 0;
    startingANewGameIsNotGoodRightNow = startingANewGameIsNotGoodRightNow || otherGames.filter(f => f.state > NS_INVITED).length > 0;

    if (startingANewGameIsNotGoodRightNow) { //!isNewGame &&
        //newgame.data.playerblack != existingGame.data.playerblack &&
        //newgame.data.playerwhite != existingGame.data.playerwhite) {

        const msg = '<@!' + newgame.data.userID + '> already has an open challenge, or game, in this channel.';
        debugDump(bot, newgame.data.channelID, { error: msg, sorryDaveICantLetYouDoThat: true });
        bot.channels.find('id', newgame.data.channelID)
            .send(msg)
            .then(function (result) {
                result.react(exclamation);//.then(function (whatever) {
                //    result.react(anger).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });
                //});
            },

            function (error) { flipYourShit(newgame, error) /* <-- on error */ }

        ).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });

        return;
    }



    if (existingGame != null && existingGame.state !== NS_INVITED) {
        debugDump(bot, newgame.data.channelID, { warning: 'This game does seem to be being negociated.', sorryDaveICantLetYouDoThat: true });
        return;
    }

    if (!isNewGame) {
        //just simply tear down the previous invite and remove all evidence DELETE FUCKING EVER?YTHINg1        
        existingGame.timeout = newgame.data.timeout;
        clearInterval(existingGame.data.timer);
        console.log('existingGame.inviteMessageID', existingGame.inviteMessageID);
        bot.channels.find('id', existingGame.data.channelID)
            .messages.find('id', existingGame.inviteMessageID).delete();

        removeGame(bot, gameData, existingGame.key);
        isNewGame = true;
    }

    addNewGame(bot, gameData, newgame);
    message.react(love_letter);

    newgame.data.timer = bot.setInterval(
        function (bot, xgameData, newgame) {
            clearInterval(newgame.data.timer);
            newgame.data.timer = null;

            endOpenedNegociations(bot, gameData, newgame);
        }, newgame.data.timeout * 1000 * 60, bot, gameData, newgame);

    //const channelIDCopy = newgame.data.channelID;
    bot.channels.find('id', newgame.data.channelID)

        .send('<@!' + newgame.data.target.id + '> You have been challenged by <@!' + newgame.data.userID + '>, do you accept?')
        .then(function (result) {
                  //newgame.inviteMessageID = result.id;

                  getExistingGame(bot, gameData, newgame.data.target.id, newgame.data.userID, newgame.data.channelID ).inviteMessageID = result.id;

                  result.react(ok)
                     .then(function (whatever) {
                         result.react(cross3).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });
                      },
                      function (error) { flipYourShit(newgame, error) /* <-- on error */ })
               }, 
               function (error) { flipYourShit(newgame, error) /* <-- on error */ }

      ).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });
}

function tellThemTheListOfGames(bot, xgameData, moveObjs) {
    const allTheirGames = gameData.games.filter(f => gameData_isPlayer(f, moveObjs.userID));
    const displayTheirGames = gameData.games.map(function (val, index, all) {
        const channel = bot.channels.find(f => f.id == val.channelID).name;
        const target = bot.users.find(f => f.id == val.target.id).username;
        return target + ' in ' + channel;
    });

    const msg = displayTheirGames.join(", ");
    bot.channels.find('id', moveObjs.channelID)
        .send(msg)
        .then(function (result) {
            result.react(information).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });//.then(function (whatever) {
            //    result.react(anger).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });
            //});
        },
        function (error) { flipYourShit(newgame, error) /* <-- on error */ }

        ).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });
}

function chessyInfo(bot, gameData, channelID, userID, infoThing, fen) {
    console.log('chessy dump', fen, infoThing);
    bot.channels.find('id', channelID)
        .send('*Info for* **' + infoThing + '**' + '```' + JSON.stringify(chessy.getInfo(fen, [ infoThing ])) + '```')
        .catch (function (error) { debugDump(bot, inviteMessageGame.data.channelID, error); });
}

function getUsefulThingsFromMessage(bot, gameInfo, userID, channelID, message, others) {
    console.log(message);
    const decodeMe = message
        .replace( /\<\@\![0-9]+\>/g, '') // remove mentions tags
        .split(' ')
        .filter(f => f.length > 0);

    console.log(decodeMe);

    var verb = '';
    var target = others[0];//only one mention is acknoledged 

    /* play */
    var restOfMessage = [];
    var whitePlayer = null, blackPlayer = null;
    var timeout = 1;

    /* list mode */
    var listThing = null;

    /* info mode */
    var infoThing = null;

    var isTakeBack = false;
    var isTimeout = false;
    var isListMode = false;
    var isInfoMode = false;

    var prevTokens = [];
    var prevToken = null;
    decodeMe.forEach(token => {
        const cleantoken = token
            .toLowerCase()
            .replace( /\!/g, '')
            .replace( /\?/g, '')
            .replace( /\./g, '');

        if (cleantoken.length === 0)
            return;


        console.log('cleant', cleantoken);


        if (isInfoMode) {
            infoThing = cleantoken;
            isInfoMode = false;
        } else if (isListMode) {
            listThing = cleantoken;
            isListMode = false;
        } else if (isTimeout) {
            timeout = parseInt(cleantoken, 10);
            isTimeout = false;
        } else if (isTakeBack) {
            restOfMessage.push(cleantoken);
        } else {
            switch (cleantoken) {
                case 'info':
                    isInfoMode = true;
                    verb = cleantoken;
                    break;

                case 'list':
                    isListMode = true;
                    verb = cleantoken;
                    break;

                case 'timeout':
                    isTimeout = true;
                    break;
                case 'move':
                case 'resign':
                case 'draw':
                case 'change':
                case 'take':
                    verb = cleantoken;
                    break;

                case 'undo':
                    verb = cleantoken;
                    isTakeBack = true;
                    break;

                case 'back':
                    if (/* 'take back' */prevToken === 'take' || (/* or 'take [move|it] back' */prevTokens.length > 2 && prevTokens[1] !== 'take')) {
                        isTakeBack = true;
                        verb = 'undo';
                    }
                    break;

                case 'play':
                    verb = cleantoken;
                    break;

                case 'cancel':
                    verb = cleantoken;
                    break;

                default:
                    restOfMessage.push(cleantoken);
                    break;
            }
        }

        if (verb.length === 0) {
            // if game already in play the default verb is 'move'
            verb = gameInfo === null ? 'move' : 'play';
        }

        // for newgames, see if the player side colour has been specified
        if (verb === 'play') {
            if (token === 'black') {
                whitePlayer = target.id;
                blackPlayer = userID;
            } else if (token === 'white') {
                whitePlayer = userID;
                blackPlayer = (typeof target === 'undefined' || target === null)
                    ? null
                    : target.id;
            }
        }

        prevToken = cleantoken;
        prevTokens.push(cleantoken);
    });

    if (whitePlayer === null) {
        whitePlayer = userID;
    }

    if (blackPlayer === null) {
        blackPlayer = (typeof target !== 'undefined' && target !== null)
            ? target.id
            : null;
    }

    return {
        channelID, /* channel the message was on */
        userID, /* user id of who made the message */
        target, /* a complete user object for the first mentioned user, .id .username etc */
        restOfMessage, /* everything from the message except the verb and user mentions */

        verb, /* command verb gleamed from the chat message */

        /* Then depending on verb... */
        
        /* play */
        playerwhite: whitePlayer, /* userID of the white player */
        playerblack: blackPlayer, /* userID of the black player */
        timeout, /* how many minuets to wait for the game challenge to be accepted */

        /* list */
        listThing, /* word after the word 'list' */

        /* info */
        infoThing /* word after the word 'info' */
    };
}



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


const gameData = makeGameData();


// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});

logger.level = 'debug';

var bot = null;
var botInterval = setInterval(function () {
    clearInterval(botInterval);
    // Initialize Discord Bot
    bot = new Discord.Client();
    bot.login(auth.token);


    bot.on('ready', function () {
        logger.info('Connected');
        logger.info('Logged in as: ');
        logger.info(bot.username + ' - (' + bot.id + ')');
    });

    bot.on('messageReactionAdd', function (reaction, user) {
        console.log('reaction.message.id', reaction.message.id);
        console.log('gameData.games', gameData.games);
        const inviteMessageGame
            = gameData.games
                .find(f => typeof f.data !== 'undefined' &&
                    f.inviteMessageID == reaction.message.id);

        if (typeof inviteMessageGame === 'undefined') {
            return;
        }

        console.log('now checking target', inviteMessageGame.data.target.id, user.id);

        if (inviteMessageGame.data.target.id != user.id) {
            return;
        }

        var msgadd = ''
        if (reaction.emoji.identifier == EMOJI_ACCEPT_GAME) {
            msgadd += ' YES ';
        }

        //it's ON!
        const chessjs = inviteMessageGame.chessjs = new Chess();
        reaction.message.channel.send("It's ON!")
            .then(t => reaction.message.channel
                .send('```' + chessjs.ascii() + '```')
            //.then(a => reaction.message.channel
            //    .send('```' + JSON.stringify(chessy.getInfo(chessjs.fen(), ['e2', 'f2'])) + '```')))
            .catch(function (error) { debugDump(bot, inviteMessageGame.data.channelID, error); });


        clearInterval(inviteMessageGame.data.timer);
        inviteMessageGame.data.timer = null;
        gameData_setGameState(bot, gameData, inviteMessageGame.key, NS_ACCEPTED);

        const debugGame = gameData_getGamesForUserInThisChannel(bot, gameData, user.id, inviteMessageGame.data.channelID);
        debugDump(bot, reaction.message.channel.id, { 'reactionComlete': true, dump: debugGame });
    });

    bot.on('message', function (message) {
        if (message.author.id === bot.user.id)
            return;

        const botMentions = message.mentions.users.filter(m => m.id === bot.user.id).array();

        // if this function is not applicable then get out of here ASAP, and don't clog up the indenting on your way out
        if (typeof botMentions === 'undefined' || botMentions === null || botMentions.length === 0) {
            return;
        }

        const userID = message.author.id;
        const channelID = message.channel.id;
        const content = message.content;

        console.log(userID, channelID, content, bot.user.id, '<--------');

        const otherMentions
            = message.mentions.users
                .filter(m => m.id !== bot.user.id && m.id !== userID).array();

        const targetid = (otherMentions.length > 0)
            ? otherMentions[0].id
            : null;
        
        var existingGameOrPossibleGame = getExistingGame(bot, gameData, targetid, message.author.id, channelID);

        //if (existingGameOrPossibleGame !== null &&
        //    targetid !== null &&
        //    existingGameOrPossibleGame.data.targetID !== targetid) {

        //    existingGameOrPossibleGame = null; // This is not the game we're looking for, move along
        //}

        const moveObjs = getUsefulThingsFromMessage(bot, existingGameOrPossibleGame, userID, channelID, content, otherMentions);

        if (moveObjs !== null) {
            processVerb(bot, gameData, message, channelID, userID, moveObjs);
            debugDump(bot, channelID, makeDebugMoveObj(moveObjs));
        }
    });

}, 1000 * 60 * 0.5);

function processVerb(bot, xgameData, message, channelID, userID, moveObjs) {
    const target = moveObjs.target;
    const targetid = (typeof target !== 'undefined' && target !== null)
        ? target.id
        : null;

    const existingGame = getExistingGame(bot, gameData, targetid, moveObjs.userID, moveObjs.channelID);

    switch (moveObjs.verb) {
        case 'play':
            if (isValidNewGame(bot, gameData, channelID, userID, moveObjs)) {
                console.log('isValidNewGame', channelID, userID, targetid);
                var newgame = makePossibleNewGame(bot, gameData, moveObjs);
                openGameNegociation(bot, gameData, message, newgame, existingGame);
            } else {
                debugDump(bot, channelID, { error: 'Not a valid new game', sorryDaveICantLetYouDoThat: true });
            }
            break;

        case 'cancel':
            
            if (existingGame !== null) {
                switch (existingGame.state) {
                    case NS_INVITED:
                        endOpenedNegociations(bot, gameData, existingGame);
                        break;

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
            if (existingGame !== null) {
                chessyInfo(bot, gameData, moveObjs.channelID, moveObjs.userID, moveObjs.infoThing, existingGame.chessjs.fen());
            }
            break;

        case 'move':
            if (existingGame !== null) {
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

var htmlServerInterval = setInterval(function (xgameData) {
    clearInterval(htmlServerInterval);
    const staticServer = new static.Server('./public');

    http.createServer(function (request, response) {
        const reqData = url.parse(request.url, true);
        console.log(reqData);
        staticServer.serve(request, response, function (e, res) {
            console.log(res, e);
            if (e && (e.status === 404)) { // If the file wasn't found
                console.log(reqData.pathname);
                switch (reqData.pathname ) {
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

    }).listen(8081);

    // Console will print the message
    console.log('Server running at http://127.0.0.1:8081');
}, 1000 * 60 * 1, gameData );

console.log('Waiting for the machine to warm up a bit, please wait....');


/*iotchess\bot.js:220:23)
\bot.js:584:17)
otchess\bot.js:565:13)*/