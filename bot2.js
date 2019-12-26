﻿const repo = require('./libOldBookRepository.js');
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

/* destroy the invite timer, and also optionally update the properties in the last parameter while setting the timer to null */
function destroyInviteTimer(guildid, channelid, messageauthorid, removefromdb, alsoupdatethese) {
    if (typeof removefromdb === 'undefined') {
        removefromdb = false;
    }
    if (typeof alsoupdatethese === 'undefined') {
        alsoupdatethese = {};
    }

    const timer = repo.timerGet(guildid, channelid, messageauthorid);

    if (timer !== null) {

        clearInterval(timer);
        repo.timerClear(guildid, channelid, messageauthorid);

        if (removefromdb) {            
            repo.dbUpdateForUser(guildid, messageauthorid, channelid, alsoupdatethese);
        }
    }
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
const emoji_play = '▶️';
const emoji_slider = '🎚';
const emoji_new = '';
const emoji_hole = '🕳';
const emoji_control = '🎛';
const emoji_clamp = '🗜';
const emoji_cool = '';
const emoji_dagger = '🗡';
const emoji_shield = '🛡';
const emoji_bow = '🏹';
const emoji_crossedswords = '⚔';
const emoji_heavytick = '✅';
// unknown emoji: const emoji_circleinformation = '🛈';
const emoji_bigbackslash = '🙽';
const emoji_bigforwardslash = '🙼';
const emoji_heavyplay = '';
const emoji_fire = '';
const emoji_crossundo = '❎';





const EMOJI_SHOW_LETTERS = emoji_letters;
const EMOJI_SHOW_NUMBERS = emoji_numbers
const EMOJI_INFO = emoji_information;
const EMOJI_SCROLL_LOLWUT = emoji_scroll;
const EMOJI_CLEARSELECTION = emoji_crossundo;

const EMOJI_SETTINGS = emoji_gear;


const emoji_board_toolkit = [ EMOJI_SHOW_LETTERS, EMOJI_SHOW_NUMBERS /* EMOJI_SCROLL_LOLWUT, emoji_pawprints, empji_rightcurvinguparrow, empji_leftcurvingdownarrow2, EMOJI_SETTINGS*/  ];
const emoji_board_toolkit_withselection = [ EMOJI_SHOW_LETTERS, EMOJI_SHOW_NUMBERS, EMOJI_INFO, EMOJI_CLEARSELECTION /* EMOJI_SCROLL_LOLWUT, emoji_pawprints, empji_rightcurvinguparrow, empji_leftcurvingdownarrow2, EMOJI_SETTINGS*/  ];

const emoji_navigation_numbers = [ emoji_1, emoji_2, emoji_3, emoji_4, emoji_5, emoji_6, emoji_7, emoji_8];
const emoji_navigation_letters = [ emoji_a, emoji_b, emoji_c, emoji_d, emoji_e, emoji_f, emoji_g, emoji_h];
const letters = ['a','b','c','d','e','f','g','h' ];
const emoji_settings = [ emoji_wrench, emoji_hammer, emoji_yarn, emoji_tools, emoji_key1, emoji_nutandbolt ];



/*********************************
   +------------------------+
 8 | r  n  b  q  k  b  n  r |
 7 | p  p  p  p  p  p  p  p |
 6 | .  .  .  .  .  .  .  . |
 5 | .  .  .  .  .  .  .  . |
 4 | .  .  .  .  .  .  .  . |
 3 | .  .  .  .  .  .  .  . |
 2 | P [P] P  P  P  P  P  P |
 1 | R  N  B  Q  K  B  N  R |
   +------------------------+
     a  b  c  d  e  f  g  h*/
//   0  1  2  3  4  5  6  7
/******************************
{
    "b2": {
        "attacking": null,
        "defending": null,
        "defenses": [
            "c1"
        ],
        "piece": {
            "color": "white",
            "type": "pawn"
        },
        "sights": [
            "a3",
            "c3"
        ],
        "threats": null,
        "moves": [ "b3", "b4" ] //added, from chess js
    }
}
attacking :anger:, defending :shield?:, moves :play: or ::
*/





//SHOW ONLY LETTERS AND NUMBERS FOR POSSIBLE MOVES
function addEmojiArray(guildid, boardMessage, emojiArray, filter) {
    var returns = [];
    const useFilter = typeof filter === 'undefined' 
        ? (t) => true
        : filter;

    var prevWait = null;

    emojiArray
        .filter(useFilter)
        .forEach(function (item, index) {

            const newWait = prevWait === null
                ? boardMessage.react(item)
                : prevWait.then(t => boardMessage.react(item));

            returns.push(newWait);
            prevWait = newWait;
        });

    return Promise.all(returns);
}


function showBoard(guildid, channel, existingGame, reactionArray) {
    if (typeof existingGame.chessjs === 'undefined' || existingGame.chessjs === null) return;

    const whonext = whoIsNext(guildid, existingGame.authorid, existingGame.targetid, channel.id)
    const whoNextGame = repo.dbGetForUserKey(guildid, whonext.whonextid, channel.id);

    var data = '';
    if (typeof whoNextGame[0].data !== 'undefined') {
        const dataJoined = whoNextGame[0].data.join('');
        if (dataJoined.length === 2) {
            data = '**' + dataJoined + '** is selected.';
        } else if (dataJoined.length === 4) {
            data = '**' + datajoined + '**';
        }
    }    


    var ascii = '';
    if (whoNextGame[0].isWhite) {
        ascii = existingGame.chessjs.ascii();
    } else {
        ascii = existingGame.chessjs.ascii().split('').reverse().join('');
        var asciia = ascii.split("\n");
        asciia.shift();
        ascii = '  ' + asciia.join('\n');
    }

    return channel
        .send('```' + ascii + '```' + '\n<@' + whonext.whonextid + '> to play... ' + data)
        .then(sentMessage => addEmojiArray(guildid, sentMessage, reactionArray));
}

function chessyInfo(guildid, channelid, messageauthorid, gameKeysInThisChannel, infoThing, chessjs, channel) {
    const fen = chessjs.fen();
    const infoString = JSON.stringify(chessy.getInfo(fen, [infoThing]), null, '\t');

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

        const game = repo.dbGetForUserKey(guildid, authorid, channelid);

        return channel.send("It's ON! ")
            .then(t => showBoard(guildid, channel, game[0], emoji_board_toolkit));

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

                bot.guilds.forEach(function (f) { repo.dbMakeDb(f.id); console.log('!ready:', f.id);});
            });

            bot.on('messageReactionAdd', function (reaction, user) {
                if (user.id === bot.user.id) {
                    return;
                }
                if (reaction.message.author.id !== bot.user.id) {
                    return;
                }

                const guildid = reaction.message.channel.guild.id;
                const userid = user.id;
                const channelid = reaction.message.channel.id;
                
                console.log('messageReactionAdd', guildid);

                const authorKeys = repo.dbGetGameKeysForUser(guildid, userid, channelid);
                if (authorKeys.length === 0) {

                    return;
                }

                const authorGame = repo.dbGetGame(guildid, authorKeys);
                const isTarget = authorGame[0].targetid === userid;

                const reactionEmojiName = reaction.emoji.name;
                const isAcceptance = reactionEmojiName == EMOJI_ACCEPT_GAME;
                const isRejection = reactionEmojiName  == EMOJI_REJECT_GAME;

                if (isTarget && authorGame[0].state == NS_INVITED && (isAcceptance || isRejection)) {
                    reactGameInvite(guildid, reaction.message.channel, userid, authorGame[0].authorid, isAcceptance, !authorGame[0].isWhite)
                        .catch(console.log);
                        return;
                }

                const isauthnext = isAuthorNext(guildid, authorGame[0].authorid, authorGame[0].targetid, channelid);
                const ourGoNext = (
                    (authorGame[0].authorid === userid && isauthnext) || 
                    (authorGame[0].targetid === userid && !isauthnext)
                );                

                if (!ourGoNext) {
                    return
                }

                if (authorGame[0].state === NS_ACCEPTED) {
                    const reactorGame = repo.dbGetForUserKey(guildid, userid, channelid)[0];
                    const haveSelection =  typeof reactorGame.data !== 'undefined';// OBTW selected items means theres a thing in the data array TLDR
    
                    // if game is in flow and we're dealing with selected pieces
                    var isProcessed = false;
                    switch (reactionEmojiName) {
                        case EMOJI_SHOW_LETTERS:
                            const letters = haveSelection 
                                ? getLettersNumbersForValidMoves(reactorGame.data.join(''), authorsGame[0])[0]
                                : emoji_navigation_letters;
                    
                            console.log('planting emoji letters', letters);

                            addEmojiArray(guildid, reaction.message, emoji_navigation_letters, (t) => letters.includes(t))
                                .catch(console.log);
                            isProcessed = true;
                            break;

                        case EMOJI_SHOW_NUMBERS:
                            const numbers = haveSelection 
                                ? getLettersNumbersForValidMoves(reactorGame.data.join(''), authorsGame[0])[1]
                                : emoji_navigation_numbers;

                            console.log('planting emoji numbers', numbers);

                            addEmojiArray(guildid, reaction.message, emoji_navigation_numbers, (t) => numbers.includes(t) )
                                .catch(console.log);
                            isProcessed = true;
                            break;

                        case EMOJI_CLEARSELECTION:
                            repo.dbUpdateForUser(guildid, userid, channelid, {data:[]});
                            isProcessed = true;
                            break;

                    }
                    if (isProcessed) {
                        return;
                    }
                }

                if (emoji_navigation_numbers.includes(reactionEmojiName) ) {
                    processVerb(guildid, reaction.message, channelid, userid, repo.dbGetGameKeysForUser(guildid, userid, channelid), {
                        verb: 'data',
                        data: emoji_navigation_numbers.indexOf(reactionEmojiName) + 1,
                        userid: userid

                    });
                    return;
                } else if (emoji_navigation_letters.includes(reactionEmojiName) ) {
                    processVerb(guildid, reaction.message, channelid, userid, repo.dbGetGameKeysForUser(guildid, userid, channelid), {
                        verb: 'data',
                        data: letters[emoji_navigation_letters.indexOf(reactionEmojiName)],
                        userid: userid
                    });
                    return;
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

    }, 1000 * 2 /* deep breath, count to two */ );
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
                .catch(console.log);

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
                .catch(console.log);

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

function whoIsNext(guildid, authorid, targetid, channelid) {

    const authorGame = repo.dbGetForUserKey(guildid, authorid, channelid)[0];
    if (typeof authorGame === 'undefined' || authorGame === null) {
        return {whonextid:null, authorGame:null};
    }

    const chessjs = authorGame.chessjs;
    if (typeof chessjs === 'undefined' || chessjs === null) {
        return {whonextid:null, authorGame:authorGame};
    }

    const isWhiteNext = chessjs.turn() === 'w';
    const whonextid = authorGame.isWhite
        ? isWhiteNext ? authorid : targetid
        : isWhiteNext ? targetid : authorid;

    return { whonextid, authorGame };
}

function isAuthorNext(guildid, authorid, targetid, channelid) {
    const whonextid = whoIsNext(guildid, authorid, targetid, channelid).whonextid;
    return whonextid === authorid;
}

function movePieceBoyakasha(guildid, channelid, userid, existingGame, cleanedMove, message) {
    const move = cleanedMove.move;
    const restOfMessage = cleanedMove.restOfMessage;//.join(' ');

    const chessjs = repo.dbGetForUserKey(guildid, existingGame.authorid, channelid)[0].chessjs;    

    const whonextid = whoIsNext(guildid, existingGame.authorid, existingGame.targetid, channelid).whonextid;

    if (whonextid !== userid) {
        return tellUser(guildid, channelid, userid, ', sorry it\'s not your move yet.', anger, message);
    }
    const moved = chessjs.move(move, { sloppy: true, legal: true });

    if (moved === null) {
        const matches = VALID_SQUARE_REGEX.exec(move);

        const firstPiece = matches !== null && matches.length > 0 ? matches[0] : restOfMessage.join(' ') ;

        var extraInfo = '';
        if (firstPiece.trim().length > 0) {
            const possibleMoves = chessjs.moves({square: firstPiece });
            extraInfo = possibleMoves.length > 0
                ? '\n' + 'Valid moves for ' + firstPiece + ': ' + firstPiece + '-*' + possibleMoves.join('*, ' + firstPiece + '-*') + '*'
                : restOfMessage;
        }

        return tellUser(guildid, channelid, userid, ', sorry unable to move ' + move + extraInfo, anger, message)
            .then(t => showBoard(guildid, message.channel, repo.dbGetForUserKey(guildid, existingGame.authorid, channelid)[0], emoji_board_toolkit));
    };
    repo.dbUpdateForUser(guildid, existingGame.authorid, channelid, { chessjs });
    return showBoard(guildid, message.channel, repo.dbGetForUserKey(guildid, existingGame.authorid, channelid)[0], emoji_board_toolkit);
}

function getLettersNumbersForValidMoves(piece, existingGame) {
    if (typeof piece === 'undefined') return [ emoji_navigation_letters, emoji_navigation_numbers ];

    var testPiece = piece;
    if ( testPiece.length < 2) {
        return [ emoji_navigation_letters, emoji_navigation_numbers ];
    }
    if ( testPiece.length % 2 > 0) {
        testPiece = testPiece.substring(0, testPiece.length-2);
    }
    const finalPieces = [];
    for (var i=0; testPiece.length <= i; i+=2) {
        finalPieces.push(testPiece[i] + testpiece[i+1]);
    }
    const pieceinfo = chessy.getInfo(existingGame.chessjs.fen(), finalPieces);

    // only showing the first piece atm
    const letters = pieceinfo[ finalPieces[0] ].sights.map(m => m[0]);
    const numbers = pieceinfo[ finalPieces[0] ].sights.map(m => m[1]);

    const uniqueLetters = [ ...new Set(letters)];
    const uniqueNumbers = [ ...new Set(numbers)];

    return [ uniqueLetters, uniqueNumbers ];
}

function getEmojiListForBoard(guildid, existingGame, messageauthorid) {
    const userGame = repo.dbGetForUserKey(guildid, messageauthorid, existingGame.channelid);
    const userData = (typeof userGame === 'undefined')
        ? [] 
        : (typeof userGame.data === 'undefined')
            ? [] 
            : userGame.data;

    const joined = userData.join('');
    if (joined.length === 2) {
        // const moves = getLettersNumbersForValidMoves(joined);
        // const letters = moves[0];
        // const numbers = moves[1];

        /* temp, instead return letters and numbers they can move with for this piece */ return emoji_board_toolkit_withselection;

    } else {
        return emoji_board_toolkit;
    }
}

function processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage) {
    const existingGame = repo.dbGetGame(guildid, gameKeysInThisChannel);
    const isExistingGame = existingGame.length > 0;

    switch (parsedMessage.verb) {
        case 'error':
            tellUser(
                guildid, 
                channelid,
                messageauthorid,
                ' ' + question_mark,
                question_mark)
            .catch(console.log);

            break;

        case 'play':
            processVerbPlay(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage, existingGame, isExistingGame);
            break;

        case 'cancel':
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
                const messageauthorsgame = existingGame.filter(f => f.key === repo.dbMakeKey(guildid, messageauthorid, channelid));

                if (typeof messageauthorsgame.data === 'undefined') messageauthorsgame.data = [];
                if (parsedMessage.infoThing.toLowerCase() === 'clear') {parsedMessage.infoThing = '';};

                if (parsedMessage.infoThing === '') {
                    messageauthorsgame.data = [];
                } else {
                    messageauthorsgame.data.push(parsedMessage.infoThing);
                }

                repo.dbUpdateForUser(guildid, messageauthorid, channelid, { data: messageauthorsgame.data});
                chessyInfo(guildid, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage.infoThing, existingGame[0].chessjs, message.channel)
                    .catch(console.log);
            }                        
            break;

        case 'board':
            if (isExistingGame) {
                showBoard(guildid, message.channel, existingGame[0], getEmojiListForBoard(guildid, existingGame[0], messageauthorid))
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
                    movePieceBoyakasha(guildid, channelid, messageauthorid, existingGame[0], cleanMoveData, message)
                        .catch(console.log);
                }
            }
            break;

        case 'data':
            const isMessageAuthorToPLay = isExistingGame 
                ? whoIsNext(guildid, existingGame[0].authorid, existingGame[0].targetid, channelid).whonextid === messageauthorid
                : false;
    
            if (isExistingGame && existingGame[0].state === NS_ACCEPTED && isMessageAuthorToPLay) {
                
                const updateMe = repo.dbGetForUserKey(guildid, messageauthorid, channelid); 

                if (typeof updateMe[0].data === 'undefined') {
                    updateMe[0].data = [];
                }
                updateMe[0].data.push(parsedMessage.data);

                repo.dbUpdateForUser(guildid, messageauthorid, channelid, { data: updateMe[0].data });

                const piece = updateMe[0].data.join('');
                // if the data is the coordinate of a piece, then show the OK button
                if (piece.length == 2) {
                    existingGame[0].data = updateMe[0].data;
                    showBoard(guildid, message.channel, existingGame[0], getEmojiListForBoard(guildid, existingGame[0], messageauthorid))
                        .catch(console.log);
                } else if (piece.length == 4) {
                    parsedMessage.verb = 'play';
                    parsedMessage.restOfMessage = updateMe[0].data;
                    processVerbPlay(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage, existingGame, isExistingGame);
                    return;
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

function resolveCode(code) {
    if (code === 'unicorn') {
        return '650762337208500295'; //idiot chess for stupids
    }
    return null;
}

function adminDumpGames(bot, code, res, reqData) {
    res.end( safeStringify( repo.dbGetGame(code, {})) );
}

function adminDumpGame(bot, code, res, reqData) {
    if (reqData.query.gamekey === 'undefined') {
        res.end();
        return;
    }

    const game = repo.dbGetGame(code, {}).games.filter(f => f.key == reqData.query.gamekey)[0];
    res.end('<html><body style="background-color:darkslategrey; color:burlywood"><div>' +
        safeStringify(game)
        + '</div></body></html>');
}

function adminDumpLogs(bot, code, res) {
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

function adminSpeak(bot, code, res, reqData) {
    console.log('adminSpeak', reqData);
    const channel = bot.guilds.find(f => f.id == code).channels.filter(f => f.id == reqData.query.channelid).array();
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
            const resolvedCode = resolveCode(reqData.query.code);

            if (resolvedCode === null) {
                response.statusCode = 403;
                response.end();
                return;
            }

            staticServer.serve(request, response, function (e, res) {

                if (e && (e.status === 404)) { // If the file wasn't found
                    console.log('path:', reqData.pathname);                    
                    switch (reqData.pathname) {
                        case '/gamesdata':
                            adminDumpGames(bot, resolvedCode, response, reqData);
                            break;

                        case '/game':
                            adminDumpPlayers(bot, resolvedCode, response, reqData);
                            break;

                        case '/logsdata':
                            adminDumpLogs(bot, resolvedCode, response);
                            break;

                        case '/speak':
                            adminSpeak(bot, resolvedCode, response, reqData);
                            break;

                        case '/restartbot':
                            startBot();
                            break;
                    }
                }
            });

        } catch (err) {
            console.log('http err:', err);
        }

    }).listen(8081);

    // Console will print the message
    console.log('Server running at http://127.0.0.1:8081');
}, 1000 * 6 );

console.log('Waiting for the machine to warm up a bit, please wait....');
