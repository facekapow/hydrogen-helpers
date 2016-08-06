'use strict';

const { app } = require('electron');

exports.onToggleFullScreen = (item, window) => window.setFullScreen(!window.isFullScreen());

exports.onQuit = (item, window) => app.quit();
