'use strict';

const configuration = require('./configuration');

const BASE_URL = 'https://mini4wd-companion.com';

let currentToken = null;
let currentUser = null;

const init = () => {
    currentToken = configuration.get('companionToken') || null;
    const userJson = configuration.get('companionUser') || null;
    if (userJson && currentToken) {
        try {
            currentUser = typeof userJson === 'string' ? JSON.parse(userJson) : userJson;
        }
        catch (e) {
            currentUser = null;
            currentToken = null;
        }
    }
};

const login = (email, password, onSuccess, onError) => {
    $.ajax({
        url: BASE_URL + '/api/v1/auth/login',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ email: email, password: password }),
        success: function (response) {
            currentToken = response.token;
            currentUser = response.user;
            configuration.set('companionToken', currentToken);
            configuration.set('companionUser', JSON.stringify(currentUser));
            if (onSuccess) {
                onSuccess(currentUser);
            }
        },
        error: function (xhr, status, error) {
            console.error('Auth: login failed', status, error);
            currentToken = null;
            currentUser = null;
            if (onError) {
                onError(error);
            }
        }
    });
};

const logout = () => {
    currentToken = null;
    currentUser = null;
    configuration.del('companionToken');
    configuration.del('companionUser');
};

const isLoggedIn = () => {
    return currentToken !== null && currentUser !== null;
};

const getToken = () => {
    return currentToken;
};

const getUser = () => {
    return currentUser;
};

module.exports = {
    init: init,
    login: login,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getToken: getToken,
    getUser: getUser
};
