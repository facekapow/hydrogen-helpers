'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const url = require('url');
const util = require('util');
const mustache = require('mustache');
const menuClasses = require('./menu/classes');
const noop = (() => {});
const electron = require('electron');
const defaultsMenuActions = require('./menu/defaultsMenuActions');
const helpers = require('./helpers');

function transparentize(ctx, obj, arr) {
  for (var func of arr) {
    (func => {
      ctx[func] = (...args) => obj[func](...args);
    })(func);
  }
}

function mirror(ctx, obj, arr) {
  for (var prop of arr) {
    (prop => {
      Object.defineProperty(ctx, prop, {
        get: () => obj[prop],
        set: (val) => {
          obj[prop] = val
        }
      });
    })(prop);
  }
}

function pipeEvents(ctx, obj) {
  const oldEmit = obj.emit.bind(obj);
  obj.emit = (...args) => {
    ctx.emit(...args);
    oldEmit(...args);
  }
}

class ApplicationWrapper extends EventEmitter {
  constructor(electronApp, appDir) {
    super();
    if (typeof electronApp === 'string') {
      appDir = electronApp;
      electronApp = null;
    }
    this._internalApp = electronApp || electron.app;
    this.viewDir = 'views';
    this.web = new ApplicationInterface(this, 0);
    this.main = new ApplicationInterface(this, 1);
    this.events = new EventEmitter();
    this.currentWindow = null;
    pipeEvents(this, this._internalApp);
    if (!appDir) throw new Error('Where\'s the app located? appDir not provided (usually just use __dirname).');
    this._dir = appDir;
    try {
      this._appCfg = JSON.parse(String(fs.readFileSync(`${this._dir}/app.json`)));
      this._appCfg.titleBarName = this._appCfg.titleBarName || (this._appCfg.appTitle.charAt(0).toUpperCase() + this._appCfg.appTitle.slice(1));
    } catch(e) {
      this._appCfg = {
        appTitle: 'electron',
        titleBarName: 'Electron'
      };
      if (e.code !== 'ENOENT') throw e;
    } finally {
      this._menuDefaults = JSON.parse(mustache.render(String(fs.readFileSync(`${__dirname}/menu/menuDefaults.json`)), this._appCfg));
    }
    transparentize(this, this._internalApp, ['quit', 'getPath']);
    this.loadMenu = (menuJSON, menuCommands) => {
      if (!menuJSON) menuJSON = `${__dirname}/menu/defaultMenu.json`;
      if (!menuCommands) menuCommands = `${__dirname}/menu/defaultsMenuActions`;
      if (!path.isAbsolute(menuJSON)) menuJSON = path.join(this._dir, menuJSON);
      if (!path.isAbsolute(menuCommands)) menuCommands = path.join(this._dir, menuCommands);
      const menu = JSON.parse(mustache.render(String(fs.readFileSync(menuJSON)), this._appCfg));
      const actions = require(menuCommands);
      const base = new menuClasses.MenuItem('__BASE__', null, null, true);
      const iterator = (parent, submenu) => {
        for (let itemName in submenu) {
          let item = submenu[itemName];
          if (item instanceof Array) {
            let shortcut = item[0] || null;
            if (typeof shortcut === 'object' && shortcut !== null) {
              if (shortcut.mac && process.platform === 'darwin') {
                shortcut = shortcut.mac;
              } else if (shortcut.default) {
                shortcut = shortcut.default;
              } else {
                shortcut = null;
              }
            }
            parent.submenu.push(new menuClasses.MenuItem(itemName, shortcut, (item[1] || actions[item[2]] || defaultsMenuActions[item[2]] || null)));
          } else if (typeof item === 'string') {
            if (itemName === '__separator' && item === '__separator') {
              parent.submenu.push(new menuClasses.Separator());
            } else if (itemName === '__default') {
              if (this._menuDefaults[item]) {
                item = this._menuDefaults[item];
                iterator(parent, item);
              }
            } else if (itemName === '__role') {
              parent.role = item;
            } else {
              const menuItem = new menuClasses.MenuItem(itemName, null, (actions[item] || defaultsMenuActions[item] || noop));
              const found = false;
              for (let i = 0, len = parent.submenu.length; i < len; i++) {
                if (parent.submenu[i].label === itemName) {
                  found = true;
                  parent.submenu[i] = menuItem;
                }
              }
              if (!found) parent.submenu.push(menuItem);
            }
          } else if (typeof item === 'object') {
            if (!item.__noChildren) {
              if (itemName === '__macOnly') {
                if (process.platform === 'darwin') iterator(parent, item);
              } else {
                const newItem = new menuClasses.MenuItem(itemName, null, null, true);
                parent.submenu.push(newItem);
                iterator(newItem, item);
              }
            }
          }
        }
      }
      iterator(base, menu);
      electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(base.submenu));
    }
  }
}

