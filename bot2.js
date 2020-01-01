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

/* destroy the invite timer, and also optionally update the properties in the last parameter while setting the timer to null */
function destroyInviteTimer(guildid, channelid, gameauthor, removefromdb, alsoupdatethese) {
    if (typeof removefromdb === 'undefined') {
        removefromdb = false;
    }
    if (typeof alsoupdatethese === 'undefined') {
        alsoupdatethese = {};
    }

    const timer = repo.timerGet(guildid, channelid, gameauthor);

    if (timer !== null) {

        clearInterval(timer);
        repo.timerClear(guildid, channelid, gameauthor);

        if (removefromdb) {            
            repo.dbUpdateForUser(guildid, gameauthor, channelid, alsoupdatethese);
        }
    }
}

function tellUserOfCancel(guildid, channelid, messageauthorid, options) {
    options = typeof options === 'undefined' ? {} : options;

    const optionalGameKeysInThisChannel = options.optionalGameKeysInThisChannel;
    const optionalMessage = options.optionalMessage;
    const deleteIt = typeof options.deleteIt !== 'undefined' && options.deleteIt;

    const game = typeof optionalGameKeysInThisChannel === 'undefined'
        ? repo.dbGetGame(guildid, repo.dbGetGameKeysForUser(guildid, messageauthorid, channelid))
        : repo.dbGetGame(guildid, optionalGameKeysInThisChannel);


    if (game.length === 0) {
        throw 'err: no game to cancel';
    }

    if (deleteIt) {
        cancelGame(guildid, channelid, messageauthorid);
    }

    const authorsGame = game.filter(f => f.isAuthor);
    if (authorsGame.length === 0) {
        return tellUser(guildid, channelid, messageauthorid, question_mark + ' *error* : no games, wut ' + question_mark, question_mark, optionalMessage);
    }

    const msg = (authorsGame[0].state === NS_INVITED)
        ? (messageauthorid === authorsGame[0].targetid
            ? ', <@!' + authorsGame[0].targetid + '> has not accepted your invitation.' //invite cancelled by target
            : ' game invite to <@!' + authorsGame[0].targetid + '> cancelled.') //invite cancelled by author

        : ', your game with ' +  // game in flow cancelled by somebody
            '<@!' + authorsGame[0].targetid +
            '> has been cancelled.';

    return tellUser(
        guildid,
        channelid,
        authorsGame[0].authorid,
        msg,
        broken_heart,
        optionalMessage);
}

function cancelGame(guildid, channelid, messageauthorid, options) {
    options = typeof options === 'undefined' ? {} : options;

    const optionalGameKeysInThisChannel = options.optionalGameKeysInThisChannel;

    const game = typeof optionalGameKeysInThisChannel === 'undefined'
        ? repo.dbGetGame(guildid, repo.dbGetGameKeysForUser(guildid, messageauthorid, channelid))
        : repo.dbGetGame(guildid, optionalGameKeysInThisChannel);


    if (game.length === 0) {
        throw 'err: no game to cancel';
    }
    destroyInviteTimer(guildid, channelid, game[0].authorid); ///---
    repo.dbRemoveGame(guildid, messageauthorid, channelid);

    const authorsGame = game.filter(f => f.isAuthor);
    if (authorsGame.length === 0) {
        throw 'err: wut no games';
    }
}

function timeoutOpenedNegociations(guildid, message, channelid, messageauthorid, targetid) {
    const timeoutMsg = ', your invitation has timed out.';
    return tellUsers(guildid, channelid, [messageauthorid, targetid], timeoutMsg, broken_heart, message);
}

function reOpenGameNegociation(guildid, message, channelid, messageauthorid, targetid, timeout, isWhite) {
    cancelGame(guildid, channelid, messageauthorid);
    return openGameNegociation(guildid, message, channelid, messageauthorid, targetid, timeout, isWhite);
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
                                            cancelGame(guildid, channelid, messageauthorid);
                                            timeoutOpenedNegociations(guildid, message, channelid, messageauthorid, targetid)
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
        return tellUser(guildid, channelid, userid, ' *You have no games.*', information, message);
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

                return author + ' vs ' + targetUsername + ' in ' + channel + ', ' + state + ', ...';
            });
    
    const msg = '*List:*  \n\t' + displayTheirGamesInProgress.join("\n\t");
    return message.channel
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
        ? '' //' ' + optionalemoji + ' '
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




var esrever = require('esrever');

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


const emoji_board_toolkit = [EMOJI_SHOW_LETTERS, EMOJI_SHOW_NUMBERS ];
const emoji_board_toolkit_withselection = [EMOJI_SHOW_LETTERS, EMOJI_SHOW_NUMBERS, EMOJI_INFO, EMOJI_CLEARSELECTION ];

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

function isValidMove(fen, move) {
    try {
        if (move === null || move.length < 2) return false;
        return (new Chess(fen).move(move, {sloppy:true}) !== null);
    } catch (err) {
        console.log('isValidMove',fen, move, err);
        return false;
    }
}

function isValidPiece(fen, piece) {
    try {
        if (piece === null || piece.length < 2) return false;
        return (new Chess(fen).get(piece) !== null);
    } catch (err) {
        console.log('isValidPiece', fen, piece, err);
        return false;
    }
}


