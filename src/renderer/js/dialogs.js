/* SlaxxCUT – export, settings and info dialogs. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, modal, toast, fmtBytes } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S;
  const t = (k) => SC.t(k);

  /* ================= EXPORT ================= */
  let lastExportDir = null;
  const VEXT = { mp4: 'mp4', mov: 'mov' };
  async function exportDialog(kind) {
    const p = S.project;
    const D = core.projectDuration(p);
    if (D <= 0) { toast(t('export.empty'), 'error'); return; }
    SC.program.pause();
    const enc = await window.api.encoders().catch(() => ({ libx264: true }));
    const prev = S.settings.lastExport || {};
    const st = Object.assign({ short: 1080, quality: 'high', encoder: 'auto', normalize: false, vformat: 'mp4', vcodec: 'h264', aformat: 'wav', bits: 16, bitrate: 320, oggq: 6, sampleRate: 48000, range: 'all' }, prev);
    st.kind = kind || prev.kind || (SC.app.mode === 'audio' ? 'audio' : 'video');
    st.aspect = p.settings.aspect; st.fps = p.settings.fps || 30;
    const sep = window.api.platform === 'win32' ? '\\' : '/';
    const baseDir = lastExportDir || (S.projectPath ? S.projectPath.replace(/[\\/][^\\/]*$/, '') : null);
    const baseName = (p.name && p.name !== t('app.untitled') ? p.name : 'SlaxxCUT');
    const ext = () => st.kind === 'image' ? 'png' : st.kind === 'audio' ? st.aformat : VEXT[st.vformat];
    const defPath = () => baseDir ? baseDir + sep + baseName + '.' + ext() : null;
    st.path = defPath();
    let userPath = false;

    const body = el('div');
    const tabs = el('div', { class: 'exp-tabs' });
    for (const [k, ic] of [['video', 'video'], ['audio', 'audio'], ['image', 'image']]) {
      const b = el('button', { type: 'button', dataset: { k } });
      b.innerHTML = SC.icon(ic) + '<span>' + SC.ui.escapeHtml(t('export.tab.' + k)) + '</span>';
      b.addEventListener('click', () => { st.kind = k; if (!userPath) st.path = defPath(); else st.path = st.path.replace(/\.[^.\\/]+$/, '.' + ext()); renderForm(); });
      tabs.append(b);
    }
    const grid = el('div', { class: 'form-grid' });
    const note = el('div', { class: 'note', style: { display: 'none', marginTop: '10px' } });
    const est = el('div', { class: 'tech' });
    const prog = el('div', { style: { display: 'none', marginTop: '14px' } });
    const bar = el('div', { class: 'progress' }, [el('div')]);
    const info = el('div', { class: 'prog-info' }, [el('span'), el('span')]);
    prog.append(bar, info);
    body.append(tabs, grid, note, est, prog);

    const presets = (opts, cur, onPick) => {
      const d = el('div', { class: 'presets' });
      for (const o of opts) {
        const b = el('button', { type: 'button', class: String(o.v) === String(cur) ? 'active' : '' }, o.small ? [o.l, el('small', { text: o.small })] : [o.l]);
        b.addEventListener('click', () => { onPick(o.v); renderForm(); });
        d.append(b);
      }
      return d;
    };
    const selectEl = (opts, cur, onPick) => {
      const s = el('select', { class: 'sel' });
      for (const o of opts) s.append(el('option', { value: o.v, text: o.l, selected: String(o.v) === String(cur) }));
      s.addEventListener('change', () => { onPick(s.value); renderForm(); });
      return s;
    };
    function rangeValue() {
      if (st.range === 'sel') {
        const sel = SC.store.selectedClips();
        if (sel.length) return { a: Math.min(...sel.map(c => c.start)), b: Math.max(...sel.map(core.clipEnd)) };
      }
      if (st.range === 'markers') {
        const ms = (p.markers || []).map(m => m.t).sort((a, b) => a - b);
        if (ms.length >= 2) return { a: ms[0], b: ms[ms.length - 1] };
      }
      return null;
    }
    function renderForm() {
      tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.k === st.kind));
      grid.innerHTML = '';
      const pathEl = el('div', { class: 'path', text: st.path || '—' });
      const choose = el('button', { class: 'btn', type: 'button', text: t('export.choose') });
      choose.addEventListener('click', async () => {
        const f = await window.api.saveFile({ title: t('export.title'), defaultPath: st.path || (baseName + '.' + ext()), filters: [{ name: ext().toUpperCase(), extensions: [ext()] }] });
        if (f) { st.path = new RegExp('\\.' + ext() + '$', 'i').test(f) ? f : f + '.' + ext(); userPath = true; pathEl.textContent = st.path; }
      });
      grid.append(el('label', { text: t('export.file') }), el('div', { class: 'file-row' }, [pathEl, choose]));
      if (st.kind === 'video' || st.kind === 'image') {
        if (st.kind === 'video') {
          grid.append(el('label', { text: t('export.container') }), presets([{ v: 'mp4', l: 'MP4' }, { v: 'mov', l: 'MOV' }], st.vformat, (v) => { st.vformat = v; if (v === 'mp4') st.vcodec = 'h264'; st.path = st.path ? st.path.replace(/\.[^.\\/]+$/, '.' + ext()) : st.path; }));
          if (st.vformat === 'mov') grid.append(el('label', { text: t('export.codec') }), presets([{ v: 'h264', l: 'H.264', small: t('codec.h264') }, { v: 'prores', l: 'ProRes 422', small: t('codec.prores') }], st.vcodec, (v) => { st.vcodec = v; }));
        }
        grid.append(el('label', { text: t('export.aspect') }), presets(Object.keys(core.ASPECTS).map(a => ({ v: a, l: a })), st.aspect, (v) => { st.aspect = v; }));
        grid.append(el('label', { text: t('export.size') }), presets(core.SIZE_PRESETS.map(sp => { const o = core.outputSize(st.aspect, sp.short); return { v: sp.short, l: sp.label, small: o.w + '×' + o.h }; }), st.short, (v) => { st.short = +v; }));
      }
      if (st.kind === 'video') {
        grid.append(el('label', { text: t('export.quality') }), selectEl(['low', 'medium', 'high', 'max'].map(q => ({ v: q, l: t((st.vcodec === 'prores' ? 'qp.' : 'q.') + q) })), st.quality, (v) => { st.quality = v; }));
        grid.append(el('label', { text: t('export.fps') }), selectEl([24, 25, 30, 50, 60].map(f => ({ v: f, l: String(f) })), st.fps, (v) => { st.fps = +v; }));
        if (st.vcodec !== 'prores') {
          const encs = [{ v: 'auto', l: t('enc.auto') }, { v: 'libx264', l: t('enc.libx264') }].concat(['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf'].filter(k => enc[k]).map(k => ({ v: k, l: t('enc.' + k) })));
          grid.append(el('label', { text: t('export.encoder') }), selectEl(encs, st.encoder, (v) => { st.encoder = v; }));
        }
      }
      if (st.kind === 'audio') {
        grid.append(el('label', { text: t('export.aformat') }), presets(['wav', 'mp3', 'flac', 'ogg', 'm4a'].map(f => ({ v: f, l: f.toUpperCase(), small: t('af.' + f) })), st.aformat, (v) => { st.aformat = v; st.path = st.path ? st.path.replace(/\.[^.\\/]+$/, '.' + v) : st.path; }));
        if (st.aformat === 'wav' || st.aformat === 'flac') grid.append(el('label', { text: t('export.bits') }), presets([{ v: 16, l: '16 Bit' }, { v: 24, l: '24 Bit' }], st.bits, (v) => { st.bits = +v; }));
        if (st.aformat === 'mp3') grid.append(el('label', { text: t('export.bitrate') }), presets([128, 192, 256, 320].map(b => ({ v: b, l: b + ' kbit/s' })), st.bitrate, (v) => { st.bitrate = +v; }));
        if (st.aformat === 'm4a') grid.append(el('label', { text: t('export.bitrate') }), presets([128, 192, 256, 320].map(b => ({ v: b, l: b + ' kbit/s' })), st.bitrate, (v) => { st.bitrate = +v; }));
        if (st.aformat === 'ogg') grid.append(el('label', { text: t('export.quality') }), presets([3, 5, 6, 8, 10].map(q => ({ v: q, l: String(q) })), st.oggq, (v) => { st.oggq = +v; }));
        grid.append(el('label', { text: t('export.rate') }), presets([{ v: 44100, l: '44,1 kHz' }, { v: 48000, l: '48 kHz' }], st.sampleRate, (v) => { st.sampleRate = +v; }));
      }
      if (st.kind !== 'image') {
        const nl = el('label', { class: 'check' });
        const nc = el('input', { type: 'checkbox', checked: !!st.normalize });
        nc.addEventListener('change', () => { st.normalize = nc.checked; });
        nl.append(nc, el('span', { text: t('export.normalize') }));
        grid.append(el('label', { text: '' }), nl);
        const hasMarkers = (p.markers || []).length >= 2, hasSel = SC.store.selectedClips().length > 0;
        grid.append(el('label', { text: t('export.range') }), presets([{ v: 'all', l: t('range.all') }].concat(hasSel ? [{ v: 'sel', l: t('range.sel') }] : []).concat(hasMarkers ? [{ v: 'markers', l: t('range.markers') }] : []), (st.range === 'sel' && !hasSel) || (st.range === 'markers' && !hasMarkers) ? 'all' : st.range, (v) => { st.range = v; }));
      } else {
        grid.append(el('label', { text: t('export.time') }), el('div', { text: core.fmtTime(S.playhead, p.settings.fps, true) }));
      }
      // notes / estimate
      const maxSrc = Math.max(0, ...p.clips.map(c => { const m = core.mediaById(p, c.mediaId); return m && m.hasVideo ? Math.min(m.width || 0, m.height || 0) : 0; }));
      const showUp = st.kind !== 'audio' && maxSrc > 0 && st.short > maxSrc * 1.05;
      note.style.display = showUp ? 'flex' : 'none';
      note.innerHTML = SC.icon('warn') + '<span>' + SC.ui.escapeHtml(t('export.upscale')) + '</span>';
      const r = rangeValue(), dur = r ? r.b - r.a : D;
      const o = core.outputSize(st.aspect, st.short);
      let bytes = 0, txt = '';
      if (st.kind === 'video') {
        const bpp = st.vcodec === 'prores' ? { low: 0.6, medium: 1.0, high: 1.5, max: 2.3 }[st.quality] : { low: 0.05, medium: 0.08, high: 0.12, max: 0.2 }[st.quality];
        bytes = (o.w * o.h * st.fps * bpp + 192000) / 8 * dur; txt = o.w + '×' + o.h + ' · ' + st.fps + ' fps · ';
      } else if (st.kind === 'audio') {
        const kbps = { wav: st.sampleRate * 2 * st.bits / 1000, flac: st.sampleRate * 2 * st.bits / 1000 * 0.6, mp3: st.bitrate, m4a: st.bitrate, ogg: 64 + st.oggq * 24 }[st.aformat];
        bytes = kbps * 1000 / 8 * dur;
      }
      est.textContent = st.kind === 'image' ? o.w + '×' + o.h + ' PNG' : t('export.est') + ': ~' + fmtBytes(bytes) + '  ·  ' + txt + core.fmtTime(dur);
    }

    let running = false, done = false;
    const m = modal({ title: t('export.title'), body, closable: true, onBackdrop: false, onClose: () => { if (running) window.api.exportCancel(); } });
    const cancelBtn = m.button(t('export.cancel'), '', () => { if (running) window.api.exportCancel(); else m.close(); });
    const startBtn = m.button(t('export.start'), 'primary', () => start());
    renderForm();

    async function start() {
      if (!st.path) {
        const f = await window.api.saveFile({ title: t('export.title'), defaultPath: baseName + '.' + ext(), filters: [{ name: ext().toUpperCase(), extensions: [ext()] }] });
        if (!f) return;
        st.path = new RegExp('\\.' + ext() + '$', 'i').test(f) ? f : f + '.' + ext();
      }
      running = true; startBtn.disabled = true;
      grid.style.opacity = '.5'; grid.style.pointerEvents = 'none'; tabs.style.pointerEvents = 'none';
      prog.style.display = 'block';
      const o = core.outputSize(st.aspect, st.short);
      const texts = {};
      if (st.kind !== 'audio') for (const c of p.clips.filter(c => c.kind === 'text')) Object.assign(texts, await SC.text.toImages(c, o.w, o.h));
      const t0 = performance.now();
      const off = window.api.onExportProgress((k) => {
        bar.firstChild.style.width = (k * 100).toFixed(1) + '%';
        const el0 = (performance.now() - t0) / 1000;
        info.firstChild.textContent = (k * 100).toFixed(1) + ' %';
        if (k > 0.02) info.lastChild.textContent = core.fmtTime(el0 / k - el0) + ' ' + t('export.remaining');
      });
      lastExportDir = st.path.replace(/[\\/][^\\/]*$/, '');
      SC.app.saveSettings({ lastExport: { kind: st.kind, short: st.short, quality: st.quality, encoder: st.encoder, normalize: st.normalize, vformat: st.vformat, vcodec: st.vcodec, aformat: st.aformat, bits: st.bits, bitrate: st.bitrate, oggq: st.oggq, sampleRate: st.sampleRate, range: st.range } });
      SC.program.suspended = true;
      try {
        const proj = JSON.parse(JSON.stringify(p));
        const format = st.kind === 'image' ? 'png' : st.kind === 'audio' ? st.aformat : st.vformat;
        const res = await window.api.exportStart(proj, {
          path: st.path, format, vcodec: st.vformat === 'mov' ? st.vcodec : 'h264', short: st.short, aspect: st.aspect, fps: st.fps, quality: st.quality,
          encoder: st.encoder, normalize: st.normalize, bits: st.bits, bitrate: st.bitrate, oggq: st.oggq, sampleRate: st.sampleRate,
          range: st.kind === 'image' ? null : rangeValue(), time: S.playhead
        }, texts);
        running = false; done = true;
        body.innerHTML = '';
        const d = el('div', { class: 'export-done' });
        const meta = [res.width ? res.width + '×' + res.height : null, res.encoder, res.duration ? core.fmtTime(res.duration) : null].filter(Boolean).join(' · ');
        d.innerHTML = SC.icon('check') + '<h3>' + SC.ui.escapeHtml(t('export.done')) + '</h3><div class="tech">' + SC.ui.escapeHtml(res.path) + '<br>' + SC.ui.escapeHtml(meta) + '</div>';
        body.append(d);
        m.foot.innerHTML = '';
        m.button(t('export.show'), '', () => window.api.showItem(res.path));
        m.button(t('export.open'), '', () => window.api.openPath(res.path));
        if (st.kind === 'image') m.button(t('export.import'), '', async () => { await SC.media.importFiles([res.path]); m.close(); });
        m.button(t('export.close'), 'primary', () => m.close());
      } catch (e) {
        running = false;
        const msg = String(e && e.message || e);
        if (/CANCELLED/.test(msg)) { toast(t('export.cancelled')); m.close(); }
        else {
          prog.style.display = 'none';
          grid.style.opacity = ''; grid.style.pointerEvents = ''; tabs.style.pointerEvents = '';
          startBtn.disabled = false;
          toast(t('export.failed') + ':\n' + msg.replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '').slice(0, 600), 'error');
        }
      } finally { off(); SC.program.suspended = false; SC.program.needsRender = true; }
      if (done) cancelBtn.textContent = t('export.close');
    }
  }

  /* ================= SETTINGS ================= */
  async function settingsDialog() {
    const body = el('div', { class: 'settings-grid' });
    const s = S.settings;
    const sel = (opts, val, fn) => { const x = el('select', { class: 'sel' }); for (const o of opts) x.append(el('option', { value: o.v, text: o.l, selected: String(o.v) === String(val) })); x.addEventListener('change', () => fn(x.value)); return x; };
    const num = (val, min, max, step, fn) => { const x = el('input', { type: 'number', class: 'num', value: val, min, max, step, style: { width: '80px', height: '30px', borderRadius: '7px', border: '1px solid var(--line)', background: 'var(--bg2)', padding: '0 6px' } }); x.addEventListener('change', () => fn(Math.min(max, Math.max(min, +x.value || 0)))); x.addEventListener('keydown', e => e.stopPropagation()); return x; };
    const chk = (val, fn) => { const x = el('input', { type: 'checkbox', checked: !!val, style: { width: '18px', height: '18px', accentColor: 'var(--accent)' } }); x.addEventListener('change', () => fn(x.checked)); return x; };
    body.append(
      el('label', { text: t('settings.lang') }), sel([{ v: 'de', l: 'Deutsch' }, { v: 'en', l: 'English' }], SC.i18n.lang, (v) => SC.app.setLang(v)),
      el('label', { text: t('settings.theme') }), sel([{ v: 'dark', l: t('theme.dark') }, { v: 'light', l: t('theme.light') }], s.theme, (v) => SC.app.setTheme(v)),
      el('label', { text: t('settings.tooltip') }), num(s.tooltipDelay / 1000, 0, 10, 0.25, (v) => { SC.ui.setTooltipDelay(v * 1000); SC.app.saveSettings({ tooltipDelay: v * 1000 }); }),
      el('label', { text: t('settings.preview') }), sel(['full', 'half', 'quarter'].map(q => ({ v: q, l: t('q.' + q) })), SC.program.quality, (v) => { SC.program.quality = v; SC.program.needsRender = true; SC.programMonitor.sync(); SC.app.saveSettings({ previewQuality: v }); }),
      el('label', { text: t('settings.imgDur') }), num(s.imageDuration, 0.5, 120, 0.5, (v) => SC.app.saveSettings({ imageDuration: v })),
      el('label', { text: t('settings.trDur') }), num(s.transitionDuration, 0.1, 4, 0.1, (v) => SC.app.saveSettings({ transitionDuration: v })),
      el('label', { text: t('settings.proxy') }), chk(s.proxyLarge, (v) => SC.app.saveSettings({ proxyLarge: v })),
      el('label', { text: t('settings.autosave') }), chk(s.autosave, (v) => SC.app.saveSettings({ autosave: v }))
    );
    const cacheSize = el('span', { class: 'muted-note', text: '…' });
    const clr = el('button', { class: 'btn', type: 'button', text: t('settings.clearCache') });
    clr.addEventListener('click', async () => { await window.api.clearCache(); cacheSize.textContent = fmtBytes(0); toast(t('toast.cacheCleared'), 'ok'); for (const m of S.project.media) { const r = S.runtime[m.id]; if (r) { r.proxy = null; r.strip = null; r.poster = null; } } SC.media.restoreRuntime(); });
    body.append(el('label', { text: t('settings.cache') }), el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, [cacheSize, clr]));
    window.api.cacheSize().then(n => { cacheSize.textContent = fmtBytes(n); });
    const m = modal({ title: t('settings.title'), body });
    m.button(t('settings.close'), 'primary', () => m.close());
  }

  /* ================= INFO ================= */
  const LICENSES = [
    { name: 'SlaxxCUT', lic: 'GPL-3.0-or-later', file: '/LICENSE', note: 'Done by IT-DUMMKOPFEN' },
    { name: 'FFmpeg (ffmpeg-static)', lic: 'GPL-3.0 / LGPL-2.1 (inkl. x264, GPL)', text: 'FFmpeg is a trademark of Fabrice Bellard, originator of the FFmpeg project.\nThis software uses code of FFmpeg (https://ffmpeg.org) licensed under the GPLv3 and its source can be downloaded from https://ffmpeg.org/download.html.\nThe bundled binaries come from the npm package "ffmpeg-static" (https://github.com/eugeneware/ffmpeg-static, GPL-3.0) and include libx264 (GPL-2.0-or-later).\nThe full GPL-3.0 text is shown in the SlaxxCUT entry above.' },
    { name: 'Electron', lic: 'MIT', text: 'Copyright (c) Electron contributors\nCopyright (c) 2013-2020 GitHub Inc.\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.' },
    { name: 'Chromium', lic: 'BSD-3-Clause u. a.', text: 'Electron contains Chromium. Chromium is licensed under a BSD-style license and contains many third-party components with their own licenses.\nSee https://www.chromium.org/ and chrome://credits for the complete list.' },
    { name: 'Inter', lic: 'SIL OFL 1.1', file: '/licenses/OFL-inter.txt' },
    { name: 'Montserrat', lic: 'SIL OFL 1.1', file: '/licenses/OFL-montserrat.txt' },
    { name: 'Roboto', lic: 'SIL OFL 1.1', file: '/licenses/OFL-roboto.txt' },
    { name: 'Anton', lic: 'SIL OFL 1.1', file: '/licenses/OFL-anton.txt' },
    { name: 'Archivo Black', lic: 'SIL OFL 1.1', file: '/licenses/OFL-archivoblack.txt' },
    { name: 'Bitter', lic: 'SIL OFL 1.1', file: '/licenses/OFL-bitter.txt' },
    { name: 'Crimson Text', lic: 'SIL OFL 1.1', file: '/licenses/OFL-crimsontext.txt' },
    { name: 'Comic Relief', lic: 'SIL OFL 1.1', file: '/licenses/OFL-comicrelief.txt' },
    { name: 'electron-builder', lic: 'MIT', text: 'Used to build the installers. Copyright (c) 2015 Loopline Systems. MIT License.' }
  ];
  async function infoDialog() {
    const ai = await window.api.appInfo().catch(() => ({}));
    const body = el('div');
    const top = el('div', { class: 'info-top' });
    top.innerHTML = '<img src="assets/logo-512.png" alt="">';
    const tx = el('div');
    tx.innerHTML = '<h1>Slaxx<b>CUT</b></h1><div class="ver">' + SC.ui.escapeHtml(t('info.tagline')) + ' · Version ' + SC.ui.escapeHtml(ai.version || '') + '</div>' +
      '<div class="done">' + SC.ui.escapeHtml(t('info.done')) + '</div><div class="tech">' + SC.ui.escapeHtml(t('info.made')) + '</div>';
    const gh = el('button', { class: 'btn', type: 'button', style: { marginTop: '10px' } });
    gh.innerHTML = SC.icon('globe') + '<span>github.com/IT-DUMMKOPFEN/SlaxxCUT</span>';
    gh.addEventListener('click', () => window.api.openExternal('https://github.com/IT-DUMMKOPFEN/SlaxxCUT'));
    tx.append(gh);
    top.append(tx);
    body.append(top);
    body.append(el('h3', { text: t('info.licenses'), style: { margin: '6px 0 8px' } }));
    const list = el('div', { class: 'lic-list' });
    for (const L of LICENSES) {
      const d = el('details', { class: 'lic' });
      const sm = el('summary'); sm.append(el('span', { text: L.name }), el('span', { text: L.lic }));
      const pre = el('pre', { text: L.note ? L.note + '\n\n' : '' });
      d.append(sm, pre);
      d.addEventListener('toggle', async () => {
        if (!d.open || pre.dataset.loaded) return;
        pre.dataset.loaded = '1';
        if (L.text) pre.textContent += L.text;
        else if (L.file) { try { pre.textContent += await (await fetch(L.file)).text(); } catch (e) { pre.textContent += L.file; } }
      });
      list.append(d);
    }
    body.append(list);
    body.append(el('div', { class: 'tech', text: 'Electron ' + (ai.electron || '') + ' · Chromium ' + (ai.chrome || '') + ' · Node ' + (ai.node || '') + ' · ' + (ai.ffmpeg || '') + ' · ' + (ai.platform || '') + '/' + (ai.arch || '') }));
    const m = modal({ title: t('info.title'), body, cls: 'wide' });
    m.button(t('info.close'), 'primary', () => m.close());
  }

  SC.dialogs = { exportDialog, settingsDialog, infoDialog };
})();