class ApplicationInterface extends EventEmitter {
  constructor(appWrapper, type) {
    super();
    this._app = appWrapper;
    this._type = type || 0;
    this._funcs = {};
    if (this._type === 0) {
      // web
      this._funcs.alert = (txt) => {
        if (this._app.currentWindow) {
          this._app.currentWindow.webContents.executeJavaScript(`alert(${util.inspect(txt)})`);
        }
      }
    }
    this.__appendFunctions = () => {
      for (var name in this._funcs) {
        (name => {
          this[name] = (...args) => this._funcs[name](...args);
        })(name);
      }
    }
    this.__addFunction = (name, func, override) => {
      if ((this[name] || this._funcs[name]) && !override) throw new Error(`Function with that name (${name}) already exists.`);
      this._funcs[name] = func;
      this.__appendFunctions();
    }
    this.__appendFunctions();
    for (var id in helpers) this[id] = helpers[id];
  }
}

class BrowserWindow extends EventEmitter {
  constructor(appWrapper, opts) {
    super();
    this._app = appWrapper;
    this._window = new electron.BrowserWindow(opts);
    this._app.currentWindow = this;
    this.currentView = {
      path: ''
    }
    pipeEvents(this, this._window);
    transparentize(this, this._window, ['setFullScreen', 'loadURL', 'isFullScreen', 'toggleDevTools']);
    mirror(this, this._window, ['webContents']);
    this._intercepted = {};
    electron.protocol.interceptBufferProtocol('file', (req, cb) => {
      if (this._intercepted[req.url]) {
        cb(new Buffer(this._intercepted[req.url]));
      } else {
        cb(fs.readFileSync(decodeURI(url.parse(req.url).path)));
      }
    }, (err) => {
      if (err) throw err;
    });
    this.loadView = (view) => {
      const viewPath = `${this._app._dir}/${this._app.viewDir}/${view}`;
      let viewJson = '';
      try {
        viewJson = String(fs.readFileSync(`${viewPath}/view.json`));
      } catch(e) {
        viewJson = JSON.stringify({
          pageTitle: this._app._appCfg.titleBarName
        });
      }
      const viewCfg = JSON.parse(mustache.render(viewJson, this._app._appCfg));
      let tmp = (viewCfg.viewMainHtml || 'index.html');
      tmp = `${viewPath}/${tmp}`;
      let tmp2 = Object.assign(Object.assign({}, this._app._appCfg), viewCfg);
      const viewMain = mustache.render(String(fs.readFileSync(tmp)), tmp2);
      tmp = `file://${tmp}`;
      this._intercepted[tmp] = viewMain;
      this.currentView.path = viewPath;
      this._window.loadURL(tmp);
    }
  }
}

module.exports = {
  ApplicationWrapper: ApplicationWrapper,
  ApplicationInterface: ApplicationInterface,
  BrowserWindow: BrowserWindow
}
