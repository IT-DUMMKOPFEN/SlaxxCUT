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
      this.pool = new Map();       // key → entry {el, url, ...}
      this.images = new Map();     // mediaId → HTMLImageElement
      this.textCanvas = new Map(); // clipId:part → {canvas, hash, bbox}
      this.volume = 1; this.muted = false;
      this.quality = 'half';
      this.needsRender = true;
      this.lastBoxes = {};
      this.onTick = null;
      this.listeners = [];
      this.soloClip = null;
      this.renders = {};           // audio render key → file path
      this.rendering = {};         // key → progress
    }
    attach(canvas) {
      this.canvas = canvas;
      try { this.gl = new SC.GLRenderer(canvas); } catch (e) { console.error(e); this.gl = null; }
      this.loopFn = this.loopFn || (() => this.frame());
      if (!this.raf) this.raf = requestAnimationFrame(this.loopFn);
      if (window.api.onJobProgress) window.api.onJobProgress((id, k) => { if (this.rendering[id] != null) { this.rendering[id] = k; store.emit('renderprogress', id, k); } });
    }
    audioCtx() {
      if (!this.actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.actx = new AC({ latencyHint: 'interactive', sampleRate: 48000 });
        this.master = this.actx.createGain();
        this.master.connect(this.actx.destination);
        // level meter
        this.splitter = this.actx.createChannelSplitter(2);
        this.anL = this.actx.createAnalyser(); this.anR = this.actx.createAnalyser();
        this.anL.fftSize = this.anR.fftSize = 1024;
        this.master.connect(this.splitter);
        this.splitter.connect(this.anL, 0); this.splitter.connect(this.anR, 1);
        this.meterBuf = new Float32Array(1024);
        this.applyVolume();
      }
      return this.actx;
    }
    /** peak levels in dBFS [L, R] */
    levels() {
      if (!this.anL) return [-90, -90];
      const peak = (an) => { an.getFloatTimeDomainData(this.meterBuf); let m = 0; for (const v of this.meterBuf) m = Math.max(m, Math.abs(v)); return m > 0 ? 20 * Math.log10(m) : -90; };
      return [peak(this.anL), peak(this.anR)];
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
      return window.api.mediaUrl(rt.proxy || m.path);
    }
    entryFor(key, url, video) {
      let e = this.pool.get(key);
      if (e && e.url !== url) { this.release(key); e = null; }
      if (!e) {
        const elx = document.createElement(video ? 'video' : 'audio');
        elx.preload = 'auto';
        elx.crossOrigin = 'anonymous';
        elx.playsInline = true;
        elx.src = url;
        elx.addEventListener('seeked', () => { this.needsRender = true; });
        elx.addEventListener('loadeddata', () => { this.needsRender = true; });
        e = { key, el: elx, url, gain: null, chainSig: null, chain: null, lastUse: performance.now() };
        this.pool.set(key, e);
      }
      e.lastUse = performance.now();
      return e;
    }
    entry(c, m) { return this.entryFor(c.id, this.mediaUrl(m), m.hasVideo && !m.isImage); }

    /** WebAudio chain for live effects: element → [effects] → gain → master */
    ensureAudio(e, liveEffects) {
      const ctx = this.audioCtx();
      if (!e.src) {
        try { e.src = ctx.createMediaElementSource(e.el); } catch (err) { console.warn(err); return null; }
        e.gain = ctx.createGain();
        e.gain.connect(this.master);
      }
      const sig = JSON.stringify((liveEffects || []).map(x => [x.type, x.params]));
      if (sig !== e.chainSig) {
        try { e.src.disconnect(); } catch (err) { /* */ }
        if (e.chain) for (const n of e.chain.nodes) { try { n.disconnect(); } catch (err) { /* */ } }
        e.chain = buildChain(ctx, liveEffects || []);
        if (e.chain.nodes.length) { e.src.connect(e.chain.input); e.chain.output.connect(e.gain); }
        else e.src.connect(e.gain);
        e.chainSig = sig;
      }
      return e.gain;
    }
    release(key) {
      const e = this.pool.get(key);
      if (!e) return;
      try { e.el.pause(); } catch (err) { /* */ }
      try { if (e.src) e.src.disconnect(); if (e.gain) e.gain.disconnect(); if (e.chain) for (const n of e.chain.nodes) n.disconnect(); } catch (err) { /* */ }
      e.el.removeAttribute('src'); try { e.el.load(); } catch (err) { /* */ }
      if (this.gl) this.gl.dropTexture(key);
      this.pool.delete(key);
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
    textSource(c, part, W, H) {
      const key = c.id + ':' + (part || 'main');
      let tc = this.textCanvas.get(key);
      const hash = JSON.stringify(c.text) + W + 'x' + H;
      if (!tc) { tc = { canvas: document.createElement('canvas'), hash: '' }; this.textCanvas.set(key, tc); }
      if (tc.hash !== hash) {
        const r = SC.text.renderPart(tc.canvas, c, W, H, part, () => { tc.hash = ''; this.needsRender = true; });
        tc.bbox = r && r.bbox;
        tc.hash = hash;
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
      if (this.suspended) return;
      if (this.playing) {
        const d = this.stopAt != null ? Math.min(this.stopAt, core.projectDuration(S.project)) : core.projectDuration(S.project);
        let t = this.startT + (performance.now() - this.startWall) / 1000;
        if (t >= d) {
          if (this.loop && d > 0) { t = this.loopFrom || 0; this.startT = t; this.startWall = performance.now(); }
          else { t = d; store.setPlayhead(t, 'program'); this.pause(); this.stopAt = null; }
        }
        if (this.playing) store.setPlayhead(t, 'program');
        this.needsRender = true;
      }
      if (this.needsRender) { this.needsRender = false; this.render(); }
      if (!this._lastGc || performance.now() - this._lastGc > 4000) {
        this._lastGc = performance.now();
        for (const [key, e] of this.pool) {
          const c = store.clipById(key.replace(/^afx_/, ''));
          if (!c || Math.abs(c.start - S.playhead) > 30 && Math.abs(core.clipEnd(c) - S.playhead) > 30 && performance.now() - e.lastUse > 3000) this.release(key);
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
        let src = null, sw = W, sh = H, key;
        if (c.kind === 'text') {
          const tc = this.textSource(c, L.part, W, H);
          src = tc.canvas; key = 'txt_' + c.id + (L.part || '');
          if (!L.part) boxes[c.id] = tc.bbox;
        } else if (!m) continue;
        else if (m.isImage) {
          const im = this.image(m);
          if (!im.complete || !im.naturalWidth) continue;
          src = im; sw = m.width || im.naturalWidth; sh = m.height || im.naturalHeight; key = 'img_' + m.id;
        } else {
          const e = this.entry(c, m);
          active.add(c.id);
          this.syncElement(e, c, m, t);
          if (e.el.readyState < 2) continue;
          src = e.el; sw = m.width || e.el.videoWidth; sh = m.height || e.el.videoHeight; key = c.id;
        }
        const fit = core.layerFit(L, sw, sh, W, H);
        const ev = core.evalLayer(L, t);
        const ops = [];
        for (const fx of L.colorEffects) {
          for (const op of core.colorOps(fx)) {
            if (op.op === 'lut' && this.gl && !this.gl.luts.has(op.file)) this.loadLut(op.file);
            ops.push(op);
          }
        }
        if (ev.tblur) ops.push({ op: 'blur', s: ev.tblur });
        if (ev.tpix) ops.push({ op: 'pixel', s: ev.tpix, rect: null });
        if (this.gl) {
          this.gl.drawLayer(src, {
            key, upload: true, fitW: fit.w, fitH: fit.h, ops, geo: c.kind === 'text' ? null : L.geo,
            alpha: ev.alpha, bright: ev.bright, white: ev.white, s: ev.s, x: ev.x, y: ev.y, rot: ev.rot,
            mask: ev.mask, glitch: ev.glitch, blur: ev.blur, blurV: ev.blurV
          });
        }
        if (c.kind === 'text' && !L.part && boxes[c.id]) boxes[c.id] = Object.assign({}, boxes[c.id], { s: ev.s, ox: ev.x, oy: ev.y, W, H });
      }
      this.lastBoxes = boxes;
      this.syncAudio(t, active);
      for (const [id, e] of this.pool) {
        if (!active.has(id) && !e.el.paused) { try { e.el.pause(); } catch (err) { /* */ } }
      }
      if (this.onTick) this.onTick(t);
    }

    syncElement(e, c, m, t, offset) {
      const el = e.el;
      const dur = (m && m.duration) || el.duration || 0;
      let st = core.sourceTime(c, t) - (offset || 0);
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
        e.lastSeek = null;
      } else {
        if (!el.paused) el.pause();
        // seek only when the requested position changes (Windows decoders report frame-snapped times)
        if (!el.seeking && (e.lastSeek == null || Math.abs(st - e.lastSeek) > 1 / 240)) {
          if (Math.abs(el.currentTime - st) > 1 / 240) el.currentTime = st;
          e.lastSeek = st;
        }
      }
    }

    /** start pre-rendering an audio job (denoise etc.) if needed */
    requestRender(job) {
      if (!job || this.renders[job.key] || this.rendering[job.key] != null) return;
      this.rendering[job.key] = 0;
      store.emit('renderprogress', job.key, 0);
      window.api.renderAudio(job.key, job).then((file) => {
        this.renders[job.key] = file;
      }).catch((err) => { console.warn('audio render', err); SC.ui.toast(String(err.message || err), 'error'); })
        .finally(() => { delete this.rendering[job.key]; store.emit('renderprogress', job.key, 1); store.emit('runtime'); this.needsRender = true; });
    }

    syncAudio(t, activeVisual) {
      const items = core.planAudio(S.project);
      const audible = new Set();
      for (const A of items) {
        if (A.render) this.requestRender(A.render);
        if (!A.media || t < A.as || t >= A.ae) continue;
        if (this.soloClip && A.clip.id !== this.soloClip) continue;
        const c = A.clip;
        let e;
        const rendered = A.render && this.renders[A.render.key];
        if (rendered) {
          e = this.entryFor('afx_' + c.id, window.api.mediaUrl(rendered), false);
          this.syncElement(e, c, { duration: A.render.end - A.render.start }, t, A.render.start);
          activeVisual.add('afx_' + c.id);
        } else {
          e = this.entry(c, A.media);
          if (!activeVisual.has(c.id)) this.syncElement(e, c, A.media, t);
          activeVisual.add(c.id);
        }
        const g = this.ensureAudio(e, A.liveEffects);
        if (g) g.gain.setTargetAtTime(core.audioGainAt(A, t), this.actx.currentTime, 0.015);
        audible.add(e.key);
        if (e.el.muted) e.el.muted = false;
      }
      for (const [key, e] of this.pool) {
        if (audible.has(key)) continue;
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
  }

  /* ---------------- WebAudio effect chains (mirror the FFmpeg filters) ---------------- */
  function buildChain(ctx, effects) {
    const nodes = [];
    let first = null, last = null;
    const add = (n) => { nodes.push(n); if (!first) first = n; else last.connect(n); last = n; return n; };
    const biquad = (type, f, q, g) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (g != null) b.gain.value = g; return add(b); };
    const channelMix = (m) => { // m = [[LL, LR], [RL, RR]]: out channel i = m[i][0]*L + m[i][1]*R
      const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
      add(sp); nodes.push(mg);
      for (let o = 0; o < 2; o++) for (let i = 0; i < 2; i++) {
        if (!m[o][i]) continue;
        const g = ctx.createGain(); g.gain.value = m[o][i]; nodes.push(g);
        sp.connect(g, i); g.connect(mg, 0, o);
      }
      last = mg;
    };
    for (const e of effects) {
      const p = core.fxParams(e);
      switch (e.type) {
        case 'highpass': biquad('highpass', +p.freq, 0.707); break;
        case 'lowpass': biquad('lowpass', +p.freq, 0.707); break;
        case 'bandpass': biquad('highpass', +p.freq / Math.pow(2, 0.5 / +p.q), 0.707); biquad('lowpass', +p.freq * Math.pow(2, 0.5 / +p.q), 0.707); break;
        case 'eq3': biquad('lowshelf', 100, null, +p.bass); biquad('peaking', 1000, 1, +p.mid); biquad('highshelf', 4000, null, +p.treble); break;
        case 'eq10': for (const f of [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]) if (+p['g' + f]) biquad('peaking', f, 1.41, +p['g' + f]); break;
        case 'dehum': for (let h = 1; h <= +p.harmonics; h++) biquad('notch', (+p.freq) * h, 30); break;
        case 'compressor': {
          const c = ctx.createDynamicsCompressor();
          c.threshold.value = +p.threshold; c.ratio.value = Math.min(20, +p.ratio); c.knee.value = 6;
          c.attack.value = +p.attack / 1000; c.release.value = +p.release / 1000;
          add(c);
          const g = ctx.createGain(); g.gain.value = Math.pow(10, +p.makeup / 20); add(g);
          break;
        }
        case 'limiter': {
          const c = ctx.createDynamicsCompressor();
          c.threshold.value = +p.limit; c.ratio.value = 20; c.knee.value = 0; c.attack.value = 0.001; c.release.value = 0.05;
          add(c);
          break;
        }
        case 'dynnorm': {
          const k = +p.strength;
          const c = ctx.createDynamicsCompressor();
          c.threshold.value = -24 - 12 * k; c.ratio.value = 2 + 6 * k; c.knee.value = 12; c.attack.value = 0.01; c.release.value = 0.3;
          add(c);
          const g = ctx.createGain(); g.gain.value = 1 + 1.5 * k; add(g);
          break;
        }
        case 'reverb': case 'echo': {
          const ir = core.impulseResponse(e, ctx.sampleRate);
          const buf = ctx.createBuffer(2, ir.L.length, ctx.sampleRate);
          buf.copyToChannel(ir.L, 0); buf.copyToChannel(ir.R, 1);
          const cv = ctx.createConvolver(); cv.normalize = false; cv.buffer = buf;
          add(cv);
          break;
        }
        case 'mono': channelMix([[0.5, 0.5], [0.5, 0.5]]); break;
        case 'swap': channelMix([[0, 1], [1, 0]]); break;
        case 'balance': { const b = +p.pan; channelMix([[b > 0 ? 1 - b : 1, 0], [0, b < 0 ? 1 + b : 1]]); break; }
      }
    }
    return { input: first, output: last, nodes };
  }

  SC.program = new Program();
})();
