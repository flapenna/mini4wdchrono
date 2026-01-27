'use strict';

const storage = require('./storage');
const clone = require('clone');

const BASE_URL = 'https://mini4wd-companion.com';

const submitMancheResults = (mancheIndex) => {
    console.log(`API: submitMancheResults called for mancheIndex=${mancheIndex}`);

    const tournament = storage.get('tournament');
    if (!tournament || !tournament.code) {
        console.log('API: no tournament or no code, skipping');
        return;
    }

    const players = tournament.players;
    // clone to avoid mutating tournament.manches (getManches pushes finals in-place)
    const mancheList = clone(storage.getManches());
    console.log(`API: mancheList length=${mancheList ? mancheList.length : null}`);

    if (!mancheList || !mancheList[mancheIndex]) {
        console.log(`API: no manche at index ${mancheIndex}, skipping`);
        return;
    }

    const manche = mancheList[mancheIndex];
    console.log(`API: manche has ${manche.length} rounds`);
    const results = [];

    manche.forEach((round, roundIndex) => {
        const cars = storage.loadRound(mancheIndex, roundIndex);
        console.log(`API: round ${roundIndex} cars=`, cars ? cars.length : 'undefined');
        if (!cars) return;

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
    });

    if (results.length === 0) {
        console.log('API: no results to submit, skipping');
        return;
    }

    const url = `${BASE_URL}/api/v1/public/tournament/${tournament.code}/heats`;
    const body = {
        manche_number: mancheIndex + 1,
        results: results
    };

    console.log(`API: POSTing to ${url}`, JSON.stringify(body, null, 2));

    $.ajax({
        url: url,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(body),
        success: (response) => {
            console.log(`API: manche ${mancheIndex + 1} results submitted`, response);
        },
        error: (xhr, status, error) => {
            console.error(`API: failed to submit manche ${mancheIndex + 1} results`, status, error);
        }
    });
};

const submitAllMancheResults = () => {
    console.log('API: submitAllMancheResults called');

    // clone to avoid mutating tournament.manches (getManches pushes finals in-place)
    const mancheList = clone(storage.getManches());
    if (!mancheList) {
        console.log('API: no mancheList, skipping');
        return;
    }

    console.log(`API: checking ${mancheList.length} manches for completed rounds`);

    mancheList.forEach((_manche, mancheIndex) => {
        const manche = mancheList[mancheIndex];
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
