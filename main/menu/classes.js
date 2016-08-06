'use strict';

const exists = obj => (typeof obj !== 'undefined' && obj !== undefined && obj !== null);

class Separator {
  constructor() {
    this.type = 'separator';
  }
}

class MenuItem {
  constructor(label, accelerator, roleOrClick, submenu) {
    this.label = label;
    if (exists(submenu) && submenu === true) this.submenu = [];
    if (exists(accelerator)) this.accelerator = accelerator;
    if (exists(roleOrClick)) {
      if (typeof roleOrClick === 'function') this.click = roleOrClick;
      if (typeof roleOrClick === 'string') this.role = roleOrClick;
    }
  }
}

module.exports = {
  Separator: Separator,
  MenuItem: MenuItem
}
