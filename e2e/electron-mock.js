// Electron ve electron-store'u Node içinde taklit eder; böylece dist-electron/*.js
// gerçek kodu Electron penceresi açmadan çalıştırılabilir.
const Module = require('module');
const handlers = new Map();
const sentEvents = [];
const fakeWindow = {
  isDestroyed: () => false,
  webContents: { send: (channel, payload) => sentEvents.push({ channel, payload, at: Date.now() }) },
};
const electron = {
  ipcMain: { handle: (ch, fn) => { if (handlers.has(ch)) throw new Error('duplicate handler ' + ch); handlers.set(ch, fn); } },
  BrowserWindow: class {},
};
const shared = {}; // iki Store örneği aynı dosyayı paylaşıyor -> aynı bellek
class FakeStore {
  constructor(opts) { this.name = opts.name; shared[this.name] ??= JSON.parse(JSON.stringify(opts.defaults || {})); }
  get(k, d) { const v = shared[this.name][k]; return v === undefined ? d : JSON.parse(JSON.stringify(v)); }
  set(k, v) { shared[this.name][k] = JSON.parse(JSON.stringify(v)); }
}
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'electron') return electron;
  if (req === 'electron-store') return { __esModule: true, default: FakeStore };
  return origLoad.apply(this, arguments);
};
async function invoke(channel, ...args) {
  const fn = handlers.get(channel);
  if (!fn) throw new Error('no handler for ' + channel);
  return fn({ sender: null }, ...args);
}
module.exports = { invoke, handlers, sentEvents, fakeWindow };
