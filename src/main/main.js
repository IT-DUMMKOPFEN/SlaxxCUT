/* SlaxxCUT – Electron main process. Done by IT-DUMMKOPFEN – GPL-3.0-or-later */
'use strict';
const { app, BrowserWindow, ipcMain, dialog, protocol, shell, Menu, session, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const ff = require('./ffmpeg.js');
const { ExportJob } = require('./exporter.js');

const ROOT = path.join(__dirname, '..');
const SCHEME = 'app';
const HOST = 'slaxx';

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true, bypassCSP: false }
}]);

let win = null;
let forceClose = false;
let pendingOpen = null;
let currentExport = null;
const proxyProcs = new Map();

const userDir = () => app.getPath('userData');
const cacheDir = () => { const d = path.join(userDir(), 'cache'); fs.mkdirSync(d, { recursive: true }); return d; };
const settingsFile = () => path.join(userDir(), 'settings.json');
const autosaveFile = () => path.join(userDir(), 'autosave.slaxxcut');

/* ---------------- protocol ---------------- */
const MIME = {
  html: 'text/html', js: 'text/javascript', css: 'text/css', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', json: 'application/json', ttf: 'font/ttf', otf: 'font/otf', woff2: 'font/woff2',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/mp4', webm: 'video/webm', mkv: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  flac: 'audio/flac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', txt: 'text/plain', cube: 'text/plain'
};
function fileResponse(file, request) {
  let st;
  try { st = fs.statSync(file); } catch (e) { return new Response('Not found', { status: 404 }); }
  if (!st.isFile()) return new Response('Not found', { status: 404 });
  const ext = path.extname(file).slice(1).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const range = request.headers.get('range');
  const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
    if (!m || !m[1]) { start = Math.max(0, st.size - (parseInt(m && m[2], 10) || 0)); end = st.size - 1; }
    end = Math.min(end, st.size - 1);
    if (start > end || start >= st.size) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${st.size}` } });
    const stream = fs.createReadStream(file, { start, end });
    return new Response(Readable.toWeb(stream), {
      status: 206,
      headers: Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': String(end - start + 1) })
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(file)), { status: 200, headers: Object.assign(headers, { 'Content-Length': String(st.size) }) });
}
function setupProtocol() {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== HOST) return new Response('Forbidden', { status: 403 });
    let p = decodeURIComponent(url.pathname);
    if (p === '/media') {
      const file = url.searchParams.get('p');
      if (!file) return new Response('Bad request', { status: 400 });
      return fileResponse(file, request);
    }
    if (p === '/' || p === '') p = '/ui/index.html';
    if (p === '/LICENSE') return fileResponse(path.join(ROOT, '..', 'LICENSE'), request);
    let base, rel;
    if (p.startsWith('/ui/')) { base = path.join(ROOT, 'renderer'); rel = p.slice(4); }
    else if (p.startsWith('/shared/')) { base = path.join(ROOT, 'shared'); rel = p.slice(8); }
    else if (p.startsWith('/licenses/')) { base = path.join(ROOT, '..', 'licenses'); rel = p.slice(10); }
    else return new Response('Not found', { status: 404 });
    const file = path.normalize(path.join(base, rel));
    if (!file.startsWith(path.normalize(base))) return new Response('Forbidden', { status: 403 });
    return fileResponse(file, request);
  });
}

/* ---------------- settings ---------------- */
const DEFAULT_SETTINGS = {
  lang: null, theme: 'dark', tooltipDelay: 2000, previewQuality: 'half', proxyLarge: true,
  imageDuration: 5, transitionDuration: 1, autosave: true, snap: true, recent: []
};
function readSettings() {
  let s = {};
  try { s = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch (e) { /* defaults */ }
  const out = Object.assign({}, DEFAULT_SETTINGS, s);
  if (!out.lang) out.lang = (app.getLocale() || 'en').toLowerCase().startsWith('de') ? 'de' : 'en';
  return out;
}
function writeSettings(s) {
  try { fs.mkdirSync(userDir(), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch (e) { /* ignore */ }
}

/* ---------------- window ---------------- */
function createWindow() {
  const s = readSettings();
  win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1180, minHeight: 720,
    backgroundColor: s.theme === 'light' ? '#e8eef7' : '#081226',
    title: 'SlaxxCUT',
    icon: path.join(ROOT, 'renderer', 'assets', 'logo-512.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  if (process.env.SLAXX_SMOKE) win.webContents.once('did-finish-load', () => runSmoke(win, process.env.SLAXX_SMOKE));
  win.loadURL(`${SCHEME}://${HOST}/ui/index.html`);
  win.on('close', (e) => {
    if (forceClose) return;
    e.preventDefault();
    win.webContents.send('app:request-close');
  });
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(SCHEME + '://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

function buildMenu() {
  if (process.platform !== 'darwin') { Menu.setApplicationMenu(null); return; }
  // macOS: edit shortcuts are routed to the renderer, which decides between text fields and clips
  const cmd = (name) => () => send('menu:cmd', name);
  const template = [
    { role: 'appMenu' },
    {
      label: 'Edit', submenu: [
        { label: 'Undo', accelerator: 'Cmd+Z', click: cmd('undo') },
        { label: 'Redo', accelerator: 'Shift+Cmd+Z', click: cmd('redo') },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'Cmd+X', click: cmd('cut') },
        { label: 'Copy', accelerator: 'Cmd+C', click: cmd('copy') },
        { label: 'Paste', accelerator: 'Cmd+V', click: cmd('paste') },
        { label: 'Select All', accelerator: 'Cmd+A', click: cmd('selectAll') }
      ]
    },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- IPC ---------------- */
function send(ch, ...a) { if (win && !win.isDestroyed()) win.webContents.send(ch, ...a); }

function setupIpc() {
  ipcMain.handle('settings:get', () => readSettings());
  ipcMain.handle('settings:set', (e, s) => { writeSettings(Object.assign(readSettings(), s)); nativeTheme.themeSource = s.theme === 'light' ? 'light' : 'dark'; return true; });

  ipcMain.handle('app:info', async () => {
    let ffv = '';
    try { const r = await ff.run(['-hide_banner', '-version']); ffv = r.stdout.toString().split('\n')[0]; } catch (e) { ffv = 'FFmpeg not found'; }
    return { version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, ffmpeg: ffv, platform: process.platform, arch: process.arch };
  });
  ipcMain.handle('app:pending-open', () => { const p = pendingOpen; pendingOpen = null; return p; });
  ipcMain.on('app:close-now', () => { forceClose = true; if (win) win.close(); });

  ipcMain.handle('dialog:openMedia', async (e, filters) => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: filters || [{ name: 'Media', extensions: ['mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'mpg', 'mpeg', 'mts', 'm2ts', 'ts', '3gp', 'ogv', 'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'ac3', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'heic', 'heif'] }, { name: '*', extensions: ['*'] }]
    });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('dialog:openFile', async (e, opts) => {
    const r = await dialog.showOpenDialog(win, Object.assign({ properties: ['openFile'] }, opts || {}));
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('dialog:saveFile', async (e, opts) => {
    const r = await dialog.showSaveDialog(win, opts || {});
    return r.canceled ? null : r.filePath;
  });
  ipcMain.handle('dialog:message', async (e, opts) => {
    const r = await dialog.showMessageBox(win, opts);
    return r.response;
  });

  ipcMain.handle('file:write', (e, file, data) => { fs.writeFileSync(file, data); return true; });
  ipcMain.handle('file:read', (e, file) => fs.readFileSync(file, 'utf8'));
  ipcMain.handle('file:exists', (e, file) => { try { return fs.existsSync(file); } catch (err) { return false; } });

  ipcMain.handle('autosave:write', (e, data) => { try { fs.writeFileSync(autosaveFile(), data); } catch (err) { /* */ } return true; });
  ipcMain.handle('autosave:read', () => { try { return fs.readFileSync(autosaveFile(), 'utf8'); } catch (err) { return null; } });
  ipcMain.handle('autosave:clear', () => { try { fs.unlinkSync(autosaveFile()); } catch (err) { /* */ } return true; });

  ipcMain.handle('media:probe', async (e, file, opts) => {
    const info = await ff.probe(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    info.type = info.isImage ? 'image' : info.hasVideo ? 'video' : 'audio';
    info.needsProxy = ff.needsProxy(info, ext, opts || {});
    return info;
  });
  ipcMain.handle('media:proxy', async (e, id, file, info) => {
    return ff.makeProxy(file, info, cacheDir(), (k) => send('proxy:progress', id, k), (proc) => proxyProcs.set(id, proc))
      .finally(() => proxyProcs.delete(id));
  });
  ipcMain.handle('media:filmstrip', (e, file, info) => ff.filmstrip(file, info, cacheDir()).catch(() => null));
  ipcMain.handle('media:poster', (e, file, info) => ff.poster(file, info, cacheDir()).catch(() => null));
  ipcMain.handle('media:waveform', (e, file) => ff.waveform(file, cacheDir()).catch(() => null));
  ipcMain.handle('media:loudness', (e, file, start, dur) => ff.measureLoudness(file, start, dur).catch(() => null));
  ipcMain.handle('cache:clear', () => {
    for (const p of proxyProcs.values()) try { p.kill(); } catch (err) { /* */ }
    try { fs.rmSync(cacheDir(), { recursive: true, force: true }); } catch (err) { /* */ }
    return true;
  });
  ipcMain.handle('cache:size', () => {
    let n = 0;
    try { for (const f of fs.readdirSync(cacheDir())) n += fs.statSync(path.join(cacheDir(), f)).size; } catch (err) { /* */ }
    return n;
  });

  ipcMain.handle('export:encoders', () => ff.encoders());
  ipcMain.handle('export:start', async (e, project, opts, textImages) => {
    if (currentExport) throw new Error('BUSY');
    const tdir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'slaxxcut-txt-'));
    const files = {};
    for (const [id, dataUrl] of Object.entries(textImages || {})) {
      const f = path.join(tdir, id.replace(/[^\w-]/g, '_') + '.png');
      fs.writeFileSync(f, Buffer.from(String(dataUrl).split(',')[1], 'base64'));
      files[id] = f;
    }
    currentExport = new ExportJob(project, opts, files, (k) => send('export:progress', k));
    try {
      return await currentExport.start();
    } finally {
      currentExport = null;
      try { fs.rmSync(tdir, { recursive: true, force: true }); } catch (err) { /* */ }
    }
  });
  ipcMain.handle('export:cancel', () => { if (currentExport) currentExport.cancel(); return true; });

  ipcMain.handle('shell:showItem', (e, p) => { shell.showItemInFolder(p); return true; });
  ipcMain.handle('shell:openExternal', (e, url) => { if (/^https?:/.test(url)) shell.openExternal(url); return true; });
  ipcMain.handle('shell:openPath', (e, p) => shell.openPath(p));
}

/* ---------------- automated smoke test (CI only, SLAXX_SMOKE=<result.json>) ---------------- */
async function runSmoke(w, outFile) {
  const result = { ok: false, steps: [] };
  const finish = () => { try { fs.writeFileSync(outFile, JSON.stringify(result, null, 2)); } catch (e) { /* */ } forceClose = true; app.exit(result.ok ? 0 : 1); };
  setTimeout(() => { result.error = 'timeout'; finish(); }, 240000);
  try {
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'slaxx-smoke-'));
    const vid = path.join(dir, 'test.mp4');
    const r = await ff.run(['-y', '-hide_banner', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=4', '-f', 'lavfi', '-i', 'sine=f=440:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', vid]);
    result.steps.push('ffmpeg:' + r.code + ':' + ff.ffmpegPath());
    const out = path.join(dir, 'export.mp4');
    const js = `(async () => {
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 100 && !(window.SC && SC.timeline && SC.timeline.content); i++) await wait(100);
      const errs = []; window.addEventListener('error', e => errs.push(String(e.message)));
      const list = await SC.media.importFiles([${JSON.stringify(vid)}]);
      const m = list[0];
      for (let i = 0; i < 50 && SC.store.S.runtime[m.id].status !== 'ready'; i++) await wait(100);
      SC.store.change('smoke', () => {
        const S = SC.store.S;
        const a = SC.edit.placeMedia(m, S.project.tracks[1].id, 0, 0, 2);
        const b = SC.edit.placeMedia(m, S.project.tracks[1].id, 2, 2, 4);
        SC.edit.applyEffect(a, 'vintage'); SC.edit.applyEffect(b, 'zoomIn');
        SC.edit.applyTransition(b, 'in', 'crossfade');
        const t = SC.edit.makeText({ start: 0.5, out: 2, trackId: S.project.tracks[0].id }); S.project.clips.push(t);
      });
      SC.program.seek(1.0); await wait(1500);
      const cv = SC.programMonitor.canvas; const gl = cv.getContext('webgl2');
      const px = new Uint8Array(4); gl.readPixels(Math.floor(cv.width / 2), Math.floor(cv.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const p = SC.store.S.project; const texts = {};
      for (const c of p.clips.filter(c => c.kind === 'text')) texts[c.id] = await SC.text.toDataURL(c, 640, 360);
      const res = await window.api.exportStart(JSON.parse(JSON.stringify(p)), { path: ${JSON.stringify(out)}, short: 360, aspect: '16:9', fps: 25, quality: 'low', encoder: 'auto' }, texts);
      return { pixel: Array.from(px), clips: p.clips.length, export: res, errors: errs, lang: SC.i18n.lang };
    })()`;
    const rr = await w.webContents.executeJavaScript(js);
    result.renderer = rr;
    const st = fs.statSync(out);
    const pr = await ff.probe(out);
    result.exportSize = st.size; result.exportDuration = pr.duration;
    result.ok = st.size > 1000 && Math.abs(pr.duration - 4) < 0.3 && rr.pixel.some(v => v > 10) && !rr.errors.length;
  } catch (e) { result.error = String(e && e.stack || e); }
  finish();
}

/* ---------------- app lifecycle ---------------- */
function projectArg(argv) {
  return (argv || []).find(a => /\.slaxxcut$/i.test(a) && fs.existsSync(a)) || null;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (e, argv) => {
    const f = projectArg(argv);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      if (f) send('app:open-project', f);
    }
  });
  app.on('open-file', (e, f) => {
    e.preventDefault();
    if (win) send('app:open-project', f); else pendingOpen = f;
  });
  app.whenReady().then(() => {
    pendingOpen = pendingOpen || projectArg(process.argv);
    const s = readSettings();
    nativeTheme.themeSource = s.theme === 'light' ? 'light' : 'dark';
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(true));
    session.defaultSession.setPermissionCheckHandler(() => true);
    setupProtocol();
    setupIpc();
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => {
    if (currentExport) currentExport.cancel();
    app.quit();
  });
}
