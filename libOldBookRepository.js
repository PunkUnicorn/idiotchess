const TAFFY = require('taffy');

const gamesMap = new Map();

function isValidSettingName(setting_name) {
    const validNameRegex = /^[a-z0-9]+$/g;
    if (typeof setting_name === 'undefined' || setting_name === null || setting_name.length === 0) return false;
    return setting_name.match(validNameRegex);
}

function dbMakeDb(guildid) {
    return gamesMap.set(guildid, TAFFY());
}

function dbGetGuildGame(guildid) {
    if (typeof guildid === 'undefined') throw 'no guildid';
    if (!gamesMap.has(guildid)) throw 'unknown guildid ' + guildid;
    return gamesMap.get(guildid);
}

function dbMakeKey(guildid, userid, channelid) {
    return [userid, channelid].join("-");
}

function dbAddGameAuthor(guildid, authorid, channelid, stuff, targetid) {
    if (typeof stuff === 'undefined') stuff = {};
    if (typeof targetid !== 'undefined' && targetid !== null) {
        stuff.targetid = targetid;
        stuff.targetkey = dbMakeKey(guildid, targetid, channelid);
    }

    const key = dbMakeKey(guildid, authorid, channelid);

    dbGetGuildGame(guildid).insert({
        key,
        isAuthor: true,
        channelid,

        authorid
    }).update(stuff);
}

function dbUpdateGameTarget(guildid, authorid, channelid, targetid, targetStuff) {
    if (typeof targetStuff === 'undefined') targetStuff = {};

    const targetkey = dbMakeKey(guildid, targetid, channelid);
    const authorkey = dbMakeKey(guildid, authorid, channelid);

    dbGetGuildGame(guildid).insert({
        key: targetkey,
        isAuthor: false,
        channelid,

        targetid,
        authorid,
        authorkey
    }).update(targetStuff);
}

/* updates all properties for where this user is an author or target */
function dbUpdateForGame(guildid, userid, channelid, game) {
    if (typeof game === 'undefined') {
        console.log('invalid game in dbUpdateForGame'); throw 'invalid game in dbUpdateForGame';
    }

    dbGetGuildGame(guildid)([{ key: dbGetGameKeysForUser(guildid, userid, channelid) }] ).update(game);
}

function dbIsAny(guildid, userid, channelid) {
    const db = dbGetGuildGame(guildid);
    return db([
        { authorid: userid, channelid },
        { targetid: userid, channelid }])
        .get().length > 0;
}

/* gets all game keys where the user is an author or target */
function dbGetGameKeysForUser(guildid, userid, channelid) {
    const findKey 
        = (typeof channelid === 'undefined') 
            ? [{ authorid: userid }, 
                { targetid: userid }]

            : [{ authorid: userid, channelid }, 
                { targetid: userid, channelid }];

    var db = dbGetGuildGame(guildid);
    const keys = db(findKey).select('authorkey', 'targetkey', 'key');

    if (keys.length > 0) {

        var definedKeys = [];

        for (var i = 0; keys.length > i; i++) {
            keys[i]
                .filter(f => typeof f !== 'undefined')
                .forEach(function (val) {        
                    definedKeys.push(val);        
                });
        }

        return [ ...new Set(definedKeys) ];
    }
    return [];
}

/* gets all game rows that 'targetid' and 'channelid' match */
function dbGetGameFromTarget(guildid, targetid, channelid) {
    return dbGetGuildGame(guildid)({ targetid, channelid }).get().filter(f => typeof f !== 'undefined');
}

/* updates individual user properties e.g. */
function dbUpdateForUser(guildid, userid, channelid, updates) {
    const key = dbMakeKey(guildid, userid, channelid);
    dbGetGuildGame(guildid)({ key }).update(updates);
}

/* removes all traces of the game a user is an author or target of */
function dbRemoveGame(guildid, userid, channelid) {
    const db = dbGetGuildGame(guildid);
    db([{ key: dbGetGameKeysForUser(guildid, userid, channelid) }]).remove();
}

function dbGetGame(guildid, keys) {
    const result = dbGetGuildGame(guildid)({ key: keys }).get();
    return typeof result === 'undefined'
        ? [[{}]]
        : result;
}

