const Discord = require('discord.io');
const logger = require('winston');
const auth = require('./../auth.json');
const Chess = require('./chess.js').Chess;
const DiscordJs = require('discord.js');


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
});
bot.on('message', function (user, userID, channelID, message, evt) { 

    const me = evt.d.mentions.filter(m => m.id == bot.id);

    const others = evt.d.mentions.filter(m => m.id != bot.id);

    if (typeof me != 'undefined' && me != null && me.length > 0) {
	console.log('me', me);
	const decodeMe = message
	    .replace(bot.id, '')
	    .split(' ');

	var verb = 'newgame';
console.log(others[0]);
	var target = others.map(f => f.username).join();
	var boardinfo = [];

	// if game already in play the default verb is 'move'

	decodeMe.forEach(token => { 
	    const cleant = token.toLowerCase().replace('!','');
	    console.log('cleant', cleant);

	    if (verb === 'move') {
		boardinfo.push(token);
	    }
	    switch (cleant) {
		case 'move':
		case 'info':
		case 'resign':
		case 'draw':
		case 'change':
		    verb = cleant;
		    break;

                case 'play':
                    verb = 'newgame';
                    break;

	    }

	});

	switch (verb) {
	    case 'newgame':
            	var chess = new Chess();
		break;

              /*	while (!chess.game_over()) {
            	  var moves = chess.moves();
            	  var move = moves[Math.floor(Math.random() * moves.length)];
            	  chess.move(move);
            	}
            	console.log(chess.pgn()); */

	    default:
		break;
	}

	bot.sendMessage({
            to: channelID,
                message: 'verb: ' + verb +' target: '+target + ' boardinfo: ' +boardinfo.join()
            });

    }



    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);
        switch(cmd) {
            // !ping
            case 'ping':
                bot.sendMessage({
                    to: channelID,
                    message: '@Karl is gay!'
                });
            break;
            // Just add any case commands if you want to..
         }
     }
});