function showBoardAscii(guildid, requesterid, channel, existingGame, reactionArray, whonext, whoNextGame, haveSelection, haveData, dataStr) {
    if (requesterid === null) {
        requesterid = whonext.whonextid;
    }

    var isFlipped = false;
    var board = '';
    var ascii = existingGame.chessjs.ascii();
    //console.log(ascii);
    if (!whoNextGame[0].isWhite) {
        isFlipped = true;
    }


    const boardName = repo.dbGetSettingDeckType(guildid, requesterid); //boardtype
    //console.log('showBoardAscii boardName', boardName);
    switch (boardName) {
        case '1default1':
        case '1default2':
        case '1default3':
        default:
            board = makeEmojiBoard(guildid, requesterid, existingGame.chessjs, isFlipped, boardName);
            //board = augmentAsciiBoard(guildid, requesterid, ascii, isFlipped);
            break;

        case 'ascii':
        case '':
            if (isFlipped) {
                ascii = ascii
                    .split('')
                    .reverse()
                    .join('');
                //console.log(ascii);

                var asciia = ascii.split("\n");
                asciia.shift();
                ascii = '  ' + asciia
                    .join('\n');
                //console.log(ascii);
            }
            board = '```' + ascii + '```';
          break
    }



    //if (!whoNextGame[0].isWhite) {
    //    board = board
    //        .split('')
    //        .reverse()
    //        .join('');

    //    var asciia = board.split("\n");
    //    asciia.shift();
    //    board = '  ' + asciia
    //        .join('\n');
    //}

    const additionalEmoji = [];
    if (haveSelection) {
        additionalEmoji.push(EMOJI_INFO);
    }
    if (haveData) {
        additionalEmoji.push(EMOJI_CLEARSELECTION);
    }

    if (additionalEmoji.length > 0) {
        return channel
            //.send(board + '\n')
            .send(board + dataStr + '\n<@' + whonext.whonextid + '> to play... ')
            .then(sentMessage => addEmojiArray(guildid, sentMessage, additionalEmoji))
            .then(sentReactionArray => {
                addEmojiArray(guildid, sentReactionArray[0].message, reactionArray);
            });
    } else {
        return channel
            .send(board + dataStr +'\n<@' + whonext.whonextid + '> to play... ')
            .then(sentMessage => addEmojiArray(guildid, sentMessage, reactionArray));
    }
}

if (typeof String.prototype.replaceAll === 'undefined') {
    String.prototype.replaceAll = function (replaceThis, withThis) {
        return this.split(replaceThis).join(withThis);
    }
}

function makeEmojiBoard(guildid, userid, chessjs, isFlipped, boardName) {
    const board = repo.dbGetCustomDeck(guildid, userid, boardName);

    //console.log('makeEmojiBoard', board, boardName);

    const result = [];
    const spaceUnicode = '            ';////'　';//unicode character (different to normal space)
    //const spaceUnicode2 = '.   ';////'　';//unicode character (different to normal space)
    const spaceUnicode3 = '      ';////'　';//unicode character (different to normal space)

    //const musicalbassclef = "" + (0xD834) + (0xDD1E); 
    //result.push(musicalbassclef);

    if (!isFlipped) {
        result.push(spaceUnicode3);
    }
    //console.log('wyut', board, board.wallplus, board['wallplus']);
    result.push(board['wallplus']);
    //if (isFlipped) {
    //    for (var i = 7; i >= 0; i--) { result.push(board.wallhorz); }
    //} else {
        for (var i = 0; i < 8; i++) { result.push(board['wallhorz']); }
    //}
    result.push(board['wallplus']);
    result.push('\n');

    const keys = [board['key1'], board['key2'], board['key3'], board['key4'], board['key5'], board['key6'], board['key7'], board['key8']];
    var rowNo = isFlipped ? 1 : 8;
    var yStagger = false;
    //console.log('board', chessjs.board());

    function loopThing(rowIndex, isFlipped) {





        //might need to reverse the board column array




        if (!isFlipped) {
            result.push(keys[rowIndex]);
        }
        result.push(board.wallvert);

        const start = isFlipped ? 7 : 0;
        const end = isFlipped ? 0 : 7;
        const step = isFlipped ? -1 : 1;
        for (var colIndex = start; true; colIndex += step) {
            if (isFlipped
                ? colIndex < end
                : colIndex > end)
                    break;

            const thisSquare = (colIndex === 0 || colIndex % 2 === 0)
                ? yStagger ? board.white : board.black
                : yStagger ? board.black : board.white;

            const piece = chessjs.get(letters[colIndex] + rowNo.toString());
            if (piece === null) {
                result.push(thisSquare);
            } else {
                //console.log('piece  man', colIndex, rowNo.toString(), piece, piece.color === 'w' ? piece.type.toUpperCase() : piece.type);
                result.push(board[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]); //{ type: 'p', color: 'b' }
            }
        }

        result.push(board.wallvert );

        if (isFlipped) {
            //result.push('**' + rowIndex.toString() + '**' + '\uFEFF');//+ keys[rowIndex]); <- cant get the unicode to render :(
            result.push(keys[rowIndex]); 
        }

        result.push('\n');
        rowNo += isFlipped ? 1 : -1;
        yStagger = !yStagger;
    }
    //console.log('result', result);
    if (isFlipped) {
        for (var rowIndex = 0; rowIndex < 8; rowIndex++)
            loopThing(rowIndex, isFlipped);

    } else {
        for (var rowIndex = 7; rowIndex >= 0; rowIndex--)
            loopThing(rowIndex, isFlipped);
    }

    if (!isFlipped) {
        result.push(spaceUnicode3);
    }
    result.push( board.wallplus);

//    if (isFlipped) {
  //      for (var i = 7; i >= 0; i--) {
    //        result.push(board.wallhorz);
   //     }
   // } else {
        for (var i = 0; i < 8; i++) {
            result.push(board.wallhorz);
        }
    //}
    result.push( board.wallplus);
    result.push('\n' );

    //return result.join('');

    const letterKeys = [board.keya, board.keyb, board.keyc, board.keyd, board.keye, board.keyf, board.keyg, board.keyh];

    //console.log('letterKeys', letterKeys, letterKeys.length);
    if (!isFlipped) {
        result.push(spaceUnicode);
    } else {
        result.push(board.black);
    }
    //const lettersTogether = board.keya + board.keyb + board.keyc + board.keyd + board.keye + board.keyf + board.keyg + board.keyh;
    if (!isFlipped) {
        for (var li = 0; li < 8; li++) {
            result.push('\uFEFF' + letterKeys[li]);
        }
    } else {
        for (var li = 7; li >= 0; li--) {
            if (li % 3 == 0) {
                result.push(' ');
            }
            result.push(' **' + letters[li].toUpperCase() + '**  ' );
        }
    }
    result.push(/*lettersTogether + */ '\n');
    //result.push(' \n' + '\uFEFF'); //different scale for emojis when outputted with plain text



    if (isFlipped) {
        return /*var ascii =*/ '\uFEFF' + result.join('\uFEFF');
        //ascii = ascii
        //    .split('');
        return '\uFEFF' + spaceUnicode3 + esrever.reverse(ascii);
        //    .join('');
        //console.log(ascii);


        //esrever.reverse(input);
    } else {
        return '\uFEFF' + result.join('');
    }
}

