'use strict';

const { ipcRenderer } = require('electron');
const { shell } = require('electron').remote;
const configuration = require('./configuration');

const BASE_URL = 'https://mini4wd-companion.com';

let currentToken = null;
let currentUser = null;
let pendingCallbacks = null;

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

    // Listen for auth callback from main process (custom protocol)
    ipcRenderer.on('companion-auth-callback', function (event, token) {
        if (!token) return;

        fetchUserInfo(token, function (user) {
            // Only organizers, admins, and superadmins can use the chrono app
            const role = user.role || '';
            if (role !== 'organizer' && role !== 'admin' && role !== 'superadmin') {
                console.error('Auth: user role not authorized for chrono', role);
                if (pendingCallbacks && pendingCallbacks.onError) {
                    pendingCallbacks.onError('unauthorized');
                }
                pendingCallbacks = null;
                return;
            }
            saveCredentials(token, user);
            if (pendingCallbacks && pendingCallbacks.onSuccess) {
                pendingCallbacks.onSuccess(user);
            }
            pendingCallbacks = null;
        }, function (err) {
            if (pendingCallbacks && pendingCallbacks.onError) {
                pendingCallbacks.onError(err);
            }
            pendingCallbacks = null;
        });
    });
};

const saveCredentials = (token, user) => {
    currentToken = token;
    currentUser = user;
    configuration.set('companionToken', currentToken);
    configuration.set('companionUser', JSON.stringify(currentUser));
};

const loginWithBrowser = (onSuccess, onError) => {
    // Store callbacks for when the custom protocol callback arrives
    pendingCallbacks = { onSuccess: onSuccess, onError: onError };

    // Open system browser to companion auth page
    shell.openExternal(BASE_URL + '/chrono-auth');
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
