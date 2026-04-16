'use strict';

const storage = require('./storage');
const auth = require('./auth');
const { app } = require('electron').remote;

const BASE_URL = 'https://mini4wd-companion.com';
const APP_VERSION = app.getVersion();

// Track last submitted payload per heat to avoid redundant API calls
const lastSubmitted = {};

// Build manches list without calling storage.getManches(),
// which mutates tournament.manches in-place by pushing finals.
const getSafeManches = (tournament) => {
    const manches = [].concat(tournament.manches);
    if (tournament.finals) {
        manches.push(...tournament.finals);
    }
    return manches;
};

// Submit a single round (heat) result to the API
const submitRoundResult = (mancheIndex, roundIndex) => {
    console.log(`API: submitRoundResult called for manche=${mancheIndex}, round=${roundIndex}`);

    const tournament = storage.get('tournament');
    if (!tournament || !tournament.code) {
        console.log('API: no tournament or no code, skipping');
        return;
    }

    const players = tournament.players;
    const mancheList = getSafeManches(tournament);

    // Log the round configuration for debugging
    const round = mancheList[mancheIndex] ? mancheList[mancheIndex][roundIndex] : null;
    console.log(`API: round config=`, JSON.stringify(round));
    console.log(`API: players array=`, JSON.stringify(players));

    const cars = storage.loadRound(mancheIndex, roundIndex);
    console.log(`API: cars=`, cars ? JSON.stringify(cars.map(c => ({ playerId: c.playerId, currTime: c.currTime }))) : 'undefined');
    if (!cars) {
        console.log(`API: no cars data for manche ${mancheIndex}, round ${roundIndex}, skipping`);
        return;
    }

    const results = [];
    cars.forEach((car, carIndex) => {
        if (car.playerId === -1 || car.playerId === null || car.playerId === undefined) {
            console.log(`API:   car[${carIndex}] empty lane (playerId=${car.playerId}), skipping`);
            return;
        }

        console.log(`API:   car[${carIndex}] outOfBounds=${car.outOfBounds} currTime=${car.currTime}`);
        const isDnf = car.outOfBounds === true || car.currTime === 99999;
        const entry = {
            car_name: players[car.playerId],
            lap_time: isDnf ? null : car.currTime / 1000,
            is_dnf: isDnf
        };
        console.log(`API:   car[${carIndex}] playerId=${car.playerId} name=${entry.car_name} time=${entry.lap_time} dnf=${entry.is_dnf}`);
        results.push(entry);
    });

    if (results.length === 0) {
        console.log(`API: round has no results, skipping`);
        return;
    }

    // Use the manche number (1-based) as displayed in the UI
    // mancheIndex 0 = MANCHE 1, mancheIndex 1 = MANCHE 2, etc.
    const mancheNumber = mancheIndex + 1;

    const url = `${BASE_URL}/api/v1/public/tournament/${tournament.code}/heats`;
    const body = {
        manche_number: mancheNumber,
        results: results
    };

    // Detect if this is a finals manche and add finals-specific fields
    const qualifierCount = tournament.mancheCount || tournament.manches.length;
    if (mancheIndex >= qualifierCount && tournament.finals) {
        body.round_type = 'final';
        const finalsIndex = mancheIndex - qualifierCount;
        if (tournament.finals.length >= 2) {
            // Two brackets: first is finalina, last is final
            body.finals_bracket = (finalsIndex === 0) ? 'finalina' : 'final';
        } else {
            // Only one bracket: it's the final
            body.finals_bracket = 'final';
        }
        // roundIndex (0-2) is the Latin Square rotation within the bracket
        body.finals_round_number = roundIndex + 1;
        console.log(`API: Finals detected - bracket=${body.finals_bracket} round=${body.finals_round_number}`);
    }

    // Use a unique key combining manche and round for deduplication
    const cacheKey = `m${mancheIndex}r${roundIndex}`;
    const payloadJson = JSON.stringify(body);
    if (lastSubmitted[cacheKey] === payloadJson) {
        console.log(`API: MANCHE ${mancheNumber} round ${roundIndex + 1} unchanged, skipping`);
        return;
    }

    console.log(`API: POSTing MANCHE ${mancheNumber} round ${roundIndex + 1} to ${url}`, JSON.stringify(body, null, 2));

    const ajaxOptions = {
        url: url,
        type: 'POST',
        contentType: 'application/json',
        data: payloadJson
    };

    ajaxOptions.headers = { 'X-Chrono-Version': APP_VERSION };
    const token = auth.getToken();
    if (token) {
        ajaxOptions.headers['Authorization'] = 'Bearer ' + token;
    }

    $.ajax(Object.assign(ajaxOptions, {
        success: (response) => {
            lastSubmitted[cacheKey] = payloadJson;
            console.log(`API: MANCHE ${mancheNumber} round ${roundIndex + 1} submitted`, response);
        },
        error: (xhr, status, error) => {
            console.error(`API: failed to submit MANCHE ${mancheNumber} round ${roundIndex + 1}`, status, error);
        }
    }));
};

// Submit all completed rounds to the API (used when saving from tabella manche)
const submitAllCompletedRounds = () => {
    console.log('API: submitAllCompletedRounds called');

    const tournament = storage.get('tournament');
    if (!tournament || !tournament.code) {
        console.log('API: no tournament, skipping');
        return;
    }

    const mancheList = getSafeManches(tournament);
    console.log(`API: checking ${mancheList.length} manches for completed rounds`);

    mancheList.forEach((manche, mancheIndex) => {
        manche.forEach((_round, roundIndex) => {
            const cars = storage.loadRound(mancheIndex, roundIndex);
            if (cars) {
                console.log(`API: submitting manche ${mancheIndex}, round ${roundIndex}`);
                submitRoundResult(mancheIndex, roundIndex);
            }
        });
    });
};

// Check if this chrono version is up to date
const checkVersion = (callback) => {
    const url = `${BASE_URL}/api/v1/public/chrono/version-check?version=${APP_VERSION}`;

    $.ajax({
        url: url,
        type: 'GET',
        contentType: 'application/json',
        headers: { 'X-Chrono-Version': APP_VERSION },
        success: (response) => {
            const data = response.data || response;
            console.log('API: version check result:', data.status);
            if (callback) {
                callback(data);
            }
        },
        error: (xhr, status, error) => {
            console.error('API: version check failed', status, error);
            if (callback) {
                callback(null);
            }
        }
    });
};

module.exports = {
    submitRoundResult: submitRoundResult,
    submitAllCompletedRounds: submitAllCompletedRounds,
    checkVersion: checkVersion
};