//function augmentAsciiBoard(guildid, userid, ascii, isFlipped) {
//    const boardName = repo.dbGetSettingDeckType(guildid, userid);
//    const board = repo.dbGetCustomDeck(guildid, userid)[boardName];

//    const asciiTransform1 = ascii.split('a');  
//    console.log('asciiTransform1 ', asciiTransform1 );
//    const asciiTransform2a = asciiTransform1[isFlipped ? 1 : 0 ]
//        .replaceAll("n", board.n)
//        .replaceAll("b", board.b)
//        .replaceAll("r", board.r)
//        .replaceAll("k", board.k)
//        .replaceAll("q", board.q)
//        .replaceAll("p", board.p)
//        .replaceAll("N", board.N)
//        .replaceAll("B", board.B)
//        .replaceAll("R", board.R)
//        .replaceAll("K", board.K)
//        .replaceAll("Q", board.Q)
//        .replaceAll("P", board.P);


//    const asciiTransform2bsource = asciiTransform2a
//        .split('8');

//    const splitIt = asciiTransform2bsource[isFlipped ? 0 : 1].split('\n');
//    const afterSplitItAll = [];
//    var yStagger = false;
//    console.log(ascii);
//    for (var i = 0; i < splitIt.length; i++) {
//        //var anyData = false;
//        const afterSplitIt = [];
//        const firstDotTestIndexOffset = 2 + (yStagger ? 1 : 0);
//        var startIndex = splitIt[i].indexOf('|') + firstDotTestIndexOffset; //<-- thankfully these characters are still ascii

//        var newLine = splitIt[i].substring(0, startIndex);
//        console.log('bewLine', newLine);
//        afterSplitIt.push(newLine);


//        var x = 0;
//        for (const symbol of splitIt[i]) { //the only way to iterate through unencoded symbols, rather than char's

//            console.log(symbol);
//            const isTestIndexTime = x === 0 || x % 2 == 0;
//            if (isTestIndexTime && symbol[startIndex + x] === '.') {
//                afterSplitIt.push(board.white);
//            } else {
//                afterSplitIt.push(symbol);
//            }


//            x++;
//        }


//        //////console.log('splitIt', startIndex, splitIt[i].length);
//        ////for (var x = 0; startIndex + x < splitIt[i].length; x++) {
//        ////    const isTestIndexTime = x === 0 || x % 2 == 0;
//        ////    //console.log('row ', startIndex ,x, splitIt[i][startIndex + x]);
//        ////    if (isTestIndexTime && splitIt[i][startIndex + x] === '.') {
//        ////        afterSplitIt.push(board.white);
//        ////    } else {
//        ////        afterSplitIt.push(splitIt[i][startIndex + x]);
//        ////    }
//        ////    //anyData = true;
//        ////}
//        yStagger = !yStagger;

//        //if (anyData)
//        //    afterSplitIt.push('\n');
//        afterSplitItAll.push(afterSplitIt.join(''));
//        //console.log('afterSplitIt1', afterSplitIt.join(''));
//        //console.log('afterSplitIt2', splitIt.join('\n'));
//    }
    
//    //const asciiTransform2b1 = splitIt.join('\n')
//    //    .replaceAll('---', board.wallhorz)
//    //    .replaceAll('|', board.wallvert)
//    //    .replaceAll('+', board.wallplus)
//    //    .replaceAll('.', board.black);

//    const asciiTransform2bOrNot2b
//        = isFlipped
//            ? [afterSplitItAll.join('\n'), asciiTransform2bsource[isFlipped ? 1 : 0]]
//                .join(board.key8)
//                + '          '
//            : [asciiTransform2bsource[isFlipped ? 1 : 0], afterSplitItAll.join('\n')]
//                .join(board.key8)
//                + '          ';

