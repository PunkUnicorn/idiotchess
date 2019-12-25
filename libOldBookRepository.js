const TAFFY = require('taffy');

const games = TAFFY();


function dbMakeKey(userid, channelid) {
    return [userid, channelid].join("-");
}

function dbAddGameAuthor(authorid, channelid, stuff, targetid) {
    if (typeof stuff === 'undefined') stuff = {};
    if (typeof targetid !== 'undefined' && targetid !== null) {
        stuff.targetid = targetid;
        stuff.targetkey = dbMakeKey(targetid, channelid);
    }

    const key = dbMakeKey(authorid, channelid);

    games.insert({
        key,
        isAuthor: true,
        channelid,

        authorid
    }).update(stuff);
}

function dbUpdateGameTarget(authorid, channelid, targetid, targetStuff) {
    if (typeof targetStuff === 'undefined') targetStuff = {};

    const targetkey = dbMakeKey(targetid, channelid);
    const authorkey = dbMakeKey(authorid, channelid);

    games.insert({
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
function dbUpdateForGame(userid, channelid, game) {
    if (typeof game === 'undefined') {
        console.log('invalid game in dbUpdateForGame'); throw 'invalid game in dbUpdateForGame';
    }

    games([{ key: dbGetGameKeysForUser(userid, channelid) }] ).update(game);
}

/* gets all game rows where the user is an author or target */
function dbGetGameKeysForUser(userid, channelid) {
    const findKey = typeof channelid !== 'undefined'
        ? { key: dbMakeKey(userid, channelid) }
        : [{ authorid: userid }, {targetid: userid} ];

    const keys = games(findKey)
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
function dbGetGameFromTarget(targetid, channelid) {
    return games({ targetid, channelid }).get().filter(f => typeof f !== 'undefined');
}

/* updates individual user properties e.g. */
function dbUpdateForUser(userid, channelid, updates) {
    const key = dbMakeKey(userid, channelid);
    games({ key }).update(updates);
}

/* removes all traces of the game a user is an author or target of */
function dbRemoveGame(userid, channelid) {
    games([{ key: dbGetGameKeysForUser(userid, channelid) }]).remove();
}

function dbGetGame(keys) {
    const result = games({ key: keys }).get();
    console.log('dbGetGame', result, keys);
    return typeof result === 'undefined'
        ? [[{}]]
        : result;
}

function dbGetAll() {
    return games().get();
}

function dbGetForUserKey(userid, channelid) {
    return games({ key: dbMakeKey(userid, channelid) }).get().filter(f => typeof f !== 'undefined');
}

const timerMap = new Map();

function timerAdd(channelid, messageauthorid, timer) {
    return timerMap.set(dbMakeKey(messageauthorid, channelid), timer);
}

function timerGet(channelid, messageauthorid) {
    return timerMap.get(dbMakeKey(messageauthorid, channelid));
}

function timerClear(channelid, messageauthorid) {
    return timerMap.delete(dbMakeKey(messageauthorid, channelid));
}

function timerGetAll() {
    return timerMap.values();
}

function pretty(data) {
    return JSON.parse(data().stringify());
}

function runTests() {
    dbAddGameAuthor(1, 20, { stuff: 'stuff1' });
    dbUpdateGameTarget(1, 20, 300, { targetstuff: 'targetstuff1' });
    console.log('\n', 'first', pretty(games));

    dbAddGameAuthor(4, 50, { stuff: 'stuffA' });
    dbUpdateGameTarget(4, 50, 600, { targetstuff: 'targetstuff2' });
    console.log('\n', 'second', pretty(games));

    dbAddGameAuthor(7, 80, { stuff: 'stuff()' });
    console.log('\n', 'third', pretty(games));

    const gamekeys = dbGetGameKeysForUser(1, 20);
    console.log('\n', 'gamekeys 1, 20', gamekeys);
    console.log('\n', 'games for keys', gamekeys.join(" and "), JSON.parse(games({ key: gamekeys }).stringify()));

    dbUpdateForUser(4, 50, { stuff: 'NOT STUFFA' });
    console.log('\n', 'gamekeys 4, 50', pretty(games));

    console.log('\n', '--------------------------- >-8 ------------------------------', '\n');

    console.log(dbGetGame(gamekeys));
    //process.exit(0);
    //return 0;
}

module.exports = {
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

    runTests,
    games
};

//runTests();
