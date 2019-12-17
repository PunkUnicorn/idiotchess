const Discord = require('discord.io');
const logger = require('winston');
const Chess = require('./chess.js').Chess;
const DiscordJs = require('discord.js');

var auth = null;
try {
    auth = require('./../auth.json');
}
catch (error) {
    auth = require('./auth.json');
}



/* note these suit of functions to be promoted to own file and required('./...')'d in */



function debugDump(bot, channelID, shitToDump) {
    console.log('debugDump', shitToDump);
    bot.sendMessage({
        to: channelID,
        message: JSON.stringify(shitToDump)
    });
}


/* Negociation types */
const NT_GAME = 1, NT_DRAW = 2, NT_MODECHANGE = 3;

/* Negociation state */
const NS_INVITED = 1, NS_ACCEPTED = 2, NS_REJECTED = 3;


function makeGameKey(userID, targetid, channelID) {
    return [userID.toString(), targetid.toString(), channelID.toString()].join();
}

function isGameDataObj(gameDataObj) {
    return typeof gameDataObj.games !== 'undefined';
}

function isGameInstanceObj(gameInstanceObj) {
    return typeof gameInstanceObj.playerwhite !== 'undefined';
}

function addPossibleNewGame(bot, gameData, moveObjs) {
    const gamekey = makeGameKey(moveObjs.userID, moveObjs.target.id, moveObjs.channelID);
    const game = {
        key: gamekey,
        state: NS_INVITED,
        data: moveObjs,
        scorewhite: 0,
        scoreblack: 0,
        isPlaying: gameInstance_isPlaying,
        chessjs: null,
        chessy: null
    };
    gameData.games.push(game);
    return game;
}

function gameInstance_isPlaying() {
    if (!isGameInstanceObj(this)) { throw 'wut? gameInstance_isPlaying() function expected to be called from a gameInstance object'; }

    var game = this;

    return (game.playerwhite !== null && game.playerblack !== null);
}

function gameData_isPlayer(userID) {
    if (!isGameDataObj(this)) { throw 'wut? gameData_isPlayer() function expected to be called from a gameData object'; }

    if (game.playerwhite !== null && this.playerwhite === userID)
        return true;

    if (game.playerblack !== null && this.playerblack === userID)
        return true;

    return false;
}

function gameData_getGames() {
    return gameData.games;
}

function gameData_getGamesForUser(userID) {
    return gameData.games
        .filter(f => f.playerwhite !== null)
        .filter(f => f.playerblack !== null)
        .filter(f => f.playerwhite === userID || f.playerblack === userID);
}

function makeGameData() {
    return { games: [/*playerw, playerb, moves: [], fen of current board? */] };
}

function makeGameInstance() {
    return { scorewhite: 0, scoreblack: 0, playerwhite: null, playerblack: null, isPlaying: gameInstance_isPlaying };
}

function isValidNewGame(bot, gameData, channelID, userID, moveObjs) {
    debugDump(bot, gameData, moveObjs);
    return typeof moveObjs.target !== 'undefined' && moveObjs.target !== null &&
        typeof moveObjs.playerwhite !== 'undefined' && moveObjs.playerwhite !== null &&
        typeof moveObjs.playerblack !== 'undefined' && moveObjs.playerblack !== null;
}

function getExistingGame(bot, gameData, targetID, userID, channelID) {
    // because we limit a user to one game per channel (*1), we can use the userID and channelID to get any existing running game
    //   FIND EXISTING GAME IN gameData

    if (targetID === null) {

        var matches = gameData_getGamesForUser(userID).filter(f => f.data.channelID === channelID);

        if (matches === 0)
            return null;

        if (matches > 1) {
            const errorMsg = { error: '{<@!>' + userID + '} has more than one game in this channel.', sorryDaveICantLetYouDoThat: true };
            debugDump(bot, channelID, errorMsg);
            throw 'throwing up with ' + JSON.stringify(errorMsg);
        }

        return matches[0];

    } else {

        const gameKey = makeGameKey(userID, targetID, channelID);

        const existing = gameData.games.filter(f => f.key = gameKey);

        return (existing.length === 0)
            ? null //makeGameInstance(bot, gameData)
            : existing[0];

    }
}

function endOpenedNegociations(newgame) {
    // it's gone sour, cold war begins

    // close the negociations (remove game obj etc)
}

