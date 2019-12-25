const repo = require('./libOldBookRepository.js');
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

//repo.runTests();




function debugDump(bot, channelID, shitToDump) {
    console.log('debugDump', shitToDump, 'channelID', channelID);
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
function destroyInviteTimer(guildid, channelid, messageauthorid, removefromdb, alsoupdatethese) {
    if (typeof removefromdb === 'undefined') {
        removefromdb = false;
    }
    if (typeof alsoupdatethese === 'undefined') {
        alsoupdatethese = {};
    }

    const timer = repo.timerGet(guildid, channelid, messageauthorid);
    console.log('destroyInviteTimer', timer);
    if (timer !== null) {
        clearInterval(timer);
        repo.timerClear(guildid, channelid, messageauthorid);
        if (removefromdb) {            
            console.log('alsoupdatethese', alsoupdatethese);
            repo.dbUpdateForUser(guildid, messageauthorid, channelid, alsoupdatethese);
        }
    }
    console.log('repo.dbGetGameKeysForUser(messageauthorid, channelid)', repo.dbGetGameKeysForUser(guildid, messageauthorid, channelid));
}

function cancelGame(guildid, channelid, messageauthorid, options) {
    options = typeof options === 'undefined' ? {} : options;

    const optionalGameKeysInThisChannel = options.optionalGameKeysInThisChannel;
    const optionalMessage = options.optionalMessage;

    const game = typeof optionalGameKeysInThisChannel === 'undefined'
        ? repo.dbGetGame(guildid, repo.dbGetGameKeysForUser(guildid, messageauthorid, channelid))
        : repo.dbGetGame(guildid, optionalGameKeysInThisChannel);

    if (game.length > 0) {
        destroyInviteTimer(guildid, channelid, messageauthorid);
        repo.dbRemoveGame(guildid, messageauthorid, channelid);

        const authorsGame = game.filter(f => f.isAuthor);
        if (authorsGame.length === 0) {
            return tellUser(guildid, channelid, messageauthorid, question_mark + ' *error* : no games, wut ' + question_mark, question_mark, optionalMessage);
        }

        console.log('cancelGame', game, authorsGame[0], '<-- cancelGame');
        const msg = (authorsGame[0].state === NS_INVITED)
            ? (messageauthorid === authorsGame[0].targetid
                ? ', <@!' + authorsGame[0].targetid + '> has not accepted your invitation.' //invite cancelled by target
                : ' game invite to <@!' + authorsGame[0].targetid + '> cancelled.') //invite cancelled by author

            : ' has cancelled the game between ' +  // game in flow cancelled by somebody
                '<@!' + authorsGame[0].authorid + '> and <@!' + authorsGame[0].targetid +
                '>';

        return tellUser(
            guildid, 
            channelid,
            messageauthorid,
            msg,
            broken_heart,
            optionalMessage);
    } else {
        if (typeof optionalMessage !== undefined) {
            return optionalMessage.react(question_mark);
        } else {
            return tellUser(
                guildid, 
                channelid,
                messageauthorid,
                question_mark);
        }
    }
}

function timeoutOpenedNegociations(guildid, message, channelid, messageauthorid, targetid) {
    const timeoutMsg = ', your invitation has timed out';
    return tellUsers(guildid, channelid, [messageauthorid, targetid], timeoutMsg, broken_heart, message);
}

function openGameNegociation(guildid, message, channelid, messageauthorid, targetid, invitetimeoutmins, iswhite) {

    return message.react(love_letter)
        .then(function (reaction) {
            // Invite message
            message.channel
                .send('<@!' + targetid + '> You have been challenged by <@!' + messageauthorid + '>, do you accept?')
                .then(function (challengeMessage) {

                    // OK accept emojii
                    challengeMessage.react(EMOJI_ACCEPT_GAME)
                        .then(function (okEmojiReaction) {

                            // Cross reject emoji
                            challengeMessage.react(EMOJI_REJECT_GAME)
                                .then(function (crossEmojiReaction) {

                                    // Interval timeout
                                    const timer = setInterval(
                                        function (guildid, channelid, messageauthorid, targetid) {
                                            cancelGame(guildid, channelid, messageauthorid, { optionalMessage: message })
                                                .then(t => timeoutOpenedNegociations(guildid, message, channelid, messageauthorid, targetid))
                                                .catch(console.log);

                                        }, invitetimeoutmins * 1000 * 60, guildid, channelid, messageauthorid, targetid);

                                    const challengemessageid = challengeMessage.id;
                                    const dateStarted = Date.now();

                                    const newGameDataObj = {
                                        challengemessageid,
                                        state: NS_INVITED,
                                        isWhite: iswhite,
                                        gameStarted: dateStarted
                                    };

                                    repo.timerAdd(guildid, channelid, messageauthorid, timer);
                                    repo.dbAddGameAuthor(guildid, messageauthorid, channelid, newGameDataObj, targetid);
                                });
                        })
                });
        });
}

function tellThemTheListOfGames(guildid, channelid, userid, message) {
    const allTheirGames = repo.dbGetGame(guildid, repo.dbGetGameKeysForUser(guildid, userid /*, wayt - leve this out to get all channels --> channelid*/));

    if (allTheirGames.length === 0) {
        return tellUser(guildid, channelid, userid, ' *You have no games*', information, message);
    }
    //console.log('allTheirGames ', allTheirGames);

    const displayTheirGamesInProgress
        = allTheirGames
            .filter(f => f.isAuthor)
            .map(function (val) {

                const channel = message.channel.guild.channels
                    .find(f => f.id == val.channelid)
                    .name;

                const author = message.channel.guild.members
                    .find(f => f.user.id == val.authorid)
                    .user.username;

                const target = message.channel.guild.members
                    .find(f => f.user.id == val.targetid)
                    .user;

                const targetUsername = typeof target !== 'undefined'
                    ? target.username
                    : ' ' + question_mark + ' ';

                const state = (val.state === NS_INVITED)
                    ? '*Invited*'
                    : '*Playing*';

                //console.log('val.dateStarted', val.dateStarted);
                return author + ' vs ' + targetUsername + ' in ' + channel + ', ' + state + ', ...';// + ((moveObjs.channelID === val.data.channelID) ? ' <-- *You are here*' : '');
            });
    
    const msg = '*List:*  \n\t' + displayTheirGamesInProgress.join("\n\t");
    return message.channel//bot.channels.find('id', channelid)
        .send(msg + '\n\n ...also: ' + JSON.stringify(repo.dbGetAll(guildid)[0]))
        .then(function (result) {
            result.react(information).catch(console.log);
        });
}

function tellUser(guildid, channelid, tellthisuserid, speak, optionalemoji, optionalmessage) {

    const channel = typeof optionalmessage === 'undefined'
        ? bot.channels.find('id', channelid)
        : optionalmessage.channel;

    const emojiAddition = typeof optionalemoji !== 'undefined'
        ? ' ' + optionalemoji + ' '
        : '';

    return channel.send(emojiAddition + '<@!' + tellthisuserid + '>' + speak + emojiAddition)
        .then(function (messageresult) {
            if (typeof optionalemoji !== 'undefined' && typeof optionalmessage !== 'undefined') {
                optionalmessage.react(optionalemoji);
            }
        })
}

function tellUsers(guildid, channelid, userid_array, speak, optionalemoji, optionalmessage) {
    if (userid_array.length === 0) {
        return;
    }

    const channel = typeof optionalmessage === 'undefined'
        ? bot.channels.find('id', channelid)
        : optionalmessage.channel;

    const addressStr = (userid_array.length > 1)
        ? '<@!' + userid_array.join('> and <@!') + '>'
        : userid_array[1];

    return channel.send(addressStr + speak)
        .then(function (messageresult) {
            if (typeof optionalemoji !== 'undefined') {
                messageresult.react(optionalemoji);
            }
        });
}

function tellChannel(guildid, channelid, speak, optionalemoji, optionalchannel) {

    const channel = typeof optionalchannel === 'undefined'
        ? bot.channels.find('id', channelid)
        : optionalchannel;

    return channel.send(speak)
        .then(function (messageresult) {
            if (typeof optionalemoji !== 'undefined') {
                messageresult.react(optionalemoji);
            }
        });
}

const emoji_numbers = '🔢';
const emoji_a = '🇦';
const emoji_b = '🇧';
const emoji_c = '🇨';
const emoji_d = '🇩';
const emoji_e = '🇪';
const emoji_f = '🇫';
const emoji_g = '🇬';
const emoji_h = '🇭';

const emoji_letters = '🔡';
const emoji_1 = '1️⃣';
const emoji_2 = '2️⃣';
const emoji_3 = '3️⃣';
const emoji_4 = '4️⃣';
const emoji_5 = '5️⃣';
const emoji_6 = '6️⃣';
const emoji_7 = '7️⃣';
const emoji_8 = '8️⃣';

const emoji_direction = '';
const empji_uparrow = '⬆️';
const empji_uprightarrow = '↗️';
const empji_rightarrow = '➡️';
const empji_downrightarrow = '↘️';
const empji_downarrow = '⬇️';
const empji_downleftarrow = '↙️';
const empji_leftarrow = '⬅️';
const empji_upleftarrow = '↖️';
const empji_rightcurvingdownarrow = '↩️';
const empji_leftcurvingdownarrow1 = '↪️';
const empji_rightcurvinguparrow = '⤴️';
const empji_leftcurvingdownarrow2 = '⤵️';
const empji_arrow = '';


//https://www.iemoji.com/emoji-cheat-sheet/comical

const emoji_symbols = '🔣';
const emoji_information = 'ℹ️';

const emoji_trophy = '🏆';
const emoji_medal1 ='🎖️';
const emoji_medal2 = '🏅';
const emoji_medal_first = '🥇';
const emoji_medal_second = '🥈';
const emoji_medal_third = '🥉';
const emoji_yarn = '🧶';
const emoji_handshake = '🤝';
const emoji_speakinghead = '🗣️';
const emoji_key1 = '🗝️';
const emoji_key2 = '🔑';
const emoji_scroll = '📜';
const emoji_hammer = '🔨';
const emoji_nutandbolt = '🔩';
const emoji_writinghand = '✍️';
const emoji_wrench = '🔧';
const emoji_tools = '🛠';
const emoji_gear = '⚙️';
const emoji_castle = '🏰';
const emoji_pawprints = '🐾';
const emoji_ribbon = '🎗️';
const emoji_yarn = '🧶';
consr emoji_play = '▶️';

const EMOJI_MOVE = emoji_play;
const EMOJI_INFO = emoji_information;
const EMOJI_SETTINGS = emoji_gear;


const emoji_board_row = [ emoji_1, emoji_2, emoji_3, emoji_4, emoji_5, emoji_6, emoji_7, emoji_8 ];
const emoji_board_column = [ emoji_a, emoji_b, emoji_c, emoji_d, emoji_e, emoji_f, emoji_g, emoji_h ];
const emoji_board_toolkit = [ EMOJI_MOVE, EMOJI_INFO, EMOJI_SETTINGS  ];

function addMoveHelperEmojis(guildid, boardMessage, existingGame) {
    var returns = [];
    emoji_board_row
    .concat(emoji_board_column)
    .concat( emoji_board_toolkit)
        .forEach(function(item, index) {
            returns.push( boardMessage.react(item) );
        });
        
    return Prmoise.all(returns);
}


function showBoard(guildid, channel, existingGame) {
    if (typeof existingGame.chessjs === 'undefined' || existingGame.chessjs === null) return;

    const isWhiteNext = existingGame.chessjs.turn() === 'w';
    const whonextid = existingGame.isWhite
        ? isWhiteNext ? existingGame.authorid : existingGame.targetid
        : isWhiteNext ? existingGame.targetid : existingGame.authorid;
    
    return message
        .send('```' + existingGame.chessjs.ascii() + '```' + '\n<@' + whonextid + '> to play...')
        .then(sentMessage => addMoveHelperEmojis(guildid, sentMessage, existingGame);
        //.catch(console.log);
}

function chessyInfo(guildid, channelid, messageauthorid, gameKeysInThisChannel, infoThing, chessjs, channel) {
    const fen = chessjs.fen();
    const infoString = JSON.stringify(chessy.getInfo(fen, [infoThing]), null, '\t');

    //const firstInfoThing = infoThing.length > 0
    //    ? infoThing[1]
    //    : '';

    const moves = infoThing.match(VALID_SQUARE_REGEX)
        ? '\nPossible moves for ' + infoThing + ': ' + chessjs.moves({ square: infoThing })
        : '';

    return channel.send('Info for **' + infoThing + '**:  ' + '```' + infoString + '\n' + moves + '```')
}

function reactGameInvite(guildid, channel, userid, authorid, isAcceptance, isWhite) {
    const channelid = channel.id;

    if (isAcceptance) {

        //it's ON!

        const chessjs = new Chess();
        destroyInviteTimer(guildid, channelid, authorid, true, { chessjs }/*<-- which also updates the author row with this */);

        repo.dbUpdateGameTarget(guildid, authorid, channelid, userid, { isWhite });
        repo.dbUpdateForGame(guildid, authorid, channelid, { state: NS_ACCEPTED });

        // CHECK ITS SAVED HERE
        console.log('react gamne unvite', repo.dbGetAll(guildid));

        const game = repo.dbGetForUserKey(guildid, authorid, channelid);
        console.log(game);
        //console.log('reactGameInvite', guildid, repo.dbGetGame(guildid, keys), 'and then', keys[0]);

        return channel.send("It's ON! ")
            .then(t => showBoard(guildid, channelid, game[0]));

    } else {
        return cancelGame(guildid, channelid, authorid);
    }
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
const EMOJI_REJECT_GAME = cross3;

//const gameData = makeGameData();


// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});

logger.level = 'debug';

var bot = null;
function startBot() {
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

                bot.guilds.forEach(function (f) { repo.dbMakeDb(f.id); console.log('ready', f);});
            });

            bot.on('messageReactionAdd', function (reaction, user) {
                if (user.id === bot.user.id) {
                    return;
                }

                const isAcceptance = reaction.emoji.name == EMOJI_ACCEPT_GAME;
                const isRejection = reaction.emoji.name == EMOJI_REJECT_GAME;

                if (!isAcceptance && !isRejection) {
                    return;
                }

                const guildid = reaction.message.channel.guild.id;
                console.log('messageReactionAdd', guildid);
                const userid = user.id;
                const channelid = reaction.message.channel.id;

                const authorGame = repo.dbGetGameFromTarget(guildid, userid, channelid);
                if (authorGame.length === 0) {
                    return;
                }

                reactGameInvite(guildid, reaction.message.channel, userid, authorGame[0].authorid, isAcceptance, !authorGame[0].isWhite)
                    .catch(console.log);
            });

            bot.on('message', function (message) {
                if (message.author.id === bot.user.id)
                    return;

                const botMentions = message.mentions.users.filter(m => m.id === bot.user.id).array();

                // if this function is not applicable then get out of here ASAP, and don't clog up the indenting on your way out
                if (typeof botMentions === 'undefined' || botMentions === null || botMentions.length === 0) {
                    return;
                }

                const guildid = message.channel.guild.id;
                const messageauthorid = message.author.id;
                const channelid = message.channel.id;
                const content = message.content;

                console.log(messageauthorid, channelid, content, '<-------- on message');

                const allNonBotMentions
                    = message.mentions.users
                        .filter(m => m.id !== bot.user.id && m.id !== messageauthorid).array();

                const gameKeysInThisChannel = repo.dbGetGameKeysForUser(guildid, messageauthorid, channelid);

                const parsedMessage = parser.parseMessage(bot, messageauthorid, channelid, content, allNonBotMentions, gameKeysInThisChannel);

                processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);

            });
        } catch (err) {
            console.log('err:', err);
        }

    }, 1000);// * 15);
}
startBot();


