/* SlaxxCUT – program (edit) playback engine. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const core = SC.core;
  const store = SC.store;
  const S = store.S;

  class Program {
    constructor() {
      this.playing = false;
      this.loop = false;
      this.pool = new Map();      // clipId → entry
      this.images = new Map();    // mediaId → HTMLImageElement
      this.textCanvas = new Map(); // clipId → {canvas, hash, bbox}
      this.volume = 1; this.muted = false;
      this.quality = 'half';
      this.raf = null;
      this.needsRender = true;
      this.lastBoxes = {};
      this.onTick = null;
      this.listeners = [];
    }
    attach(canvas) {
      this.canvas = canvas;
      try { this.gl = new SC.GLRenderer(canvas); } catch (e) { console.error(e); this.gl = null; }
      this.loopFn = this.loopFn || (() => this.frame());
      if (!this.raf) this.raf = requestAnimationFrame(this.loopFn);
    }
    audioCtx() {
      if (!this.actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.actx = new AC({ latencyHint: 'interactive' });
        this.master = this.actx.createGain();
        this.master.connect(this.actx.destination);
        this.applyVolume();
      }
      return this.actx;
    }
    applyVolume() { if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; }
    setVolume(v) { this.volume = v; this.applyVolume(); }
    setMuted(m) { this.muted = m; this.applyVolume(); }

    size() {
      const sh = { full: 1080, half: 540, quarter: 270 }[this.quality] || 540;
      return core.outputSize(S.project.settings.aspect, sh);
    }

    /* ---------------- element pool ---------------- */
    mediaUrl(m) {
      const rt = S.runtime[m.id] || {};
      if (rt.proxy) return window.api.mediaUrl(rt.proxy);
      return window.api.mediaUrl(m.path);
    }
    entry(c, m) {
      let e = this.pool.get(c.id);
      const url = this.mediaUrl(m);
      if (e && e.url !== url) { this.release(c.id); e = null; }
      if (!e) {
        const isVideo = m.hasVideo && !m.isImage;
        const elx = document.createElement(isVideo ? 'video' : 'audio');
        elx.preload = 'auto';
        elx.crossOrigin = 'anonymous';
        elx.playsInline = true;
        elx.src = url;
        elx.addEventListener('seeked', () => { this.needsRender = true; });
        elx.addEventListener('loadeddata', () => { this.needsRender = true; });
        e = { el: elx, url, mediaId: m.id, gain: null, comp: null, lastUse: performance.now() };
        this.pool.set(c.id, e);
      }
      e.lastUse = performance.now();
      return e;
    }
    ensureAudio(e, dyn) {
      const ctx = this.audioCtx();
      if (!e.gain) {
        try {
          e.src = ctx.createMediaElementSource(e.el);
          e.gain = ctx.createGain();
          e.src.connect(e.gain);
          e.gain.connect(this.master);
        } catch (err) { console.warn(err); return null; }
      }
      if (dyn > 0 && !e.comp) {
        e.comp = ctx.createDynamicsCompressor();
        e.comp.threshold.value = -24 - 12 * dyn; e.comp.ratio.value = 2 + 6 * dyn; e.comp.knee.value = 12; e.comp.attack.value = 0.01; e.comp.release.value = 0.3;
        e.makeup = ctx.createGain(); e.makeup.gain.value = 1 + 1.5 * dyn;
        e.gain.disconnect(); e.gain.connect(e.comp); e.comp.connect(e.makeup); e.makeup.connect(this.master);
      } else if (!dyn && e.comp) {
        e.gain.disconnect(); e.comp.disconnect(); e.makeup.disconnect(); e.comp = null; e.makeup = null; e.gain.connect(this.master);
      }
      return e.gain;
    }
    release(id) {
      const e = this.pool.get(id);
      if (!e) return;
      try { e.el.pause(); } catch (err) { /* */ }
      try { if (e.src) e.src.disconnect(); if (e.gain) e.gain.disconnect(); if (e.comp) e.comp.disconnect(); } catch (err) { /* */ }
      e.el.removeAttribute('src'); try { e.el.load(); } catch (err) { /* */ }
      if (this.gl) this.gl.dropTexture(id);
      this.pool.delete(id);
    }
    releaseAll() { for (const id of Array.from(this.pool.keys())) this.release(id); this.images.clear(); this.textCanvas.clear(); }
    image(m) {
      let im = this.images.get(m.id);
      const url = this.mediaUrl(m);
      if (!im || im.dataset.url !== url) {
        im = new Image();
        im.crossOrigin = 'anonymous';
        im.dataset.url = url;
        im.onload = () => { this.needsRender = true; };
        im.src = url;
        this.images.set(m.id, im);
      }
      return im;
    }
    textSource(c, W, H) {
      let tc = this.textCanvas.get(c.id);
      const hash = JSON.stringify(c.text) + W + 'x' + H;
      if (!tc) { tc = { canvas: document.createElement('canvas'), hash: '' }; this.textCanvas.set(c.id, tc); }
      if (tc.hash !== hash) {
        tc.bbox = SC.text.render(tc.canvas, c, W, H);
        tc.hash = hash; tc.changed = true;
        SC.text.ensureFont(c).then(() => { if (tc.hash === hash) { tc.hash = ''; this.needsRender = true; } });
      }
      return tc;
    }

    /* ---------------- transport ---------------- */
    play() {
      const d = core.projectDuration(S.project);
      if (d <= 0) return;
      if (S.playhead >= d - 0.02) store.setPlayhead(0, 'program');
      this.audioCtx().resume();
      this.playing = true;
      this.startWall = performance.now();
      this.startT = S.playhead;
      this.emit();
    }
    pause() {
      this.playing = false;
      for (const e of this.pool.values()) { try { e.el.pause(); } catch (err) { /* */ } }
      this.needsRender = true;
      this.emit();
    }
    toggle() { if (this.playing) this.pause(); else this.play(); }
    seek(t) {
      store.setPlayhead(t, 'program');
      if (this.playing) { this.startWall = performance.now(); this.startT = S.playhead; }
      this.needsRender = true;
    }
    onState(fn) { this.listeners.push(fn); }
    emit() { for (const f of this.listeners) f(this.playing); }

    /* ---------------- main loop ---------------- */
    frame() {
      this.raf = requestAnimationFrame(this.loopFn);
      if (this.playing) {
        const d = core.projectDuration(S.project);
        let t = this.startT + (performance.now() - this.startWall) / 1000;
        if (t >= d) {
          if (this.loop && d > 0) { t = 0; this.startT = 0; this.startWall = performance.now(); }
          else { t = d; store.setPlayhead(t, 'program'); this.pause(); }
        }
        if (this.playing) store.setPlayhead(t, 'program');
        this.needsRender = true;
      }
      if (this.needsRender) { this.needsRender = false; this.render(); }
      // occasional cleanup of far-away elements
      if (!this._lastGc || performance.now() - this._lastGc > 4000) {
        this._lastGc = performance.now();
        for (const [id, e] of this.pool) {
          const c = store.clipById(id);
          if (!c || Math.abs(c.start - S.playhead) > 30 && Math.abs(core.clipEnd(c) - S.playhead) > 30 && performance.now() - e.lastUse > 3000) this.release(id);
        }
      }
    }

    render() {
      const t = S.playhead;
      const p = S.project;
      const { w: W, h: H } = this.size();
      if (this.gl) { this.gl.resize(W, H); this.gl.clear(); }
      const layers = core.planVisual(p, t - 1e-4, t + 1e-4).filter(L => t >= L.vs - 1e-6 && t < L.ve);
      const active = new Set();
      const boxes = {};
      for (const L of layers) {
        const c = L.clip, m = L.media;
        let src = null, sw = W, sh = H, upload = true;
        if (c.kind === 'text') {
          const tc = this.textSource(c, W, H);
          src = tc.canvas; upload = true;
          boxes[c.id] = tc.bbox;
        } else if (!m) continue;
        else if (m.isImage) {
          const im = this.image(m);
          if (!im.complete || !im.naturalWidth) continue;
          src = im; sw = m.width || im.naturalWidth; sh = m.height || im.naturalHeight;
        } else {
          const e = this.entry(c, m);
          active.add(c.id);
          this.syncElement(e, c, m, t);
          if (e.el.readyState < 2) continue;
          src = e.el; sw = m.width || e.el.videoWidth; sh = m.height || e.el.videoHeight;
        }
        const fit = core.fitSize(sw, sh, W, H, c.kind === 'text' ? 'stretch' : (c.fit || 'contain'));
        const ev = core.evalLayer(L, t);
        const ops = [];
        for (const fx of L.colorEffects) {
          for (const op of core.colorOps(fx)) {
            if (op.op === 'lut' && this.gl && !this.gl.luts.has(op.file)) this.loadLut(op.file);
            ops.push(op);
          }
        }
        if (this.gl) {
          this.gl.drawLayer(src, {
            key: c.kind === 'text' ? 'txt_' + c.id : (m.isImage ? 'img_' + m.id : c.id),
            upload, fitW: fit.w, fitH: fit.h, ops,
            alpha: ev.alpha, bright: ev.bright, s: ev.s, x: ev.x, y: ev.y, rot: ev.rot,
            wipe: ev.wipe, glitch: ev.glitch, blur: ev.blur
          });
        }
        if (c.kind === 'text' && boxes[c.id]) boxes[c.id] = Object.assign({}, boxes[c.id], { s: ev.s, ox: ev.x, oy: ev.y, W, H });
      }
      this.lastBoxes = boxes;
      // audio
      this.syncAudio(t, active);
      // pause elements that are no longer active
      for (const [id, e] of this.pool) {
        if (!active.has(id) && !e.el.paused) { try { e.el.pause(); } catch (err) { /* */ } }
      }
      if (this.onTick) this.onTick(t);
    }

    syncElement(e, c, m, t) {
      const el = e.el;
      const dur = m.duration || el.duration || 0;
      let st = core.sourceTime(c, t);
      st = Math.max(0, Math.min(st, Math.max(0, dur - 0.04)));
      const sp = c.speed || 1;
      if (this.playing) {
        if (Math.abs(el.playbackRate - sp) > 1e-3) { try { el.playbackRate = sp; } catch (err) { /* */ } }
        if (el.paused) {
          if (Math.abs(el.currentTime - st) > 0.05) el.currentTime = st;
          const pr = el.play(); if (pr && pr.catch) pr.catch(() => { });
        } else if (Math.abs(el.currentTime - st) > 0.3 * Math.max(1, sp)) {
          el.currentTime = st;
        }
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - st) > 1 / 120 && !el.seeking) el.currentTime = st;
      }
    }

    syncAudio(t, activeVisual) {
      const items = core.planAudio(S.project);
      const audible = new Set();
      for (const A of items) {
        if (!A.media || t < A.as || t >= A.ae) continue;
        const c = A.clip;
        const e = this.entry(c, A.media);
        if (!activeVisual.has(c.id)) this.syncElement(e, c, A.media, t);
        activeVisual.add(c.id);
        const g = this.ensureAudio(e, A.dynnorm);
        if (g) g.gain.setTargetAtTime(core.audioGainAt(A, t), this.actx.currentTime, 0.015);
        audible.add(c.id);
        if (e.el.muted) e.el.muted = false;
      }
      // silence video elements whose audio is muted/detached
      for (const [id, e] of this.pool) {
        if (audible.has(id)) continue;
        if (e.gain) e.gain.gain.setTargetAtTime(0, this.actx.currentTime, 0.01);
        else e.el.muted = true;
      }
    }

    async loadLut(file) {
      if (!this._lutLoading) this._lutLoading = new Set();
      if (this._lutLoading.has(file)) return;
      this._lutLoading.add(file);
      try {
        const txt = await window.api.readFile(file);
        this.gl.setLut(file, txt);
        this.needsRender = true;
      } catch (e) { console.warn('LUT', e); }
    }

    snapshot() { return this.canvas ? this.canvas.toDataURL('image/png') : null; }
  }

  SC.program = new Program();
})();
