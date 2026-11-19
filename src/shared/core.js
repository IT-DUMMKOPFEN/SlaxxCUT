/*
 * SlaxxCUT – shared core
 * Used by the renderer (preview) and the main process (export), so that the
 * preview and the exported MP4 are computed from exactly the same rules.
 * Done by IT-DUMMKOPFEN – GPL-3.0-or-later
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SC = root.SC || {}; root.SC.core = api; }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_TRACKS = 10;
  const MIN_TRACKS = 1;
  const EPS = 1e-3;

  let idCounter = 0;
  function uid(prefix) {
    idCounter = (idCounter + 1) % 1e6;
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7) + idCounter.toString(36);
  }

  const EXT = {
    video: ['mp4', 'm4v', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', 'mpg', 'mpeg', 'mts', 'm2ts', 'ts', '3gp', 'ogv'],
    audio: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'alac', 'ac3'],
    image: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'heic', 'heif']
  };
  function typeFromPath(p) {
    const ext = String(p).split('.').pop().toLowerCase();
    for (const k of Object.keys(EXT)) if (EXT[k].includes(ext)) return k;
    return null;
  }

  /* ------------------------------------------------------------------ */
  /* Project model                                                       */
  /* ------------------------------------------------------------------ */
  function newProject() {
    const tracks = [];
    for (let i = 0; i < 4; i++) tracks.push(newTrack(i));
    return {
      app: 'SlaxxCUT', version: 1,
      name: 'Unbenannt',
      settings: { aspect: '16:9', fps: 30 },
      media: [],
      tracks,
      clips: []
    };
  }
  function newTrack(i) {
    return { id: uid('trk'), name: 'Spur ' + (i + 1), muted: false, hidden: false, locked: false };
  }

  const ASPECTS = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1] };
  const SIZE_PRESETS = [
    { key: '4k', label: '4K', short: 2160 },
    { key: '2k', label: '2K', short: 1440 },
    { key: '1080', label: '1080p', short: 1080 },
    { key: '720', label: '720p', short: 720 },
    { key: '480', label: '480p', short: 480 },
    { key: '360', label: '360p', short: 360 }
  ];
  function even(n) { n = Math.round(n); return n % 2 ? n + 1 : n; }
  function outputSize(aspect, short) {
    const a = ASPECTS[aspect] || ASPECTS['16:9'];
    if (a[0] >= a[1]) return { w: even(short * a[0] / a[1]), h: even(short) };
    return { w: even(short), h: even(short * a[1] / a[0]) };
  }

  function clipDuration(c) { return Math.max(0, (c.out - c.in) / (c.speed || 1)); }
  function clipEnd(c) { return c.start + clipDuration(c); }
  function projectDuration(p) {
    let d = 0;
    for (const c of p.clips) d = Math.max(d, clipEnd(c));
    return d;
  }
  function mediaById(p, id) { return p.media.find(m => m.id === id) || null; }
  function trackIndex(p, trackId) { return p.tracks.findIndex(t => t.id === trackId); }

  function clipHasVideo(p, c) {
    if (c.kind === 'text' || c.kind === 'image') return true;
    if (c.kind !== 'video') return false;
    const m = mediaById(p, c.mediaId); return !!(m && m.hasVideo);
  }
  function clipHasAudio(p, c) {
    if (c.kind === 'audio') return true;
    if (c.kind !== 'video' || c.audioDetached || c.muted) return false;
    const m = mediaById(p, c.mediaId); return !!(m && m.hasAudio);
  }

  /* ------------------------------------------------------------------ */
  /* Expression helpers (same expression strings evaluated by JS and FFmpeg) */
  /* ------------------------------------------------------------------ */
  const exprCache = new Map();
  function compile(expr) {
    let f = exprCache.get(expr);
    if (!f) {
      // eslint-disable-next-line no-new-func
      f = new Function('T', 'u', 'const {sin,cos,abs,min,max,floor,PI}=Math;const clip=(x,a,b)=>Math.min(b,Math.max(a,x));return (' + expr + ');');
      exprCache.set(expr, f);
    }
    return f;
  }
  function num(n) { return (Math.round(n * 1e6) / 1e6).toString(); }
  /** replace the variable T inside an expression by another sub-expression */
  function subst(expr, name, repl) { return expr.replace(new RegExp('\\b' + name + '\\b', 'g'), '(' + repl + ')'); }

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */
  // param types: range | select | color | check | file | text
  const EFFECTS = {
    // --- motion
    zoomIn: { cat: 'motion', icon: 'zoom-in', params: [{ k: 'amount', t: 'range', min: 0.05, max: 1, step: 0.05, def: 0.3 }] },
    zoomOut: { cat: 'motion', icon: 'zoom-out', params: [{ k: 'amount', t: 'range', min: 0.05, max: 1, step: 0.05, def: 0.3 }] },
    panScan: { cat: 'motion', icon: 'pan', params: [{ k: 'dir', t: 'select', opts: ['lr', 'rl', 'tb', 'bt'], def: 'lr' }, { k: 'zoom', t: 'range', min: 1.1, max: 2, step: 0.05, def: 1.3 }] },
    shake: { cat: 'motion', icon: 'shake', params: [{ k: 'strength', t: 'range', min: 0.002, max: 0.05, step: 0.001, def: 0.012 }, { k: 'speed', t: 'range', min: 1, max: 20, step: 0.5, def: 8 }] },
    parallax: { cat: 'motion', icon: 'parallax', params: [{ k: 'depth', t: 'range', min: 0.02, max: 0.4, step: 0.01, def: 0.12 }, { k: 'dir', t: 'select', opts: ['lr', 'rl', 'tb', 'bt'], def: 'lr' }] },
    slowmo: { cat: 'motion', icon: 'slowmo', action: true, params: [{ k: 'speed', t: 'select', opts: [0.75, 0.5, 0.25], def: 0.5 }] },
    timelapse: { cat: 'motion', icon: 'timelapse', action: true, params: [{ k: 'speed', t: 'select', opts: [2, 4, 8, 16], def: 4 }] },
    // --- color
    bw: { cat: 'color', icon: 'bw', params: [{ k: 'strength', t: 'range', min: 0, max: 1, step: 0.05, def: 1 }] },
    sepia: { cat: 'color', icon: 'sepia', params: [{ k: 'strength', t: 'range', min: 0, max: 1, step: 0.05, def: 0.9 }] },
    vintage: { cat: 'color', icon: 'vintage', params: [{ k: 'strength', t: 'range', min: 0, max: 1, step: 0.05, def: 1 }] },
    film: { cat: 'color', icon: 'film', params: [{ k: 'bars', t: 'check', def: true }, { k: 'grain', t: 'range', min: 0, max: 20, step: 1, def: 6 }] },
    grading: {
      cat: 'color', icon: 'grading', params: [
        { k: 'brightness', t: 'range', min: -0.5, max: 0.5, step: 0.01, def: 0 },
        { k: 'contrast', t: 'range', min: 0.5, max: 2, step: 0.01, def: 1 },
        { k: 'saturation', t: 'range', min: 0, max: 2, step: 0.01, def: 1 },
        { k: 'temperature', t: 'range', min: -1, max: 1, step: 0.01, def: 0 },
        { k: 'tint', t: 'range', min: -1, max: 1, step: 0.01, def: 0 },
        { k: 'lut', t: 'file', def: '' }]
    },
    duotone: { cat: 'color', icon: 'duotone', params: [{ k: 'dark', t: 'color', def: '#0b1d3f' }, { k: 'light', t: 'color', def: '#7fc4ff' }] },
    hdr: { cat: 'color', icon: 'hdr', params: [{ k: 'strength', t: 'range', min: 0.2, max: 2, step: 0.1, def: 1 }] },
    // --- audio (actions or audio effects)
    detach: { cat: 'audio', icon: 'detach', action: true, params: [] },
    louder: { cat: 'audio', icon: 'louder', action: true, params: [] },
    quieter: { cat: 'audio', icon: 'quieter', action: true, params: [] },
    match: { cat: 'audio', icon: 'match', action: true, params: [] },
    dynnorm: { cat: 'audio', icon: 'normalize', params: [{ k: 'strength', t: 'range', min: 0.1, max: 1, step: 0.05, def: 0.6 }] },
    // --- text
    text: { cat: 'text', icon: 'text', action: true, params: [] }
  };
  const EFFECT_CATS = ['motion', 'color', 'audio', 'text'];

  const TRANSITIONS = {
    fade: { icon: 'fade' },
    crossfade: { icon: 'crossfade' },
    wipe: { icon: 'wipe' },
    zoom: { icon: 'tzoom' },
    spin: { icon: 'spin' },
    glitch: { icon: 'glitch' },
    whip: { icon: 'whip' }
  };

  function defaultParams(type) {
    const def = EFFECTS[type]; const o = {};
    if (!def) return o;
    for (const p of def.params) o[p.k] = p.def;
    return o;
  }

  /* ---------- color primitives (shared numbers for shader and ffmpeg) ---------- */
  const LUMA = [0.299, 0.587, 0.114];
  const SEPIA = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function mix3(a, b, k) { return a.map((v, i) => v * (1 - k) + b[i] * k); }
  function mul3(a, b) { // a*b (apply b first, then a)
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
    return r;
  }
  function grayM() { return [LUMA[0], LUMA[1], LUMA[2], LUMA[0], LUMA[1], LUMA[2], LUMA[0], LUMA[1], LUMA[2]]; }
  function satM(s) { return mix3(grayM(), I3, s); }
  function hexToRgb(h) {
    h = String(h || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  /** Converts one color effect into a list of primitive operations. */
  function colorOps(effect) {
    const p = Object.assign(defaultParams(effect.type), effect.params || {});
    switch (effect.type) {
      case 'bw': return [{ op: 'matrix', m: mix3(I3, grayM(), +p.strength) }];
      case 'sepia': return [{ op: 'matrix', m: mix3(I3, SEPIA, +p.strength) }];
      case 'vintage': {
        const k = +p.strength;
        return [
          { op: 'matrix', m: mix3(I3, mul3(satM(0.75), mix3(I3, SEPIA, 0.4)), k) },
          { op: 'curve', c: [1 - 0.12 * k, 1 - 0.12 * k, 1 - 0.16 * k], b: [0.04 * k, 0.03 * k, 0.0] },
          { op: 'vignette', a: Math.PI / 4 * k },
          { op: 'grain', n: 8 * k }
        ];
      }
      case 'film': {
        const ops = [
          { op: 'matrix', m: satM(0.85) },
          { op: 'curve', c: [1.16, 1.08, 0.98], b: [0.0, 0.0, 0.02] }
        ];
        if (+p.grain > 0) ops.push({ op: 'grain', n: +p.grain });
        if (p.bars) ops.push({ op: 'bars', h: 0.11 });
        return ops;
      }
      case 'grading': {
        const t = +p.temperature, ti = +p.tint;
        const temp = [1 + 0.15 * t, 0, 0, 0, 1 - 0.12 * ti, 0, 0, 0, 1 - 0.15 * t];
        const ops = [
          { op: 'matrix', m: mul3(temp, satM(+p.saturation)) },
          { op: 'curve', c: [+p.contrast, +p.contrast, +p.contrast], b: [+p.brightness, +p.brightness, +p.brightness] }
        ];
        if (p.lut) ops.push({ op: 'lut', file: p.lut });
        return ops;
      }
      case 'duotone': return [{ op: 'matrix', m: grayM() }, { op: 'duotone', a: hexToRgb(p.dark), b: hexToRgb(p.light) }];
      case 'hdr': {
        const k = +p.strength;
        return [
          { op: 'sharpen', amount: 0.9 * k },
          { op: 'matrix', m: satM(1 + 0.25 * k) },
          { op: 'curve', c: [1 + 0.1 * k, 1 + 0.1 * k, 1 + 0.1 * k], b: [0, 0, 0] }
        ];
      }
      default: return [];
    }
  }
  function isColorEffect(type) { return EFFECTS[type] && EFFECTS[type].cat === 'color'; }
  function isMotionEffect(type) { return ['zoomIn', 'zoomOut', 'panScan', 'shake', 'parallax'].includes(type); }

  /* ---------- motion effects → expressions in T (seconds since clip start) and D (clip duration) ---------- */
  // returns {s, x, y} expression strings; x/y offsets are fractions of output width/height
  function motionExpr(effect, D) {
    const p = Object.assign(defaultParams(effect.type), effect.params || {});
    const d = num(Math.max(D, 0.001));
    const prog = 'clip(T/' + d + ',0,1)';
    switch (effect.type) {
      case 'zoomIn': return { s: '1+' + num(+p.amount) + '*' + prog, x: '0', y: '0' };
      case 'zoomOut': return { s: '1+' + num(+p.amount) + '*(1-' + prog + ')', x: '0', y: '0' };
      case 'panScan': {
        const z = +p.zoom, m = num((z - 1) / 2);
        const dirs = { lr: ['1', '0'], rl: ['-1', '0'], tb: ['0', '1'], bt: ['0', '-1'] }[p.dir] || ['1', '0'];
        const pos = '(' + prog + '-0.5)*2';
        return { s: num(z), x: '-' + m + '*' + dirs[0] + '*' + pos, y: '-' + m + '*' + dirs[1] + '*' + pos };
      }
      case 'shake': {
        const S = num(+p.strength), F = num(+p.speed);
        return {
          s: num(1 + 2.6 * p.strength),
          x: S + '*(sin(T*' + F + '*6.1)+0.5*sin(T*' + F + '*13.7+1.3))/1.5',
          y: S + '*(cos(T*' + F + '*5.3+0.7)+0.5*sin(T*' + F + '*11.9))/1.5'
        };
      }
      case 'parallax': {
        const dp = +p.depth;
        const dirs = { lr: ['1', '0'], rl: ['-1', '0'], tb: ['0', '1'], bt: ['0', '-1'] }[p.dir] || ['1', '0'];
        const pos = '(' + prog + '-0.5)';
        return { s: num(1 + dp * 1.05), x: num(dp) + '*' + dirs[0] + '*' + pos, y: num(dp) + '*' + dirs[1] + '*' + pos };
      }
      default: return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Transitions                                                         */
  /* ------------------------------------------------------------------ */
  function neighbors(p, c) {
    let prev = null, next = null;
    for (const o of p.clips) {
      if (o === c || o.id === c.id || o.trackId !== c.trackId) continue;
      if (Math.abs(clipEnd(o) - c.start) < EPS) prev = o;
      if (Math.abs(o.start - clipEnd(c)) < EPS) next = o;
    }
    return { prev, next };
  }
  function maxTransDur(c) { return Math.max(0.1, Math.min(4, clipDuration(c) * 0.9)); }

  /** resolves the in/out transition windows of a clip.
   *  Returns {tin, tout}; each {type, d, paired, w0, w1, cut} or null. */
  function transWindows(p, c) {
    const nb = neighbors(p, c);
    const res = { tin: null, tout: null };
    if (c.transIn && c.transIn.type) {
      const d = Math.min(c.transIn.d || 1, maxTransDur(c));
      const paired = !!(nb.prev && nb.prev.transOut && nb.prev.transOut.type === c.transIn.type);
      if (paired) {
        const dd = Math.min(d, maxTransDur(nb.prev));
        res.tin = { type: c.transIn.type, d: dd, paired, cut: c.start, w0: c.start - dd / 2, w1: c.start + dd / 2 };
      } else res.tin = { type: c.transIn.type, d, paired, cut: c.start, w0: c.start, w1: c.start + d };
    }
    if (c.transOut && c.transOut.type) {
      const e = clipEnd(c);
      const d = Math.min(c.transOut.d || 1, maxTransDur(c));
      const paired = !!(nb.next && nb.next.transIn && nb.next.transIn.type === c.transOut.type);
      if (paired) {
        const dd = Math.min(d, maxTransDur(nb.next));
        res.tout = { type: c.transOut.type, d: dd, paired, cut: e, w0: e - dd / 2, w1: e + dd / 2 };
      } else res.tout = { type: c.transOut.type, d, paired, cut: e, w0: e - d, w1: e };
    }
    return res;
  }

  /** returns the visual plan pieces caused by a transition window for a role ('in' | 'out') */
  function transitionPiece(w, role) {
    const P = { alpha: [], bright: [], s: null, x: null, rot: null, wipe: null, glitch: null, blur: null, vs: null, ve: null };
    const u = 'clip((T-' + num(w.w0) + ')/' + num(w.w1 - w.w0) + ',0,1)'; // T here = absolute timeline time
    const half = (w.w0 + w.w1) / 2;
    const ease = (x) => '(' + x + ')*(' + x + ')*(3-2*(' + x + '))';
    switch (w.type) {
      case 'fade':
        if (w.paired) {
          if (role === 'out') { P.bright.push({ a: w.w0, b: w.cut, dir: 'out' }); P.ve = w.cut; }
          else { P.bright.push({ a: w.cut, b: w.w1, dir: 'in' }); P.vs = w.cut; }
        } else P.alpha.push({ a: w.w0, b: w.w1, dir: role });
        break;
      case 'crossfade':
        if (role === 'in') P.alpha.push({ a: w.w0, b: w.w1, dir: 'in' });
        else if (!w.paired) P.alpha.push({ a: w.w0, b: w.w1, dir: 'out' });
        break;
      case 'wipe':
        if (role === 'in') P.wipe = { a: w.w0, b: w.w1, mode: 'reveal' };
        else if (!w.paired) P.wipe = { a: w.w0, b: w.w1, mode: 'hide' };
        break;
      case 'zoom':
        if (role === 'out') { P.s = '1+0.6*' + ease(u); P.alpha.push({ a: w.w0, b: w.w1, dir: 'out' }); }
        else { P.s = '1.4-0.4*' + ease(u); P.alpha.push({ a: w.w0, b: w.w1, dir: 'in' }); }
        break;
      case 'spin': {
        if (w.paired) {
          const hu = role === 'out'
            ? 'clip((T-' + num(w.w0) + ')/' + num(half - w.w0) + ',0,1)'
            : 'clip((T-' + num(half) + ')/' + num(w.w1 - half) + ',0,1)';
          if (role === 'out') { P.s = '1-0.999*' + ease(hu); P.rot = 'PI*' + ease(hu); P.ve = half; }
          else { P.s = '0.001+0.999*' + ease(hu); P.rot = '-PI*(1-' + ease(hu) + ')'; P.vs = half; }
        } else if (role === 'out') { P.s = '1-0.999*' + ease(u); P.rot = 'PI*' + ease(u); }
        else { P.s = '0.001+0.999*' + ease(u); P.rot = '-PI*(1-' + ease(u) + ')'; }
        break;
      }
      case 'glitch':
        if (w.paired) {
          if (role === 'out') { P.glitch = { a: w.w0, b: half }; P.ve = half; }
          else { P.glitch = { a: half, b: w.w1 }; P.vs = half; }
        } else P.glitch = { a: w.w0, b: w.w1 };
        break;
      case 'whip':
        if (role === 'out') P.x = '-1.05*' + '(' + u + ')*(' + u + ')';
        else P.x = '1.05*(1-' + u + ')*(1-' + u + ')';
        if (!w.paired) P.alpha.push({ a: w.w0, b: w.w1, dir: role });
        P.blur = { a: w.w0 + (w.w1 - w.w0) * 0.15, b: w.w1 - (w.w1 - w.w0) * 0.15 };
        break;
    }
    return P;
  }

  /* ------------------------------------------------------------------ */
  /* Layer planning                                                      */
  /* ------------------------------------------------------------------ */
  /**
   * Builds the list of visual layers (bottom → top) intersecting [t0, t1].
   * Each layer describes WHEN and HOW a clip is drawn. Times are absolute timeline seconds.
   * Expressions use T = absolute timeline time.
   */
  function planVisual(p, t0, t1) {
    const layers = [];
    const nT = p.tracks.length;
    for (let ti = nT - 1; ti >= 0; ti--) {
      const tr = p.tracks[ti];
      if (tr.hidden) continue;
      const clips = p.clips.filter(c => c.trackId === tr.id && clipHasVideo(p, c)).sort((a, b) => a.start - b.start);
      for (const c of clips) {
        const L = planClip(p, c, ti);
        if (!L) continue;
        if (L.ve <= t0 + 1e-6 || L.vs >= t1 - 1e-6) continue;
        layers.push(L);
      }
    }
    return layers;
  }

  function planClip(p, c, ti) {
    const D = clipDuration(c);
    if (D <= 0) return null;
    const media = c.mediaId ? mediaById(p, c.mediaId) : null;
    const w = transWindows(p, c);
    let vs = c.start, ve = c.start + D;
    const L = {
      clip: c, media, track: ti, kind: c.kind, D,
      alpha: [], bright: [], sExpr: [], xExpr: [], yExpr: [], rotExpr: [],
      wipe: null, glitch: [], blur: [],
      opacity: c.opacity == null ? 1 : +c.opacity,
      colorEffects: (c.effects || []).filter(e => isColorEffect(e.type) && e.enabled !== false),
      speed: c.speed || 1
    };
    // user transform
    const ts = c.transform || {};
    if (ts.scale != null && +ts.scale !== 1) L.sExpr.push(num(+ts.scale));
    if (ts.x) L.xExpr.push(num(+ts.x));
    if (ts.y) L.yExpr.push(num(+ts.y));
    // motion effects (expressed in T relative to clip start)
    for (const e of (c.effects || [])) {
      if (!isMotionEffect(e.type) || e.enabled === false) continue;
      const m = motionExpr(e, D);
      if (!m) continue;
      const rel = (x) => subst(x, 'T', 'T-' + num(c.start));
      if (m.s !== '1') L.sExpr.push(rel(m.s));
      if (m.x !== '0') L.xExpr.push(rel(m.x));
      if (m.y !== '0') L.yExpr.push(rel(m.y));
    }
    // clip fade handles
    if (c.fadeIn > 0) L.alpha.push({ a: c.start, b: c.start + Math.min(c.fadeIn, D), dir: 'in' });
    if (c.fadeOut > 0) L.alpha.push({ a: c.start + D - Math.min(c.fadeOut, D), b: c.start + D, dir: 'out' });
    // transitions
    for (const [win, role] of [[w.tin, 'in'], [w.tout, 'out']]) {
      if (!win) continue;
      const P = transitionPiece(win, role);
      if (role === 'in' && win.paired) vs = Math.min(vs, win.w0);
      if (role === 'out' && win.paired) ve = Math.max(ve, win.w1);
      if (P.vs != null) vs = P.vs;
      if (P.ve != null) ve = P.ve;
      L.alpha.push(...P.alpha); L.bright.push(...P.bright);
      if (P.s) L.sExpr.push(P.s);
      if (P.x) L.xExpr.push(P.x);
      if (P.rot) L.rotExpr.push(P.rot);
      if (P.wipe) L.wipe = P.wipe;
      if (P.glitch) L.glitch.push(P.glitch);
      if (P.blur) L.blur.push(P.blur);
    }
    L.vs = vs; L.ve = ve;
    L.pre = c.start - vs;            // seconds shown before clip start (transition handle)
    L.post = ve - (c.start + D);     // seconds shown after clip end
    L.s = L.sExpr.length ? L.sExpr.map(e => '(' + e + ')').join('*') : '1';
    L.x = L.xExpr.length ? L.xExpr.map(e => '(' + e + ')').join('+') : '0';
    L.y = L.yExpr.length ? L.yExpr.map(e => '(' + e + ')').join('+') : '0';
    L.rot = L.rotExpr.length ? L.rotExpr.map(e => '(' + e + ')').join('+') : '0';
    return L;
  }

  /** source time (seconds in the media file) for absolute timeline time t */
  function sourceTime(c, t) { return c.in + (t - c.start) * (c.speed || 1); }

  function rampValue(r, t) {
    const k = r.b > r.a ? Math.min(1, Math.max(0, (t - r.a) / (r.b - r.a))) : (t >= r.b ? 1 : 0);
    return r.dir === 'in' ? k : 1 - k;
  }

  /** evaluates a layer at absolute time t (for preview) */
  function evalLayer(L, t) {
    let alpha = L.opacity, bright = 1;
    for (const r of L.alpha) alpha *= rampValue(r, t);
    for (const r of L.bright) bright *= rampValue(r, t);
    const s = compile(L.s)(t), x = compile(L.x)(t), y = compile(L.y)(t), rot = compile(L.rot)(t);
    let wipe = null;
    if (L.wipe) {
      const k = Math.min(1, Math.max(0, (t - L.wipe.a) / (L.wipe.b - L.wipe.a)));
      wipe = { k, mode: L.wipe.mode };
    }
    let glitch = 0;
    for (const g of L.glitch) if (t >= g.a && t <= g.b) glitch = Math.max(glitch, 1);
    let blur = 0;
    for (const b of L.blur) if (t >= b.a && t <= b.b) blur = 1;
    const jitter = glitch ? glitchJitter(t) : 0;
    return { alpha, bright, s, x: x + jitter, y, rot, wipe, glitch, blur };
  }
  // deterministic jitter used both in preview and export
  const GLITCH_JITTER = '0.035*sin(T*91)*sin(T*37)';
  function glitchJitter(t) { return compile(GLITCH_JITTER)(t); }

  /** audio plan: list of audio sources for the whole project */
  function planAudio(p) {
    const out = [];
    p.tracks.forEach((tr, ti) => {
      if (tr.muted) return;
      for (const c of p.clips) {
        if (c.trackId !== tr.id || !clipHasAudio(p, c)) continue;
        const D = clipDuration(c);
        if (D <= 0) continue;
        const w = transWindows(p, c);
        let as = c.start, ae = c.start + D;
        const fades = [];
        if (c.fadeIn > 0) fades.push({ a: c.start, b: c.start + Math.min(D, c.fadeIn), dir: 'in' });
        if (c.fadeOut > 0) fades.push({ a: c.start + D - Math.min(D, c.fadeOut), b: c.start + D, dir: 'out' });
        if (w.tin) {
          if (w.tin.type === 'fade' && w.tin.paired) fades.push({ a: w.tin.cut, b: w.tin.w1, dir: 'in' });
          else { if (w.tin.paired) as = w.tin.w0; fades.push({ a: w.tin.w0, b: w.tin.w1, dir: 'in' }); }
        }
        if (w.tout) {
          if (w.tout.type === 'fade' && w.tout.paired) fades.push({ a: w.tout.w0, b: w.tout.cut, dir: 'out' });
          else { if (w.tout.paired) ae = w.tout.w1; fades.push({ a: w.tout.w0, b: w.tout.w1, dir: 'out' }); }
        }
        const dyn = (c.effects || []).find(e => e.type === 'dynnorm' && e.enabled !== false);
        out.push({
          clip: c, media: mediaById(p, c.mediaId), track: ti, as, ae,
          pre: c.start - as, post: ae - (c.start + D),
          speed: c.speed || 1, gainDb: +(c.volume || 0), fades,
          dynnorm: dyn ? Object.assign(defaultParams('dynnorm'), dyn.params || {}).strength : 0
        });
      }
    });
    return out;
  }
  function audioGainAt(A, t) {
    let g = Math.pow(10, A.gainDb / 20);
    for (const r of A.fades) g *= rampValue(r, t);
    return g;
  }

  /** fit a source of size sw×sh into W×H; mode 'contain' | 'cover' | 'stretch' */
  function fitSize(sw, sh, W, H, mode) {
    if (!sw || !sh) return { w: W, h: H };
    if (mode === 'stretch') return { w: W, h: H };
    const k = mode === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    return { w: sw * k, h: sh * k };
  }

  /* ------------------------------------------------------------------ */
  /* Snap helper                                                         */
  /* ------------------------------------------------------------------ */
  function snapPoints(p, excludeIds, playhead) {
    const pts = [0];
    if (playhead != null) pts.push(playhead);
    for (const c of p.clips) {
      if (excludeIds && excludeIds.has(c.id)) continue;
      pts.push(c.start, clipEnd(c));
    }
    return pts;
  }

  function fmtTime(s, fps, withFrames) {
    if (!isFinite(s) || s < 0) s = 0;
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s) % 60;
    const pad = (n) => String(n).padStart(2, '0');
    let str = (h || withFrames ? pad(h) + ':' : '') + pad(m) + ':' + pad(sec);
    if (withFrames) str += ':' + pad(Math.floor((s - Math.floor(s)) * (fps || 30) + 1e-6));
    else str += '.' + String(Math.floor((s - Math.floor(s)) * 10));
    return str;
  }

  return {
    MAX_TRACKS, MIN_TRACKS, EPS, EXT, uid, typeFromPath,
    newProject, newTrack, ASPECTS, SIZE_PRESETS, outputSize,
    clipDuration, clipEnd, projectDuration, mediaById, trackIndex, clipHasVideo, clipHasAudio,
    EFFECTS, EFFECT_CATS, TRANSITIONS, defaultParams, colorOps, isColorEffect, isMotionEffect, motionExpr,
    neighbors, transWindows, maxTransDur, planVisual, planClip, planAudio, evalLayer, sourceTime, rampValue,
    audioGainAt, fitSize, snapPoints, fmtTime, compile, subst, num, hexToRgb, GLITCH_JITTER
  };
});
