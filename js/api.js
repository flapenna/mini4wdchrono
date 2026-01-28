'use strict';

const storage = require('./storage');

const BASE_URL = 'https://mini4wd-companion.com';

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

    const cars = storage.loadRound(mancheIndex, roundIndex);
    console.log(`API: cars=`, cars ? cars.length : 'undefined');
    if (!cars) {
        console.log(`API: no cars data for manche ${mancheIndex}, round ${roundIndex}, skipping`);
        return;
    }

    const results = [];
    cars.forEach((car, carIndex) => {
        if (car.playerId === -1) {
            console.log(`API:   car[${carIndex}] empty lane, skipping`);
            return;
        }

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

    // Calculate the sequential manche_number for the API
    // Each row/heat gets a unique sequential number (1, 2, 3, 4...)
    let mancheNumber = 0;
    for (let i = 0; i < mancheIndex; i++) {
        mancheNumber += mancheList[i].length;
    }
    mancheNumber += roundIndex + 1;

    const url = `${BASE_URL}/api/v1/public/tournament/${tournament.code}/heats`;
    const body = {
        manche_number: mancheNumber,
        results: results
    };

    // Use a unique key combining manche and round for deduplication
    const cacheKey = `m${mancheIndex}r${roundIndex}`;
    const payloadJson = JSON.stringify(body);
    if (lastSubmitted[cacheKey] === payloadJson) {
        console.log(`API: manche_number ${mancheNumber} (manche ${mancheIndex}, round ${roundIndex}) unchanged, skipping`);
        return;
    }

    console.log(`API: POSTing manche_number ${mancheNumber} (manche ${mancheIndex}, round ${roundIndex}) to ${url}`, JSON.stringify(body, null, 2));

    $.ajax({
        url: url,
        type: 'POST',
        contentType: 'application/json',
        data: payloadJson,
        success: (response) => {
            lastSubmitted[cacheKey] = payloadJson;
            console.log(`API: manche_number ${mancheNumber} results submitted`, response);
        },
        error: (xhr, status, error) => {
            console.error(`API: failed to submit manche_number ${mancheNumber}`, status, error);
        }
    });
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

module.exports = {
    submitRoundResult: submitRoundResult,
    submitAllCompletedRounds: submitAllCompletedRounds
};