function processVerbPlay(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage, existingGame, isExistingGame) {
    if (!isExistingGame) {
        console.log('/* not an existing game */');
        if (parsedMessage.targetid == null) {

            console.log('/* they want to play but have not said with who, abort... */');

            tellUser(
                guildid, 
                channelid,
                messageauthorid,
                //' I can\'t see who you want to play with' + '\n> @' + bot.user.username + ' play @their name',
                '',
                question_mark,
                message)
                .catch(console.log);

        } else {

            console.log('/* no existing game, start a new one: make an invite */');

            openGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite)
                .catch(function (err) { console.log(err); });

        }
    } else if (existingGame[0].state === NS_INVITED) {
        console.log('/* is existing game! */');

        if (existingGame[0].authorid !== parsedMessage.messageauthorid) {

            console.log('/* they have a game invite open *from* someone else, cancel that and make a new invite */');

            cancelGame(guildid, channelid, messageauthorid, { optionalGameKeysInThisChannel: gameKeysInThisChannel, optionalMessage: message })
                .then(function (result) {
                    openGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite)
                        .catch(console.log);
                })
                .catch(console.log);

        } else if (existingGame[0].authorid === parsedMessage.messageauthorid) {

            console.log('/* they have aready invited this person, so reset the invite to these new parameters */');

            reOpenGameNegociation(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage.timeout, parsedMessage.isWhite)
                .catch(function (err) { console.log(err); });

        } else if (existingGame[0].targetid === parsedMessage.messageauthorid) {

            console.log('/* they are the target of an open invite, accept the invite */');

            acceptGameNegociation(guildid, channelid, messageauthorid, gameKeysInThisChannel)
                .catch(console.log);

        }
    } else if (existingGame[0].state === NS_ACCEPTED) {
        console.log(' /* game in flow, take \'play\' to mean move a piece */');
        parsedMessage.verb = 'move';
        processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);
    }
}