//    //for (i = asciiTransform2a.split('\n')
//    const asciiTransform2c = asciiTransform1[isFlipped ? 0 : 1]
//        //.replaceAll('     ', '  -  ')//leave one text character per line to scale down the emojis
//        .replaceAll('b', board.keyb)
//        .replaceAll('c', board.keyc)
//        .replaceAll('d', board.keyd)
//        .replaceAll('e', board.keye)
//        .replaceAll('f', board.keyf)
//        .replaceAll('g', board.keyg)
//        .replaceAll('h', board.keyh);

//    const asciiTransform3
//        = (isFlipped ? [asciiTransform2c, asciiTransform2bOrNot2b] : [asciiTransform2bOrNot2b, asciiTransform2c])
//            .join(board.keya)
//            .replaceAll('---', board.wallhorz)
//            .replaceAll('|', board.wallvert)
//            .replaceAll('+', board.wallplus)
//            .replaceAll('.', board.black)
//            .replaceAll('1', board.key1)
//            .replaceAll('2', board.key2)
//            .replaceAll('3', board.key3)
//            .replaceAll('4', board.key4)
//            .replaceAll('5', board.key5)
//            .replaceAll('6', board.key6)
//            .replaceAll('7', board.key7);

//    return asciiTransform3;
//    //dbGetSettingDeckType,
//    //    dbGetCustomDeck,
//}

function showBoard(guildid, requesterid, channel, existingGame, reactionArray, selected) {
    if (typeof selected === 'undefined') selected = null;
    if (typeof existingGame.chessjs === 'undefined' || existingGame.chessjs === null) return;

    const whonext = whoIsNext(guildid, existingGame.authorid, existingGame.targetid, channel.id)
    const whoNextGame = repo.dbGetForUserKey(guildid, whonext.whonextid, channel.id);

    var haveData = typeof whoNextGame[0].data !== 'undefined' && typeof whoNextGame[0].data.length > 0;
    var haveSelection = false;

    //if (selected === null) {
        if (whoNextGame.length > 0 && typeof whoNextGame[0].data !== 'undefined') {
            if (typeof existingGame.chessjs !== 'undefined' && existingGame.chessjs !== null) {
                const dataJoined = whoNextGame[0].data.join('');

                const isValidPieceResult = isValidPiece(existingGame.chessjs.fen(), dataJoined);
                const isValidMoveResult = isValidMove(existingGame.chessjs.fen(), dataJoined);

                if (isValidPieceResult || isValidMoveResult) {
                    selected = dataJoined;
                }
            }
        }
    //}    

    var dataStr = '';
    if (selected !== null && selected.length > 0) {
        haveSelection = true;
        dataStr = '**' + selected + '**  is selected.\t\t';
    } else if (haveData) {
        dataStr = question_mark + whoNextGame[0].data.join('') + question_mark + '  is selected.\t\t';
    }


    return showBoardAscii(guildid, requesterid, channel, existingGame, reactionArray, whonext, whoNextGame, haveSelection, haveData, dataStr);
}

