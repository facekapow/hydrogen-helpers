'use strict';

const { ipcRenderer } = require('electron');

const handlers = new WeakMap();

class EventManager {
  emit(eventName, ...args) {
    ipcRenderer.send(eventName, ...args);
  }
  on(eventName, handler) {
    function func(e, ...args) {
      handler(...args);
    }
    handlers.set(handler, func);
    ipcRenderer.on(eventName, func);
  }
  once(eventName, handler) {
    function func(e, ...args) {
      handler(...args);
    }
    handlers.set(handler, func);
    ipcRenderer.once(eventName, func);
  }
  removeListener(eventName, handler) {
    ipcRenderer.removeListener(eventName, handlers.get(handler));
  }
  removeAllListeners(eventName) {
    ipcRenderer.removeAllListeners(eventName);
  }
}

module.exports = new EventManager();
