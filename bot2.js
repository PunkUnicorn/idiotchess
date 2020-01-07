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

    if (game[0].state !== NS_INVITED) {
        repo.dbDecrementGameCount();
    }

    const authorsGame = game.filter(f => f.isAuthor);
    if (authorsGame.length === 0) {
        throw 'err: wut no games';
    }
}

function timeoutOpenedNegociations(guildid, message, channelid, messageauthorid, targetid) {
    const timeoutMsg = ', your invitation has timed out.';
    return tellUsers(guildid, channelid, [messageauthorid, targetid], timeoutMsg, broken_heart, message);
}

function reOpenGameNegociation(guildid, message, channelid, messageauthorid, targetid, timeout, isWhite, fenStuff, pgnStuff) {
    cancelGame(guildid, channelid, messageauthorid);
    return openGameNegociation(guildid, message, channelid, messageauthorid, targetid, timeout, isWhite, fenStuff, pgnStuff);
}

function openGameNegociation(guildid, message, channelid, messageauthorid, targetid, invitetimeoutmins, iswhite, fenStuff, pgnStuff) {
    var targetname = message.channel.guild.members.find(f => f.id === targetid).nickname;
    targetname = targetname === null
        ? message.channel.guild.members.find(f => f.id === targetid).user.username
        : targetname;

    var authorname = message.channel.guild.members.find(f => f.id === messageauthorid).nickname;
    authorname = authorname === null
        ? message.channel.guild.members.find(f => f.id === messageauthorid).user.username
        : authorname;

        return message.react(love_letter)
        .then(function (reaction) {
            // Invite message
            message.channel
                //.send('<@!' + targetid + '> You have been challenged by <@!' + messageauthorid + '>, do you accept?')
                .send(targetname + ' you have been challenged by '+ authorname + ', do you accept?')
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
                                        gameStarted: dateStarted,
                                        fenStuff: ( fenStuff == null ? [] : fenStuff ),
                                        pgnStuff: ( pgnStuff == null ? [] : pgnStuff )
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
const EMOJI_PRIZE = emoji_trophy;

const EMOJI_SCROLL_LOLWUT = emoji_scroll;
const EMOJI_CLEARSELECTION = emoji_crossundo;

const EMOJI_SETTINGS = emoji_gear;


const emoji_board_toolkit = [EMOJI_SHOW_LETTERS, EMOJI_SHOW_NUMBERS ];
const emoji_board_toolkit_withselection = [EMOJI_SHOW_LETTERS, EMOJI_SHOW_NUMBERS, EMOJI_INFO, EMOJI_CLEARSELECTION ];
const emoji_board_prize = [ EMOJI_PRIZE ];

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


function showBoardAscii(guildid, requesterid, channel, existingGame, reactionArray, whonext, whoNextGame, haveSelection, haveData, dataStr, usefulState, isOver, isWon, overReason) {
    if (requesterid === null) {
        requesterid = whonext.whonextid;
    }

    var isFlipped = false;
    var board = '';
    var ascii = existingGame.chessjs.ascii();

    if (!whoNextGame[0].isWhite) {
        const setting = repo.dbGetSettingAutoFlip(guildid, requesterid);
        if (typeof setting === 'undefined') {
            isFlipped = true;
        } else {
            isFlipped = setting;
        }
    }


    const boardName = repo.dbGetSettingDeckType(guildid, requesterid); 

    switch (boardName) {
        case '1default1':
        case '1default2':
        case '1default3':
        default:
            board = makeEmojiBoard(guildid, requesterid, existingGame.chessjs, isFlipped, boardName);
            break;

        case 'ascii':
        case '':
            if (isFlipped) {
                ascii = ascii
                    .split('')
                    .reverse()
                    .join('');

                var asciia = ascii.split("\n");
                asciia.shift();
                ascii = '  ' + asciia
                    .join('\n');
            }
            board = '```' + ascii + '```';
          break
    }

    const additionalEmoji = [];
    if (haveSelection) {
        additionalEmoji.push(EMOJI_INFO);
    }
    if (haveData) {
        additionalEmoji.push(EMOJI_CLEARSELECTION);
    }

    const whoPlayNext = isOver 
        ? '\n' + overReason + '... ' 
        : '\n<@' + whonext.whonextid + '> to play... ' ;

    if (isOver) {
        //Message to say Thank you! please click (something) to end the game
        const overMsg = 'Thank you for using the idiotchess bot.' + isWon ? ' And congratulations to the winner!' : '';
        tellUsers(guildid, channel.id, [whoNextGame[0].authorid, whoNextGame[0].targetid], overMsg, emoji_ribbon);
        //  pgn to get the pgn
        //  this game will auto-close in 1 min
        //  offer icon to close
        //or just delete the game
        repo.dbRemoveGame(guildid, userid, channel.id);
        repo.dbDecrementGameCount();
    }

    if (additionalEmoji.length > 0 && !isOver) {
        return channel
            .send(board + dataStr + usefulState + whoPlayNext)
            .then(sentMessage => addEmojiArray(guildid, sentMessage, additionalEmoji))
            .then(sentReactionArray => {
                addEmojiArray(guildid, sentReactionArray[0].message, reactionArray);
            });
    } else {
        return channel
            .send(board + dataStr + usefulState + whoPlayNext)
            .then(sentMessage => addEmojiArray(guildid, sentMessage, isOver ? (isWon ? emoji_board_prize : []) : reactionArray));

    }
}

if (typeof String.prototype.replaceAll === 'undefined') {
    String.prototype.replaceAll = function (replaceThis, withThis) {
        return this.split(replaceThis).join(withThis);
    }
}

function makeEmojiBoard(guildid, userid, chessjs, isFlipped, boardName) {
    const board = repo.dbGetCustomDeck(guildid, userid, boardName);

    const result = [];
    const spaceUnicode = '            ';//unicode spaces (different to normal space)
    const spaceUnicode3 = '      ';;//unicode spaces (different to normal space)

    if (!isFlipped) {
        result.push(spaceUnicode3);
    }

    result.push(board['wallplus']);

    for (var i = 0; i < 8; i++) { 
        result.push(board['wallhorz']); 
    }

    result.push(board['wallplus']);
    result.push('\n');

    const keys = [board['key1'], board['key2'], board['key3'], board['key4'], board['key5'], board['key6'], board['key7'], board['key8']];
    var rowNo = isFlipped ? 1 : 8;
    var yStagger = false;

    function loopThing(rowIndex, isFlipped) {
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
                ? yStagger ? board.black : board.white
                : yStagger ? board.white : board.black;

            const piece = chessjs.get(letters[colIndex] + rowNo.toString());

            if (piece === null) {
                result.push(thisSquare);
            } else {
                result.push(board[piece.color === 'w' ? piece.type.toUpperCase() : piece.type]);
            }
        }

        result.push(board.wallvert );

        if (isFlipped) {
            result.push(keys[rowIndex]); 
        }

        result.push('\n');
        rowNo += isFlipped ? 1 : -1;
        yStagger = !yStagger;
    }

    if (isFlipped) {
        for (var rowIndex = 0; rowIndex < 8; rowIndex++) {
            loopThing(rowIndex, isFlipped);
        }
    } else {
        for (var rowIndex = 7; rowIndex >= 0; rowIndex--) {
            loopThing(rowIndex, isFlipped);
        }
    }

    if (!isFlipped) {
        result.push(spaceUnicode3);
    }
    result.push( board.wallplus);

    for (var i = 0; i < 8; i++) {
        result.push(board.wallhorz);
    }
    result.push( board.wallplus);
    result.push('\n' );

    const letterKeys = [board.keya, board.keyb, board.keyc, board.keyd, board.keye, board.keyf, board.keyg, board.keyh];

    if (!isFlipped) {
        result.push(spaceUnicode);
    } else {
        result.push('　  ' /*funny unicode spaces - special width and a couple of tiny unicode space*/);
    }

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
    result.push('\n');

    if (isFlipped) {
        return '\uFEFF' + result.join('\uFEFF');
    } else {
        return '\uFEFF' + result.join('');
    }
}

function showBoard(guildid, requesterid, channel, existingGame, reactionArray, selected) {
    if (typeof selected === 'undefined') selected = null;
    if (typeof existingGame.chessjs === 'undefined' || existingGame.chessjs === null) return;

    const chessjs = existingGame.chessjs;
    const isOver = chessjs.game_over();
    var overReason = ''
    var isWon = false;

    if (isOver) {
/*      GAME OVER, MAN, GAME OVER. WHAT THE FUCK ARE WE SUPPOSED TO DO NOW?         
        http://www.asciiartfarts.com/alien.html


       __.,,------.._                                                        
     ,'"   _      _   "`.                                                    
    /.__, ._  -=- _"`    Y                                                   
   (.____.-.`      ""`   j                                                   
    VvvvvvV`.Y,.    _.,-'       ,     ,     ,                                
        Y    ||,   '"\         ,/    ,/    ./                                
        |   ,'  ,     `-..,'_,'/___,'/   ,'/   ,                             
   ..  ,;,,',-'"\,'  ,  .     '     ' ""' '--,/    .. ..                     
 ,'. `.`---'     `, /  , Y -=-    ,'   ,   ,. .`-..||_|| ..                  
ff\\`. `._        /f ,'j j , ,' ,   , f ,  \=\ Y   || ||`||_..               
l` \` `.`."`-..,-' j  /./ /, , / , / /l \   \=\l   || `' || ||...            
 `  `   `-._ `-.,-/ ,' /`"/-/-/-/-"'''"`.`.  `'.\--`'--..`'_`' || ,          
            "`-_,',  ,'  f    ,   /      `._    ``._     ,  `-.`'//         ,
          ,-"'' _.,-'    l_,-'_,,'          "`-._ . "`. /|     `.'\ ,       |
        ,',.,-'"          \=) ,`-.         ,    `-'._`.V |       \ // .. . /j
        |f\\               `._ )-."`.     /|         `.| |        `.`-||-\\/ 
        l` \`                 "`._   "`--' j          j' j          `-`---'  
         `  `                     "`_,-','/       ,-'"  /                    
                                 ,'",__,-'       /,, ,-'                     
                                 Vvv'            VVv'                                       */
        if ( chessjs.in_checkmate() ) { /*--------------------------------------------------*/
            overReason = 'Checkmate';
            isWon = true;
        } else if (chessjs.in_stalemate()) {
             overReason = 'Stalemate';
        } else if (chessjs.in_draw()) {
            overReason = 'Draw';
        }
    }

    const isInsufficientMaterial = chessjs.insufficient_material() 
        ? '*Insufficient material for a win (K vs. K, K vs. KB, or K vs. KN)*'
        : '';

    const isThreeFold = chessjs.in_threefold_repetition() 
        ? "*Threefold repetition has occurred*" 
        : '';

    const isCheck = chessjs.in_check() 
        ? ' *Checkmate*'  
        : '';

    const usefulStateRaw = [isInsufficientMaterial, isThreeFold, isCheck].filter(f => f !== '\n' && f.length > 0).join('\n');
    const usefulState = usefulStateRaw.length > 0 
        ? '\n' + warning + ' ' + usefulStateRaw + '\n'
        : '';

    const whonext = whoIsNext(guildid, existingGame.authorid, existingGame.targetid, channel.id)
    const whoNextGame = repo.dbGetForUserKey(guildid, whonext.whonextid, channel.id);    

    var haveData = typeof whoNextGame[0].data !== 'undefined' && typeof whoNextGame[0].data.length > 0;
    var haveSelection = false;

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

    var dataStr = '';
    if (selected !== null && selected.length > 0) {
        haveSelection = true;
        dataStr = '**' + selected + '**  is selected.\t\t';
    } else if (haveData) {
        dataStr = question_mark + whoNextGame[0].data.join('') + question_mark + '  is selected.\t\t';
    }


    return showBoardAscii(guildid, requesterid, channel, existingGame, reactionArray, whonext, whoNextGame, haveSelection, haveData, dataStr, usefulState, isOver, isWon, overReason);
}

function chessyInfo(guildid, channelid, messageauthorid, infoThing, chessjs, channel) {
    const fen = chessjs.fen();

    const infoObj = ( chessy.getInfo(fen, [infoThing]) )[infoThing];

    const pieceDataStr0 = infoObj.piece != null
        ? infoThing + ': ' + [infoObj.piece.color, infoObj.piece.type].join(", ") + '\n'
        : '';

    const pieceDateStr1 = infoObj.attacking !== null 
        ? 'Ia attacking:' + infoObj.attacking.join(', ') + '\n'
        : '';

    const pieceDateStr2 = infoObj.defenses !== null 
        ? 'Defended by: ' + infoObj.defenses.join(', ') + '\n'
        : '';

    const pieceDateStr3 = infoObj.defending !== null 
        ? 'Is defending: ' + infoObj.defending.join(', ') + '\n'
        : '';

    const pieceDateStr4 = infoObj.threats !== null 
        ? 'Threatened by: ' + infoObj.threats.join(', ') + '\n'
        : '';

    const pieceDateStr5 = infoObj.sights !== null 
        ? 'Can see: ' + infoObj.sights.join(', ') + '\n'
        : '';

    const pieceDateStr = pieceDataStr0+pieceDateStr1+pieceDateStr2+pieceDateStr3+pieceDateStr4+pieceDateStr5;

    const daMoves = chessjs.moves({ square: infoThing, verbose: true });
    const moves = daMoves.length > 0
        ? '\nMoves for ' + infoThing + ': ' + daMoves.map(m => m.to).join(", ") + '\n'
        : '\nThis piece can not move\n';


    const infoString = '```' + pieceDateStr + moves + '```';
    return tellUser(guildid, channelid, messageauthorid, infoString, EMOJI_INFO);
}

function reactGameInvite(guildid, channel, userid, authorid, isAcceptance, isWhite, fenStuff, pgnStuff) {
    const channelid = channel.id;

    if (isAcceptance) {

        //it's ON!

        var chessjs = null;
        if (typeof pgnStuff !== 'undefined' && pgnStuff.length > 0) {
            try {    
                chessjs = new Chess();
                chessjs.load_pgn(pgnStuff.join(' '));
            } catch (err) {
                console.log('reactGameInvite pgn err', pgnStuff, err);
            }
        } else  {
            try {
                chessjs = typeof fenStuff === 'undefined' || fenStuff.length === 0 
                    ? new Chess()
                    : new Chess(fenStuff.join(' '));
            } catch(err) {
                console.log('reactGameInvite fen err', fenStuff, err);
            }
        }

        destroyInviteTimer(guildid, channelid, authorid, true, { chessjs:chessjs, fenStuff:[], pgnStuff:[] }/*<-- which also updates the author row with this */);

        repo.dbUpdateGameTarget(guildid, authorid, channelid, userid, { isWhite });
        repo.dbUpdateForGame(guildid, authorid, channelid, { state: NS_ACCEPTED });

        repo.dbIncrementGameCount();

        /*LOGGING*/
        {
            const game = repo.dbGetForUserKey(guildid, authorid, channelid);
            console.log('new game', guildid, channelid, authorid, game);
        }

        return channel.send("It's ON! ")
            .then(t => showBoard(guildid, null, channel, repo.dbGetForUserKey(guildid, authorid, channelid)[0], emoji_board_toolkit));

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

/// UNICODE SPACING SPACES http://jkorpela.fi/chars/spaces.html



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
                    /*odd number, so add the last character to result array, or otherwise it 
                      will get missed since otherwise this function takes chunks of two */
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
            try {
                parsedMessage.verb = 'move';
                parsedMessage.restOfMessage = [piece];
                processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);//, existingGame, isExistingGame);
            } catch (err) {
                console.log('processVerbData', err);
            }
            return;
        }

        if (piece.length > 1 && piece.length < 4) {

            /*
                 
                Really needs a from: and to:, separater to just a single 'data[]'
 
            */

            // If the data is a valid piece, auto move
            if (isValidPiece(existingGame[0].chessjs.fen(), piece)) {
                boardShow = true;
            }

        }

        if (parsedMessage.verb == 'select') {
            boardShow = true;
        }
        if (boardShow) {
            showBoard(guildid, null, message.channel, existingGame[0], emoji_board_toolkit, piece)
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

            openGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite, parsedMessage.fenStuff, parsedMessage.pgnStuff)
                .catch(console.log);

        }
    } else if (existingGame[0].state === NS_INVITED) {
        console.log('/* is existing game! */');

        if (existingGame[0].authorid !== parsedMessage.messageauthorid) {

            console.log('/* they have a game invite open *from* someone else, cancel that and make a new invite */', existingGame, parsedMessage);

            tellUserOfCancel(guildid, channelid, messageauthorid, { optionalGameKeysInThisChannel: gameKeysInThisChannel, optionalMessage: message, deleteIt:true })
                .then(t => openGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite, parsedMessage.fenStuff, parsedMessage.pgnStuff))
                .catch(console.log);

        } else if (existingGame[0].authorid === parsedMessage.messageauthorid) {

            if (existingGame[0].targetid === parsedMessage.targetid) {
                console.log('/* they have aready invited this person, so reset the invite to these new parameters */');

                reOpenGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite, parsedMessage.fenStuff, parsedMessage.pgnStuff)
                    .catch(console.log);

            } else {
                console.log('/* they have aready invited someomne else, so cancel the previous and start the new one */');

                tellUserOfCancel(guildid, channelid, messageauthorid, { optionalGameKeysInThisChannel: gameKeysInThisChannel, optionalMessage: message, deleteIt:true })
                    .then(t => openGameNegociation(guildid, message, channelid, messageauthorid, parsedMessage.targetid, parsedMessage.timeout, parsedMessage.isWhite, parsedMessage.fenStuff, parsedMessage.pgnStuff))
                    .catch(console.log);

            }


        } else if (existingGame[0].targetid === parsedMessage.messageauthorid) {

            console.log('/* they are the target of an open invite, accept the invite */');

            acceptGameNegociation(guildid, channelid, messageauthorid, gameKeysInThisChannel)
                .catch(console.log);

        }
    } else if (existingGame[0].state === NS_ACCEPTED) {
        try {
            console.log(' /* game in flow, take \'play\' to mean move a piece */');
            parsedMessage.verb = 'move';
            processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);
        } catch (err) {
            console.log('processVerbPlay', err);
        }
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
    const restOfMessage = cleanedMove.restOfMessage;

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
                : (move === restOfMessage ? '' : restOfMessage);
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

    const emojiLetters = uniqueLetters.map(val => emoji_navigation_letters[letters.indexOf(val)]);
    const emojiNumbers = uniqueNumbers.map(val => emoji_navigation_numbers[parseInt(val, 10)-1]);

    return [emojiLetters, emojiNumbers ];
}