function chessyInfo(guildid, channelid, messageauthorid, gameKeysInThisChannel, infoThing, chessjs, channel) {
    const fen = chessjs.fen();
    const infoString = JSON.stringify(chessy.getInfo(fen, [infoThing]), null, '\t');

    const moves = infoThing.match(VALID_SQUARE_REGEX)
        ? '\nPossible moves for ' + infoThing + ': ' + chessjs.moves({ square: infoThing, verbose: true }).map(m => m.to).join(", ")
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
            .then(t => showBoard(guildid, authorid, channel, game[0], emoji_board_toolkit));

    } else {
        return tellUserOfCancel(guildid, channelid, userid, { deleteIt: true });        
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
const https = require("https");


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
function processVerbData(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage, existingGame, isExistingGame) {
    const isMessageAuthorToPLay = isExistingGame
        ? whoIsNext(guildid, existingGame[0].authorid, existingGame[0].targetid, channelid).whonextid === messageauthorid
        : false;

    if (isExistingGame && existingGame[0].state === NS_ACCEPTED && isMessageAuthorToPLay) {
        var boardShow = false;

        const updateMe = repo.dbGetForUserKey(guildid, messageauthorid, channelid);

        if (typeof updateMe[0].data === 'undefined') {
            updateMe[0].data = [];
        }

        var cleaned = [];
        if (parsedMessage.infoThing !== null) {
            updateMe[0].data.push(parsedMessage.infoThing);
        }

        if (updateMe[0].data.join('').length <= 1) {
            cleaned = updateMe[0].data;
        } else {
            updateMe[0].data.join('').split('').forEach(function (val, index, array) {
                if (index == 0) return;
                if (index === array.length - 1 && index % 2 === 0) {
                    //odd number, and last one, add to result array or it will get missed since otherwise this function takes chunks of two
                    cleaned.push(val);
                }
                if (index % 2 === 0) return;

                const firstIsNumber = '0123456789'.includes((array[index - 1]).toString());
                const secondIsNumber = '0123456789'.includes((array[index]).toString());

                const firstIsLetter = letters.includes((array[index - 1]).toString());
                const secondIsLetter = letters.includes((array[index]).toString());

                // to help emoji reaction piece selection swap round numbers and letters if numbers come first. The engine likes letters first
                if (firstIsNumber && secondIsLetter) {
                    cleaned.push(val);
                    cleaned.push(array[index - 1]);
                } else if (firstIsLetter && secondIsNumber) {
                    cleaned.push(array[index - 1]);
                    cleaned.push(val);
                } else {
                    // probably not recognised format, but the chess engine may understand it
                    cleaned.push(array[index - 1]);
                    cleaned.push(val);
                }

            });
        }

        const readyData = cleaned.join('');

        const saveData = (readyData.length > 0)
            ? [readyData]
            : (parsedMessage.infoThing !== null)
                ? [parsedMessage.infoThing]
                : [];

        repo.dbUpdateForUser(guildid, messageauthorid, channelid, { data: saveData });
        existingGame[0].data = saveData;

        const piece = updateMe[0].data.join('');

        //auto move
        if (isValidMove(existingGame[0].chessjs.fen(), piece)) {
            parsedMessage.verb = 'move';
            parsedMessage.restOfMessage = [piece];
            processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);//, existingGame, isExistingGame);
            return;
        }

        if (piece.length > 1 && piece.length < 4) {
            /*
                 
                Really needs a from: and to:, separater to data[]
 
            */
            // If the data is a valid piece, auto move
            if (isValidPiece(existingGame[0].chessjs.fen(), piece)) {
                //if (existingGame[0].chessjs.get(piece) !== null) {
                boardShow = true;
            }

        } //else if (piece.length > 3) {
        //    if (new Chess(existingGame[0].chessjs.fen()).move(piece) !== null) {
        //        parsedMessage.verb = 'move';
        //        parsedMessage.restOfMessage = [piece];
        //        processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage, existingGame, isExistingGame);
        //        return;
        //    }
        //}
        if (parsedMessage.verb == 'select') {
            boardShow = true;
        }
        if (boardShow) {
            showBoard(guildid, messageauthorid, message.channel, existingGame[0], emoji_board_toolkit, piece)
                .catch(console.log);
        }
    }
}

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

            console.log('/* they have a game invite open *from* someone else, cancel that and make a new invite */', existingGame, parsedMessage);

            tellUserOfCancel(guildid, channelid, messageauthorid, { optionalGameKeysInThisChannel: gameKeysInThisChannel, optionalMessage: message, deleteIt:true })
                .then(t => openGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite))
                .catch(console.log);

        } else if (existingGame[0].authorid === parsedMessage.messageauthorid) {

            if (existingGame[0].targetid === parsedMessage.targetid) {
                console.log('/* they have aready invited this person, so reset the invite to these new parameters */');

                reOpenGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite)
                    .catch(console.log);

            } else {
                console.log('/* they have aready invited someomne else, so cancel the previous and start the new one */');

                tellUserOfCancel(guildid, channelid, messageauthorid, { optionalGameKeysInThisChannel: gameKeysInThisChannel, optionalMessage: message, deleteIt:true })
                    .then(t => openGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite))
                    .catch(console.log);

            }


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
        if (firstPiece.trim().length > 1) {
            const possibleMoves = chessjs.moves({ square: firstPiece, verbose: true  }).map(m => m.to);
            extraInfo = possibleMoves.length > 0
                ? '\n' + 'Valid moves for ' + firstPiece + ': ' + firstPiece + '-*' + possibleMoves.join('*, ' + firstPiece + '-*') + '*'
                : restOfMessage;
        }

        return tellUser(guildid, channelid, userid, ', sorry unable to move ' + move + extraInfo + exclamation, exclamation, message)
            .then(t => showBoard(guildid, userid, message.channel, repo.dbGetForUserKey(guildid, existingGame.authorid, channelid)[0], emoji_board_toolkit));
    }

    repo.dbUpdateForUser(guildid, existingGame.authorid, channelid, { chessjs });
    repo.dbUpdateForGame(guildid, existingGame.authorid, channelid, { data:[] });
    return showBoard(guildid, null, message.channel, repo.dbGetForUserKey(guildid, existingGame.authorid, channelid)[0], emoji_board_toolkit);
}