const VALID_SQUARE_REGEX = /([A-Ha-h][1-8]|[1-8][A-Ha-h])/g; ///([a-h][1-8]|[1-8][a-h])/g;

function getCleanMoveData(restOfMessage) {
    const returnObj = {};
    returnObj.error = false;
    returnObj.restOfMessage = restOfMessage;
    returnObj.move = restOfMessage
        .filter(f => f.length >= 2)
        .filter(f => f.substring(0, 2).match(VALID_SQUARE_REGEX))
        .join('');

    return returnObj;
}

function movePieceBoyakasha(guildid, channelid, userid, existingGame, cleanedMove, message) {
    const move = cleanedMove.move;
    const restOfMessage = cleanedMove.restOfMessage.join(' ');

    const chessjs = repo.dbGetForUserKey(guildid, existingGame.authorid, channelid)[0].chessjs;    

    const isWhiteNext = chessjs.turn() === 'w';
    const whonextid = existingGame.isWhite
        ? isWhiteNext ? existingGame.authorid : existingGame.targetid
        : isWhiteNext ? existingGame.targetid : existingGame.authorid;

    if (whonextid !== userid) {
        return tellUser(guildid, channelid, userid, ', sorry it\'s not your move yet.', anger, message);
    }
    const moved = chessjs.move(move, { sloppy: true, legal: true });

    if (moved === null) {
        const matches = VALID_SQUARE_REGEX.exec(move);

        console.log('matches', matches);

        const firstPiece = matches !== null && matches.length > 0 ? matches[0] : restOfMessage ;

        var extraInfo = '';
        if (firstPiece.trim().length > 0) {
            console.log('chessjs', chessjs, 'firstPiece', firstPiece);
            const possibleMoves = chessjs.moves({square: firstPiece });
            extraInfo = possibleMoves.length > 0
                ? '\n' + 'Valid moves for ' + firstPiece + ': ' + firstPiece + '-*' + possibleMoves.join('*, ' + firstPiece + '-*') + '*'
                : restOfMessage;
        }

        return tellUser(guildid, channelid, userid, ', sorry unable to move ' + move + extraInfo, anger, message)
            .then(t => showBoard(guildid, channelid, repo.dbGetForUserKey(guildid, existingGame.authorid, channelid)[0]));
    };
    repo.dbUpdateForUser(guildid, existingGame.authorid, channelid, { chessjs });
    return showBoard(guildid, channelid, repo.dbGetForUserKey(guildid, existingGame.authorid, channelid)[0]);
}

function processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage) {
    const existingGame = repo.dbGetGame(guildid, gameKeysInThisChannel);
    const isExistingGame = existingGame.length > 0;

    switch (parsedMessage.verb) {
        case 'play':
            processVerbPlay(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage, existingGame, isExistingGame);
            break;

        case 'cancel':
            console.log('cancel', existingGame, messageauthorid);
            if (existingGame.length > 0) {
                cancelGame(guildid, channelid, messageauthorid, { optionalGameKeysInThisChannel: gameKeysInThisChannel, optionalMessage: message })
                    .catch(console.log);
            }
            break;

        case 'list':
            switch (parsedMessage.listThing) {
                case 'game':
                case 'games':
                    tellThemTheListOfGames(guildid, channelid, messageauthorid, message)
                        .catch(console.log);

                    break;
            }
            break;

        case 'info':
            if (isExistingGame) {
                chessyInfo(guildid, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage.infoThing, existingGame[0].chessjs, message.channel)
                    .catch(console.log);
            }
            break;

        case 'board':
            if (isExistingGame) {
                showBoard(guildid, message.channel, existingGame[0])
                    .catch(console.log);
            }
            break;

        case 'move':
            if (isExistingGame) {
                if (existingGame[0].state === NS_ACCEPTED) {
                    const cleanMoveData = getCleanMoveData(parsedMessage.restOfMessage);
                    if (cleanMoveData.error) {
                        tellUser(guildid, channelid, messageauthorid, '"' + existingGame[0].restOfMessage + '" move not recognised', anger, message.channel)
                            .catch(console.log);
                        return;
                    }
                    movePieceBoyakasha(channelid, messageauthorid, existingGame[0], cleanMoveData, message)
                        .catch(console.log);
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

                        case '/restartbot':
                            startBot();
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