function dbPresentGames(guildid, template) {
    const db = dbGetGuildGame(guildid);
    return db().supplant(template);
}

function dbGetAll(guildid) {
    return dbGetGuildGame(guildid)().get();
}

function dbGetForUserKey(guildid, userid, channelid) {
    const db = dbGetGuildGame(guildid);
    return db({ key: dbMakeKey(guildid, userid, channelid) }).get().filter(f => typeof f !== 'undefined');
}

/*
https://www.asciiart.eu/electronics/clocks


     |        |
     _|________|_
    |____________|
      |        |
      |        |
      |        |
     |          |
     |          |
     |          |
     |          |
    _|__________|_
  _/______________\_
 /  ______________  \
|  |  _     _  _  |  |
|  | |_| o | | _| |  |\
|  |  _| o |_| _| |  | |
|  |______________|  |/
|                __  |
|  _   _   _    |  | |\
| |_| |_| |_|   |__| |/
\____________________/
   \______________/
     |          |
     |          |
     |          |
     |          |
     |          |
      |        |
      |   ()   |                     
*/
const timerMap = new Map();

function timerAdd(guildid, channelid, messageauthorid, timer) {
    return timerMap.set(dbMakeKey(guildid, messageauthorid, channelid), timer);
}

function timerGet(guildid, channelid, messageauthorid) {
    return timerMap.get(dbMakeKey(guildid, messageauthorid, channelid));
}

function timerClear(guildid, channelid, messageauthorid) {
    return timerMap.delete(dbMakeKey(guildid, messageauthorid, channelid));
}

function timerGetAll() {
    return timerMap.values();
}






const fs = require('fs');




const authContent = fs.readFileSync('../guild.auth.json');
const guildAuth = ( JSON.parse( new TextDecoder().decode(authContent)) );

function dbResolveCode(code) {
    try
    {
        return guildAuth[code];
    } catch (err) {
        console.log("resolve code:", err);
        return false;
    }
}








const settingsMap = new Map();

function hasSettingsOnDisk(guildid, userid) {
    try {
        const fn = '../' + guildid + '_' + userid + '.settings';
        return fs.existsSync(fn);
    } catch (err) {
        return false;
    }
}

function hasGuildSettingsOnDisk(guildid) {
    try {
        const fn = './' + guildid + '.settings';
        return fs.existsSync(fn);
    } catch (err) {
        return false;
    }
}

function loadGuildSettingsFromDisk(guildid) {
    try {
        const fn = './' + guildid + '.settings';
        if (fs.existsSync(fn)) {

            const content = new TextDecoder().decode(fs.readFileSync(fn));
            console.log('loadGuildSettingsFromDisk', content);

            return JSON.parse(content);
        }
        else
            return {};

    } catch (err) {
        return { loadSettingsFromDiskError: err };
    }
}

function loadSettingsFromDisk(guildid, userid) {
    try {
        const fn = '../' + guildid + '_' + userid + '.settings';
        if (fs.existsSync(fn)) {

            const content = new TextDecoder().decode(fs.readFileSync(fn));
            console.log('loadSettingsFromDisk', content);

            return JSON.parse(content);
        }
        else
            return {};

    } catch (err) {
        return { loadSettingsFromDiskError: err };
    }
}

function saveSettingsToDisk(guildid, userid, settingsObj) {
    console.log('saveSettingsToDisk', settingsObj);
    const fn = '../' + guildid + '_' + userid + '.settings';

    //SAVE EVERYTHING IN UNICODE!!!
    //easier to read it back then
    var encoded = new TextEncoder('utf-16le').encode(JSON.stringify(settingsObj));
    fs.writeFileSync(fn, encoded);

    const testObj = loadSettingsFromDisk(guildid, userid);
    if (typeof testObj.loadSettingsFromDiskError !== 'undefined')
        throw testObj.loadSettingsFromDiskError;

    Object.keys(testObj)
        .concat(Object.keys(settingsObj))
        .forEach(key => {
            if (!isValidSettingName(key)) {
                return;
            }

            if (testObj[key] !== settingsObj[key])
                throw key + ' not saved!';
        });    
}


