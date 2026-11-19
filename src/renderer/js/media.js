/* SlaxxCUT – media panel: import, list, drag & drop, thumbnails, proxies. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $, iconBtn, toast, contextMenu, basename } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S;
  const t = (k) => SC.t(k);

  let listEl, filter = 'all', search = '';
  const items = new Map(); // mediaId → element

  function rt(id) { return S.runtime[id] || (S.runtime[id] = { status: 'ready' }); }

  function build() {
    const page = $('#pageMedia');
    const head = el('div', { class: 'media-head' });
    const imp = el('button', { class: 'btn primary', 'data-tip': 'tip.media.import', type: 'button' });
    imp.innerHTML = SC.icon('import') + '<span data-i18n="media.import"></span>';
    imp.addEventListener('click', async () => { const files = await window.api.openMedia(); if (files.length) importFiles(files); });
    const sb = el('label', { class: 'searchbox', 'data-tip': 'tip.media.search' });
    sb.innerHTML = SC.icon('search');
    const inp = el('input', { type: 'text', 'data-i18n-ph': 'media.search' });
    inp.addEventListener('input', () => { search = inp.value.toLowerCase(); render(); });
    sb.append(inp);
    head.append(imp, sb);
    const filters = el('div', { class: 'filters', 'data-tip': 'tip.media.filter' });
    for (const f of ['all', 'video', 'audio', 'image']) {
      const b = el('button', { class: 'chip' + (f === 'all' ? ' active' : ''), type: 'button', 'data-i18n': 'media.filter.' + f });
      b.addEventListener('click', () => { filter = f; filters.querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x === b)); render(); });
      filters.append(b);
    }
    listEl = el('div', { class: 'media-list' });
    page.append(head, filters, listEl);

    // OS file drop
    const dz = page;
    dz.addEventListener('dragover', (e) => {
      if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; listEl.classList.add('dragover'); }
    });
    dz.addEventListener('dragleave', (e) => { if (!dz.contains(e.relatedTarget)) listEl.classList.remove('dragover'); });
    dz.addEventListener('drop', (e) => {
      listEl.classList.remove('dragover');
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      importFiles(filesFromDrop(e));
    });
    store.on('project', (info) => {
      if (info.label === 'history' || info.label === 'load') {
        // media metadata is not part of the undo history → re-apply what we know
        for (const m of S.project.media) { const r = S.runtime[m.id]; if (r && r.info) { Object.assign(m, r.info); delete m.status; } }
      }
      if (info.structural) render();
    });
    window.api.onProxyProgress((id, k) => { const r = S.runtime[id]; if (r) { r.progress = k; updateItem(id); } });
    render();
  }

  function filesFromDrop(e) {
    return Array.from(e.dataTransfer.files).map(f => window.api.pathForFile(f)).filter(Boolean);
  }

  /** import paths → media entries. Returns the list of media objects (after probing). */
  async function importFiles(paths) {
    const added = [];
    const tasks = [];
    for (const p of paths) {
      const type = core.typeFromPath(p);
      const exist = S.project.media.find(m => m.path === p);
      if (exist) { added.push(exist); continue; }
      const m = { id: core.uid('med'), path: p, name: basename(p), type: type || 'video', duration: 0, width: 0, height: 0, hasVideo: type !== 'audio', hasAudio: type !== 'image', isImage: type === 'image', status: 'analyzing' };
      S.runtime[m.id] = { status: 'analyzing', progress: 0 };
      store.change('import', () => { S.project.media.push(m); });
      added.push(m);
      tasks.push(analyze(m));
    }
    await Promise.all(tasks);
    // drop failed imports
    const failed = added.filter(m => S.runtime[m.id] && S.runtime[m.id].status === 'error');
    if (failed.length) {
      toast(t('toast.importFailed') + ':\n' + failed.map(m => m.name).join('\n'), 'error');
      store.change('import-fail', () => { S.project.media = S.project.media.filter(m => !failed.includes(m)); });
    }
    return added.filter(m => !failed.includes(m));
  }

  async function analyze(m) {
    const r = rt(m.id);
    r.status = 'analyzing'; updateItem(m.id);
    let info;
    try {
      info = await window.api.probe(m.path, { proxyLarge: !!S.settings.proxyLarge });
    } catch (e) {
      r.status = 'error'; r.error = String(e.message || e); updateItem(m.id);
      return;
    }
    Object.assign(m, {
      type: info.type, duration: info.duration, width: info.width, height: info.height, fps: info.fps,
      hasVideo: info.hasVideo && !info.isImage ? true : info.isImage, hasAudio: info.hasAudio, isImage: info.isImage,
      vcodec: info.vcodec, acodec: info.acodec, rotation: info.rotation
    });
    delete m.status;
    if (info.isImage) m.hasVideo = true;
    r.info = { type: m.type, duration: m.duration, width: m.width, height: m.height, fps: m.fps, hasVideo: m.hasVideo, hasAudio: m.hasAudio, isImage: m.isImage, vcodec: m.vcodec, acodec: m.acodec, rotation: m.rotation };
    // set project fps from first video
    if (info.type === 'video' && !S.project.clips.length && !S.project._fpsSet && info.fps) {
      const f = [24, 25, 30, 50, 60].reduce((a, b) => Math.abs(b - info.fps) < Math.abs(a - info.fps) ? b : a, 30);
      S.project.settings.fps = f; S.project._fpsSet = true;
    }
    r.status = 'ready';
    updateItem(m.id);
    // thumbnails / waveform in the background
    if (info.hasVideo || info.isImage) {
      window.api.filmstrip(m.path, info).then(p => { if (p) { r.strip = p; updateItem(m.id); store.emit('runtime', m.id); } });
      window.api.poster(m.path, info).then(p => { if (p) { r.poster = p; updateItem(m.id); } });
    }
    if (info.hasAudio) window.api.waveform(m.path).then(w => { if (w) { r.wave = w; updateItem(m.id); store.emit('runtime', m.id); } });
    if (info.needsProxy) {
      r.status = 'proxy'; r.progress = 0; updateItem(m.id);
      try {
        r.proxy = await window.api.proxy(m.id, m.path, info);
        r.status = 'ready';
      } catch (e) { r.status = 'ready'; r.proxyError = true; }
      updateItem(m.id);
      store.emit('runtime', m.id);
      SC.program.needsRender = true;
    }
  }

  /** after loading a project: check files and rebuild runtime info */
  async function restoreRuntime() {
    const missing = [];
    for (const m of S.project.media) {
      const ok = await window.api.exists(m.path);
      if (!ok) { S.runtime[m.id] = { status: 'missing' }; missing.push(m); continue; }
      analyze(m);
    }
    render();
    if (missing.length) SC.ui.ask(t('dlg.missing') + '\n\n' + missing.map(m => m.path).join('\n'), [t('dlg.ok')]);
  }

  async function relink(m) {
    const f = await window.api.openFile({ title: t('media.relink'), defaultPath: m.path });
    if (!f) return;
    store.change('relink', () => { m.path = f; m.name = basename(f); });
    await analyze(m);
    render();
    SC.program.releaseAll();
    SC.program.needsRender = true;
  }

  function removeMedia(m) {
    const used = S.project.clips.some(c => c.mediaId === m.id);
    const go = () => store.change('remove-media', () => {
      S.project.clips = S.project.clips.filter(c => c.mediaId !== m.id);
      S.project.media = S.project.media.filter(x => x !== m);
    });
    if (used) SC.ui.ask(t('media.inUse'), [t('dlg.yes'), t('dlg.no')]).then(i => { if (i === 0) go(); });
    else go();
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    items.clear();
    const list = S.project.media.filter(m => (filter === 'all' || m.type === filter) && (!search || m.name.toLowerCase().includes(search)));
    if (!S.project.media.length) {
      const dz = el('div', { class: 'dropzone' });
      dz.innerHTML = SC.icon('import') + '<div>' + SC.ui.escapeHtml(t('media.drop')) + '</div>';
      listEl.append(dz);
      return;
    }
    for (const m of list) {
      const it = el('div', { class: 'mitem ' + m.type, draggable: 'true', 'data-tip': 'tip.media.item' });
      it.dataset.id = m.id;
      it.addEventListener('dragstart', (e) => {
        if (rt(m.id).status === 'missing' || rt(m.id).status === 'analyzing' || rt(m.id).status === 'error') { e.preventDefault(); return; }
        e.dataTransfer.setData('application/x-slaxx-media', m.id);
        e.dataTransfer.effectAllowed = 'copy';
        SC.dragPayload = { kind: 'media', id: m.id };
      });
      it.addEventListener('dragend', () => { SC.dragPayload = null; });
      it.addEventListener('click', () => { SC.source.load(m); listEl.querySelectorAll('.mitem').forEach(x => x.classList.toggle('active', x === it)); });
      it.addEventListener('dblclick', () => {
        if (rt(m.id).status !== 'ready' && rt(m.id).status !== 'proxy') return;
        store.change('append', () => { const c = SC.edit.appendMedia(m); if (c) store.select(c.id); });
      });
      it.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenu(e.clientX, e.clientY, [
          { label: t('media.toTimeline'), icon: 'append', action: () => store.change('append', () => SC.edit.appendMedia(m)), disabled: rt(m.id).status === 'missing' },
          { label: t('media.reveal'), icon: 'folder', action: () => window.api.showItem(m.path) },
          { label: t('media.relink'), icon: 'open', action: () => relink(m) },
          '-',
          { label: t('media.remove'), icon: 'trash', action: () => removeMedia(m) }
        ]);
      });
      listEl.append(it);
      items.set(m.id, it);
      updateItem(m.id);
    }
    if (SC.source && SC.source.media) {
      const a = items.get(SC.source.media.id); if (a) a.classList.add('active');
    }
  }

  function updateItem(id) {
    const it = items.get(id);
    if (!it) return;
    const m = S.project.media.find(x => x.id === id);
    if (!m) return;
    const r = rt(id);
    it.classList.toggle('missing', r.status === 'missing');
    it.innerHTML = '';
    const th = el('div', { class: 'thumb' });
    if (m.type === 'audio') {
      if (r.wave) {
        const cv = el('canvas', { class: 'wave', width: 240, height: 70 });
        drawWave(cv, r.wave, 0, m.duration, 'rgba(160,230,255,.9)');
        th.append(cv);
      } else th.innerHTML = SC.icon('audio');
    } else if (r.poster) th.style.backgroundImage = 'url("' + window.api.mediaUrl(r.poster) + '")';
    else if (m.isImage && r.status === 'ready') th.style.backgroundImage = 'url("' + window.api.mediaUrl(m.path) + '")';
    else th.innerHTML = SC.icon(m.type === 'image' ? 'image' : 'video');
    const badge = el('span', { class: 'badge', html: SC.icon(m.type === 'audio' ? 'audio' : m.type === 'image' ? 'image' : 'video') });
    th.append(badge);
    if (m.duration && !m.isImage) th.append(el('span', { class: 'dur', text: core.fmtTime(m.duration) }));
    if (r.status === 'analyzing') th.append(el('div', { class: 'state', text: t('media.analyzing') }));
    if (r.status === 'proxy') {
      th.append(el('div', { class: 'state', text: t('media.proxy') + ' ' + Math.round((r.progress || 0) * 100) + '%' }));
      th.append(el('div', { class: 'prog', style: { width: Math.round((r.progress || 0) * 100) + '%' } }));
    }
    if (r.status === 'missing') th.append(el('div', { class: 'state', text: t('media.missing') }));
    if (r.status === 'error') th.append(el('div', { class: 'state', text: t('media.unsupported') }));
    it.append(th, el('div', { class: 'name', text: m.name, title: m.path }));
  }

  /** draws waveform peaks between source times a..b into a canvas */
  function drawWave(cv, wave, a, b, color) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!wave || !wave.peaks || !wave.peaks.length) return;
    const pps = wave.pps, peaks = wave.peaks;
    ctx.fillStyle = color || 'rgba(255,255,255,.8)';
    const mid = H / 2;
    for (let x = 0; x < W; x++) {
      const t0 = a + (b - a) * x / W, t1 = a + (b - a) * (x + 1) / W;
      let mx = 0;
      for (let i = Math.floor(t0 * pps); i <= Math.min(peaks.length - 1, Math.ceil(t1 * pps)); i++) if (peaks[i] > mx) mx = peaks[i];
      const h = Math.max(1, mx / 100 * H * 0.95);
      ctx.fillRect(x, mid - h / 2, 1, h);
    }
  }

  SC.media = { build, importFiles, analyze, restoreRuntime, render, drawWave, rt, filesFromDrop };
})();
