'use strict';

const { BrowserWindow, session } = require('electron').remote;
const configuration = require('./configuration');

const BASE_URL = 'https://mini4wd-companion.com';
const SESSION_PARTITION = 'persist:companion';

let currentToken = null;
let currentUser = null;
let loginWindow = null;

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

const saveCredentials = (token, user) => {
    currentToken = token;
    currentUser = user;
    configuration.set('companionToken', currentToken);
    configuration.set('companionUser', JSON.stringify(currentUser));
};

const loginWithBrowser = (onSuccess, onError) => {
    // Prevent multiple login windows
    if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.focus();
        return;
    }

    const companionSession = session.fromPartition(SESSION_PARTITION);

    loginWindow = new BrowserWindow({
        width: 900,
        height: 700,
        webPreferences: {
            partition: SESSION_PARTITION,
            nodeIntegration: false
        }
    });

    loginWindow.loadURL(BASE_URL + '/login');

    const checkForAuth = (url) => {
        // After login, companion redirects to /races or / (root)
        if (url.indexOf(BASE_URL + '/races') === 0 || url === BASE_URL + '/' || url === BASE_URL) {
            // Extract auth_token cookie from the companion session
            companionSession.cookies.get({ url: BASE_URL, name: 'auth_token' })
                .then(function (cookies) {
                    if (!cookies || cookies.length === 0) {
                        return;
                    }
                    const token = cookies[0].value;
                    // Fetch user info with the token
                    fetchUserInfo(token, function (user) {
                        saveCredentials(token, user);
                        if (loginWindow && !loginWindow.isDestroyed()) {
                            loginWindow.close();
                        }
                        if (onSuccess) {
                            onSuccess(user);
                        }
                    }, function (err) {
                        if (loginWindow && !loginWindow.isDestroyed()) {
                            loginWindow.close();
                        }
                        if (onError) {
                            onError(err);
                        }
                    });
                })
                .catch(function (err) {
                    console.error('Auth: failed to read cookies', err);
                });
        }
    };

    loginWindow.webContents.on('did-navigate', function (event, url) {
        checkForAuth(url);
    });

    loginWindow.webContents.on('did-redirect-navigation', function (event, url) {
        checkForAuth(url);
    });

    loginWindow.on('closed', function () {
        loginWindow = null;
    });
};

const fetchUserInfo = (token, onSuccess, onError) => {
    $.ajax({
        url: BASE_URL + '/api/v1/users/me',
        type: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
        success: function (response) {
            // Response format: { success: true, data: { user: { ... } } }
            const user = (response.data && response.data.user) || response.data || response;
            if (onSuccess) {
                onSuccess(user);
            }
        },
        error: function (xhr, status, error) {
            console.error('Auth: failed to fetch user info', status, error);
            if (onError) {
                onError(error);
            }
        }
    });
};

const validate = (onSuccess, onFailure) => {
    if (!currentToken) {
        if (onFailure) {
            onFailure();
        }
        return;
    }
    fetchUserInfo(currentToken, function (user) {
        // Update stored user data from server
        currentUser = user;
        configuration.set('companionUser', JSON.stringify(currentUser));
        if (onSuccess) {
            onSuccess(user);
        }
    }, function () {
        logout();
        if (onFailure) {
            onFailure();
        }
    });
};

const logout = () => {
    currentToken = null;
    currentUser = null;
    configuration.del('companionToken');
    configuration.del('companionUser');
    // Clear companion browser session so next login requires re-auth
    const companionSession = session.fromPartition(SESSION_PARTITION);
    companionSession.cookies.remove(BASE_URL, 'auth_token').catch(function () {});
    companionSession.clearStorageData({ origin: BASE_URL }).catch(function () {});
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
    loginWithBrowser: loginWithBrowser,
    validate: validate,
    logout: logout,
    isLoggedIn: isLoggedIn,
    getToken: getToken,
    getUser: getUser
};