// function getEmojiListForBoard(guildid, existingGame, messageauthorid) {
//     const userGame = repo.dbGetForUserKey(guildid, messageauthorid, existingGame.channelid);
//     const userData = (typeof userGame === 'undefined')
//         ? [] 
//         : (typeof userGame.data === 'undefined')
//             ? [] 
//             : userGame.data;

//     const joined = userData.join('');
//     if (joined.length === 2) {
//         // const moves = getLettersNumbersForValidMoves(joined);
//         // const letters = moves[0];
//         // const numbers = moves[1];

//         /* temp, instead return letters and numbers they can move with for this piece */ 
//         return emoji_board_toolkit_withselection;

//     } else {
//         return emoji_board_toolkit;
//     }
// }

function isValidSettingName(setting_name) {
    const validNameRegex = /^[a-z0-9]+$/g;
    if (typeof setting_name === 'undefined' || setting_name === null || setting_name.length === 0) {
        return false;
    }
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

        case 'fen':
            if (existingGame.length > 0) {
                if (existingGame[0].state === NS_ACCEPTED) {
                    tellUser(guildid, channelid, messageauthorid, ': game fen:\n```' + existingGame[0].chessjs.fen() + '```', information, message)
                        .catch(console.log);
                }
            }
            break;

        case 'help':
            var page = '1';
            if (parsedMessage.restOfMessage.length > 0) {
                var page = parsedMessage.restOfMessage.join(' ');                    
            }
            const helpText1 = 
                '\n> `@idiotchess play @<your friend>`' 
                + '\nor to continue a game:'
                + '\n> `@idiotchess play @<your friend> [fen <chess FEN mumbo jumbo here>]`'
                + '\n' + 'e.g.\n'
                + '\n> `@idiotchess play @BestBuddy`'
                + '\nor to continue a game:'
                + '\n> `@idiotchess play @Topalov fen rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2`'
                + '\n\n' + 'Whilst playing you can save the game using the `fen` command, and continue it later:\n> ```@idiotchess fen```\nThis gives you the chess FEN code for the current board setup, and who plays next.';
            const helpText2 = 
                'While in play:\n\n> `@diotchess board`\n> `@idiotchess select <piece>`\n> `@idiotchess info [<piece>]`\n> `@idiotchess move <piece ref>`';

            const helpText3 = 
                'Also:'+
                + '\n\n> `@idiotchess play @<your friend> [timeout <number of mins. (default is one min)>] [fen <chess FEN mumbo jumbo here>]`'
                + '\n\n> `@idiotbot get [<variable name>]`\n> `@idiotchess set <variable name> <value>`'                
                + '\n\nWith the variable `boardtype` it\'s possible for you to create your own emoji board...\n...*enjoy!*';

            var finalText = helpText1;
            switch (page) {
                case '3':
                case 'third':
                case '3rd':
                    finalText = [helpText1, helpText2, helpText3].join('\n\n') + '\n';
                    break;

                case '2':
                case 'second':
                case '2nd':
                    finalText = [helpText1, helpText2, '@idiotchess `help third` for the next'].join('\n\n') + '\n';
                    break;

                case '1':
                case 'first':
                case '1st':
                default:
                    finalText = [helpText1, '@idiotchess `help second` for the next'].join('\n\n') + '\n';
                    break;
            }
            tellUser(guildid, channelid, messageauthorid, finalText, emoji_speakinghead, message )
                .catch(console.log);

            break;

        case 'pgn':
            if (existingGame.length > 0) {
                if (existingGame[0].state === NS_ACCEPTED) {
                    tellUser(guildid, channelid, messageauthorid, ': game pgn:\n```' + existingGame[0].chessjs.pgn() + '```', information, message)
                        .catch(console.log);
                }
            }
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
            const settings = repo.dbResolveSettings(guildid, messageauthorid);
            const ourGettings = settings.length > 0 ? settings[0] : {};

            // add default settings
            if (!ourGettings.hasOwnProperty('autoreact')) {
                ourGettings['autoreact'] = null;
            }
            if (!ourGettings.hasOwnProperty('boardtype')) {
                ourGettings['boardtype'] = null;
            }
            if (!ourGettings.hasOwnProperty('autoflip')) {
                ourGettings['autoflip'] = null;
            }

            if (typeof parsedMessage.settingName === 'undefined' || parsedMessage.settingName === null || parsedMessage.settingName.length === 0) {
                const endMessageParts = [emoji_speakinghead + '  '];
                if (Object.keys(ourGettings).length) {
                    Object.keys(ourGettings).forEach(key => {
                        if (!isValidSettingName(key)) return;
                        endMessageParts.push(' - Setting `' + key + '`');
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
                    case 'null':
                    case 'reset':
                        // delete their local default one, so the board renders with the default
                        saveSettingObj[setting_name] = null;
                        try {
                            repo.dbUpdateSetting(guildid, messageauthorid, saveSettingObj)
                            tellUser(guildid, channelid, messageauthorid, '\n' + emoji_speakinghead + ' ' + setting_name + ' reset.', emoji_speakinghead, message)
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
                    
                    const first = message.attachments.first();
                    if (first == undefined) {
                        return;
                    }

                    if (first.filesize > 3000) {
                        return;
                    }

                    function downloads(url, dest, cb)
                    {
                        const file = fs.createWriteStream(dest);
                        https.get(url, response => {
                            var stream = response.pipe(file);
                        
                            
                            file.on('finish', function () {
                                file.close(cb);
                            });

                            stream.on("finish", function() {

                            });
                        });
                    }

                    try {
                        const tempfilename = first.id + '.download';

                        downloads(first.url, tempfilename,
                            function (wut) {
                            var downloaded = new TextDecoder('utf-16le').decode(fs.readFileSync(tempfilename));

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
                const messageauthorsgame = existingGame.filter(f => f.key === repo.dbMakeKey(guildid, messageauthorid, channelid))[0];

                if (typeof messageauthorsgame.data === 'undefined') messageauthorsgame.data = [];

                var infoThing = messageauthorsgame.data.join('');
                if (parsedMessage.infoThing !== null && parsedMessage.infoThing.length > 0) {
                    infoThing = parsedMessage.infoThing;
                }
                
                chessyInfo(guildid, channelid, messageauthorid, infoThing, existingGame[0].chessjs, message.channel)
                    .then(t => showBoard(guildid, messageauthorid, message.channel, messageauthorsgame, emoji_board_toolkit))
                    .catch(console.log);
            }                        
            break;

        case 'resign':
            if (isExistingGame) {
                if (existingGame[0].state === NS_ACCEPTED) {
                    //const whonextid = whoIsNext(guildid, existingGame[0].authorid, existingGame[0].targetid, channelid).whonextid;
                    //if (whonextid === messageauthorid) {
                    //    return tellUser(guildid, channelid, messageauthorid, ', sorry it\'s not your move yet.', anger, message);
                    //}
                    var itsname = message.channel.guild.members.find(f => f.id === messageauthorid).nickname;
                    itsname = itsname === null
                        ? message.channel.guild.members.find(f => f.id === messageauthorid).user.username
                        : itsname;

                    const overMsg = ', ' + itsname + ' has resigned.';
                    tellUsers(guildid, message.channel.id, [existingGame[0].authorid, existingGame[0].targetid], overMsg, emoji_handshake);
                    
                    repo.dbRemoveGame(guildid, messageauthorid, message.channel.id);
                    repo.dbDecrementGameCount();                
                }
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

                    if (cleanMoveData.move.length === 2 
                        && existingGame.filter(f => f.key === repo.dbMakeKey(guildid, messageauthorid, channelid)[0].data)) {
                        //process this as data
                        parsedMessage.infoThing = [ cleanMoveData.move ];
                        processVerbData(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage, existingGame, isExistingGame);
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
                try {
                    logger.info('Connected');
                    logger.info('Logged in as: ');
                    logger.info(bot.username + ' - (' + bot.id + ')');

                    bot.guilds.forEach(function (f) { repo.dbMakeDb(f.id); console.log('!ready:', f.id);});
                } catch (err) {
                    console.log('ready', err);
                }
            });

            bot.setInterval(function() {
                try {
                    const gamesBeingPlayed = repo.dbGetGameCount();
                    bot.user.setActivity(gamesBeingPlayed + ' idiototic games');
                } catch (err) {
                    console.log('bot.setInterval(...)', err);
                }
            }, 60 * 1000);

            bot.on('messageReactionAdd', function (reaction, user) {
                try {
                    if (user.id === bot.user.id) {
                        return;
                    }
                    if (reaction.message.author.id !== bot.user.id) {
                        return;
                    }

                    const guildid = reaction.message.channel.guild.id;
                    const userid = user.id;
                    const channelid = reaction.message.channel.id;
                    
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
                        reactGameInvite(guildid, reaction.message.channel, userid, authorGame[0].authorid, isAcceptance, !authorGame[0].isWhite, authorGame[0].fenStuff, authorGame[0].pgnStuff)
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

                    /*LOGGING*/
                    {
                        console.log('message reaction', guildid, channelid, authorGame[0].authorid , authorGame);
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

                            case EMOJI_INFO:
                                try
                                {
                                    const infoUserData = repo.dbGetForUserKey(guildid, userid, channelid)[0].data;
                                    processVerb(guildid, reaction.message, channelid, userid, repo.dbGetGameKeysForUser(guildid, userid, channelid), {
                                        verb: 'info',
                                        infoThing: infoUserData,
                                        userid: userid
                                    });
                                } catch(err) {
                                    console.log('case EMOJI_INFO:', err);
                                }
                                isProcessed = true;
                                break;

                            case EMOJI_PRIZE:
                                try
                                {                                    
                                    const hotGame = repo.dbGetForUserKey(guildid, reactorGame.authorid, channelid)[0];
                                    const isWon = hotGame.chessjs.game_over() && !hotGame.chessjs.in_draw();
                                    if (isWon) {
                                        tellUsers(
                                            guildid,
                                            channelid, 
                                            [ hotGame.authorid, hotGame.targetid ], 
                                            ', WINNER GETS FUCKING PONY!!!1\nhttps://static.independent.co.uk/s3fs-public/thumbnails/image/2018/10/11/14/shetland-foal-pony.jpg\n\nPlease cancel the game manually (sorry - still wip)', 
                                            EMOJI_PRIZE, 
                                            reaction.message);

                                        isProcessed = true;
                                    }
                                } catch(err) {
                                    console.log('case EMOJI_PRIZE:', err);
                                }
                                isProcessed = true;
                                break;
    
                        }
                        if (isProcessed) {
                            return;
                        }
                    }

                    try {
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
                    } catch(err) {
                        console.log('message react, verb processing err', err);
                    }
                } catch (err) {
                    console.log('on message react', err);
                }
            });

            bot.on('message', function (message) {
                try {
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

                    const allNonBotMentions
                        = message.mentions.users
                            .filter(m => m.id !== bot.user.id && m.id !== messageauthorid).array();

                    const gameKeysInThisChannel = repo.dbGetGameKeysForUser(guildid, messageauthorid, channelid);

                    const parsedMessage = parser.parseMessage(bot, messageauthorid, channelid, content, allNonBotMentions, gameKeysInThisChannel);

                    console.log(parsedMessage, '<-------- on message');
                    try {
                        processVerb(guildid, message, channelid, messageauthorid, gameKeysInThisChannel, parsedMessage);
                    } catch (err) {
                        console.log('message', err);
                    }
                } catch (err) {
                    console.log('message', err);
                }
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
    const resolved = repo.dbResolveCode(code);
    if (typeof resolved === 'undefined')
        return null;
    return resolved;
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
        res.end('<html><body style="background-color:darkslategrey; color:burlywood"><div>' +
            'Failed - no channelid query string parameter specified'
            + '</div></body></html>');
        return;
    }

    if (reqData.query.say === 'undefined') {
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
