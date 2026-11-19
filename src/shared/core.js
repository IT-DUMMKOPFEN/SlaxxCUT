/*
 * SlaxxCUT – shared core
 * Used by the renderer (preview) and the main process (export), so that the
 * preview and the exported file are computed from exactly the same rules.
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
  /** small stable string hash (cache keys) */
  function hash(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2246822519) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
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
      app: 'SlaxxCUT', version: 2,
      name: 'Unbenannt',
      settings: { aspect: '16:9', fps: 30 },
      media: [], tracks, clips: [], markers: [], noiseProfile: null
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
  /* Expressions (same strings evaluated by JS for the preview and by FFmpeg for the export) */
  /* ------------------------------------------------------------------ */
  const exprCache = new Map();
  function compile(expr) {
    let f = exprCache.get(expr);
    if (!f) {
      const js = expr.replace(/\bif\(/g, '_if(');
      // eslint-disable-next-line no-new-func
      f = new Function('T', 'u', 'const {sin,cos,abs,min,max,floor,PI,pow,sqrt,hypot}=Math;' +
        'const clip=(x,a,b)=>Math.min(b,Math.max(a,x));const _if=(c,a,b)=>c?a:b;const lt=(a,b)=>a<b?1:0;const gt=(a,b)=>a>b?1:0;' +
        'const gte=(a,b)=>a>=b?1:0;const lte=(a,b)=>a<=b?1:0;const between=(x,a,b)=>x>=a&&x<=b?1:0;const mod=(a,b)=>a-Math.floor(a/b)*b;' +
        'return (' + js + ');');
      exprCache.set(expr, f);
    }
    return f;
  }
  function num(n) { return (Math.round(n * 1e6) / 1e6).toString(); }
  function subst(expr, name, repl) { return expr.replace(new RegExp('\\b' + name + '\\b', 'g'), '(' + repl + ')'); }
  const ease = (x) => '(' + x + ')*(' + x + ')*(3-2*(' + x + '))';

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */
  // param types: range | select | color | check | file
  const DIR4 = ['lr', 'rl', 'tb', 'bt'];
  const EFFECTS = {
    // --- motion
    zoomIn: { cat: 'motion', icon: 'zoom-in', params: [{ k: 'amount', t: 'range', min: 0.05, max: 1, step: 0.05, def: 0.3 }] },
    zoomOut: { cat: 'motion', icon: 'zoom-out', params: [{ k: 'amount', t: 'range', min: 0.05, max: 1, step: 0.05, def: 0.3 }] },
    panScan: { cat: 'motion', icon: 'pan', params: [{ k: 'dir', t: 'select', opts: DIR4, def: 'lr' }, { k: 'zoom', t: 'range', min: 1.1, max: 2, step: 0.05, def: 1.3 }] },
    shake: { cat: 'motion', icon: 'shake', params: [{ k: 'strength', t: 'range', min: 0.002, max: 0.05, step: 0.001, def: 0.012 }, { k: 'speed', t: 'range', min: 1, max: 20, step: 0.5, def: 8 }] },
    parallax: { cat: 'motion', icon: 'parallax', params: [{ k: 'depth', t: 'range', min: 0.02, max: 0.4, step: 0.01, def: 0.12 }, { k: 'dir', t: 'select', opts: DIR4, def: 'lr' }] },
    pulse: { cat: 'motion', icon: 'pulse', params: [{ k: 'amount', t: 'range', min: 0.01, max: 0.3, step: 0.01, def: 0.06 }, { k: 'bpm', t: 'range', min: 40, max: 200, step: 1, def: 120 }] },
    spinSlow: { cat: 'motion', icon: 'spin', params: [{ k: 'angle', t: 'range', min: 1, max: 360, step: 1, def: 12 }, { k: 'rdir', t: 'select', opts: ['cw', 'ccw'], def: 'cw' }] },
    slowmo: { cat: 'motion', icon: 'slowmo', action: true, params: [] },
    timelapse: { cat: 'motion', icon: 'timelapse', action: true, params: [] },
    reverse: { cat: 'motion', icon: 'reverse', action: true, params: [] },
    freeze: { cat: 'motion', icon: 'freeze', action: true, params: [] },
    stabilize: { cat: 'motion', icon: 'stabilize', action: true, params: [] },
    // --- look
    bw: { cat: 'look', icon: 'bw', params: [{ k: 'strength', t: 'range', min: 0, max: 1, step: 0.05, def: 1 }] },
    sepia: { cat: 'look', icon: 'sepia', params: [{ k: 'strength', t: 'range', min: 0, max: 1, step: 0.05, def: 0.9 }] },
    vintage: { cat: 'look', icon: 'vintage', params: [{ k: 'strength', t: 'range', min: 0, max: 1, step: 0.05, def: 1 }] },
    film: { cat: 'look', icon: 'film', params: [{ k: 'bars', t: 'check', def: true }, { k: 'grain', t: 'range', min: 0, max: 20, step: 1, def: 6 }] },
    grading: {
      cat: 'look', icon: 'grading', params: [
        { k: 'brightness', t: 'range', min: -0.5, max: 0.5, step: 0.01, def: 0 },
        { k: 'contrast', t: 'range', min: 0.5, max: 2, step: 0.01, def: 1 },
        { k: 'saturation', t: 'range', min: 0, max: 2, step: 0.01, def: 1 },
        { k: 'temperature', t: 'range', min: -1, max: 1, step: 0.01, def: 0 },
        { k: 'tint', t: 'range', min: -1, max: 1, step: 0.01, def: 0 },
        { k: 'lut', t: 'file', def: '' }]
    },
    duotone: { cat: 'look', icon: 'duotone', params: [{ k: 'dark', t: 'color', def: '#0b1d3f' }, { k: 'light', t: 'color', def: '#7fc4ff' }] },
    hdr: { cat: 'look', icon: 'hdr', params: [{ k: 'strength', t: 'range', min: 0.2, max: 2, step: 0.1, def: 1 }] },
    invert: { cat: 'look', icon: 'invert', params: [] },
    hue: { cat: 'look', icon: 'hue', params: [{ k: 'deg', t: 'range', min: -180, max: 180, step: 1, def: 90 }] },
    poster: { cat: 'look', icon: 'poster', params: [{ k: 'levels', t: 'range', min: 2, max: 12, step: 1, def: 5 }, { k: 'saturation', t: 'range', min: 0.5, max: 2, step: 0.05, def: 1.3 }] },
    vhs: { cat: 'look', icon: 'vhs', params: [{ k: 'strength', t: 'range', min: 0.2, max: 1.5, step: 0.05, def: 1 }] },
    glow: { cat: 'look', icon: 'glow', params: [{ k: 'strength', t: 'range', min: 0.1, max: 1, step: 0.05, def: 0.6 }, { k: 'radius', t: 'range', min: 0.003, max: 0.05, step: 0.001, def: 0.015 }] },
    vignette: { cat: 'look', icon: 'vignette', params: [{ k: 'strength', t: 'range', min: 0.1, max: 1.5, step: 0.05, def: 0.8 }] },
    // --- picture
    blur: { cat: 'image', icon: 'blur', params: [{ k: 'amount', t: 'range', min: 0.001, max: 0.04, step: 0.001, def: 0.008 }] },
    sharpen: { cat: 'image', icon: 'sharpen', params: [{ k: 'amount', t: 'range', min: 0.1, max: 3, step: 0.1, def: 1 }] },
    mirror: { cat: 'image', icon: 'mirror', params: [{ k: 'axis', t: 'select', opts: ['h', 'v'], def: 'h' }] },
    rotate: { cat: 'image', icon: 'rotate', params: [{ k: 'angle', t: 'select', opts: [90, 180, 270], def: 90 }] },
    crop: {
      cat: 'image', icon: 'crop', params: [
        { k: 'left', t: 'range', min: 0, max: 0.45, step: 0.01, def: 0.1 }, { k: 'right', t: 'range', min: 0, max: 0.45, step: 0.01, def: 0.1 },
        { k: 'top', t: 'range', min: 0, max: 0.45, step: 0.01, def: 0 }, { k: 'bottom', t: 'range', min: 0, max: 0.45, step: 0.01, def: 0 }]
    },
    pixelate: {
      cat: 'image', icon: 'pixelate', params: [
        { k: 'size', t: 'range', min: 0.005, max: 0.1, step: 0.005, def: 0.03 },
        { k: 'area', t: 'check', def: false },
        { k: 'ax', t: 'range', min: 0, max: 1, step: 0.01, def: 0.35 }, { k: 'ay', t: 'range', min: 0, max: 1, step: 0.01, def: 0.25 },
        { k: 'aw', t: 'range', min: 0.02, max: 1, step: 0.01, def: 0.3 }, { k: 'ah', t: 'range', min: 0.02, max: 1, step: 0.01, def: 0.4 }]
    },
    chromakey: {
      cat: 'image', icon: 'chromakey', params: [
        { k: 'color', t: 'color', def: '#00ff00' },
        { k: 'similarity', t: 'range', min: 0.01, max: 0.8, step: 0.01, def: 0.3 },
        { k: 'blend', t: 'range', min: 0, max: 0.5, step: 0.01, def: 0.1 }]
    },
    pip: {
      cat: 'image', icon: 'pip', params: [
        { k: 'corner', t: 'select', opts: ['tr', 'tl', 'br', 'bl'], def: 'tr' },
        { k: 'size', t: 'range', min: 0.15, max: 0.7, step: 0.01, def: 0.33 },
        { k: 'border', t: 'range', min: 0, max: 0.03, step: 0.001, def: 0.006 },
        { k: 'color', t: 'color', def: '#ffffff' }]
    },
    // --- audio: filters
    highpass: { cat: 'afilter', icon: 'highpass', params: [{ k: 'freq', t: 'range', min: 20, max: 2000, step: 5, def: 80 }] },
    lowpass: { cat: 'afilter', icon: 'lowpass', params: [{ k: 'freq', t: 'range', min: 500, max: 20000, step: 50, def: 8000 }] },
    bandpass: { cat: 'afilter', icon: 'bandpass', params: [{ k: 'freq', t: 'range', min: 100, max: 8000, step: 10, def: 1000 }, { k: 'q', t: 'range', min: 0.3, max: 10, step: 0.1, def: 1 }] },
    eq3: { cat: 'afilter', icon: 'eq', params: [{ k: 'bass', t: 'range', min: -15, max: 15, step: 0.5, def: 0 }, { k: 'mid', t: 'range', min: -15, max: 15, step: 0.5, def: 0 }, { k: 'treble', t: 'range', min: -15, max: 15, step: 0.5, def: 0 }] },
    eq10: { cat: 'afilter', icon: 'eq10', params: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].map(f => ({ k: 'g' + f, t: 'range', min: -15, max: 15, step: 0.5, def: 0, label: (f >= 1000 ? (f / 1000) + 'k' : String(f)) + ' Hz' })) },
    dehum: { cat: 'afilter', icon: 'dehum', params: [{ k: 'freq', t: 'select', opts: [50, 60], def: 50 }, { k: 'harmonics', t: 'range', min: 1, max: 8, step: 1, def: 4 }] },
    denoise: { cat: 'afilter', icon: 'denoise', render: true, params: [{ k: 'mode', t: 'select', opts: ['auto', 'profile'], def: 'auto' }, { k: 'strength', t: 'range', min: 6, max: 40, step: 1, def: 15 }] },
    declick: { cat: 'afilter', icon: 'declick', render: true, params: [] },
    deesser: { cat: 'afilter', icon: 'deesser', render: true, params: [{ k: 'strength', t: 'range', min: 0, max: 1, step: 0.05, def: 0.5 }] },
    // --- audio: dynamics & space
    compressor: {
      cat: 'adyn', icon: 'compressor', params: [
        { k: 'threshold', t: 'range', min: -60, max: 0, step: 1, def: -20 }, { k: 'ratio', t: 'range', min: 1, max: 20, step: 0.5, def: 4 },
        { k: 'attack', t: 'range', min: 1, max: 200, step: 1, def: 10 }, { k: 'release', t: 'range', min: 10, max: 1000, step: 10, def: 200 },
        { k: 'makeup', t: 'range', min: 0, max: 24, step: 0.5, def: 0 }]
    },
    limiter: { cat: 'adyn', icon: 'limiter', params: [{ k: 'limit', t: 'range', min: -12, max: 0, step: 0.5, def: -1 }] },
    dynnorm: { cat: 'adyn', icon: 'normalize', params: [{ k: 'strength', t: 'range', min: 0.1, max: 1, step: 0.05, def: 0.6 }] },
    reverb: { cat: 'adyn', icon: 'reverb', params: [{ k: 'room', t: 'range', min: 0.2, max: 4, step: 0.1, def: 1.2 }, { k: 'mix', t: 'range', min: 0.05, max: 1, step: 0.05, def: 0.3 }] },
    echo: { cat: 'adyn', icon: 'echo', params: [{ k: 'delay', t: 'range', min: 0.05, max: 1.5, step: 0.01, def: 0.3 }, { k: 'feedback', t: 'range', min: 0.1, max: 0.8, step: 0.05, def: 0.4 }] },
    pitch: { cat: 'adyn', icon: 'pitch', render: true, params: [{ k: 'semitones', t: 'range', min: -12, max: 12, step: 1, def: 3 }] },
    // --- audio: channels
    mono: { cat: 'achan', icon: 'mono', params: [] },
    swap: { cat: 'achan', icon: 'swap', params: [] },
    balance: { cat: 'achan', icon: 'balance', params: [{ k: 'pan', t: 'range', min: -1, max: 1, step: 0.05, def: 0 }] },
    // --- audio: tools (actions)
    detach: { cat: 'atools', icon: 'detach', action: true, params: [] },
    louder: { cat: 'atools', icon: 'louder', action: true, params: [] },
    quieter: { cat: 'atools', icon: 'quieter', action: true, params: [] },
    match: { cat: 'atools', icon: 'match', action: true, params: [] },
    normalize: { cat: 'atools', icon: 'peak', action: true, params: [] },
    silence: { cat: 'atools', icon: 'silence', action: true, params: [] },
    // --- text
    text: { cat: 'text', icon: 'text', action: true, params: [] }
  };
  const EFFECT_CATS = ['motion', 'look', 'image', 'afilter', 'adyn', 'achan', 'atools', 'text'];
  const AUDIO_CATS = ['afilter', 'adyn', 'achan', 'atools'];

  const TRANSITIONS = {
    fade: { icon: 'fade' },
    flash: { icon: 'flash' },
    crossfade: { icon: 'crossfade' },
    wipe: { icon: 'wipe', dirs: ['lr', 'rl', 'tb', 'bt', 'tlbr', 'trbl', 'bltr', 'brtl'] },
    slide: { icon: 'slide', dirs: DIR4 },
    push: { icon: 'push', dirs: DIR4 },
    iris: { icon: 'iris', dirs: ['open', 'close'] },
    blinds: { icon: 'blinds', dirs: ['h', 'v'] },
    zoom: { icon: 'tzoom', dirs: ['in', 'out'] },
    spin: { icon: 'spin', dirs: ['cw', 'ccw'] },
    whip: { icon: 'whip', dirs: ['rl', 'lr', 'tb', 'bt'] },
    glitch: { icon: 'glitch' },
    pixel: { icon: 'pixelate' },
    blur: { icon: 'blur' }
  };
  function transDir(tr) { const d = TRANSITIONS[tr.type]; return d && d.dirs ? (d.dirs.includes(tr.dir) ? tr.dir : d.dirs[0]) : null; }

  function defaultParams(type) {
    const def = EFFECTS[type]; const o = {};
    if (!def) return o;
    for (const p of def.params) o[p.k] = p.def;
    return o;
  }
  function fxParams(e) { return Object.assign(defaultParams(e.type), e.params || {}); }

  const isAudioEffect = (type) => !!EFFECTS[type] && AUDIO_CATS.includes(EFFECTS[type].cat) && !EFFECTS[type].action;
  const isRenderAudioEffect = (type) => !!EFFECTS[type] && !!EFFECTS[type].render;
  const isMotionEffect = (type) => ['zoomIn', 'zoomOut', 'panScan', 'shake', 'parallax', 'pulse', 'spinSlow'].includes(type);
  const GEO = ['mirror', 'rotate', 'crop'];
  const isGeoEffect = (type) => GEO.includes(type);
  /** effects processed per pixel (look + picture, except geometry) */
  const isColorEffect = (type) => !!EFFECTS[type] && (EFFECTS[type].cat === 'look' || EFFECTS[type].cat === 'image') && !isGeoEffect(type);

  /* ---------- colour primitives (shared numbers for shader and ffmpeg) ---------- */
  const LUMA = [0.299, 0.587, 0.114];
  const SEPIA = [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131];
  const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function mix3(a, b, k) { return a.map((v, i) => v * (1 - k) + b[i] * k); }
  function mul3(a, b) {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  }
  function grayM() { return [LUMA[0], LUMA[1], LUMA[2], LUMA[0], LUMA[1], LUMA[2], LUMA[0], LUMA[1], LUMA[2]]; }
  function satM(s) { return mix3(grayM(), I3, s); }
  function hueM(deg) {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return [
      0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
  }
  function hexToRgb(h) {
    h = String(h || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  /** Converts one per-pixel effect into a list of primitive operations. */
  function colorOps(effect) {
    const p = fxParams(effect);
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
        const ops = [{ op: 'matrix', m: satM(0.85) }, { op: 'curve', c: [1.16, 1.08, 0.98], b: [0.0, 0.0, 0.02] }];
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
        return [{ op: 'sharpen', amount: 0.9 * k }, { op: 'matrix', m: satM(1 + 0.25 * k) }, { op: 'curve', c: [1 + 0.1 * k, 1 + 0.1 * k, 1 + 0.1 * k], b: [0, 0, 0] }];
      }
      case 'invert': return [{ op: 'curve', c: [-1, -1, -1], b: [0, 0, 0] }];
      case 'hue': return [{ op: 'matrix', m: hueM(+p.deg) }];
      case 'poster': return [{ op: 'matrix', m: satM(+p.saturation) }, { op: 'posterize', levels: Math.round(+p.levels) }];
      case 'vhs': {
        const k = +p.strength;
        return [
          { op: 'blur', s: 0.0012 * k },
          { op: 'matrix', m: satM(1 - 0.25 * k) },
          { op: 'curve', c: [1 - 0.1 * k, 1 - 0.1 * k, 1 - 0.1 * k], b: [0.04 * k, 0.03 * k, 0.05 * k] },
          { op: 'shift', s: 0.004 * k },
          { op: 'scan', a: Math.min(0.6, 0.28 * k) },
          { op: 'grain', n: 10 * k }
        ];
      }
      case 'glow': return [{ op: 'glow', k: +p.strength, r: +p.radius }];
      case 'vignette': return [{ op: 'vignette', a: Math.PI / 4 * +p.strength }];
      case 'blur': return [{ op: 'blur', s: +p.amount }];
      case 'sharpen': return [{ op: 'sharpen', amount: +p.amount }];
      case 'pixelate': return [{ op: 'pixel', s: +p.size, rect: p.area ? [+p.ax, +p.ay, +p.aw, +p.ah] : null }];
      case 'chromakey': return [{ op: 'key', color: hexToRgb(p.color), sim: +p.similarity, blend: +p.blend }];
      case 'pip': return +p.border > 0 ? [{ op: 'border', w: +p.border, color: hexToRgb(p.color) }] : [];
      default: return [];
    }
  }

  /** geometry effects → {crop:[l,t,r,b], flipH, flipV, rot} applied before scaling */
  function geoOf(effects) {
    const g = { crop: null, flipH: false, flipV: false, rot: 0 };
    for (const e of (effects || [])) {
      if (e.enabled === false || !isGeoEffect(e.type)) continue;
      const p = fxParams(e);
      if (e.type === 'crop') g.crop = [+p.left, +p.top, +p.right, +p.bottom];
      if (e.type === 'mirror') { if (p.axis === 'v') g.flipV = !g.flipV; else g.flipH = !g.flipH; }
      if (e.type === 'rotate') g.rot = (g.rot + (+p.angle)) % 360;
    }
    return g;
  }
  function geoSize(sw, sh, g) {
    let w = sw, h = sh;
    if (g.crop) { w = sw * (1 - g.crop[0] - g.crop[2]); h = sh * (1 - g.crop[1] - g.crop[3]); }
    if (g.rot === 90 || g.rot === 270) return { w: h, h: w };
    return { w, h };
  }

  /* ---------- motion effects → expressions in T (seconds since clip start) ---------- */
  function motionExpr(effect, D) {
    const p = fxParams(effect);
    const d = num(Math.max(D, 0.001));
    const prog = 'clip(T/' + d + ',0,1)';
    const dv = (dir) => ({ lr: ['1', '0'], rl: ['-1', '0'], tb: ['0', '1'], bt: ['0', '-1'] }[dir] || ['1', '0']);
    switch (effect.type) {
      case 'zoomIn': return { s: '1+' + num(+p.amount) + '*' + prog, x: '0', y: '0' };
      case 'zoomOut': return { s: '1+' + num(+p.amount) + '*(1-' + prog + ')', x: '0', y: '0' };
      case 'panScan': {
        const z = +p.zoom, m = num((z - 1) / 2), v = dv(p.dir);
        const pos = '(' + prog + '-0.5)*2';
        return { s: num(z), x: '-' + m + '*' + v[0] + '*' + pos, y: '-' + m + '*' + v[1] + '*' + pos };
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
        const dp = +p.depth, v = dv(p.dir);
        const pos = '(' + prog + '-0.5)';
        return { s: num(1 + dp * 1.05), x: num(dp) + '*' + v[0] + '*' + pos, y: num(dp) + '*' + v[1] + '*' + pos };
      }
      case 'pulse': return { s: '1+' + num(+p.amount) + '*abs(sin(PI*T*' + num(+p.bpm / 60) + '))', x: '0', y: '0' };
      case 'spinSlow': {
        const a = (+p.angle) * Math.PI / 180 * (p.rdir === 'ccw' ? -1 : 1);
        return { s: num(1 + Math.min(0.45, Math.abs(Math.sin(Math.min(Math.abs(a), Math.PI / 2))) * 0.45)), x: '0', y: '0', rot: num(a) + '*' + prog };
      }
      default: return null;
    }
  }

  /* ---------- keyframes ---------- */
  const KEY_PROPS = ['scale', 'x', 'y', 'rot', 'opacity', 'volume'];
  function keyList(c, prop) {
    const l = c.keys && c.keys[prop];
    return Array.isArray(l) && l.length ? l.slice().sort((a, b) => a.t - b.t) : null;
  }
  /** piecewise smooth interpolation, expression in absolute T */
  function keyExpr(c, prop) {
    const l = keyList(c, prop);
    if (!l) return null;
    const tau = '(T-' + num(c.start) + ')';
    if (l.length === 1) return num(l[0].v);
    let e = num(l[l.length - 1].v);
    for (let i = l.length - 2; i >= 0; i--) {
      const a = l[i], b = l[i + 1];
      const span = Math.max(1e-4, b.t - a.t);
      const k = 'clip((' + tau + '-' + num(a.t) + ')/' + num(span) + ',0,1)';
      const seg = num(a.v) + '+' + num(b.v - a.v) + '*' + ease(k);
      e = 'if(lt(' + tau + ',' + num(b.t) + '),' + seg + ',' + e + ')';
    }
    return 'if(lt(' + tau + ',' + num(l[0].t) + '),' + num(l[0].v) + ',' + e + ')';
  }
  function keyValueAt(c, prop, tLocal) {
    const l = keyList(c, prop);
    if (!l) return null;
    if (tLocal <= l[0].t) return l[0].v;
    for (let i = 0; i < l.length - 1; i++) {
      if (tLocal < l[i + 1].t) {
        const k = Math.min(1, Math.max(0, (tLocal - l[i].t) / Math.max(1e-4, l[i + 1].t - l[i].t)));
        return l[i].v + (l[i + 1].v - l[i].v) * k * k * (3 - 2 * k);
      }
    }
    return l[l.length - 1].v;
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

  function transWindows(p, c) {
    const nb = neighbors(p, c);
    const res = { tin: null, tout: null };
    if (c.transIn && c.transIn.type) {
      const d = Math.min(c.transIn.d || 1, maxTransDur(c));
      const paired = !!(nb.prev && nb.prev.transOut && nb.prev.transOut.type === c.transIn.type);
      const dir = transDir(c.transIn);
      if (paired) {
        const dd = Math.min(d, maxTransDur(nb.prev));
        res.tin = { type: c.transIn.type, dir, d: dd, paired, cut: c.start, w0: c.start - dd / 2, w1: c.start + dd / 2 };
      } else res.tin = { type: c.transIn.type, dir, d, paired, cut: c.start, w0: c.start, w1: c.start + d };
    }
    if (c.transOut && c.transOut.type) {
      const e = clipEnd(c);
      const d = Math.min(c.transOut.d || 1, maxTransDur(c));
      const paired = !!(nb.next && nb.next.transIn && nb.next.transIn.type === c.transOut.type);
      // paired: the incoming clip's direction is used for both sides
      const dir = paired ? transDir(nb.next.transIn) : transDir(c.transOut);
      if (paired) {
        const dd = Math.min(d, maxTransDur(nb.next));
        res.tout = { type: c.transOut.type, dir, d: dd, paired, cut: e, w0: e - dd / 2, w1: e + dd / 2 };
      } else res.tout = { type: c.transOut.type, dir, d, paired, cut: e, w0: e - d, w1: e };
    }
    return res;
  }

  const DIRV = { lr: [1, 0], rl: [-1, 0], tb: [0, 1], bt: [0, -1] };
  /** visual pieces caused by a transition window for a role ('in' | 'out') */
  function transitionPiece(w, role) {
    const P = { alpha: [], bright: [], white: [], s: null, x: null, y: null, rot: null, mask: null, glitch: null, blur: null, tblur: [], tpix: [], vs: null, ve: null };
    const u = 'clip((T-' + num(w.w0) + ')/' + num(w.w1 - w.w0) + ',0,1)';
    const half = (w.w0 + w.w1) / 2;
    const steps = (a, b, levels, rising) => {
      const n = levels.length, out = [];
      for (let i = 0; i < n; i++) out.push({ a: a + (b - a) * i / n, b: a + (b - a) * (i + 1) / n, level: levels[rising ? i : n - 1 - i] });
      return out;
    };
    switch (w.type) {
      case 'fade':
      case 'flash': {
        const list = w.type === 'fade' ? P.bright : P.white;
        if (w.paired) {
          if (role === 'out') { list.push({ a: w.w0, b: w.cut, dir: 'out' }); P.ve = w.cut; }
          else { list.push({ a: w.cut, b: w.w1, dir: 'in' }); P.vs = w.cut; }
        } else if (w.type === 'fade') P.alpha.push({ a: w.w0, b: w.w1, dir: role });
        else list.push({ a: w.w0, b: w.w1, dir: role });
        break;
      }
      case 'crossfade':
        if (role === 'in') P.alpha.push({ a: w.w0, b: w.w1, dir: 'in' });
        else if (!w.paired) P.alpha.push({ a: w.w0, b: w.w1, dir: 'out' });
        break;
      case 'wipe':
      case 'iris':
      case 'blinds': {
        const kind = w.type === 'wipe' ? 'linear' : w.type;
        if (role === 'in') P.mask = { kind, dir: w.dir, a: w.w0, b: w.w1, mode: 'reveal' };
        else if (!w.paired) P.mask = { kind, dir: w.type === 'iris' ? (w.dir === 'open' ? 'close' : 'open') : w.dir, a: w.w0, b: w.w1, mode: 'hide' };
        break;
      }
      case 'slide':
      case 'push': {
        const v = DIRV[w.dir] || DIRV.lr;
        if (role === 'in') {
          const e = '(1-' + ease(u) + ')';
          if (v[0]) P.x = num(-v[0]) + '*' + e; else P.y = num(-v[1]) + '*' + e;
        } else if (w.type === 'push' || !w.paired) {
          const e = ease(u);
          if (v[0]) P.x = num(v[0]) + '*' + e; else P.y = num(v[1]) + '*' + e;
        }
        break;
      }
      case 'zoom':
        if (w.dir === 'out') {
          if (role === 'out') { P.s = '1-0.4*' + ease(u); P.alpha.push({ a: w.w0, b: w.w1, dir: 'out' }); }
          else { P.s = '0.6+0.4*' + ease(u); P.alpha.push({ a: w.w0, b: w.w1, dir: 'in' }); }
        } else {
          if (role === 'out') { P.s = '1+0.6*' + ease(u); P.alpha.push({ a: w.w0, b: w.w1, dir: 'out' }); }
          else { P.s = '1.4-0.4*' + ease(u); P.alpha.push({ a: w.w0, b: w.w1, dir: 'in' }); }
        }
        break;
      case 'spin': {
        const sg = w.dir === 'ccw' ? '-' : '';
        const nsg = w.dir === 'ccw' ? '' : '-';
        if (w.paired) {
          const hu = role === 'out' ? 'clip((T-' + num(w.w0) + ')/' + num(half - w.w0) + ',0,1)' : 'clip((T-' + num(half) + ')/' + num(w.w1 - half) + ',0,1)';
          if (role === 'out') { P.s = '1-0.999*' + ease(hu); P.rot = sg + 'PI*' + ease(hu); P.ve = half; }
          else { P.s = '0.001+0.999*' + ease(hu); P.rot = nsg + 'PI*(1-' + ease(hu) + ')'; P.vs = half; }
        } else if (role === 'out') { P.s = '1-0.999*' + ease(u); P.rot = sg + 'PI*' + ease(u); }
        else { P.s = '0.001+0.999*' + ease(u); P.rot = nsg + 'PI*(1-' + ease(u) + ')'; }
        break;
      }
      case 'glitch':
        if (w.paired) {
          if (role === 'out') { P.glitch = { a: w.w0, b: half }; P.ve = half; }
          else { P.glitch = { a: half, b: w.w1 }; P.vs = half; }
        } else P.glitch = { a: w.w0, b: w.w1 };
        break;
      case 'whip': {
        const v = DIRV[w.dir] || DIRV.rl;
        if (role === 'out') { const e = '(' + u + ')*(' + u + ')'; if (v[0]) P.x = num(1.05 * v[0]) + '*' + e; else P.y = num(1.05 * v[1]) + '*' + e; }
        else { const e = '(1-' + u + ')*(1-' + u + ')'; if (v[0]) P.x = num(-1.05 * v[0]) + '*' + e; else P.y = num(-1.05 * v[1]) + '*' + e; }
        if (!w.paired) P.alpha.push({ a: w.w0, b: w.w1, dir: role });
        P.blur = { a: w.w0 + (w.w1 - w.w0) * 0.15, b: w.w1 - (w.w1 - w.w0) * 0.15, vertical: !v[0] };
        break;
      }
      case 'pixel':
        P.tpix = steps(w.w0, w.w1, [0.008, 0.018, 0.035, 0.06], role === 'out');
        if (role === 'in') P.alpha.push({ a: w.w0, b: w.w1, dir: 'in' });
        else if (!w.paired) P.alpha.push({ a: w.w0, b: w.w1, dir: 'out' });
        break;
      case 'blur':
        P.tblur = steps(w.w0, w.w1, [0.003, 0.008, 0.016, 0.03], role === 'out');
        if (role === 'in') P.alpha.push({ a: w.w0, b: w.w1, dir: 'in' });
        else if (!w.paired) P.alpha.push({ a: w.w0, b: w.w1, dir: 'out' });
        break;
    }
    return P;
  }
  /** mask coordinate s in [0,1]; expression uses X,Y,W,H (pixels of the layer) */
  function maskS(kind, dir) {
    if (kind === 'iris') return dir === 'close' ? '(1-hypot(X/W-0.5,Y/H-0.5)/0.70711)' : '(hypot(X/W-0.5,Y/H-0.5)/0.70711)';
    if (kind === 'blinds') return dir === 'v' ? '(X/W*8-floor(X/W*8))' : '(Y/H*8-floor(Y/H*8))';
    return ({
      lr: '(X/W)', rl: '(1-X/W)', tb: '(Y/H)', bt: '(1-Y/H)',
      tlbr: '((X/W+Y/H)/2)', trbl: '((1-X/W+Y/H)/2)', bltr: '((X/W+1-Y/H)/2)', brtl: '((2-X/W-Y/H)/2)'
    })[dir] || '(X/W)';
  }
  const MASK_EDGE = 0.04;
  function maskCodes(kind, dir) {
    const kinds = { linear: 1, iris: 2, blinds: 3 };
    const dirs = { lr: 0, rl: 1, tb: 2, bt: 3, tlbr: 4, trbl: 5, bltr: 6, brtl: 7, open: 0, close: 1, h: 0, v: 1 };
    return { kind: kinds[kind] || 0, dir: dirs[dir] || 0 };
  }

  /* ------------------------------------------------------------------ */
  /* Text templates & animations                                         */
  /* ------------------------------------------------------------------ */
  const TEXT_TEMPLATES = ['free', 'lower', 'bar', 'box', 'badge', 'ticker', 'credits'];
  const TEXT_ANIMS = ['none', 'fade', 'slideLeft', 'slideRight', 'slideUp', 'pop'];
  function textScroll(c) { const t = c.text && c.text.template; return t === 'ticker' || t === 'credits' ? t : null; }

  /* ------------------------------------------------------------------ */
  /* Layer planning                                                      */
  /* ------------------------------------------------------------------ */
  function planVisual(p, t0, t1) {
    const layers = [];
    for (let ti = p.tracks.length - 1; ti >= 0; ti--) {
      const tr = p.tracks[ti];
      if (tr.hidden) continue;
      const clips = p.clips.filter(c => c.trackId === tr.id && clipHasVideo(p, c)).sort((a, b) => a.start - b.start);
      for (const c of clips) {
        for (const L of planClipLayers(p, c, ti)) {
          if (L.ve <= t0 + 1e-6 || L.vs >= t1 - 1e-6) continue;
          layers.push(L);
        }
      }
    }
    return layers;
  }

  function planClipLayers(p, c, ti) {
    const L = planClip(p, c, ti);
    if (!L) return [];
    const scroll = c.kind === 'text' ? textScroll(c) : null;
    if (!scroll) return [L];
    // ticker / credits: optional static background + moving strip
    const m = (c.text && c.text.measure) || { w: 1, h: 0.1 };
    const out = [];
    if (c.text.bg && c.text.bg.type && c.text.bg.type !== 'none') out.push(Object.assign({}, L, { part: 'bg' }));
    const S = Object.assign({}, L, { part: 'strip', native: { w: m.w, h: m.h } });
    const tau = '(T-' + num(c.start) + ')';
    if (scroll === 'ticker') {
      const v = Math.max(0.01, +(c.text.speed || 0.15));
      const period = (1 + m.w) / v;
      const xs = num(0.5 + m.w / 2) + '-' + num(v) + '*mod(' + tau + ',' + num(period) + ')';
      S.x = '(' + L.x + ')+(' + xs + ')';
      S.y = '(' + L.y + ')+' + num((c.text.y != null ? c.text.y : 0.9) - 0.5);
    } else {
      const ys = num(0.5 + m.h / 2) + '-' + num(1 + m.h) + '*clip(' + tau + '/' + num(Math.max(0.1, L.D)) + ',0,1)';
      S.y = '(' + L.y + ')+(' + ys + ')';
    }
    out.push(S);
    return out;
  }

  function planClip(p, c, ti) {
    const D = clipDuration(c);
    if (D <= 0) return null;
    const media = c.mediaId ? mediaById(p, c.mediaId) : null;
    const w = transWindows(p, c);
    let vs = c.start, ve = c.start + D;
    const L = {
      clip: c, media, track: ti, kind: c.kind, D, part: null, native: null,
      alpha: [], bright: [], white: [], sExpr: [], xExpr: [], yExpr: [], rotExpr: [],
      mask: null, glitch: [], blur: [], tblur: [], tpix: [],
      opacity: c.opacity == null ? 1 : +c.opacity, opacityExpr: null,
      colorEffects: (c.effects || []).filter(e => isColorEffect(e.type) && e.enabled !== false),
      geo: geoOf(c.effects),
      speed: c.speed || 1
    };
    const ts = c.transform || {};
    // keyframes override static values
    const kS = keyExpr(c, 'scale'), kX = keyExpr(c, 'x'), kY = keyExpr(c, 'y'), kR = keyExpr(c, 'rot'), kO = keyExpr(c, 'opacity');
    if (kS) L.sExpr.push(kS); else if (ts.scale != null && +ts.scale !== 1) L.sExpr.push(num(+ts.scale));
    if (kX) L.xExpr.push(kX); else if (ts.x) L.xExpr.push(num(+ts.x));
    if (kY) L.yExpr.push(kY); else if (ts.y) L.yExpr.push(num(+ts.y));
    if (kR) L.rotExpr.push('(' + kR + ')*PI/180'); else if (ts.rot) L.rotExpr.push(num(+ts.rot * Math.PI / 180));
    if (kO) L.opacityExpr = 'clip(' + kO + ',0,1)';
    // picture in picture preset
    const pip = (c.effects || []).find(e => e.type === 'pip' && e.enabled !== false);
    if (pip) {
      const q = fxParams(pip);
      const sz = +q.size, mg = 0.03, off = 0.5 - sz / 2 - mg;
      L.sExpr.push(num(sz));
      L.xExpr.push(num(q.corner === 'tl' || q.corner === 'bl' ? -off : off));
      L.yExpr.push(num(q.corner === 'tl' || q.corner === 'tr' ? -off : off));
    }
    // motion effects
    for (const e of (c.effects || [])) {
      if (!isMotionEffect(e.type) || e.enabled === false) continue;
      const m = motionExpr(e, D);
      if (!m) continue;
      const rel = (x) => subst(x, 'T', 'T-' + num(c.start));
      if (m.s !== '1') L.sExpr.push(rel(m.s));
      if (m.x !== '0') L.xExpr.push(rel(m.x));
      if (m.y !== '0') L.yExpr.push(rel(m.y));
      if (m.rot) L.rotExpr.push(rel(m.rot));
    }
    // text animations
    if (c.kind === 'text' && c.text && c.text.anim) {
      const an = c.text.anim, ad = Math.min(+(an.d || 0.6), D / 2);
      for (const [kind, role] of [[an.in, 'in'], [an.out, 'out']]) {
        if (!kind || kind === 'none' || ad <= 0) continue;
        const a = role === 'in' ? c.start : c.start + D - ad, b = a + ad;
        const uu = 'clip((T-' + num(a) + ')/' + num(ad) + ',0,1)';
        const k = role === 'in' ? '(1-' + ease(uu) + ')' : ease(uu);   // 1 = fully away
        L.alpha.push({ a, b, dir: role });
        if (kind === 'slideLeft') L.xExpr.push('-0.3*' + k);
        if (kind === 'slideRight') L.xExpr.push('0.3*' + k);
        if (kind === 'slideUp') L.yExpr.push('0.2*' + k);
        if (kind === 'pop') L.sExpr.push('1-0.4*' + k);
      }
    }
    // clip fade handles
    if (c.fadeIn > 0) L.alpha.push({ a: c.start, b: c.start + Math.min(c.fadeIn, D), dir: 'in' });
    if (c.fadeOut > 0) L.alpha.push({ a: c.start + D - Math.min(c.fadeOut, D), b: c.start + D, dir: 'out' });
    // transitions
    for (const [win, role] of [[w.tin, 'in'], [w.tout, 'out']]) {
      if (!win) continue;
      const P = transitionPiece(win, role);
      const cutsAtCenter = win.type === 'fade' || win.type === 'flash';
      if (role === 'in' && win.paired && !cutsAtCenter) vs = Math.min(vs, win.w0);
      if (role === 'out' && win.paired && !cutsAtCenter) ve = Math.max(ve, win.w1);
      if (P.vs != null) vs = P.vs;
      if (P.ve != null) ve = P.ve;
      L.alpha.push(...P.alpha); L.bright.push(...P.bright); L.white.push(...P.white);
      if (P.s) L.sExpr.push(P.s);
      if (P.x) L.xExpr.push(P.x);
      if (P.y) L.yExpr.push(P.y);
      if (P.rot) L.rotExpr.push(P.rot);
      if (P.mask) L.mask = P.mask;
      if (P.glitch) L.glitch.push(P.glitch);
      if (P.blur) L.blur.push(P.blur);
      L.tblur.push(...P.tblur); L.tpix.push(...P.tpix);
    }
    L.vs = vs; L.ve = ve;
    L.pre = c.start - vs;
    L.post = ve - (c.start + D);
    L.s = L.sExpr.length ? L.sExpr.map(e => '(' + e + ')').join('*') : '1';
    L.x = L.xExpr.length ? L.xExpr.map(e => '(' + e + ')').join('+') : '0';
    L.y = L.yExpr.length ? L.yExpr.map(e => '(' + e + ')').join('+') : '0';
    L.rot = L.rotExpr.length ? L.rotExpr.map(e => '(' + e + ')').join('+') : '0';
    return L;
  }

  function sourceTime(c, t) { return c.in + (t - c.start) * (c.speed || 1); }

  function rampValue(r, t) {
    const k = r.b > r.a ? Math.min(1, Math.max(0, (t - r.a) / (r.b - r.a))) : (t >= r.b ? 1 : 0);
    return r.dir === 'in' ? k : 1 - k;
  }
  const stepAt = (list, t) => { for (const s of list) if (t >= s.a && t < s.b) return s.level; return 0; };

  /** evaluates a layer at absolute time t (preview) */
  function evalLayer(L, t) {
    let alpha = L.opacityExpr ? compile(L.opacityExpr)(t) : L.opacity, bright = 1, wk = 1;
    for (const r of L.alpha) alpha *= rampValue(r, t);
    for (const r of L.bright) bright *= rampValue(r, t);
    for (const r of L.white) wk *= rampValue(r, t);
    const s = compile(L.s)(t), x = compile(L.x)(t), y = compile(L.y)(t), rot = compile(L.rot)(t);
    let mask = null;
    if (L.mask) mask = Object.assign({}, L.mask, { k: Math.min(1, Math.max(0, (t - L.mask.a) / (L.mask.b - L.mask.a))) });
    let glitch = 0;
    for (const g of L.glitch) if (t >= g.a && t <= g.b) glitch = 1;
    let blur = 0, blurV = false;
    for (const b of L.blur) if (t >= b.a && t <= b.b) { blur = 1; blurV = !!b.vertical; }
    const jitter = glitch ? glitchJitter(t) : 0;
    return { alpha, bright, white: 1 - wk, s, x: x + jitter, y, rot, mask, glitch, blur, blurV, tblur: stepAt(L.tblur, t), tpix: stepAt(L.tpix, t) };
  }
  const GLITCH_JITTER = '0.035*sin(T*91)*sin(T*37)';
  function glitchJitter(t) { return compile(GLITCH_JITTER)(t); }

  /* ------------------------------------------------------------------ */
  /* Audio                                                               */
  /* ------------------------------------------------------------------ */
  /** deterministic impulse responses for reverb / echo (dry signal included at t=0) */
  function impulseResponse(effect, rate) {
    const p = fxParams(effect);
    if (effect.type === 'echo') {
      const d = +p.delay, g = +p.feedback;
      const len = Math.ceil(rate * (d * 4 + 0.05));
      const L = new Float32Array(len), R = new Float32Array(len);
      L[0] = R[0] = 1;
      for (let k = 1; k <= 4; k++) { const i = Math.round(rate * d * k); if (i < len) { L[i] = R[i] = Math.pow(g, k); } }
      return { L, R };
    }
    const sec = +p.room, mix = +p.mix;
    const len = Math.ceil(rate * sec);
    const L = new Float32Array(len), R = new Float32Array(len);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1; };
    const norm = mix * 0.6 / Math.sqrt(rate * sec / 6);
    for (let i = 1; i < len; i++) {
      const env = Math.exp(-6.9 * i / len);
      L[i] = rnd() * env * norm; R[i] = rnd() * env * norm;
    }
    L[0] = R[0] = 1 - mix * 0.5;
    return { L, R };
  }

  /** FFmpeg filters for "live" audio effects (also previewed with WebAudio).
   *  Items: {f: 'filters'} or {ir: effect} (convolution with an impulse response) */
  function audioLiveChain(effects) {
    const out = [];
    for (const e of (effects || [])) {
      if (e.enabled === false || !isAudioEffect(e.type) || isRenderAudioEffect(e.type)) continue;
      const p = fxParams(e);
      switch (e.type) {
        case 'highpass': out.push({ f: `highpass=f=${num(+p.freq)}:p=2:t=q:w=0.707` }); break;
        case 'lowpass': out.push({ f: `lowpass=f=${num(+p.freq)}:p=2:t=q:w=0.707` }); break;
        case 'bandpass': out.push({ f: `highpass=f=${num(+p.freq / Math.pow(2, 0.5 / +p.q))}:p=2:t=q:w=0.707,lowpass=f=${num(+p.freq * Math.pow(2, 0.5 / +p.q))}:p=2:t=q:w=0.707` }); break;
        case 'eq3': out.push({ f: `lowshelf=f=100:g=${num(+p.bass)}:t=s:w=1,equalizer=f=1000:t=q:w=1:g=${num(+p.mid)},highshelf=f=4000:g=${num(+p.treble)}:t=s:w=1` }); break;
        case 'eq10': {
          const parts = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000].filter(f => +p['g' + f]).map(f => `equalizer=f=${f}:t=q:w=1.41:g=${num(+p['g' + f])}`);
          if (parts.length) out.push({ f: parts.join(',') });
          break;
        }
        case 'dehum': {
          const parts = [];
          for (let h = 1; h <= +p.harmonics; h++) parts.push(`bandreject=f=${(+p.freq) * h}:t=q:w=30`);
          out.push({ f: parts.join(',') });
          break;
        }
        case 'compressor': out.push({ f: `acompressor=threshold=${num(Math.pow(10, +p.threshold / 20))}:ratio=${num(+p.ratio)}:attack=${num(+p.attack)}:release=${num(+p.release)}:makeup=${num(Math.pow(10, +p.makeup / 20))}` }); break;
        case 'limiter': out.push({ f: `alimiter=limit=${num(Math.pow(10, +p.limit / 20))}:attack=5:release=50:level=disabled` }); break;
        case 'dynnorm': out.push({ f: `dynaudnorm=f=200:g=15:m=${num(1 + 19 * +p.strength)}:p=0.95` }); break;
        case 'reverb': case 'echo': out.push({ ir: e }); break;
        case 'mono': out.push({ f: 'pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1' }); break;
        case 'swap': out.push({ f: 'pan=stereo|c0=c1|c1=c0' }); break;
        case 'balance': {
          const b = +p.pan, gl = b > 0 ? 1 - b : 1, gr = b < 0 ? 1 + b : 1;
          out.push({ f: `pan=stereo|c0=${num(gl)}*c0|c1=${num(gr)}*c1` });
          break;
        }
      }
    }
    return out;
  }
  /** FFmpeg filters for effects that are pre-rendered (denoise, declick, de-esser, pitch) */
  function audioRenderChain(effects, noiseLevel) {
    const f = [];
    for (const e of (effects || [])) {
      if (e.enabled === false || !isRenderAudioEffect(e.type)) continue;
      const p = fxParams(e);
      switch (e.type) {
        case 'denoise': {
          const nf = p.mode === 'profile' && noiseLevel != null ? Math.max(-80, Math.min(-20, noiseLevel)) : -30;
          f.push(`afftdn=nr=${num(+p.strength)}:nf=${num(nf)}:tn=1`);
          break;
        }
        case 'declick': f.push('adeclick'); break;
        case 'deesser': f.push(`deesser=i=${num(+p.strength)}`); break;
        case 'pitch': {
          const r = Math.pow(2, +p.semitones / 12);
          f.push(`asetrate=${Math.round(48000 * r)}`, 'aresample=48000', ...atempoChain(1 / r));
          break;
        }
      }
    }
    return f;
  }
  function atempoChain(sp) {
    const f = [];
    let s = sp;
    while (s > 2) { f.push('atempo=2'); s /= 2; }
    while (s < 0.5) { f.push('atempo=0.5'); s /= 0.5; }
    if (Math.abs(s - 1) > 1e-6) f.push('atempo=' + num(s));
    return f;
  }
  /** pre-render job for a clip (or null) */
  function audioRenderJob(p, c) {
    const fx = (c.effects || []).filter(e => e.enabled !== false && isRenderAudioEffect(e.type));
    if (!fx.length) return null;
    const m = mediaById(p, c.mediaId);
    if (!m || !m.hasAudio) return null;
    const start = Math.max(0, c.in - 5), end = Math.min(m.duration || c.out + 5, c.out + 5);
    const usesProfile = fx.some(e => e.type === 'denoise' && fxParams(e).mode === 'profile');
    const noiseLevel = usesProfile && p.noiseProfile ? p.noiseProfile.level : null;
    const chain = audioRenderChain(fx, noiseLevel);
    const key = hash([m.path, num(start), num(end), chain.join(',')].join('|'));
    return { key, path: m.path, start, end, chain };
  }

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
          if ((w.tin.type === 'fade' || w.tin.type === 'flash') && w.tin.paired) fades.push({ a: w.tin.cut, b: w.tin.w1, dir: 'in' });
          else { if (w.tin.paired) as = w.tin.w0; fades.push({ a: w.tin.w0, b: w.tin.w1, dir: 'in' }); }
        }
        if (w.tout) {
          if ((w.tout.type === 'fade' || w.tout.type === 'flash') && w.tout.paired) fades.push({ a: w.tout.w0, b: w.tout.cut, dir: 'out' });
          else { if (w.tout.paired) ae = w.tout.w1; fades.push({ a: w.tout.w0, b: w.tout.w1, dir: 'out' }); }
        }
        out.push({
          clip: c, media: mediaById(p, c.mediaId), track: ti, as, ae,
          pre: c.start - as, post: ae - (c.start + D),
          speed: c.speed || 1, gainDb: +(c.volume || 0), gainExpr: keyExpr(c, 'volume'), fades,
          live: audioLiveChain(c.effects), render: audioRenderJob(p, c),
          liveEffects: (c.effects || []).filter(e => e.enabled !== false && isAudioEffect(e.type) && !isRenderAudioEffect(e.type))
        });
      }
    });
    return out;
  }
  function audioGainAt(A, t) {
    const db = A.gainExpr ? compile(A.gainExpr)(t) : A.gainDb;
    let g = Math.pow(10, db / 20);
    for (const r of A.fades) g *= rampValue(r, t);
    return g;
  }

  function fitSize(sw, sh, W, H, mode) {
    if (!sw || !sh) return { w: W, h: H };
    if (mode === 'stretch') return { w: W, h: H };
    const k = mode === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
    return { w: sw * k, h: sh * k };
  }
  /** fit size of a layer for output W×H (handles geometry, text and strips) */
  function layerFit(L, sw, sh, W, H) {
    if (L.native) return { w: L.native.w * W, h: L.native.h * H };
    if (L.kind === 'text') return { w: W, h: H };
    const g = geoSize(sw, sh, L.geo || { rot: 0 });
    return fitSize(g.w, g.h, W, H, L.clip.fit || 'contain');
  }

  /** a copy of the project limited to [a, b], shifted to start at 0 */
  function sliceProject(p, a, b) {
    const q = JSON.parse(JSON.stringify(p));
    q.clips = [];
    for (const c0 of p.clips) {
      const s = c0.start, e = clipEnd(c0);
      if (e <= a + EPS || s >= b - EPS) continue;
      const c = JSON.parse(JSON.stringify(c0));
      const sp = c.speed || 1;
      let shift = 0;
      if (s < a) {
        shift = a - s;
        if (c.kind === 'video' || c.kind === 'audio') c.in += shift * sp; else c.out -= shift;
        c.start = a; c.transIn = null; c.fadeIn = 0;
      }
      if (core_end(c) > b) { c.out = c.in + (b - c.start) * sp; c.transOut = null; c.fadeOut = 0; }
      c.start -= a;
      if (c.keys) for (const k of Object.keys(c.keys)) c.keys[k] = (c.keys[k] || []).map(x => ({ t: x.t - shift, v: x.v }));
      q.clips.push(c);
    }
    q.markers = (p.markers || []).filter(m => m.t >= a && m.t <= b).map(m => Object.assign({}, m, { t: m.t - a }));
    return q;
  }
  function core_end(c) { return clipEnd(c); }

  function snapPoints(p, excludeIds, playhead) {
    const pts = [0];
    if (playhead != null) pts.push(playhead);
    for (const c of p.clips) {
      if (excludeIds && excludeIds.has(c.id)) continue;
      pts.push(c.start, clipEnd(c));
    }
    for (const m of (p.markers || [])) pts.push(m.t);
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
    MAX_TRACKS, MIN_TRACKS, EPS, EXT, uid, hash, typeFromPath,
    newProject, newTrack, ASPECTS, SIZE_PRESETS, outputSize,
    clipDuration, clipEnd, projectDuration, mediaById, trackIndex, clipHasVideo, clipHasAudio,
    EFFECTS, EFFECT_CATS, AUDIO_CATS, TRANSITIONS, transDir, defaultParams, fxParams, colorOps, geoOf, geoSize,
    isColorEffect, isMotionEffect, isGeoEffect, isAudioEffect, isRenderAudioEffect, motionExpr,
    KEY_PROPS, keyList, keyExpr, keyValueAt,
    neighbors, transWindows, maxTransDur, maskS, maskCodes, MASK_EDGE,
    TEXT_TEMPLATES, TEXT_ANIMS, textScroll,
    planVisual, planClip, planClipLayers, planAudio, evalLayer, sourceTime, rampValue,
    impulseResponse, audioLiveChain, audioRenderChain, audioRenderJob, atempoChain,
    audioGainAt, fitSize, layerFit, sliceProject, snapPoints, fmtTime, compile, subst, num, hexToRgb, GLITCH_JITTER
  };
});