function openGameNegociation(bot, gameData, message, newgame) {

    // check for existing game with that key
    //    reject game negociation if already a game

    // limit a user to only one game per channel (*1)
    //    then the game instance can be gleamed from the user id (who sent the message) and the channel id

    const existingGame = getExistingGame(bot, gameData, newgame.data.target.id, newgame.data.userID, newgame.data.channelID);
    if (existingGame !== null && existingGame.key !== newgame.key) {
        debugDump(bot, newgame.data.channelID, { error: '{<@!>' + newgame.data.userID + '} already has a game in this channel.', sorryDaveICantLetYouDoThat: true });
        return;
    }

    if (newgame.state !== NS_INVITED) {
        debugDump(bot, newgame.data.channelID, { warning: 'This game does seem to be being negociated. I\'m changing that though...', bitWeirdButOk: true });
        newgame.state = NS_INVITED;
    }

    console.log(message);
    const love_letter = '\u1F48C';
    bot.sendMessage({
        to: newgame.data.channelID,
        message: love_letter
    });
    //message.react(love_letter);

    newgame.data.timer = setTimeout(
        function (bot, gameData, newgame) {
            endOpenedNegociations(newgame);
        }, newgame.data.timeout, bot, gameData, newgame);

    var acceptanceMessage = bot.sendMessage({
        to: newgame.data.channelID,
        message: '<@!'+newgame.data.target.id+'> You have been challenged by <@!' +newgame.data.userID+ '>, do you accept?'
    });

    //const ok = '\u1F197';
    //const cross = '\u2717';//bot.emojis.find(emoji => emoji.name === "x");
    //console.log(acceptanceMessage);
    //acceptanceMessage.react(ok);
    //acceptanceMessage.react(cross);


    // start timer for negociation timeout
    //    reject game if times out (10 mins?)

    // if all is well
    //    open the negociation

    // WHAT USER INTERFACE TO OPEN A CHALLENGE? 
    //    the bot message with two attached emojies is a good way, and both players click the tick
    //    start the negociation and set a timeout to cancel it
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
    var restOfMessage = [];
    var whitePlayer = null, blackPlayer = null;
    var isTakeBack = false;

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

        if (isTakeBack) {
            restOfMessage.push(token);
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
                    break;

                default:
                    restOfMessage.push(token);
                    break;
            }
        }

        if (verb.length === 0) {
            // if game already in play the default verb is 'move'
            verb = gameInfo === null ? 'move' : 'newgame';
        }

        // for newgames, see if the player side colour has been specified
        if (verb === 'newgame') {
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
        verb, /* command verb gleamed from the chat message */
        target, /* a complete user object for the first mentioned user, .id .username etc */
        restOfMessage, /* everything from the message except the verb and user mentions */

        /* for newgame */
        playerwhite: whitePlayer, /* userID of the white player */
        playerblack: blackPlayer, /* userID of the black player */
        timeout: 10 /* how many minuets to wait for the game challenge to be accepted */
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

function processVerb(bot, gameData, message, channelID, userID, moveObjs) {
    const target = moveObjs.target;

    switch (moveObjs.verb) {
        case 'newgame':
            if (isValidNewGame(bot, gameData, channelID, userID, moveObjs)) {
                var newgame = addPossibleNewGame(bot, gameData, moveObjs);
                openGameNegociation(bot, gameData, message, newgame);
            } else {
                debugDump(bot, channelID, { error: 'Not a valid new game', sorryDaveICantLetYouDoThat: true });
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
    console.log(evt.d);
    const content = message;
    //, evt
    const botMentions = evt.d.mentions.filter(m => m.id === bot.id);

    // if this function is not applicable then get out of here ASAP, and don't clog up the indenting on your way out
    if (typeof botMentions === 'undefined' || botMentions === null || botMentions.length === 0) {
        return;
    }

    const otherMentions
        = evt.d.mentions
            .filter(m => m.id !== bot.id && m.id !== userID);

    var existingGameOrPossibleGame = getExistingGame(bot, gameData, null/*unknown*/, userID, channelID);

    const moveObjs = getUsefulThingsFromMessage(bot, existingGameOrPossibleGame, userID, channelID, content, otherMentions);

    if (moveObjs !== null) {
        processVerb(bot, gameData, message, channelID, userID, moveObjs);
        var target = (typeof moveObjs.target !== 'undefined' && moveObjs.target !== null)
            ? moveObjs.target
            : { username:'' };

        debugDump(bot, channelID, { verb: moveObjs.verb, target: target.username, restOfMessage: moveObjs.restOfMessage.join(), playerwhite: moveObjs.whitePlayer, playerblack: moveObjs.blackPlayer });
    }
});


var http = require("http");
setTimeout(function () {
    http.createServer(function (request, response) {
        response.writeHead(200, { 'Content-Type': 'text/plain' });
        response.end('This bot is now woke\n');    

        // DIAGNOSTIC CONSOLE???

    }).listen(8081);

    // Console will print the message
    console.log('Server running at http://127.0.0.1:8081');
}, 1000 );

