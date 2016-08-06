'use strict';

const { ipcMain, BrowserWindow } = require('electron');

const handlers = new WeakMap();

class EventManager {
  emit(eventName, ...args) {
    BrowserWindow.getFocusedWindow().webContents.send(eventName, ...args);
  }
  on(eventName, handler) {
    function func(e, ...args) {
      handler(...args);
    }
    handlers.set(handler, func);
    ipcMain.on(eventName, func);
  }
  once(eventName, handler) {
    function func(e, ...args) {
      handler(...args);
    }
    handlers.set(handler, func);
    ipcMain.once(eventName, func);
  }
  removeListener(eventName, handler) {
    ipcMain.removeListener(eventName, handlers.get(handler));
  }
  removeAllListeners(eventName) {
    ipcMain.removeAllListeners(eventName);
  }
}

module.exports = new EventManager();
