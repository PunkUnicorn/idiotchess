const TAFFY = require('taffy');

const gamesMap = new Map();

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
const settingsMap = new Map();

function hasSettingsOnDisk(guildid, userid) {
    try {
        const fn = '../' + guildid + '_' + userid + '.settings';
        return fs.existsSync(fn);
    } catch (err) {
        return false;
    }
}

function loadSettingsFromDisk(guildid, userid) {
    try {
        const fn = '../' + guildid + '_' + userid + '.settings';
        if (fs.existsSync(fn)) {
            const content = fs.readFileSync(fn);
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
    fs.writeFileSync(fn, JSON.stringify(settingsObj));
    const testObj = loadSettingsFromDisk(guildid, userid);
    if (typeof testObj.loadSettingsFromDiskError !== 'undefined')
        throw testObj.loadSettingsFromDiskError;

    Object.keys(testObj)
        .concat(Object.keys(settingsObj))
        .forEach(key => {
            if (testObj[key] !== settingsObj[key])
                throw key + ' not saved!';
        });    
}

function dbMakeSettingsDb(guildid, userid) {
    settings = loadSettingsFromDisk(guildid, userid);
    return settingsMap.set(userid, TAFFY(settings));
}

function dbGetUserSettings(guildid, userid) {
    if (typeof guildid === 'undefined') throw 'no guildid';
    if (typeof userid === 'undefined') throw 'no userid';
    if (!settingsMap.has(userid)) {
        dbMakeSettingsDb(guildid, userid);
    }
    return settingsMap.get(userid);
}

function dbGetSettings(guildid, userid) {
    const db = dbGetUserSettings(guildid, userid);
    console.log('dbGetSettings', db().get());
    return db().get();
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
        key7: '7️⃣', //<:emoji:000000000000000000>
        key8: '8️⃣',
        wallplus: '➕',//+
        wallvert: '▪️',
        wallhorz: '▪️'
    }
};

const DEFAULT_DECKTYPE = '1default1';

// boardtype
function dbGetSettingDeckType(guildid, userid) {
    if (!settingsMap.has(userid)) {
        if (hasSettingsOnDisk(guildid, userid)) {
            dbMakeSettingsDb(guildid, userid);
        } else {
            //console.log('dbGetSettingDeckType', 'not has ======');
            return DEFAULT_DECKTYPE;
        }
    }
    const first = (dbGetUserSettings(guildid, userid))().first();

    if (typeof first.boardtype === 'undefined') {
        return DEFAULT_DECKTYPE;
    }
    return first.boardtype;
}

function dbGetCustomDeck(guildid, userid, boardName) {
    if (!settingsMap.has(userid)) {
        if (hasSettingsOnDisk(guildid, userid)) {
            dbMakeSettingsDb(guildid, userid);
        } else {
            console.log('dbGetCustomDeck', 'not has ======');
            return DEFAULT_EMOJI_SET['1default1'];
        }
    }

    const first = (dbGetUserSettings(guildid, userid))().first();
    try {
        if (first.hasOwnProperty(boardName)) {
            //console.log('first[boardName]', first, first[boardName], first[boardName].toString());
            //const cloneFood = { ...first[boardName] };
            //console.log(first.customb, cloneFood);
            return first[boardName];
        }
    } catch (err) {
        console.log('dbGetCustomDeck', err);
    }
    return DEFAULT_EMOJI_SET['1default1'];
}

function dbGetSettingAutoReact(guildid, userid) {
    if (!settingsMap.has(userid)) {
        if (hasSettingsOnDisk(guildid, userid)) {
            dbMakeSettingsDb(guildid, userid);
        } else {
            console.log('dbGetSettingAutoReact', 'not has ======');
            return DEFAULT_AUTOREACT;
        }
    }
    const first = (dbGetUserSettings(guildid, userid))().first();
    //console.log('first        ', first);
    if (typeof first.autoreact === 'undefined') {
        return DEFAULT_AUTOREACT;
    }
    //console.log('dbGetSettingAutoReact', first, first.autoreact.toString(), JSON.parse(first.autoreact.toString().toLowerCase()));
    if (first.length > 5) return false; //quick check before a JSON.parse
    return JSON.parse(first.autoreact.toString().toLowerCase());
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

    dbGetSettings, //(guildid, messageauthorid);
    dbUpdateSetting, //(guildid, messageauthorid, saveSettingObj);
    dbGetSettingAutoReact,
    dbGetSettingDeckType,
    dbGetCustomDeck,


    runTests    
};

//runTests();
