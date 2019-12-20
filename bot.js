//const Discord = require('discord.io');
const logger = require('winston');
const Chess = require('./chess.js').Chess;
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

function removeGame(bot, gameData, key)
{
    const gamekey = key;//makeGameKey(newgame.data.userID, newgame.data.target.id, newgame.data.channelID);
    gameData.games.splice(gameData.games.indexOf(gameData.games.filter(f => f.key === gamekey)), 1);
}

function gameInstance_isPlaying() {
    if (!isGameInstanceObj(this)) { throw 'wut? gameInstance_isPlaying() function expected to be called from a gameInstance object'; }

    var game = this;

    return (game.playerwhite !== null && game.playerblack !== null);
}

function gameData_isPlayer(userID) {
    if (!isGameDataObj(this)) { throw 'wut? gameData_isPlayer() function expected to be called from a gameData object'; }

    if (game.playerwhite !== null && this.playerwhite == userID)
        return true;

    if (game.playerblack !== null && this.playerblack == userID)
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
    return typeof moveObjs.target !== 'undefined' && moveObjs.target !== null &&
        typeof moveObjs.playerwhite !== 'undefined' && moveObjs.playerwhite !== null &&
        typeof moveObjs.playerblack !== 'undefined' && moveObjs.playerblack !== null;
}

function getExistingGame(bot, gameData, targetID, messageSenderUserID, channelID) {
    // because we limit a user to one game per channel (*1), we can use the userID and channelID to get any existing running game
    //   FIND EXISTING GAME IN gameData

    if (targetID === null) {

        var matches = gameData_getGamesForUser(messageSenderUserID).filter(f => f.data.channelID === channelID);

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

        const existing = gameData.games.filter(f => f.key = gameKey);

        return (existing.length === 0)
            ? null
            : existing[0];

    }
}

function endOpenedNegociations(bot, gameData, newgame) {
    // it's gone sour, cold war begins
    const msg = '<@!' + newgame.data.userID  + '> to <@!' + newgame.data.target.id + '>';
    debugDump(bot, newgame.data.channelID, { warning:'negociation has timed out between: ' + msg });

    bot.channels.find('id', newgame.data.channelID)
        .send('Invite from ' + msg + ' has timed out.')
        .then(function (result) {
            result.react(broken_heart);
        });

    // close the negociations (remove game obj etc)
    removeGame(bot, gameData, newgame.key);
}

function isExistingGameSameAsNewGame(newgame, existingGame) {
    return existingGame !== null && existingGame.key === newgame.key;
}

function flipYourShit(newgame, error) {
    debugDump(bot, newgame.data.channelID, {
        error: 'cant send challenge message from <@!' + newgame.data.target.id + '> to <@!' + newgame.data.userID + '>',
        sorryDaveICantLetYouDoThat: true
    });
}

function openGameNegociation(bot, gameData, message, newgame, existingGame) {
    // check for existing game with that key
    //    reject game negociation if already a game

    // limit a user to only one game per channel (*1)
    //    then the game instance can be gleamed from the user id (who sent the message) and the channel id
    var isNewGame = !isExistingGameSameAsNewGame(newgame, existingGame)

    console.log('newgame.data.playerblack != existingGame.data.playerblack', newgame.data.playerblack, existingGame == null ? '' : existingGame.data.playerblack);
    console.log('newgame.data.playerwhite != existingGame.data.playerwhite) {', newgame.data.playerwhite, existingGame == null ? '' : existingGame.data.playerwhite);
    if (!isNewGame &&
        newgame.data.playerblack != existingGame.data.playerblack &&
        newgame.data.playerwhite != existingGame.data.playerwhite) {

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

        );;

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

        bot.channels.find('id', existingGame.data.channelID)
            .messages.find('id', existingGame.inviteMessageID).delete();

        removeGame(bot, gameData, existingGame.key);
        isNewGame = true;
    }

    message.react(love_letter);
    
    newgame.data.timer = bot.setInterval(
        function (bot, gameData, newgame) {
            clearInterval(newgame.data.timer);
            newgame.data.timer = null;

            endOpenedNegociations(bot, gameData, newgame);
        }, newgame.data.timeout * 1000 * 60, bot, gameData, newgame);


    bot.channels.find('id', newgame.data.channelID)

        .send('<@!' + newgame.data.target.id + '> You have been challenged by <@!' + newgame.data.userID + '>, do you accept?')
        .then(function (result) {
                  newgame.inviteMessageID = result.id;
                           // DONE THINK inviteMessageID is getting saved
                           // possibly persist the results with that save library
                           // local linux db?
                           // best node db? that's free
                  result.react(ok)
                     .then(function (whatever) {
                         result.react(cross3).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });
                     });
               },
 
               function (error) { flipYourShit(newgame, error) /* <-- on error */ }

        );
}

