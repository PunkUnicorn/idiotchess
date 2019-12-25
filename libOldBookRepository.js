const TAFFY = require('taffy');

const gamesMap = new Map();
const gamesObj = {};

function dbMakeDb(guildid) {
    //gamesObj['T'+guildid] = TAFFY();
    return gamesMap.set(guildid, TAFFY());
}
function dbGetGuildGame(guildid) {
    if (typeof guildid === 'undefined') throw 'no guildid';
    if (!gamesMap.has(guildid)) throw 'unknown guildid ' + guildid;
    //if (typeof gamesObj['T' + guildid] === 'undefined') {
    //    throw 'wut';
    //    //gamesObj['T' + guildid] = TAFFY();
    //    //console.log('****************************************** unexpected making of DB for ' + guildid);
    //}
    //if (gamesObj['T' + guildid] === null) throw 'urgh';
    //console.log('dbGetGuildGame', guildid, gamesObj['T' + guildid]());
    //return (gamesObj['T' + guildid]);
    return gamesMap.get(guildid);


            //return typeof query === 'undefined' ? gamesObj['T' + guildid]() : gamesObj['T' + guildid](query);
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

    //games({ key: authorkey })
    //    .update({ targetid, targetkey });
}

/* updates all properties for where this user is an author or target */
function dbUpdateForGame(guildid, userid, channelid, game) {
    if (typeof game === 'undefined') {
        console.log('invalid game in dbUpdateForGame'); throw 'invalid game in dbUpdateForGame';
    }

    dbGetGuildGame(guildid)([{ key: dbGetGameKeysForUser(guildid, userid, channelid) }] ).update(game);
}

/* gets all game rows where the user is an author or target */
function dbGetGameKeysForUser(guildid, userid, channelid) {
    const findKey = typeof channelid !== 'undefined'
        ? { key: dbMakeKey(guildid, userid, channelid) }
        : [{ authorid: userid }, {targetid: userid} ];

    var db = dbGetGuildGame(guildid);

    console.log('dbGetGameKeysForUser', db(), 'and', findKey);
    const keys = db(findKey)
        .select('authorkey', 'targetkey', 'key');

    console.log('findKey', findKey, 'and keys', keys);

    if (keys.length > 0) {
        var definedKeys = [];
        for (var i = 0; keys.length > i; i++) {
            console.log('findKey2', i, keys[i]);

            keys[i]
                .filter(f => typeof f !== 'undefined')
                .forEach(function (val) {
                    definedKeys.push(val); console.log('definedKeys.push(val)', val);
                });
        }

        console.log([...new Set(definedKeys)]);
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
    console.log('dbGetGame', result, keys);
    return typeof result === 'undefined'
        ? [[{}]]
        : result;
}

function dbGetAll(guildid) {
    return dbGetGuildGame(guildid)().get();
}

function dbGetForUserKey(guildid, userid, channelid) {
    const db = dbGetGuildGame(guildid);
    //console.log('dbGetForUserKey 1', gamesMap.keys());
    //console.log('dbGetForUserKey 2', guildid, db().get(), db({ key: dbMakeKey(guildid, userid, channelid) }).get());
    return db({ key: dbMakeKey(guildid, userid, channelid) }).get().filter(f => typeof f !== 'undefined');
}



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
    dbGetAll,

    timerAdd,
    timerGet,
    timerClear,
    timerGetAll,

    runTests    
};

//runTests();