function dbMakeGuildSettingsDb(guildid) {
    settings = loadGuildSettingsFromDisk(guildid);
    return settingsMap.set(guildid, TAFFY(settings));
}

function dbMakeSettingsDb(guildid, userid) {
    settings = loadSettingsFromDisk(guildid, userid);
    return settingsMap.set(userid, TAFFY(settings));
}

function dbGetGuildSettings(guildid) {
    if (typeof guildid === 'undefined') throw 'no guildid';
    if (!settingsMap.has(guildid)) {
        dbMakeGuildSettingsDb(guildid);
    }
    return settingsMap.get(guildid);
}

function dbGetUserSettings(guildid, userid) {
    if (typeof guildid === 'undefined') throw 'no guildid';
    if (typeof userid === 'undefined') throw 'no userid';

    if (!settingsMap.has(userid)) {
        dbMakeSettingsDb(guildid, userid);
    }
    return settingsMap.get(userid);
}

function dbResolveSettings(guildid, userid) {
    const guildDb = dbGetGuildSettings(guildid, userid);
    const db = dbGetUserSettings(guildid, userid);

    const guildSettingsCopy = guildDb().first();
    const userSettings = db().first();

    Object.keys(userSettings).forEach(function(key, index) {
        if (!isValidSettingName(key)) return;
        guildSettingsCopy[key] = userSettings[key];
    });

    return [ guildSettingsCopy ];
    //return ( TAFFY(db().get())().merge( guildDb().first()) ).first();//( TAFFY(guildDb().first())().merge( db().first()) ).first();
}

function dbUpdateSetting(guildid, userid, saveSettingObj) {
    const db = dbGetUserSettings(guildid, userid);
    db().update(saveSettingObj);
    saveSettingsToDisk(guildid, userid, db().first());
}
/**
:regional_indicator_a: |  :mountain_railway: :unicorn: :innocent: :flushed: :face_with_monocle: :innocent: :unicorn: :mountain_railway:
:regional_indicator_b: |  :no_mouth: :no_mouth: :no_mouth: :no_mouth: :no_mouth: :no_mouth: :no_mouth: :no_mouth:
:regional_indicator_c: |
:regional_indicator_d: |
:regional_indicator_e: |


:woman_in_lotus_position: :man_in_lotus_position:

:regional_indicator_a: |  :snowboarder: :horse_racing: :person_golfing: :reminder_ribbon: :rosette: :horse_racing: :person_golfing: :snowboarder:
:regional_indicator_b: |  :people_wrestling: :people_wrestling: :people_wrestling: :people_wrestling: :people_wrestling: :people_wrestling: :people_wrestling: :people_wrestling:
:regional_indicator_c: |
:regional_indicator_d: |
:regional_indicator_e: |


:regional_indicator_a: |  :bus: :scooter: :airplane: :statue_of_liberty:  :moyai: :airplane: :scooter: :bus:
:regional_indicator_b: |  :blue_car: :blue_car: :blue_car: :blue_car: :blue_car: :blue_car: :blue_car: :blue_car:
:regional_indicator_c: |
:regional_indicator_d: |
:regional_indicator_e: |

*/

//function toUTF16(codePoint) {
//    var TEN_BITS = parseInt('1111111111', 2);
//    function u(codeUnit) {
//        return '\\u' + codeUnit.toString(16).toUpperCase();
//    }

//    if (codePoint <= 0xFFFF) {
//        return u(codePoint);
//    }
//    codePoint -= 0x10000;

//    // Shift right to get to most significant 10 bits
//    var leadingSurrogate = 0xD800 | (codePoint >> 10);

//    // Mask to get least significant 10 bits
//    var trailingSurrogate = 0xDC00 | (codePoint & TEN_BITS);

