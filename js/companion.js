'use strict';

const auth = require('./auth');

const BASE_URL = 'https://mini4wd-companion.com';

const fetchTodayRaces = (onSuccess, onError) => {
    const token = auth.getToken();
    if (!token) {
        if (onError) {
            onError('Not logged in');
        }
        return;
    }

    $.ajax({
        url: BASE_URL + '/api/v1/organizer/races/today',
        type: 'GET',
        contentType: 'application/json',
        headers: {
            'Authorization': 'Bearer ' + token
        },
        success: function (response) {
            if (onSuccess) {
                // Response format: { success: true, data: { races: [...] } }
                const data = response.data || response;
                onSuccess(data.races || []);
            }
        },
        error: function (xhr, status, error) {
            console.error('Companion: failed to fetch today races', status, error);
            if (onError) {
                onError(error);
            }
        }
    });
};

module.exports = {
    fetchTodayRaces: fetchTodayRaces
};
