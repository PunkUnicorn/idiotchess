const Discord = require('discord.io');
const logger = require('winston');
const Chess = require('./chess.js').Chess;
const DiscordJs = require('discord.js');

var auth = null;
try {
    auth = require('./../auth.json');
}
catch (error) {
    auth = null;
}

if (auth == null) {
    auth = require('./auth.json');
}

/* note these suit of functions to be promoted to own file and required('./...')'d in */
function debugDump(bot, channelID, shitToDump) {
    //console.log('debugDump', bot, channelID, shitToDump);
    bot.sendMessage({
        to: channelID,
        message: JSON.stringify(shitToDump)
    });
}

function addGame(bot, gameData, gamename, playerw, playerb, chessjs) {
    gameState.games.push({ gamename, playerw, playerb, chessjs });
}

function makeGameKey(userID, targetid, channelID) {
    return [userID.toString(), targetid.toString(), channelID.toString()].join();
}

function gameInstance_isPlaying() {
    if (typeof this.scorewhite === 'undefined') { throw 'wut? gameInstance_isPlaying() function expected to be called from a gameInstance object'; }
    var game = this;


    return false;
}

function makeGameData() {
    return { games: [/*playerw, playerb, moves: [], fen of current board? */] };
}

function makeGameInstance() {
    return { scorewhite: 0, scoreblack: 0, isPlaying: gameInstance_isPlaying };
}

function isValidNewGame(bot, gameData, channelID, userID, target) {
    return typeof target !== 'undefined';
}

function openGameNegociation(bot, gameData, channelID, challengerUserId, gameKey, targetID) {
    // check for existing game with that key
    //    reject game negociation if already a game

    // limit a user to only one game per channel (*1)
    //    then the game instance can be gleamed from the user id (who sent the message) and the channel id

    // start timer for negociation timeout
    //    reject game if times out (10 mins?)

    // if all is well
    //    open the negociation

    // WHAT USER INTERFACE TO OPEN A CHALLENGE? 
    //    the bot message with two attached emojies is a good way, and both players click the tick
    //    start the negociation and set a timeout to cancel it
}

function getExistingGame(bot, gameData, userID, channelID) {
    // because we limit a user to one game per channel (*1), we can use the userID and channelID to get any existing running game
    //   FIND EXISTING GAME IN gameData

    //return existing running game for userID and channelID
    const newGame = makeGameInstance(bot, gameData);
    return newGame;
}

function getMoveDataFromMessage(bot, gameInfo, userID, channelID, message, others) {
    const decodeMe = message
        .replace(bot.id, '')
        .split(' ');

    var verb = 'newgame';
    if (gameInfo.isPlaying()) { // if game already in play the default verb is 'move'
        verb = 'move'
    }

    //console.log(others[0]);
    var target = others[0];//only one mention is acknoledged 
    var boardinfo = [];
    var whitePlayer = null, blackPlayer = null;
    var isTakeBack = false;

    var prevTokens = [];
    var prevToken = null;
    decodeMe.forEach(token => {
        const cleantoken = token
            .toLowerCase()
            .replace(/(\!)/g, '')
            .replace(/(\?)/g, '')
            .replace(/(\.)/g, '');

        console.log('cleant', cleantoken);

        /****
         * If the command is 'move' then extra message text is gathered because it has the fucking move data.
         * e.g.move e2 to e4, boardInfo becomes ['e2', 'to', 'e4'] 
         *
         ****/
        if (verb === 'move') {
            boardinfo.push(token);
        }

        if (isTakeBack) {
            boardInfo.push(token);
        } else {
            switch (cleantoken) {
                case 'move':
                case 'info':
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
                    verb = 'newgame';
                    break;

                case 'cancel':
                    verb = cleantoken;
            }
        }

        // for newgames, see if the player side colour has been specified
        if (verb === 'newgame') {
            if (token === 'black') {
                whitePlayer = userID;
            } else if (token === 'white') {
                blackPlayer = userID;
            }
        }

        prevToken = cleantoken;
        prevTokens.push(cleantoken);
    });

    return { verb, target, boardinfo, isTakeBack, whitePlayer, blackPlayer };
}

/* Negociation types */
const NT_GAME = 0x1, NT_DRAW = 0x2, NT_MODECHANGE = 0x4;

/* Negociation state */
const NS_INVITED = 0x1, NS_ACCEPTED = 0x2, NS_REJECTED = 0x4;

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


var gameData = makeGameData();


// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});

logger.level = 'debug';

// Initialize Discord Bot
var bot = new Discord.Client({
    token: auth.token,
    autorun: true
});

bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
    gameData = makeGameData();
});

function processVerb(bot, gameData, channelID, userID, moveObjs) {
    const target = moveObjs.target;

    switch (moveObjs.verb) {
        case 'newgame':
            if (isValidNewGame(bot, gameData, channelID, userID, target)) {
                openGameNegociation(bot, gameData, channelID, userID, makeGameKey(userID, target.id, channelID), target.id);
            }
            //addGame(bot, gameData, makeGameKey(userID, target[0].id, channelID), playerw, playerb, new Chess());
            break;

        /* 
                    while (!chess.game_over()) {
                      var moves = chess.moves();
                      var move = moves[Math.floor(Math.random() * moves.length)];
                      chess.move(move);
                    }
                    console.log(chess.pgn()); 
        */

        default:
            break;
    }

}

bot.on('message', function (user, userID, channelID, message, evt) {
    const me = evt.d.mentions.filter(m => m.id == bot.id);

    // if this function is not applicable then get out of here ASAP, and don't clog up the indenting on your way out
    if (typeof me === 'undefined' || me === null || me.length === 0) {
        return;
    }

    const others = evt.d.mentions.filter(m => m.id != bot.id);

    const possibleExistingGameForThisUserInThisChannel = getExistingGame(bot, gameData, userID, channelID);

    const moveObjs = getMoveDataFromMessage(bot, possibleExistingGameForThisUserInThisChannel, userID, channelID, message, others);

    //console.log('mid', me, others, possibleExistingGameForThisUserInThisChannel, moveObjs);
    if (moveObjs !== null) {
        processVerb(bot, gameData, channelID, userID, moveObjs);
        debugDump(bot, channelID, { verb: moveObjs.verb, target: moveObjs.target, boardinfo: moveObjs.boardinfo.join() });
    }
    //    switch (moveObjs.verb) {
    //        case 'newgame':
    //            openGameNegociation(bot, gameData, channelID, userID, makeGameKey(userID, target[0].id, channelID), target[0].id);
    //            //addGame(bot, gameData, makeGameKey(userID, target[0].id, channelID), playerw, playerb, new Chess());
    //            break;

    /* 
            while (!chess.game_over()) {
                  var moves = chess.moves();
                  var move = moves[Math.floor(Math.random() * moves.length)];
                  chess.move(move);
                }
                console.log(chess.pgn()); 
    */

    //        default:
    //            break;
    //    }

    //    debugDump(bot, channelID, { verb: moveObjs.verb, target: moveObjs.target.join(), boardinfo: moveObjs.boardinfo.join() });
    //bot.sendMessage({
    //    to: channelID,
    //    message: 'verb: ' + moveObjs.verb + ' target: ' + moveObjs.target.join() + ' boardinfo: ' + moveObjs.boardinfo.join()
    //});
});

var http = require("http");

http.createServer(function (request, response) {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('This bot is now woke\n');
}).listen(8081);

// Console will print the message
console.log('Server running at http://127.0.0.1:8081/');