//    return u(leadingSurrogate) + u(trailingSurrogate);
//}
const DEFAULT_AUTOFLIP = true;
const DEFAULT_AUTOREACT = false;
const DEFAULT_EMOJI_SET = {
    '1default1': {
        /*********************************
       +------------------------+
     8 | r  n  b  q  k  b  n  r |
     7 | p  p  p  p  p  p  p  p |
     6 | .  .  .  .  .  .  .  . |
     5 | .  .  .  .  .  .  .  . |
     4 | .  .  .  .  .  .  .  . |
     3 | .  .  .  .  .  .  .  . |
     2 | P  P  P  P  P  P  P  P |
     1 | R  N  B  Q  K  B  N  R |
       +--- --- --- --- --- --- --- ---+
         a  b  c  d  e  f  g  h*/
        r: '🚌',
        n: '🛴',
        b: '✈️',
        q: '🗽',
        k: '🗿',
        p: '🚙',
        R: '🚞',
        N: '🦄',
        B: '😇',
        Q: '😳',
        K: '🧐',
        P: '😶',
        white: '⬜',//'⬜',▫️
        black: '⬛',
        keya: '🇦',//\uFEFF\ud83c\udde6',//' 🇦' \uD83C\uDDE6 //https://graphemica.com/%F0%9F%87%A6  \ud83c\udde6\u000a
        keyb: '🇧',//\uFEFF\uD83C\uDDE7',//.//🇧', //UTF-16/UTF-16BE (hex)	0xD83C 0xDDE7 (d83cdde7)
        keyc: '🇨', //\uFEFF\uD83C\uDDE8',//' 🇨',
        keyd: '🇩', //\uFEFF\uD83C\uDDE9',//' 🇩',
        keye: '🇪', //\uFEFF\uD83C\uDDEA',//' 🇪',
        keyf: '🇫',//\uFEFF\uD83C\uDDEB',//' 🇫',   THIS!!! https://onlineutf8tools.com/convert-utf8-to-utf16    
        keyg: '🇬',//\uFEFF\uD83C\uDDEC',//' 🇬',
        keyh: '🇭',//\uFEFF\uD83C\uDDED',//' 🇭',
        key1: '1️⃣',
        key2: '2️⃣',
        key3: '3️⃣',
        key4: '4️⃣',              //https://en.wikipedia.org/wiki/Byte_order_mark
        key5: '5️⃣',
        key6: '6️⃣',
        key7: '7️⃣', 
        key8: '8️⃣',
        wallplus: '➕',
        wallvert: '▪️',
        wallhorz: '▪️'
    }
};

const DEFAULT_DECKTYPE = '1default1';

function getGuildSettingDeckType(guildid, userid, setting_name) {
    if (!settingsMap.has(guildid)) {
        if (hasGuildSettingsOnDisk(guildid)) {
            dbMakeGuildSettingsDb(guildid);
        } else {
            //console.log('dbGetSettingDeckType', 'not has ======');
            return DEFAULT_DECKTYPE;
        }
    }
    const first = (dbGetGuildSettings(guildid))().first();

    if (typeof first.boardtype === 'undefined' || first.boardtype === null) {
        return DEFAULT_DECKTYPE;
    }
    return first.boardtype;
}

// boardtype
function dbGetSettingDeckType(guildid, userid) {
    if (!settingsMap.has(userid)) {
        if (hasSettingsOnDisk(guildid, userid)) {
            dbMakeSettingsDb(guildid, userid);
        } else {
            return getGuildSettingDeckType(guildid);//DEFAULT_DECKTYPE;
        }
    }
    const first = (dbGetUserSettings(guildid, userid))().first();

    if (typeof first.boardtype === 'undefined' || first.boardtype === null) {
        return getGuildSettingDeckType(guildid);//DEFAULT_DECKTYPE;
    }
    return first.boardtype;
}

function dbGetGuildCustomDeck(guildid, boardName) {
    if (!settingsMap.has(guildid)) {
        if (hasGuildSettingsOnDisk(guildid)) {
            dbMakeGuildSettingsDb(guildid);
        } else {
            return DEFAULT_EMOJI_SET['1default1'];
        }
    }

    const first = (dbGetGuildSettings(guildid))().first();
    try {
        if (first.hasOwnProperty(boardName)) {
            const result2 = {};
            
            const matches = (first[boardName].toString()).split('\n');
            for (const match of matches) {
                const kv = match.split(':');
                const value = kv.length === 4 /*emoji ref '<:doge:662971757174718467>' has been split, so reconstitute */ 
                        ? [kv[1], kv[2], kv[3]].join(':')
                        : kv[1];

                result2[kv[0]] = value;
            }
            return result2;
        }
    } catch (err) {
        console.log('dbGetGuildCustomDeck', err);
    }
    return DEFAULT_EMOJI_SET['1default1'];

}

