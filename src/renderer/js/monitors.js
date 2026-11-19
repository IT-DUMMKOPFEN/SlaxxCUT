/* SlaxxCUT – source monitor (middle) and edit/program monitor (right). Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $, iconBtn, clamp } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S;
  const t = (k) => SC.t(k);

  function fitStage(viewport, stage, aspectW, aspectH) {
    const ro = new ResizeObserver(() => layout());
    function layout() {
      const r = viewport.getBoundingClientRect();
      const a = (stage._aw || aspectW) / (stage._ah || aspectH);
      let w = r.width - 16, h = w / a;
      if (h > r.height - 16) { h = r.height - 16; w = h * a; }
      stage.style.width = Math.max(10, w) + 'px'; stage.style.height = Math.max(10, h) + 'px';
    }
    ro.observe(viewport);
    stage._layout = layout;
    return layout;
  }

  function scrubBar(onSeek) {
    const bar = el('div', { class: 'scrub' });
    const track = el('div', { class: 'track' });
    const range = el('div', { class: 'range', style: { display: 'none' } });
    const fill = el('div', { class: 'fill' });
    const knob = el('div', { class: 'knob' });
    bar.append(track, range, fill, knob);
    let dragging = false;
    const pos = (e) => { const r = bar.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
    bar.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true; onSeek(pos(e));
      const mv = (ev) => { if (dragging) onSeek(pos(ev)); };
      const up = () => { dragging = false; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    });
    return {
      el: bar,
      set(k) { k = clamp(k || 0, 0, 1); fill.style.width = (k * 100) + '%'; knob.style.left = (k * 100) + '%'; },
      range(a, b) {
        if (a == null || b == null) { range.style.display = 'none'; return; }
        range.style.display = 'block'; range.style.left = (a * 100) + '%'; range.style.width = Math.max(0, (b - a) * 100) + '%';
      }
    };
  }

  /* ================= SOURCE ================= */
  const source = {
    media: null, inP: null, outP: null, elx: null, playing: false,
    build() {
      const root = $('#sourceMonitor');
      root.addEventListener('mousedown', () => { SC.activeMonitor = 'source'; });
      const head = el('div', { class: 'mon-head' }, [el('h3', { 'data-i18n': 'src.title' })]);
      this.fileEl = el('div', { class: 'file' });
      head.append(this.fileEl);
      this.viewport = el('div', { class: 'viewport' });
      this.stage = el('div', { class: 'stage', draggable: 'true' });
      this.empty = el('div', { class: 'empty', html: SC.icon('video') + '<div data-i18n="src.empty"></div>' });
      this.viewport.append(this.stage, this.empty);
      fitStage(this.viewport, this.stage, 16, 9);
      this.stage.addEventListener('dragstart', (e) => {
        if (!this.media) { e.preventDefault(); return; }
        e.dataTransfer.setData('application/x-slaxx-media', this.media.id);
        SC.dragPayload = { kind: 'media', id: this.media.id, inP: this.inP, outP: this.outP };
      });
      this.stage.addEventListener('dragend', () => { SC.dragPayload = null; });
      this.scrub = scrubBar((k) => this.seek(k * this.duration()));
      const tr = el('div', { class: 'transport' });
      this.btnPlay = iconBtn('play', 'tip.play', () => this.toggle(), { class: 'ibtn big' });
      this.tc = el('div', { class: 'tc', 'data-tip': 'tip.timecode' });
      this.volBtn = iconBtn('volume', 'tip.mute', () => { this.muted = !this.muted; this.applyVol(); });
      this.vol = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 1, class: 'vol', 'data-tip': 'tip.volume' });
      this.vol.addEventListener('input', () => this.applyVol());
      tr.append(
        iconBtn('toStart', 'tip.toStart', () => this.seek(this.inP != null ? this.inP : 0)),
        iconBtn('stepBack', 'tip.stepBack', () => this.step(-1)),
        this.btnPlay,
        iconBtn('stepFwd', 'tip.stepFwd', () => this.step(1)),
        iconBtn('toEnd', 'tip.toEnd', () => this.seek(this.outP != null ? this.outP : this.duration())),
        el('div', { class: 'sep' }),
        iconBtn('markIn', 'tip.markIn', () => this.mark('in')),
        iconBtn('markOut', 'tip.markOut', () => this.mark('out')),
        iconBtn('clearInOut', 'tip.clearInOut', () => { this.inP = this.outP = null; this.update(); }),
        this.tc,
        el('div', { class: 'spacer' }),
        iconBtn('insert', 'tip.insert', () => this.insert(false)),
        iconBtn('append', 'tip.append', () => this.insert(true)),
        el('div', { class: 'sep' }),
        this.volBtn, this.vol
      );
      root.append(head, this.viewport, this.scrub.el, tr);
      this.update();
      const loop = () => { if (this.playing) this.update(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    },
    duration() {
      if (!this.media) return 0;
      if (this.media.isImage) return S.settings.imageDuration || 5;
      return this.media.duration || (this.elx && this.elx.duration) || 0;
    },
    applyVol() {
      if (this.elx && this.elx.tagName !== 'IMG') { this.elx.volume = +this.vol.value; this.elx.muted = !!this.muted; }
      this.volBtn.innerHTML = SC.icon(this.muted ? 'mute' : 'volume');
    },
    load(m) {
      this.pause();
      this.media = m; this.inP = this.outP = null;
      this.stage.innerHTML = '';
      this.elx = null;
      const r = S.runtime[m.id] || {};
      const url = window.api.mediaUrl(r.proxy || m.path);
      this.fileEl.textContent = m.name;
      this.empty.style.display = 'none';
      this.stage._aw = 16; this.stage._ah = 9;
      if (m.isImage) {
        this.elx = el('img', { src: url });
        this.stage._aw = m.width || 16; this.stage._ah = m.height || 9;
        this.stage.append(this.elx);
      } else if (m.hasVideo) {
        this.elx = el('video', { src: url, preload: 'auto', playsinline: true });
        this.stage._aw = m.width || 16; this.stage._ah = m.height || 9;
        this.stage.append(this.elx);
      } else {
        this.elx = el('audio', { src: url, preload: 'auto' });
        this.wave = el('canvas', { class: 'audio-vis', width: 800, height: 300 });
        this.stage.append(this.wave, this.elx);
        this.stage.style.background = 'linear-gradient(135deg,#0d3b56,#0b1a35)';
      }
      if (this.elx.tagName !== 'IMG') {
        this.elx.addEventListener('timeupdate', () => this.update());
        this.elx.addEventListener('loadedmetadata', () => this.update());
        this.elx.addEventListener('ended', () => { this.playing = false; this.update(); });
        this.elx.addEventListener('pause', () => { if (this.playing) { this.playing = false; this.update(); } });
        this.applyVol();
      }
      this.imgT = 0;
      this.stage._layout();
      this.update();
    },
    cur() {
      if (!this.elx) return 0;
      if (this.elx.tagName === 'IMG') return this.imgT || 0;
      return this.elx.currentTime || 0;
    },
    seek(tt) {
      tt = clamp(tt, 0, this.duration());
      if (!this.elx) return;
      if (this.elx.tagName === 'IMG') this.imgT = tt; else this.elx.currentTime = tt;
      this.update();
    },
    step(n) { const f = 1 / (this.media && this.media.fps || S.project.settings.fps || 30); this.pause(); this.seek(this.cur() + n * f); },
    toggle() { if (this.playing) this.pause(); else this.play(); },
    play() {
      if (!this.elx || this.elx.tagName === 'IMG') return;
      if (this.outP != null && this.cur() >= this.outP - 0.02) this.seek(this.inP || 0);
      SC.program.pause();
      this.elx.play().catch(() => { this.playing = false; this.update(); });
      this.playing = true; this.update();
    },
    pause() { if (this.elx && this.elx.pause) this.elx.pause(); this.playing = false; if (this.btnPlay) this.update(); },
    mark(which) {
      if (!this.media) return;
      const c = this.cur();
      if (which === 'in') { this.inP = c; if (this.outP != null && this.outP <= c) this.outP = null; }
      else { this.outP = Math.max(c, (this.inP || 0) + 0.05); }
      this.update();
    },
    insert(append) {
      const m = this.media;
      if (!m) return;
      const inP = this.inP != null ? this.inP : 0;
      const outP = this.outP != null ? this.outP : (m.isImage ? (S.settings.imageDuration || 5) : m.duration);
      store.change('insert', () => {
        let c;
        if (append) c = SC.edit.appendMedia(m, m.isImage ? 0 : inP, m.isImage ? outP - inP : outP);
        else c = SC.edit.placeMedia(m, S.selectedTrack || S.project.tracks[0].id, S.playhead, m.isImage ? 0 : inP, m.isImage ? outP - inP : outP);
        if (c) store.select(c.id);
      });
    },
    update() {
      const d = this.duration();
      const c = this.cur();
      if (this.playing && this.outP != null && c >= this.outP) this.pause();
      if (this._shownPlaying !== this.playing) { this.btnPlay.innerHTML = SC.icon(this.playing ? 'pause' : 'play'); this._shownPlaying = this.playing; }
      this.scrub.set(d ? c / d : 0);
      this.scrub.range(this.inP != null || this.outP != null ? (this.inP || 0) / (d || 1) : null, this.inP != null || this.outP != null ? (this.outP != null ? this.outP : d) / (d || 1) : null);
      const fps = (this.media && this.media.fps) || S.project.settings.fps;
      let txt = '<b>' + core.fmtTime(c, fps, true) + '</b> / ' + core.fmtTime(d, fps, true);
      if (this.inP != null || this.outP != null) txt += '  ·  ' + core.fmtTime((this.outP != null ? this.outP : d) - (this.inP || 0), fps, true);
      this.tc.innerHTML = this.media ? txt : '--:--:--';
      if (this.wave && this.media && !this.media.hasVideo) {
        const r = S.runtime[this.media.id] || {};
        SC.media.drawWave(this.wave, r.wave, 0, d, 'rgba(127,196,255,.85)');
        const ctx = this.wave.getContext('2d');
        ctx.fillStyle = '#ff4f6a'; ctx.fillRect(Math.round(this.wave.width * (d ? c / d : 0)), 0, 2, this.wave.height);
      }
    }
  };

  /* ================= PROGRAM ================= */
  const program = {
    build() {
      const root = $('#programMonitor');
      root.addEventListener('mousedown', () => { SC.activeMonitor = 'program'; });
      const head = el('div', { class: 'mon-head' }, [el('h3', { 'data-i18n': 'pgm.title' })]);
      head.append(el('div', { class: 'file' }));
      this.aspectSel = el('select', { class: 'sel', 'data-tip': 'tip.format' });
      for (const a of Object.keys(core.ASPECTS)) this.aspectSel.append(el('option', { value: a, text: a }));
      this.aspectSel.addEventListener('change', () => {
        store.change('aspect', () => { S.project.settings.aspect = this.aspectSel.value; });
      });
      this.qualSel = el('select', { class: 'sel', 'data-tip': 'tip.quality' });
      for (const q of ['full', 'half', 'quarter']) this.qualSel.append(el('option', { value: q, 'data-i18n': 'q.' + q }));
      this.qualSel.addEventListener('change', () => { SC.program.quality = this.qualSel.value; SC.program.needsRender = true; SC.app.saveSettings({ previewQuality: this.qualSel.value }); });
      head.append(this.aspectSel, this.qualSel);
      this.viewport = el('div', { class: 'viewport' });
      this.stage = el('div', { class: 'stage' });
      this.canvas = el('canvas', { class: 'view' });
      this.textBox = el('div', { class: 'text-drag' });
      this.stage.append(this.canvas, this.textBox);
      this.empty = el('div', { class: 'empty', html: SC.icon('film') + '<div data-i18n="pgm.empty"></div>' });
      this.viewport.append(this.stage, this.empty);
      this.layout = fitStage(this.viewport, this.stage, 16, 9);
      this.scrub = scrubBar((k) => { SC.program.seek(k * core.projectDuration(S.project)); });
      const tr = el('div', { class: 'transport' });
      this.btnPlay = iconBtn('play', 'tip.play', () => SC.program.toggle(), { class: 'ibtn big' });
      this.btnLoop = iconBtn('loop', 'tip.loop', () => { SC.program.loop = !SC.program.loop; this.btnLoop.classList.toggle('active', SC.program.loop); });
      this.tc = el('div', { class: 'tc', 'data-tip': 'tip.timecode' });
      this.volBtn = iconBtn('volume', 'tip.mute', () => { SC.program.setMuted(!SC.program.muted); this.volBtn.innerHTML = SC.icon(SC.program.muted ? 'mute' : 'volume'); });
      this.vol = el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: 1, class: 'vol', 'data-tip': 'tip.volume' });
      this.vol.addEventListener('input', () => SC.program.setVolume(+this.vol.value));
      this.vu = el('div', { class: 'vu', 'data-tip': 'ae.vu', style: { width: '46px' } }, [el('div', {}, [el('i')]), el('div', {}, [el('i')])]);
      const fps = () => S.project.settings.fps || 30;
      tr.append(
        iconBtn('toStart', 'tip.toStart', () => SC.program.seek(0)),
        iconBtn('stepBack', 'tip.stepBack', () => { SC.program.pause(); SC.program.seek(S.playhead - 1 / fps()); }),
        this.btnPlay,
        iconBtn('stepFwd', 'tip.stepFwd', () => { SC.program.pause(); SC.program.seek(S.playhead + 1 / fps()); }),
        iconBtn('toEnd', 'tip.toEnd', () => SC.program.seek(core.projectDuration(S.project))),
        this.btnLoop,
        this.tc,
        el('div', { class: 'spacer' }),
        this.vu, this.volBtn, this.vol,
        iconBtn('image', 'tip.snapshot', () => SC.dialogs.exportDialog('image')),
        iconBtn('fullscreen', 'tip.fullscreen', () => { if (document.fullscreenElement) document.exitFullscreen(); else this.viewport.requestFullscreen().catch(() => { }); })
      );
      root.append(head, this.viewport, this.scrub.el, tr);
      SC.program.attach(this.canvas);
      SC.program.onState((pl) => { this.btnPlay.innerHTML = SC.icon(pl ? 'pause' : 'play'); });
      SC.program.onTick = () => this.update();
      store.on('project', () => { this.sync(); SC.program.needsRender = true; });
      store.on('playhead', (src) => { if (src !== 'program') SC.program.needsRender = true; this.update(); });
      store.on('selection', () => this.update());
      this.initTextDrag();
      this.sync();
    },
    sync() {
      const a = core.ASPECTS[S.project.settings.aspect] || [16, 9];
      this.aspectSel.value = S.project.settings.aspect;
      this.qualSel.value = SC.program.quality;
      this.stage._aw = a[0]; this.stage._ah = a[1];
      this.layout();
      this.empty.style.display = S.project.clips.length ? 'none' : 'flex';
      this.update();
    },
    update() {
      const d = core.projectDuration(S.project);
      this.scrub.set(d ? S.playhead / d : 0);
      const fps = S.project.settings.fps || 30;
      this.tc.innerHTML = '<b>' + core.fmtTime(S.playhead, fps, true) + '</b> / ' + core.fmtTime(d, fps, true);
      // text drag box for the selected text clip
      const sel = SC.store.selectedClips().find(c => c.kind === 'text');
      const box = sel && SC.program.lastBoxes[sel.id];
      if (box && !SC.program.playing) {
        const sr = this.stage.getBoundingClientRect();
        const kx = sr.width / box.W, ky = sr.height / box.H;
        const cx = box.W / 2, cy = box.H / 2;
        // the text layer is full-frame: point p maps to (p - centre) * s + centre + offset
        const left = ((box.x - cx) * box.s + cx + (box.ox || 0) * box.W) * kx;
        const top = ((box.y - cy) * box.s + cy + (box.oy || 0) * box.H) * ky;
        this.textBox.style.display = 'block';
        this.textBox.style.left = left + 'px';
        this.textBox.style.top = top + 'px';
        this.textBox.style.width = box.w * box.s * kx + 'px';
        this.textBox.style.height = box.h * box.s * ky + 'px';
        this.textBox.dataset.clip = sel.id;
      } else this.textBox.style.display = 'none';
    },
    initTextDrag() {
      this.textBox.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const c = store.clipById(this.textBox.dataset.clip);
        if (!c) return;
        const sr = this.stage.getBoundingClientRect();
        const x0 = e.clientX, y0 = e.clientY;
        const p0 = Object.assign({}, c.text || {});
        const sx = p0.x != null ? p0.x : 0.5, sy = p0.y != null ? p0.y : 0.5;
        const mv = (ev) => {
          store.changeLive('textpos', () => {
            c.text = Object.assign({}, c.text, {
              x: clamp(sx + (ev.clientX - x0) / sr.width, 0, 1),
              y: clamp(sy + (ev.clientY - y0) / sr.height, 0, 1)
            });
          });
        };
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); store.commitLive(); SC.inspector.refresh(); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
    }
  };

  SC.source = source;
  SC.programMonitor = program;
})();