function tellThemTheListOfGames(bot, gameData, moveObjs) {
    const allTheirGames = gameData.games.filter(f => gameData_isPlayer(moveObjs.userID));
    const displayTheirGames = gameData.games.map(function (val, index, all) {
        const channel = bot.channels.find(f => f.id == val.channelID).name;
        const target = bot.users.find(f => f.id == val.target.id).username;
        return target + ' in ' + channel;
    });

    const msg = displayTheirGames.join(", ");
    bot.channels.find('id', moveObjs.channelID)
        .send(msg)
        .then(function (result) {
            result.react(information);//.then(function (whatever) {
            //    result.react(anger).catch(function (error) { debugDump(bot, newgame.data.channelID, error); });
            //});
        },

            function (error) { flipYourShit(newgame, error) /* <-- on error */ }

        );
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

    var isTakeBack = false;
    var isTimeout = false;
    var isListMode = false;

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


        if (isListMode) {
            listThing = cleantoken;
        }
        if (isTimeout) {
            timeout = parseInt(cleantoken, 10);
            isTimeout = false;
        } else if (isTakeBack) {
            restOfMessage.push(cleantoken);
        } else {
            switch (cleantoken) {
                case 'list':
                    isListMode = true;
                    break;
                case 'timeout':
                    isTimeout = true;
                    break;
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
        listThing /* word after the word 'list' */
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


var gameData = makeGameData();


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

        console.log('now checking target');

        if (inviteMessageGame.data.target.id != user.id) {
            return;
        }

        var msgadd = ''
        if (reaction.emoji.identifier == EMOJI_ACCEPT_GAME) {
            msgadd += ' YES ';
        }
        //it's ON!
        const chessjs = inviteMessageGame.chessjs = new Chess();
        const chessy = inviteMessageGame.chessy = new Chessy();
        reaction.message.channel.send("It's ON!")
            .then(t => reaction.message.channel
                .send('```' + chessjs.ascii() + '```')
            .then(a => reaction.message.channel
                .send('```' + chessy.getInfo(chessjs.fen(), ['e2', 'f2']) + '```')));
        

        // get channel id
        // get author id

        // if author is bot message mentions and mentions

        logger.info('Connected');
        logger.info('Logged in as: ');
        logger.info(bot.username + ' - (' + bot.id + ')');
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

        console.log(userID, channelID, content, bot.id, '<--------');

        const otherMentions
            = message.mentions.users
                .filter(m => m.id !== bot.user.id && m.id !== userID).array();

        var existingGameOrPossibleGame = getExistingGame(bot, gameData, null/*unknown*/, message.author.id, channelID);

        const moveObjs = getUsefulThingsFromMessage(bot, existingGameOrPossibleGame, userID, channelID, content, otherMentions);

        if (moveObjs !== null) {
            processVerb(bot, gameData, message, channelID, userID, moveObjs);
            debugDump(bot, channelID, makeDebugMoveObj(moveObjs));
        }
    });

}, 1000 * 60 * 0.5);

function processVerb(bot, gameData, message, channelID, userID, moveObjs) {
    const target = moveObjs.target;
    const targetid = (typeof target !== 'undefined' && target !== null)
        ? target.id
        : null;

    const existingGame = getExistingGame(bot, gameData, targetid, moveObjs.userID, moveObjs.channelID);

    switch (moveObjs.verb) {
        case 'play':
            if (isValidNewGame(bot, gameData, channelID, userID, moveObjs)) {
                var newgame = addPossibleNewGame(bot, gameData, moveObjs);
                openGameNegociation(bot, gameData, message, newgame, existingGame);
            } else {
                debugDump(bot, channelID, { error: 'Not a valid new game', sorryDaveICantLetYouDoThat: true });
            }
            break;

        case 'cancel':
            if (isExistingGameSameAsNewGame(existingGame, newgame)) {
                switch (existingGame.state) {
                    case NS_INVITED:
                        endOpenedNegociations(bot, gameData, existingGame);
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

function adminDumpGames(bot, gameData, res, reqData) {
    res.end( safeStringify(gameData.games) );
}

function adminDumpGame(bot, gameData, res, reqData) {
    if (reqData.query.gamekey === 'undefined') {
        res.end();
        return;
    }

    const game = gameData.games.filter(f => f.key == reqData.query.gamekey);
    res.end('<html><body style="background-color:darkslategrey; color:burlywood"><div>' +
        safeStringify(game)
        + '</div></body></html>');
}

function adminDumpLogs(bot, gameData, res) {
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

function adminSpeak(bot, gameData, res, reqData) {
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
    channel[0].send(reqData.query.say);
    res.end('<html><body style="background-color:darkslategrey; color:burlywood"><div>' +
        'WINNING' + ' idiotchess said ' + reqData.query.say
        + '</div></body></html>');
}

var htmlServerInterval = setInterval(function (gameData) {
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