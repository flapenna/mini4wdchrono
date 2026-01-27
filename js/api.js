'use strict';

const storage = require('./storage');

const BASE_URL = 'https://mini4wd-companion.com';

const submitMancheResults = (mancheIndex) => {
    const tournament = storage.get('tournament');
    if (!tournament || !tournament.code) return;

    const players = tournament.players;
    const mancheList = storage.getManches();
    if (!mancheList || !mancheList[mancheIndex]) return;

    const manche = mancheList[mancheIndex];
    const results = [];

    manche.forEach((round, roundIndex) => {
        const cars = storage.loadRound(mancheIndex, roundIndex);
        if (!cars) return;

        cars.forEach((car) => {
            if (car.playerId === -1) return;

            const isDnf = car.outOfBounds === true || car.currTime === 99999;
            results.push({
                car_name: players[car.playerId],
                lap_time: isDnf ? null : car.currTime / 1000,
                is_dnf: isDnf
            });
        });
    });

    if (results.length === 0) return;

    const url = `${BASE_URL}/api/v1/public/tournament/${tournament.code}/heats`;
    const body = {
        manche_number: mancheIndex + 1,
        results: results
    };

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
    const mancheList = storage.getManches();
    if (!mancheList) return;

    mancheList.forEach((_manche, mancheIndex) => {
        const manche = mancheList[mancheIndex];
        const hasCompletedRound = manche.some((_round, roundIndex) => {
            return !!storage.loadRound(mancheIndex, roundIndex);
        });

        if (hasCompletedRound) {
            submitMancheResults(mancheIndex);
        }
    });
};

module.exports = {
    submitMancheResults: submitMancheResults,
    submitAllMancheResults: submitAllMancheResults
};
