
function parseMessage(bot, messageuserid, channelid, content, allNonBotMentions, gameKeysInThisChannel) {
    const decodeMe = content
        .replace(/\<\@\![0-9]+\>/g, '') // remove mentions tags
        .split(' ')
        .filter(f => f.length > 0);

    const errorStringMessage = content
        .replace(/\<\@\![0-9]+\>/g, '**blah blah**'); // remove mentions tags;

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

    var isWhite = true;

    var error = null;

    var prevTokens = [];
    var prevToken = null;
    decodeMe.forEach(token => {
        var cleantoken = token
            .toLowerCase()
            .replace(/\!/g, '')
            .replace(/\?/g, '')
            .replace(/\./g, '');

        if (cleantoken.length === 0)
            return;


        console.log('cleantoken', cleantoken);

        const VERB_RETRY_SAFTY = 3; //don't exceed this number of retrys
        var retryCount = 0;
        do  {
            var retry = false;

            if (isInfoMode) {
                if (cleantoken === 'clear' || cleantoken === 'reset') {
                    cleantoken = null; //clears the selection
                }
                infoThing = cleantoken;
                isInfoMode = false;
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
                    case 's': cleantoken = 'select'; retry = true; break;
                    case 'i': cleantoken = 'info'; retry = true; break;
                    case 'l': cleantoken = 'list'; retry = true; break;
                    case 't': cleantoken = 'timeout'; retry = true; break;
                    case 'b': cleantoken = 'board'; retry = true; break;
                    case 'm': cleantoken = 'move'; retry = true; break;

                    case 'data':
                        isInfoMode = true;
                        verb = 'data';
                        break;

                    case 'information':
                    case 'show':
                    case 'info':
                        isInfoMode = true;
                        verb = 'info';
                        break;

                    case 'select':
                    case 'selection':
                        isInfoMode = true;
                        verb = 'select';
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
        } while (++retryCount < VERB_RETRY_SAFTY && retry);

        if (verb.length === 0) {
            error = errorStringMessage;
            verb = 'error';
            //// if game already in play the default verb is 'move'
            //verb = (gameKeysInThisChannel.length > 0) ? 'move' : 'play';
        }

        // for newgames, see if the player side colour has been specified
        if (verb === 'play') {
            if (token === 'black') {
                isWhite = false;
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

    if (isInfoMode && infoThing === '') {
        infoThing = null;
    }

    return {
        messageauthorid: messageuserid,
        channelid,
        targetid: (target === null) ? null : target.id,

        restOfMessage, /* almost everything else from the message (after taking out at least the verb and user mentions) */
        verb, /* command verb gleamed from the chat message */

        /* Then depending on verb... */

        /* play */
        isWhite,
        timeout, /* how many minuets to wait for the game challenge to be accepted */

        /* list */
        listThing, /* word after the word 'list' */

        /* info */
        infoThing, /* word after the word 'info' */
        
        error
    };
}

module.exports = {
    parseMessage
};