function getLettersNumbersForValidMoves(piece, existingGame, isWhite) {
    if (typeof piece === 'undefined') return [ emoji_navigation_letters, emoji_navigation_numbers ];
    if (piece.length < 2) {
        return [ emoji_navigation_letters, emoji_navigation_numbers ];
    }

    var testPiece = piece;

    if ( testPiece.length % 2 > 0) {
        testPiece = testPiece.substring(0, testPiece.length-2);
    }
    const finalPieces = [];
    var finalPiece = piece;
    for (var i=0; testPiece.length <= i; i+=2) {
        finalPieces.push(testPiece[i] + testpiece[i+1]);
    }
    if (finalPieces.length === 0) {
        finalPiece = piece;
    } else {
        finalPiece = finalPieces.join('');
    }

    //const pieceinfoObj = chessy.getInfo(existingGame.chessjs.fen(), [finalPiece]);
    //if (typeof pieceinfoObj[finalPiece] === 'undefined' || pieceinfoObj[finalPiece].sights.length === 0) {
    //    return [emoji_navigation_letters, emoji_navigation_numbers];
    //}
    //const pieceinfo = pieceinfo[finalPiece].sights;
    const pieceinfo = existingGame.chessjs.moves({ square: finalPiece, verbose: true });

    
    // only showing the first piece atm
    const ourLetters = pieceinfo.map(m => m.to[0]);
    const ourNumbers = pieceinfo.map(m => m.to[1]);


    var uniqueLetters = [...new Set(ourLetters)];
    var uniqueNumbers = [...new Set(ourNumbers)];

    if (!isWhite) {
        uniqueLetters = uniqueLetters.reverse();
        uniqueNumbers = uniqueNumbers.reverse();
    }

    //uniqueLetters.forEach(val => console.log('letters:', val, letters.indexOf(val)));
    //uniqueNumbers.forEach(val => console.log('numbers:', val, parseInt(val, 10)));
    const emojiLetters = uniqueLetters.map(val => emoji_navigation_letters[letters.indexOf(val)]);
    const emojiNumbers = uniqueNumbers.map(val => emoji_navigation_numbers[parseInt(val, 10)-1]);




    //const emojiLetters = uniqueLetters.map(val => (isWhite ? emoji_navigation_letters : emoji_navigation_letters.reverse())[letters.indexOf(val)]);
    //const emojiNumbers = uniqueNumbers.map(val => (isWhite ? emoji_navigation_numbers : emoji_navigation_numbers.reverse())[numbers.indexOf(val)]);

    return [emojiLetters, emojiNumbers ];
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

function isValidSettingName(setting_name) {
    const validNameRegex = /^[a-z]+$/g;
    if (typeof setting_name === 'undefined' || setting_name === null || setting_name.length === 0) return false;
    return setting_name.match(validNameRegex);
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
                tellUserOfCancel(guildid, channelid, messageauthorid, { optionalGameKeysInThisChannel: gameKeysInThisChannel, deleteIt:true })
                    .catch(console.log);
            }
            break;

        case 'get':
            const settings = repo.dbGetSettings(guildid, messageauthorid);
            const ourGettings = settings.length > 0 ? settings[0] : {};

            if (typeof parsedMessage.settingName === 'undefined' || parsedMessage.settingName === null || parsedMessage.settingName.length === 0) {
                const endMessageParts = ['\n' + emoji_speakinghead + '  '];
                if (Object.keys(ourGettings).length) {
                    Object.keys(ourGettings).forEach(key => {
                        if (!isValidSettingName(key)) return;
                        endMessageParts.push('\n  - Setting `' + key + '` is:\n```' + ourGettings[key] + '```');
                    });
                }
                tellUser(guildid, channelid, messageauthorid, '\n' + endMessageParts.join('\n'), emoji_speakinghead, message)
                    .catch(console.log);
                return;
            }

            if (ourGettings.hasOwnProperty(parsedMessage.settingName)) {
                tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead + '  setting `' + parsedMessage.settingName + '` is:\n```' + ourGettings[parsedMessage.settingName] + '```', emoji_speakinghead, message)
                    .catch(console.log);

            } else {
                tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead +'  setting `' + parsedMessage.settingName + '` unknown.', emoji_speakinghead, message)
                    .catch(console.log);

            }
            break;

        case 'set':
            const setting_name = parsedMessage.settingName;
            if (!isValidSettingName(setting_name)) {
                return;
            }
            var saveSettingObj = {};
            if (typeof parsedMessage.settingName !== 'undefined' && parsedMessage.settingStuff != null && parsedMessage.settingStuff.length == 1) {
                const token = parsedMessage.settingStuff[0].toLowerCase();
                switch (token) {
                    case 'clear':
                    case 'reset':
                        // delete their local default one, so the board renders with the default
                        saveSettingObj[setting_name] = null;
                        try {
                            repo.dbUpdateSetting(guildid, messageauthorid, saveSettingObj)
                            tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead + ' ' + settingName + 'reset.', emoji_speakinghead, message)
                                .catch(console.log);
                            saveSettingObj = {};
                        } catch (err) {
                            tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead + '  ' + exclamation + ' error saving:\n> ' + err, emoji_speakinghead, message)
                                .catch(console.log);
                        }
                        return;

                    default:
                        break;
                } /*Scraappy test probably */
            } else if (typeof parsedMessage.settingName === 'undefined' || typeof parsedMessage.settingName === null || parsedMessage.settingStuff.length == 0) {
                try {

                    //get the attachment

                    //strip out functions by JSON.parse( JSON.stringify( loaded ) )

                    console.log('message.attachments', message.attachments.first());
                    const first = message.attachments.first();
                    if (first == undefined) {
                        return;
                    }
                    console.log('first', first);
                    if (first.filesize > 3000) {
                        return;
                    }
                    // var http = require('http');
                    // var fs = require('fs');

                    // var download = function (url, dest, cb) {
                    //     var file = fs.createWriteStream(dest);
                    //     var request = http.get(url, function (response) {
                    //         response.pipe(file);
                    //         file.on('finish', function () {
                    //             file.close(cb);
                    //         });
                    //     });
                    // }


                    
                    //const file = fs.createWriteStream("data.txt");
                    function downloads(url, dest, cb)
                    {
                        const file = fs.createWriteStream(dest);
                        https.get(url, response => {
                            var stream = response.pipe(file);
                        
                            
                            file.on('finish', function () {
                                file.close(cb);
                            });

                            stream.on("finish", function() {
                                console.log("done");
                            });
                        });
                    }

                    //https://github.com/nodejs/node/issues/23033

                    // function GetFileEncodingHeader(filePath) {
                    //     const readStream = fs.openSync(filePath, 'r');
                    //     const bufferSize = 2;
                    //     const buffer = new Buffer(bufferSize);
                    //     let readBytes = 0;
                    
                    //     if (readBytes = fs.readSync(readStream, buffer, 0, bufferSize, 0)) {
                    //         const header = buffer.slice(0, readBytes).toString("hex");
                    
                    //         if (header === "fffe") {
                    //             return "utf16le";
                    //         } else if (header === "feff") {
                    //             return "utf16be";
                    //         } else if (header.startsWith("ff") || header.startsWith("fe") || header.startsWith("ef")) {
                    //             return "utf8";
                    //         }
                    //     }
                    
                    //     return "";
                    // }
                    
                    // function ReadFileSync(filePath, desiredEncoding) {
                    //     if (!desiredEncoding || desiredEncoding == null || desiredEncoding === "undefined") {
                    //         return fs.readFileSync(filePath);
                    //     } else if (desiredEncoding === "binary" || desiredEncoding === "hex") {
                    //         return fs.readFileSync(filePath, desiredEncoding);
                    //     }
                    
                    //     const fileEncoding = GetFileEncodingHeader(filePath);
                    //     let fileEncodingBytes = 0;
                    //     let content = null;
                    
                    //     if (desiredEncoding === "ucs2") {
                    //         desiredEncoding = "utf16le";
                    //     } else if (desiredEncoding === "ascii") {
                    //         desiredEncoding = "utf8";
                    //     }
                    
                    //     if (fileEncoding === "utf16le" || fileEncoding === "utf16be") {
                    //         fileEncodingBytes = 2;
                    //         content = fs.readFileSync(filePath, "ucs2"); // utf-16 Little Endian
                    
                    //         if (desiredEncoding != fileEncoding && desiredEncoding !== "default" &&
                    //             !(fileEncoding == "utf16le" && desiredEncoding === "utf8")) {
                    
                    //             content = content.swap16();
                    //         }
                    //     } else {
                    //         if (fileEncoding === "utf8") {
                    //             fileEncodingBytes = 1;
                    //         }
                    
                    //         content = fs.readFileSync(filePath, "utf8");
                    //     }
                    
                    //     if (desiredEncoding === "default") {
                    //         return content; // Per documentation, no encoding means return a raw buffer.
                    //     }
                    
                    //     return content.toString(desiredEncoding, fileEncodingBytes);
                    // }
                    

                    // //https://github.com/nodejs/node/issues/23033
                    // function GetJson(filePath) {
                    //     const jsonContents = ReadFileSync(filePath, "utf16be");
                    //     console.log(GetFileEncodingHeader(filePath));
                    
                    //     return JSON.parse(jsonContents);
                    // }

                    try {
                        const tempfilename = first.id + '.download';

                        downloads(first.url, tempfilename,
                            function (wut) {
                            console.log('first.url, tempfilename', first.url, tempfilename);
                            
                            //var downloaded = GetJson(tempfilename);
                            //var downloaded = fs.readFileSync(tempfilename);
                            var downloaded = new TextDecoder('utf-16le').decode(fs.readFileSync(tempfilename));
                            var downloaded21 = new TextDecoder('utf-16').decode(fs.readFileSync(tempfilename));
                            //console.log('downloaded.toString()', downloaded.toString());
                            //const one = JSON.stringify(downloaded.toString());
                            //const two = JSON.parse(one);
                            //const dataObj = two;

                            const updateObj = {};
                            updateObj[setting_name] = downloaded;
                            repo.dbUpdateSetting(guildid, messageauthorid, updateObj);

                            tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead + '  setting `' + setting_name + '` set to:\n```' + updateObj[setting_name] + '```', emoji_speakinghead, message)
                                .catch(console.log);

                            //fs.unlink(tempfilename);
                        });

                    } catch (err) {console.log('} catch (err) {', err); }
                } catch (err) {
                    tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead + '  ' + exclamation + ' error saving:\n> ' + err, emoji_speakinghead, message)
                        .catch(console.log);
                    
                    
                }
                return;
            }
            
            try {
                saveSettingObj[setting_name] = parsedMessage.settingStuff.join(' ');
                //if (JSON.stringify(saveSettingObj) !== JSON.stringify(JSON.parse(JSON.stringify(saveSettingObj)))) {
                //    throw 'invalid setting';
                //}

                repo.dbUpdateSetting(guildid, messageauthorid, saveSettingObj);

                tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead + '  setting `' + setting_name + '` set to:\n```' + saveSettingObj[setting_name] + '```', emoji_speakinghead, message)
                    .catch(console.log);

                saveSettingObj = {};
            } catch (err) {
                tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead + '  ' + exclamation + ' error saving:\n> ' + err, emoji_speakinghead, message)
                    .catch(console.log);
            }
            break;

        case 'list':
            switch (parsedMessage.listThing) {
                case 'settings':
                    tellThemTheListOfSetings(guildid, channelid, messageauthorid, message)
                        .catch(console.log);
                    break;
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
                /*if (parsedMessage.infoThing.toLowerCase() === 'clear') {parsedMessage.infoThing = '';};*/

                var infoThing = messageauthorsgame.data.join('');
                if (parsedMessage.infoThing.length > 0) {
                    infoThing = parsedMessage.infoThing;
                }

                repo.dbUpdateForUser(guildid, messageauthorid, channelid, { data: messageauthorsgame.data });

                /* 
                  
                    How to show the info?????
                  
                 */
                /////////////////showInfo(guildid, message.channel, messageauthorsgame, messageauthorid, infoThing);


                showBoard(guildid, messageauthorid, message.channel, messageauthorsgame, emoji_board_toolkit)
                    .catch(console.log);
                //chessyInfo(guildid, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage.infoThing, existingGame[0].chessjs, message.channel)
                //    .catch(console.log);
            }                        
            break;

        case 'board':
            if (isExistingGame) {
                showBoard(guildid, messageauthorid, message.channel, existingGame[0], emoji_board_toolkit)
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

        case 'select':
            if (isExistingGame) {
                repo.dbUpdateForUser(guildid, messageauthorid, channelid, { data: [parsedMessage.infoThing] })
                parsedMessage.infoThing = null;
            }
            //fall through.....

        case 'data':
            processVerbData(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage, existingGame, isExistingGame);
            break;

        default:
            break;
    }
}

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
                const isWhite = (!isTarget && authorGame[0].isWhite) || !authorGame[0].isWhite;

                const reactionEmojiName = reaction.emoji.name;
                const isAcceptance = reactionEmojiName == EMOJI_ACCEPT_GAME;
                const isRejection = reactionEmojiName == EMOJI_REJECT_GAME;

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
                                ? getLettersNumbersForValidMoves(reactorGame.data.join(''), authorGame[0], isWhite)[0]
                                : emoji_navigation_letters;
                                               
                            addEmojiArray(guildid, reaction.message, emoji_navigation_letters, (t) => letters.includes(t))
                                //.then(t => addEmojiArray(guildid, reaction.message, [ EMOJI_SHOW_NUMBERS ]))
                                .catch(console.log);

                            isProcessed = true;
                            break;

                        case EMOJI_SHOW_NUMBERS:
                            const numbers = haveSelection 
                                ? getLettersNumbersForValidMoves(reactorGame.data.join(''), authorGame[0], isWhite)[1]
                                : emoji_navigation_numbers;

                            addEmojiArray(guildid, reaction.message, emoji_navigation_numbers, (t) => numbers.includes(t) )
                                .catch(console.log);
                            isProcessed = true;
                            break;

                        case EMOJI_CLEARSELECTION:
                            repo.dbUpdateForUser(guildid, userid, channelid, { data: [] });
                            const passGame = repo.dbGetForUserKey(guildid, reactorGame.authorid, channelid)[0];
                            showBoard(guildid, userid, reaction.message.channel, passGame, emoji_board_toolkit, null);
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
                        infoThing: (emoji_navigation_numbers.indexOf(reactionEmojiName)+1).toString(),
                        userid: userid

                    });
                    return;
                } else if (emoji_navigation_letters.includes(reactionEmojiName) ) {
                    processVerb(guildid, reaction.message, channelid, userid, repo.dbGetGameKeysForUser(guildid, userid, channelid), {
                        verb: 'data',
                        infoThing: letters[emoji_navigation_letters.indexOf(reactionEmojiName)],
                        userid: userid
                    });
                    return;
                }

            });

            bot.on('message', function (message) {
                if (message.author.id === bot.user.id)
                    return;

                const botMentions = message.mentions.users.filter(m => m.id === bot.user.id).array();

                const guildid = message.channel.guild.id;
                const messageauthorid = message.author.id;
                const channelid = message.channel.id;

                var isExpectedPlayer = false;

                // if this function is not applicable then get out of here ASAP, and don't clog up the indenting on your way out
                if (/*typeof botMentions === 'undefined' || botMentions === null ||*/ botMentions.length === 0) {
                    const anyGames = repo.dbIsAny(guildid, messageauthorid, channelid);
                    if (anyGames) {
                        const userWantsAutoReact = repo.dbGetSettingAutoReact(guildid, messageauthorid);
                        if (userWantsAutoReact) {
                            const quickCheckGames = repo.dbGetGame(guildid, repo.dbGetGameKeysForUser(guildid, messageauthorid, channelid));
                            const whonext = whoIsNext(guildid, quickCheckGames[0].authorid, quickCheckGames[0].targetid, channelid);
                            if (whonext.whonextid === messageauthorid) {
                                isExpectedPlayer = true;
                            }
                        }
                    }
                    if (!isExpectedPlayer) {
                        return;
                    }
                }

                const content = message.content;

                console.log(messageauthorid, channelid, content, '<-------- on message');

                const allNonBotMentions
                    = message.mentions.users
                        .filter(m => m.id !== bot.user.id && m.id !== messageauthorid).array();

                const gameKeysInThisChannel = repo.dbGetGameKeysForUser(guildid, messageauthorid, channelid);

                const parsedMessage = parser.parseMessage(bot, messageauthorid, channelid, content, allNonBotMentions, gameKeysInThisChannel);

                console.log(parsedMessage, '<-------- on message');
                processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);

            });
        } catch (err) {
            console.log('err:', err);
        }

    }, 1000 * 2 /* deep breath, count to two */ );
}
startBot();


// function makeDebugMoveObj(moveObjs) {
//     var target = (typeof moveObjs.target !== 'undefined' && moveObjs.target !== null)
//         ? moveObjs.target
//         : { username: '' };

//     return {
//         verb: moveObjs.verb,
//         target: target.username,
//         restOfMessage: moveObjs.restOfMessage.join(),
//         playerwhite: moveObjs.playerwhite,
//         playerblack: moveObjs.playerblack,
//         timeout: moveObjs.timeout
//     };
// }


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
