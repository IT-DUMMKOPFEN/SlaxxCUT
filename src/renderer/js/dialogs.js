/* SlaxxCUT – export, settings and info dialogs. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, modal, toast, fmtBytes } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S;
  const t = (k) => SC.t(k);

  /* ================= EXPORT ================= */
  let lastExportDir = null;
  async function exportDialog() {
    const p = S.project;
    const D = core.projectDuration(p);
    if (D <= 0) { toast(t('export.empty'), 'error'); return; }
    SC.program.pause();
    const enc = await window.api.encoders().catch(() => ({ libx264: true }));
    const st = Object.assign({ short: 1080, quality: 'high', encoder: 'auto', normalize: false, fps: p.settings.fps || 30, aspect: p.settings.aspect }, S.settings.lastExport || {});
    st.aspect = p.settings.aspect; st.fps = p.settings.fps || st.fps;
    const baseName = (p.name && p.name !== t('app.untitled') ? p.name : 'SlaxxCUT') + '.mp4';
    const sep = window.api.platform === 'win32' ? '\\' : '/';
    st.path = (lastExportDir || (S.projectPath ? S.projectPath.replace(/[\\/][^\\/]*$/, '') : null)) ? (lastExportDir || S.projectPath.replace(/[\\/][^\\/]*$/, '')) + sep + baseName : null;

    const body = el('div');
    const grid = el('div', { class: 'form-grid' });
    // file
    const pathEl = el('div', { class: 'path', text: st.path || '—' });
    const choose = el('button', { class: 'btn', type: 'button', text: t('export.choose') });
    choose.addEventListener('click', async () => {
      const f = await window.api.saveFile({ title: t('export.title'), defaultPath: st.path || baseName, filters: [{ name: 'MP4', extensions: ['mp4'] }] });
      if (f) { st.path = /\.mp4$/i.test(f) ? f : f + '.mp4'; pathEl.textContent = st.path; validate(); }
    });
    grid.append(el('label', { text: t('export.file') }), el('div', { class: 'file-row' }, [pathEl, choose]));
    // aspect
    const asp = el('div', { class: 'presets' });
    const renderAsp = () => {
      asp.innerHTML = '';
      for (const a of Object.keys(core.ASPECTS)) {
        const b = el('button', { type: 'button', class: st.aspect === a ? 'active' : '' }, a);
        b.addEventListener('click', () => { st.aspect = a; renderAsp(); renderSizes(); });
        asp.append(b);
      }
    };
    grid.append(el('label', { text: t('export.aspect') }), asp);
    // sizes
    const sizes = el('div', { class: 'presets' });
    const renderSizes = () => {
      sizes.innerHTML = '';
      for (const sp of core.SIZE_PRESETS) {
        const o = core.outputSize(st.aspect, sp.short);
        const b = el('button', { type: 'button', class: st.short === sp.short ? 'active' : '' }, [sp.label, el('small', { text: o.w + '×' + o.h })]);
        b.addEventListener('click', () => { st.short = sp.short; renderSizes(); });
        sizes.append(b);
      }
      upscaleNote();
      estimate();
    };
    grid.append(el('label', { text: t('export.size') }), sizes);
    // quality
    const qs = el('select', { class: 'sel' });
    for (const q of ['low', 'medium', 'high', 'max']) qs.append(el('option', { value: q, text: t('q.' + q), selected: st.quality === q }));
    qs.addEventListener('change', () => { st.quality = qs.value; estimate(); });
    grid.append(el('label', { text: t('export.quality') }), qs);
    // fps
    const fs = el('select', { class: 'sel' });
    for (const f of [24, 25, 30, 50, 60]) fs.append(el('option', { value: f, text: String(f), selected: +st.fps === f }));
    fs.addEventListener('change', () => { st.fps = +fs.value; estimate(); });
    grid.append(el('label', { text: t('export.fps') }), fs);
    // encoder
    const es = el('select', { class: 'sel' });
    es.append(el('option', { value: 'auto', text: t('enc.auto'), selected: st.encoder === 'auto' }));
    es.append(el('option', { value: 'libx264', text: t('enc.libx264'), selected: st.encoder === 'libx264' }));
    for (const k of ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf']) if (enc[k]) es.append(el('option', { value: k, text: t('enc.' + k), selected: st.encoder === k }));
    es.addEventListener('change', () => { st.encoder = es.value; });
    grid.append(el('label', { text: t('export.encoder') }), es);
    // normalize
    const nl = el('label', { class: 'check' });
    const nc = el('input', { type: 'checkbox', checked: !!st.normalize });
    nc.addEventListener('change', () => { st.normalize = nc.checked; });
    nl.append(nc, el('span', { text: t('export.normalize') }));
    grid.append(el('label', { text: '' }), nl);
    const est = el('div', { class: 'tech' });
    const note = el('div', { class: 'note', style: { display: 'none', marginTop: '10px' } });
    body.append(grid, note, est);
    const prog = el('div', { style: { display: 'none', marginTop: '14px' } });
    const bar = el('div', { class: 'progress' }, [el('div')]);
    const info = el('div', { class: 'prog-info' }, [el('span'), el('span')]);
    prog.append(bar, info);
    body.append(prog);

    function upscaleNote() {
      const maxSrc = Math.max(0, ...p.clips.map(c => { const m = core.mediaById(p, c.mediaId); return m && m.hasVideo ? Math.min(m.width || 0, m.height || 0) : 0; }));
      const show = maxSrc > 0 && st.short > maxSrc * 1.05;
      note.style.display = show ? 'flex' : 'none';
      note.innerHTML = SC.icon('warn') + '<span>' + SC.ui.escapeHtml(t('export.upscale')) + '</span>';
    }
    function estimate() {
      const o = core.outputSize(st.aspect, st.short);
      const bpp = { low: 0.05, medium: 0.08, high: 0.12, max: 0.2 }[st.quality];
      const bytes = (o.w * o.h * st.fps * bpp + 192000) / 8 * D;
      est.textContent = t('export.est') + ': ~' + fmtBytes(bytes) + '  ·  ' + o.w + '×' + o.h + ' · ' + st.fps + ' fps · ' + core.fmtTime(D);
    }
    let running = false, done = false;
    const m = modal({ title: t('export.title'), body, closable: true, onBackdrop: false, onClose: () => { if (running) window.api.exportCancel(); } });
    const cancelBtn = m.button(t('export.cancel'), '', () => { if (running) window.api.exportCancel(); else m.close(); });
    const startBtn = m.button(t('export.start'), 'primary', () => start());
    function validate() { startBtn.disabled = running || done; }
    renderAsp(); renderSizes(); validate();

    async function start() {
      if (!st.path) {
        const f = await window.api.saveFile({ title: t('export.title'), defaultPath: baseName, filters: [{ name: 'MP4', extensions: ['mp4'] }] });
        if (!f) return;
        st.path = /\.mp4$/i.test(f) ? f : f + '.mp4'; pathEl.textContent = st.path;
      }
      running = true; validate();
      grid.style.opacity = '.5'; grid.style.pointerEvents = 'none';
      prog.style.display = 'block';
      const o = core.outputSize(st.aspect, st.short);
      // render text clips to PNG at export size
      const texts = {};
      for (const c of p.clips.filter(c => c.kind === 'text')) texts[c.id] = await SC.text.toDataURL(c, o.w, o.h);
      const t0 = performance.now();
      const off = window.api.onExportProgress((k) => {
        bar.firstChild.style.width = (k * 100).toFixed(1) + '%';
        const el0 = (performance.now() - t0) / 1000;
        info.firstChild.textContent = (k * 100).toFixed(1) + ' %';
        if (k > 0.02) info.lastChild.textContent = core.fmtTime(el0 / k - el0) + ' ' + t('export.remaining');
      });
      lastExportDir = st.path.replace(/[\\/][^\\/]*$/, '');
      SC.app.saveSettings({ lastExport: { short: st.short, quality: st.quality, encoder: st.encoder, normalize: st.normalize } });
      SC.program.suspended = true; // keep the CPU free for FFmpeg
      try {
        const proj = JSON.parse(JSON.stringify(p));
        const res = await window.api.exportStart(proj, { path: st.path, short: st.short, aspect: st.aspect, fps: st.fps, quality: st.quality, encoder: st.encoder, normalize: st.normalize }, texts);
        running = false; done = true;
        body.innerHTML = '';
        const d = el('div', { class: 'export-done' });
        d.innerHTML = SC.icon('check') + '<h3>' + SC.ui.escapeHtml(t('export.done')) + '</h3><div class="tech">' + SC.ui.escapeHtml(res.path) + '<br>' + res.width + '×' + res.height + ' · ' + res.encoder + ' · ' + core.fmtTime(res.duration) + '</div>';
        body.append(d);
        m.foot.innerHTML = '';
        m.button(t('export.show'), '', () => window.api.showItem(res.path));
        m.button(t('export.open'), '', () => window.api.openPath(res.path));
        m.button(t('export.close'), 'primary', () => m.close());
      } catch (e) {
        running = false;
        const msg = String(e && e.message || e);
        if (/CANCELLED/.test(msg)) { toast(t('export.cancelled')); m.close(); }
        else {
          prog.style.display = 'none';
          grid.style.opacity = ''; grid.style.pointerEvents = '';
          validate();
          toast(t('export.failed') + ':\n' + msg.replace(/^Error invoking remote method[^:]*:\s*(Error:\s*)?/, '').slice(0, 600), 'error');
        }
      } finally { off(); SC.program.suspended = false; SC.program.needsRender = true; }
      cancelBtn.textContent = t('export.close');
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
