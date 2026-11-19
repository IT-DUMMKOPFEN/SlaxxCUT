/* SlaxxCUT – preload bridge. Done by IT-DUMMKOPFEN */
'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (cb) => {
  const h = (e, ...a) => cb(...a);
  ipcRenderer.on(ch, h);
  return () => ipcRenderer.removeListener(ch, h);
};

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  getSettings: inv('settings:get'),
  setSettings: inv('settings:set'),
  appInfo: inv('app:info'),
  pendingOpen: inv('app:pending-open'),
  closeNow: () => ipcRenderer.send('app:close-now'),
  onRequestClose: on('app:request-close'),
  onOpenProject: on('app:open-project'),
  onMenuCmd: on('menu:cmd'),

  openMedia: inv('dialog:openMedia'),
  openFile: inv('dialog:openFile'),
  saveFile: inv('dialog:saveFile'),
  message: inv('dialog:message'),

  writeFile: inv('file:write'),
  readFile: inv('file:read'),
  exists: inv('file:exists'),
  autosaveWrite: inv('autosave:write'),
  autosaveRead: inv('autosave:read'),
  autosaveClear: inv('autosave:clear'),

  probe: inv('media:probe'),
  proxy: inv('media:proxy'),
  onProxyProgress: on('proxy:progress'),
  filmstrip: inv('media:filmstrip'),
  poster: inv('media:poster'),
  waveform: inv('media:waveform'),
  loudness: inv('media:loudness'),
  clearCache: inv('cache:clear'),
  cacheSize: inv('cache:size'),

  encoders: inv('export:encoders'),
  exportStart: inv('export:start'),
  exportCancel: inv('export:cancel'),
  onExportProgress: on('export:progress'),

  showItem: inv('shell:showItem'),
  openExternal: inv('shell:openExternal'),
  openPath: inv('shell:openPath'),

  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch (e) { return file && file.path; } },
  mediaUrl: (p) => 'app://slaxx/media?p=' + encodeURIComponent(p)
});