function dbGetCustomDeck(guildid, userid, boardName) {
    if (!settingsMap.has(userid)) {
        if (hasSettingsOnDisk(guildid, userid)) {
            dbMakeSettingsDb(guildid, userid);
        } else {
            return dbGetGuildCustomDeck(guildid, boardName);
        }
    }

    const first = (dbGetUserSettings(guildid, userid))().first();
    try {
        if (first.hasOwnProperty(boardName)) {
            const result2 = {};
            
            const matches = (first[boardName].toString()).split('\n');
            for (const match of matches) {
                const kv = match.split(':');
                const value = kv.length === 4 /*emoji ref '<:doge:662971757174718467>' has been split, so reconstitute */ 
                        ? [kv[1], kv[2], kv[3]].join(':')
                        : kv[1];

                result2[kv[0]] = value;
            }
            return result2;
        }
    } catch (err) {
        console.log('dbGetCustomDeck', err);
    }
    return dbGetGuildCustomDeck(guildid, boardName);
}

//function dbGetSettingBigBoard() {

const DEFAULT_BIGBOARD = 'true';

function dbGetSettingBigBoard(guildid) {
    if (!settingsMap.has(guildid)) {
        if (hasGuildSettingsOnDisk(guildid)) {
            dbMakeGuildSettingsDb(guildid);
        } else {
            return DEFAULT_BIGBOARD;
        }
    }
    const first = (dbGetGuildSettings(guildid))().first();
    if (typeof first.bigboard === 'undefined' || first.bigboard === null) {
        return DEFAULT_BIGBOARD;
    }

    if (first.length > 5) return false; //quick check before a JSON.parse
    return JSON.parse(first.bigboard.toString().toLowerCase());
}

function dbGetGuildSettingBigBoard(guildid) {
    if (!settingsMap.has(guildid)) {
        if (hasGuildSettingsOnDisk(guildid)) {
            dbMakeGuildSettingsDb(guildid);
        } else {
            return DEFAULT_BIGBOARD;
        }
    }
    const first = (dbGetGuildSettings(guildid))().first();
    if (typeof first.bigboard === 'undefined' || first.bigboard === null) {
        return DEFAULT_BIGBOARD;
    }

    if (first.length > 5) return false; //quick check before a JSON.parse
    return JSON.parse(first.bigboard.toString().toLowerCase());
}

function dbGetSettingBigBoard(guildid, userid) {
    if (!settingsMap.has(userid)) {
        if (hasSettingsOnDisk(guildid, userid)) {
            dbMakeSettingsDb(guildid, userid);
        } else {
            return dbGetGuildSettingBigBoard(guildid);
        }
    }
    const first = (dbGetUserSettings(guildid, userid))().first();
    if (typeof first.bigboard === 'undefined' || first.bigboard === null) {
        return dbGetGuildSettingBigBoard(guildid);
    }

    if (first.length > 5) return false; //quick check before a JSON.parse
    return JSON.parse(first.bigboard.toString().toLowerCase());
}



//----------------------------------------------

function dbGetGuildSettingAutoFlip(guildid) {
    if (!settingsMap.has(guildid)) {
        if (hasGuildSettingsOnDisk(guildid)) {
            dbMakeGuildSettingsDb(guildid);
        } else {
            return DEFAULT_AUTOFLIP;
        }
    }
    const first = (dbGetGuildSettings(guildid))().first();
    if (typeof first.autoflip === 'undefined' || first.autoflip === null) {
        return DEFAULT_AUTOFLIP;
    }

    if (first.length > 5) return false; //quick check before a JSON.parse
    return JSON.parse(first.autoflip.toString().toLowerCase());
}

