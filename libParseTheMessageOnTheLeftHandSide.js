
function parseMessage(bot, messageuserid, channelid, content, allNonBotMentions, gameKeysInThisChannel) {
    const decodeMe = content
        .replace(/\<\@\![0-9]+\>/g, '') // remove mentions tags
        .split(' ')
        .filter(f => f.length > 0);

    console.log(decodeMe);

    var verb = '';
    var target = (allNonBotMentions.length > 0)
        ? allNonBotMentions[0] //only one mention is acknoledged 
        : null;

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
            .replace(/\!/g, '')
            .replace(/\?/g, '')
            .replace(/\./g, '');

        if (cleantoken.length === 0)
            return;


        console.log('cleant', cleantoken);


        if (isInfoMode) {
            infoThing = cleantoken;
            isInfoMode = false;
            verb = 'info';
        } else if (isListMode) {
            listThing = cleantoken;
            //verb = 'list';
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

                case 'board':
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

                case 'quit':
                case 'cancel':
                    verb = 'cancel';
                    break;

                default:
                    restOfMessage.push(cleantoken);
                    break;
            }
        }

        if (verb.length === 0) {
            // if game already in play the default verb is 'move'
            verb = (gameKeysInThisChannel.length > 0) ? 'move' : 'play';
        }

        // for newgames, see if the player side colour has been specified
        if (verb === 'play') {
            if (token === 'black') {
                whitePlayer = target.id;
                blackPlayer = messageuserid;
            } else if (token === 'white') {
                whitePlayer = messageuserid;
                blackPlayer = (typeof target === 'undefined' || target === null)
                    ? null
                    : target.id;
            }
        }

        prevToken = cleantoken;
        prevTokens.push(cleantoken);
    });

    if (whitePlayer === null) {
        whitePlayer = messageuserid;
    }

    if (blackPlayer === null) {
        blackPlayer = (typeof target !== 'undefined' && target !== null)
            ? target.id
            : null;
    }

    return {
        messageuserid,
        channelid,
        targetid: (target === null) ? null : target.id,

        restOfMessage, /* almost everything else from the message (after taking out at least the verb and user mentions) */
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

module.exports = {
    parseMessage
};