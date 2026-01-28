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

const submitMancheResults = (mancheIndex) => {
    console.log(`API: submitMancheResults called for mancheIndex=${mancheIndex}`);

    const tournament = storage.get('tournament');
    if (!tournament || !tournament.code) {
        console.log('API: no tournament or no code, skipping');
        return;
    }

    const players = tournament.players;
    const mancheList = getSafeManches(tournament);
    console.log(`API: mancheList length=${mancheList.length}`);

    if (!mancheList[mancheIndex]) {
        console.log(`API: no manche at index ${mancheIndex}, skipping`);
        return;
    }

    const manche = mancheList[mancheIndex];
    console.log(`API: manche has ${manche.length} rounds`);

    // Calculate the sequential heat number offset for this manche
    let heatOffset = 0;
    for (let i = 0; i < mancheIndex; i++) {
        heatOffset += mancheList[i].length;
    }

    // Submit each round as a separate heat
    manche.forEach((round, roundIndex) => {
        const cars = storage.loadRound(mancheIndex, roundIndex);
        console.log(`API: round ${roundIndex} cars=`, cars ? cars.length : 'undefined');
        if (!cars) return;

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
            console.log(`API: round ${roundIndex} has no results, skipping`);
            return;
        }

        const heatNumber = heatOffset + roundIndex + 1;
        const url = `${BASE_URL}/api/v1/public/tournament/${tournament.code}/heats`;
        const body = {
            manche_number: heatNumber,
            results: results
        };

        const payloadJson = JSON.stringify(body);
        if (lastSubmitted[heatNumber] === payloadJson) {
            console.log(`API: heat ${heatNumber} (manche ${mancheIndex}, round ${roundIndex}) unchanged, skipping`);
            return;
        }

        console.log(`API: POSTing heat ${heatNumber} (manche ${mancheIndex}, round ${roundIndex}) to ${url}`, JSON.stringify(body, null, 2));

        $.ajax({
            url: url,
            type: 'POST',
            contentType: 'application/json',
            data: payloadJson,
            success: (response) => {
                lastSubmitted[heatNumber] = payloadJson;
                console.log(`API: heat ${heatNumber} (manche ${mancheIndex}, round ${roundIndex}) results submitted`, response);
            },
            error: (xhr, status, error) => {
                console.error(`API: failed to submit heat ${heatNumber} (manche ${mancheIndex}, round ${roundIndex})`, status, error);
            }
        });
    });
};

const submitAllMancheResults = () => {
    console.log('API: submitAllMancheResults called');

    const tournament = storage.get('tournament');
    if (!tournament || !tournament.code) {
        console.log('API: no tournament, skipping');
        return;
    }

    const mancheList = getSafeManches(tournament);
    console.log(`API: checking ${mancheList.length} manches for completed rounds`);

    mancheList.forEach((manche, mancheIndex) => {
        const hasCompletedRound = manche.some((_round, roundIndex) => {
            return !!storage.loadRound(mancheIndex, roundIndex);
        });

        console.log(`API: manche ${mancheIndex} hasCompletedRound=${hasCompletedRound}`);
        if (hasCompletedRound) {
            submitMancheResults(mancheIndex);
        }
    });
};

module.exports = {
    submitMancheResults: submitMancheResults,
    submitAllMancheResults: submitAllMancheResults
};