function dbGetGuildSettingAutoReact(guildid) {
    if (!settingsMap.has(guildid)) {
        if (hasGuildSettingsOnDisk(guildid)) {
            dbMakeGuildSettingsDb(guildid);
        } else {
            return DEFAULT_AUTOREACT;
        }
    }
    const first = (dbGetGuildSettings(guildid))().first();
    if (typeof first.autoreact === 'undefined' || first.autoreact === null) {
        return DEFAULT_AUTOREACT;
    }

    if (first.length > 5) return false; //quick check before a JSON.parse
    return JSON.parse(first.autoreact.toString().toLowerCase());
}

function dbGetSettingAutoFlip(guildid, userid) {
    if (!settingsMap.has(userid)) {
        if (hasSettingsOnDisk(guildid, userid)) {
            dbMakeSettingsDb(guildid, userid);
        } else {
            return dbGetGuildSettingAutoFlip(guildid);
        }
    }
    const first = (dbGetUserSettings(guildid, userid))().first();
    if (typeof first.autoflip === 'undefined' || first.autoflip === null) {
        return dbGetGuildSettingAutoFlip(guildid);
    }

    if (first.length > 5) return false; //quick check before a JSON.parse
    return JSON.parse(first.autoflip.toString().toLowerCase());
}

function dbGetSettingAutoReact(guildid, userid) {
    if (!settingsMap.has(userid)) {
        if (hasSettingsOnDisk(guildid, userid)) {
            dbMakeSettingsDb(guildid, userid);
        } else {
            return dbGetGuildSettingAutoReact(guildid);
        }
    }
    const first = (dbGetUserSettings(guildid, userid))().first();
    if (typeof first.autoreact === 'undefined' || first.autoreact === null) {
        return dbGetGuildSettingAutoReact(guildid);
    }

    if (first.length > 5) return false; //quick check before a JSON.parse
    return JSON.parse(first.autoreact.toString().toLowerCase());
}




var gameCount = 0;
function dbIncrementGameCount() {
    gameCount++;
}

function dbDecrementGameCount() {
    gameCount--;
}

function dbGetGameCount() {
    return gameCount;
}

function pretty(data) {
    return JSON.parse(data().stringify());
}

function runTests() {
    dbAddGameAuthor(0, 1, 20, { stuff: 'stuff1' });
    dbUpdateGameTarget(0, 1, 20, 300, { targetstuff: 'targetstuff1' });
    console.log('\n', 'first', pretty(getGame(0)));

    dbAddGameAuthor(0, 4, 50, { stuff: 'stuffA' });
    dbUpdateGameTarget(0, 4, 50, 600, { targetstuff: 'targetstuff2' });
    console.log('\n', 'second', pretty(getGame(0)));

    dbAddGameAuthor(0, 7, 80, { stuff: 'stuff()' });
    console.log('\n', 'third', pretty(getGame(0)));

    const gamekeys = dbGetGameKeysForUser(0, 1, 20);
    console.log('\n', 'gamekeys 1, 20', gamekeys);
    console.log('\n', 'games for keys', gamekeys.join(" and "), JSON.parse(getGame(0)({ key: gamekeys }).stringify()));

    dbUpdateForUser(4, 50, { stuff: 'NOT STUFFA' });
    console.log('\n', 'gamekeys 4, 50', pretty(getGame(0)));

    console.log('\n', '--------------------------- >-8 ------------------------------', '\n');

    console.log(dbGetGuildGame(0)(gamekeys));
    //process.exit(0);
    //return 0;
}

module.exports = {
    dbResolveCode,

    dbMakeDb,
    dbMakeKey,

    dbAddGameAuthor,

    dbUpdateGameTarget,
    dbUpdateForGame,
    dbUpdateForUser,

    dbRemoveGame,

    dbGetGameFromTarget,
    dbGetGameKeysForUser,
    dbGetGame,
    dbGetForUserKey,
    dbPresentGames,
    dbGetAll,
    dbIsAny,

    timerAdd,
    timerGet,
    timerClear,
    timerGetAll,

    dbResolveSettings, 
    dbUpdateSetting,
    dbGetSettingAutoFlip,
    dbGetSettingAutoReact,
    dbGetSettingDeckType,
    dbGetSettingBigBoard,
    dbGetCustomDeck,

    dbIncrementGameCount,
    dbDecrementGameCount,
    dbGetGameCount,

    runTests    
};

//runTests();
