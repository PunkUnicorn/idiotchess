const TAFFY = require('taffy');

var games = TAFFY();


function dbMakeKey(userid, channelid) {
    return [userid, channelid].join("-");
}

function dbAddGameAuthor(authorid, channelid, stuff) {
    if (typeof stuff === 'undefined') stuff = {};

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

    games({ key: authorkey })
        .update({ targetid, targetkey })
}

/* updates all properties for where this user is an author or target */
function dbUpdateForGame(userid, channelid, game) {
    if (typeof game === 'undefined') game = BLANK_GAME;
    games( dbGetGameUserKeys(userid, channelid) ).update(game);
}

/* gets all game rows where the user is an author or target */
function dbGetGameUserKeys(userid, channelid) {
    const findKey = { key: dbMakeKey(userid, channelid) };

    const keys = games(findKey)
        .select('authorkey', 'targetkey', 'key');

    if (keys.length > 0) {
        return keys[0].filter(f => typeof f !== 'undefined');
    }
    return [];
}

/* updates individual user properties e.g. */
function dbUpdateForUser(userid, channelid, updates) {
    const key = dbMakeKey(userid, channelid);
    games({ key }).update(updates);
}

/* removes all traces of the game a user is an author or target of */
function dbRemoveGame(userid, channelid) {
    games(dbGetGameUserKeys(userid, channelid)).remove();
}

function dbGetGame(keys) {
    const result = games({ key: keys }).get();
    return typeof result === 'undefined'
        ? [[{}]]
        : result;
}

function dbGetForUser(userid, channelid) {
    return games({ key: dbMakeKey(userid, channelid) }).get();
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

    const gamekeys = dbGetGameUserKeys(1, 20);
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
    dbGetGameUserKeys,
    dbGetGame,
    dbGetForUser,

    timerAdd,
    timerGet,
    timerClear,

    runTests
};

//runTests();
