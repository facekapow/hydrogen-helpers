'use strict';

const electron = require('electron');
const menuClasses = require('./classes');
const defaultsMenuActions = require('./defaultsMenuActions');
const mustache = require('mustache');
const path = require('path');
const fs = require('fs');

module.exports = (appCfg, dir, menuJSON, menuCommands) => {
  if (!menuJSON) menuJSON = `${__dirname}/defaultMenu.json`;
  if (!menuCommands) menuCommands = `${__dirname}/defaultsMenuActions`;
  if (!path.isAbsolute(menuJSON)) menuJSON = path.join(dir, menuJSON);
  if (!path.isAbsolute(menuCommands)) menuCommands = path.join(dir, menuCommands);
  const menuDefaults = JSON.parse(mustache.render(String(fs.readFileSync(`${__dirname}/menuDefaults.json`)), appCfg));
  const menu = JSON.parse(mustache.render(String(fs.readFileSync(menuJSON)), appCfg));
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
          if (menuDefaults[item]) {
            item = menuDefaults[item];
            iterator(parent, item);
          }
        } else if (itemName === '__role') {
          parent.role = item;
        } else {
          const menuItem = new menuClasses.MenuItem(itemName, null, (actions[item] || defaultsMenuActions[item] || noop));
          let found = false;
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
          } else if (itemName === '__exceptMac') {
            if (process.platform !== 'darwin') iterator(parent, item);
          } else {
            const newItem = new menuClasses.MenuItem(itemName, null, null, true);
            for (let item of parent.submenu) {
              if (item.label === newItem.label) {
                parent.submenu.splice(parent.submenu.indexOf(item), 1);
                break;
              }
            }
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
