/* SlaxxCUT – editing operations on the project model. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const core = SC.core, store = SC.store, S = store.S;
  const t = (k) => SC.t(k);
  const EPS = 1e-4;

  function P() { return S.project; }
  function track(id) { return P().tracks.find(x => x.id === id); }
  function clipsOn(trackId, exclude) { return P().clips.filter(c => c.trackId === trackId && !(exclude && exclude.has(c.id))); }
  function overlaps(trackId, a, b, exclude) {
    return clipsOn(trackId, exclude).some(c => c.start < b - EPS && core.clipEnd(c) > a + EPS);
  }
  function isFree(trackId, a, b, exclude) { return !overlaps(trackId, a, b, exclude); }

  function kindFor(m) { return m.isImage ? 'image' : m.hasVideo ? 'video' : 'audio'; }

  function makeClip(m, o) {
    const kind = kindFor(m);
    const isImg = kind === 'image';
    const dur = isImg ? (S.settings.imageDuration || 5) : m.duration;
    return Object.assign({
      id: core.uid('clip'), trackId: null, kind, mediaId: m.id,
      start: 0, in: 0, out: dur, speed: 1, volume: 0, fadeIn: 0, fadeOut: 0, opacity: 1,
      fit: 'contain', transform: { scale: 1, x: 0, y: 0 }, effects: [], transIn: null, transOut: null,
      audioDetached: false, muted: false
    }, o || {});
  }
  function makeText(o, template, props) {
    const text = props ? JSON.parse(JSON.stringify(props)) : SC.text.defaults(template || 'free');
    if (props && template) text.template = template;
    const isScroll = text.template === 'ticker' || text.template === 'credits';
    return Object.assign({
      id: core.uid('clip'), trackId: null, kind: 'text', mediaId: null,
      start: 0, in: 0, out: isScroll ? 12 : 5, speed: 1, volume: 0, fadeIn: 0, fadeOut: 0, opacity: 1,
      fit: 'stretch', transform: { scale: 1, x: 0, y: 0 }, effects: [], transIn: null, transOut: null,
      text
    }, o || {});
  }

  /** removes everything on a track inside [a,b) (overwrite edit) */
  function clearRange(trackId, a, b, exclude) {
    const p = P();
    for (const c of clipsOn(trackId, exclude).slice()) {
      const s = c.start, e = core.clipEnd(c), sp = c.speed || 1;
      if (e <= a + EPS || s >= b - EPS) continue;
      if (s >= a - EPS && e <= b + EPS) { p.clips.splice(p.clips.indexOf(c), 1); continue; }
      if (s < a && e > b) { // split around
        const right = JSON.parse(JSON.stringify(c));
        right.id = core.uid('clip');
        right.in = c.in + (b - s) * sp; right.start = b; right.transIn = null; right.fadeIn = 0;
        c.out = c.in + (a - s) * sp; c.transOut = null; c.fadeOut = 0;
        p.clips.push(right);
        continue;
      }
      if (s < a) { c.out = c.in + (a - s) * sp; c.transOut = null; c.fadeOut = Math.min(c.fadeOut, core.clipDuration(c)); }
      else { const cut = (b - s) * sp; c.in += cut; c.start = b; c.transIn = null; c.fadeIn = Math.min(c.fadeIn, core.clipDuration(c)); }
    }
  }

  /** first track (preferring `pref`, then below, then above) that is free in [a,b) */
  function findFreeTrack(pref, a, b, exclude) {
    const tr = P().tracks;
    const i0 = Math.max(0, tr.findIndex(x => x.id === pref));
    const order = [];
    for (let i = i0; i < tr.length; i++) order.push(i);
    for (let i = i0 - 1; i >= 0; i--) order.push(i);
    for (const i of order) if (!tr[i].locked && isFree(tr[i].id, a, b, exclude)) return tr[i].id;
    return null;
  }

  function addTrack() {
    if (P().tracks.length >= core.MAX_TRACKS) { SC.ui.toast(t('toast.maxTracks')); return null; }
    const tr = core.newTrack(P().tracks.length);
    tr.name = t('track') + ' ' + (P().tracks.length + 1);
    P().tracks.push(tr);
    return tr;
  }

  /** place a media clip; avoids overwriting by using a free track when possible */
  function placeMedia(m, trackId, start, inP, outP, opts) {
    if (!m || m.status === 'error') return null;
    const c = makeClip(m);
    if (inP != null) c.in = inP;
    if (outP != null) c.out = outP;
    if (c.out - c.in < 0.05) { c.in = 0; c.out = c.kind === 'image' ? (S.settings.imageDuration || 5) : m.duration; }
    c.start = Math.max(0, start);
    const d = core.clipDuration(c);
    let tid = trackId;
    const tr = track(tid);
    if (!tr || tr.locked || !isFree(tid, c.start, c.start + d)) {
      tid = (opts && opts.overwrite) ? tid : findFreeTrack(trackId, c.start, c.start + d);
      if (!tid) {
        const nt = addTrack();
        tid = nt ? nt.id : trackId;
        if (!nt) clearRange(tid, c.start, c.start + d);
      }
    }
    if (opts && opts.overwrite) clearRange(tid, c.start, c.start + d);
    c.trackId = tid;
    P().clips.push(c);
    return c;
  }

  function appendMedia(m, inP, outP) {
    const end = core.projectDuration(P());
    let trackId = S.selectedTrack || P().tracks[0].id;
    if (m && !m.hasVideo && !m.isImage) {
      // audio → prefer a track that already holds audio, else the last track
      const at = P().clips.find(c => c.kind === 'audio');
      trackId = at ? at.trackId : P().tracks[P().tracks.length - 1].id;
      const trEnd = Math.max(0, ...clipsOn(trackId).map(core.clipEnd));
      return placeMedia(m, trackId, trEnd, inP, outP);
    }
    const trEnd = Math.max(0, ...clipsOn(trackId).map(core.clipEnd));
    return placeMedia(m, trackId, trEnd || (P().clips.length ? end : 0), inP, outP);
  }

  function split(c, at) {
    const s = c.start, e = core.clipEnd(c);
    if (at <= s + 0.02 || at >= e - 0.02) return null;
    if (track(c.trackId).locked) return null;
    const sp = c.speed || 1;
    const right = JSON.parse(JSON.stringify(c));
    right.id = core.uid('clip');
    right.in = c.in + (at - s) * sp; right.start = at;
    right.transIn = null; right.fadeIn = 0;
    if (c.keys) { // keyframe times are clip-relative: cut the curves at the split point
      const d = at - s, lk = {}, rk = {};
      for (const prop of Object.keys(c.keys)) {
        const l = c.keys[prop] || []; if (!l.length) continue;
        const v = core.keyValueAt(c, prop, d);
        const L = l.filter(k => k.t < d - 0.02), R = l.filter(k => k.t > d + 0.02).map(k => ({ t: +(k.t - d).toFixed(3), v: k.v }));
        lk[prop] = L.concat([{ t: +d.toFixed(3), v }]); rk[prop] = [{ t: 0, v }].concat(R);
      }
      c.keys = lk; right.keys = rk;
    }
    c.out = c.in + (at - s) * sp; c.transOut = null; c.fadeOut = 0;
    if (right.kind === 'text' || right.kind === 'image') { right.out = right.out - right.in; right.in = 0; }
    P().clips.push(right);
    return right;
  }

  function remove(ids) {
    const p = P();
    p.clips = p.clips.filter(c => !ids.has(c.id) || track(c.trackId).locked);
  }
  function rippleDelete(ids) {
    const p = P();
    const del = p.clips.filter(c => ids.has(c.id) && !track(c.trackId).locked);
    // process per track from right to left
    const byTrack = {};
    for (const c of del) (byTrack[c.trackId] = byTrack[c.trackId] || []).push(c);
    for (const [tid, list] of Object.entries(byTrack)) {
      list.sort((a, b) => b.start - a.start);
      for (const c of list) {
        const d = core.clipDuration(c), s = c.start;
        p.clips.splice(p.clips.indexOf(c), 1);
        for (const o of p.clips) if (o.trackId === tid && o.start >= s - EPS) o.start = Math.max(0, o.start - d);
      }
    }
  }

  function maxOut(c) {
    const m = c.mediaId ? core.mediaById(P(), c.mediaId) : null;
    if (!m || m.isImage || c.kind === 'text' || c.kind === 'image') return Infinity;
    return m.duration;
  }

  function setSpeed(c, sp) {
    const oldEnd = core.clipEnd(c);
    c.speed = sp;
    // keep inside neighbours
    const next = clipsOn(c.trackId, new Set([c.id])).filter(o => o.start >= oldEnd - EPS).sort((a, b) => a.start - b.start)[0];
    if (next && core.clipEnd(c) > next.start + EPS) c.out = c.in + (next.start - c.start) * sp;
    c.out = Math.min(c.out, maxOut(c));
  }

  function detachAudio(c) {
    const m = c.mediaId ? core.mediaById(P(), c.mediaId) : null;
    if (!m || !m.hasAudio || c.kind !== 'video') { SC.ui.toast(t('toast.noAudio')); return null; }
    if (c.audioDetached) return null;
    const a = c.start, b = core.clipEnd(c);
    const tr = P().tracks;
    const ti = tr.findIndex(x => x.id === c.trackId);
    let tid = null;
    for (let i = ti + 1; i < tr.length && !tid; i++) if (!tr[i].locked && isFree(tr[i].id, a, b)) tid = tr[i].id;
    for (let i = ti - 1; i >= 0 && !tid; i--) if (!tr[i].locked && isFree(tr[i].id, a, b)) tid = tr[i].id;
    if (!tid) { const nt = addTrack(); if (!nt) { SC.ui.toast(t('toast.noFreeTrack'), 'error'); return null; } tid = nt.id; }
    const ac = makeClip(m, {
      kind: 'audio', trackId: tid, start: c.start, in: c.in, out: c.out, speed: c.speed, volume: c.volume,
      fadeIn: c.fadeIn, fadeOut: c.fadeOut, effects: (c.effects || []).filter(e => e.type === 'dynnorm'),
      transIn: c.transIn ? Object.assign({}, c.transIn) : null, transOut: c.transOut ? Object.assign({}, c.transOut) : null
    });
    c.audioDetached = true;
    P().clips.push(ac);
    return ac;
  }

  function hasVisual(c) { return c.kind === 'video' || c.kind === 'image' || c.kind === 'text'; }
  function hasAudioClip(c) { return core.clipHasAudio(P(), c) || c.kind === 'audio'; }

  /** apply an effect from the effects panel to a clip. Returns a toast key or null */
  function applyEffect(c, type) {
    const def = core.EFFECTS[type];
    if (!def) return null;
    if (track(c.trackId).locked) return 'toast.locked';
    switch (type) {
      case 'slowmo': setSpeed(c, 0.5); return 'toast.speedSet';
      case 'timelapse': setSpeed(c, 4); return 'toast.speedSet';
      case 'detach': return detachAudio(c) ? 'toast.detached' : null;
      case 'louder': if (!hasAudioClip(c)) return 'toast.noAudio'; c.volume = Math.min(24, (+c.volume || 0) + 3); return null;
      case 'quieter': if (!hasAudioClip(c)) return 'toast.noAudio'; c.volume = Math.max(-60, (+c.volume || 0) - 3); return null;
      case 'text': return null;
      case 'reverse': case 'freeze': case 'stabilize': case 'normalize': case 'silence': case 'match': return null; // async → SC.edit.runAction
    }
    if ((def.cat === 'color' || def.cat === 'motion') && !hasVisual(c)) return 'toast.onlyVisual';
    if (type === 'dynnorm' && !hasAudioClip(c)) return 'toast.noAudio';
    c.effects = c.effects || [];
    // motion effects of the same type replace each other
    const existing = c.effects.find(e => e.type === type);
    if (existing) return null;
    if (def.cat === 'image' && type === 'rotate' && c.kind === 'text') return 'toast.onlyVisual';
    c.effects.push({ id: core.uid('fx'), type, params: core.defaultParams(type), enabled: true });
    return 'toast.fxAdded';
  }

  /** transition at a clip edge; if there's an adjacent clip, both sides are set (paired) */
  function applyTransition(c, edge, type, dur, dir) {
    const d = dur || S.settings.transitionDuration || 1;
    const def = core.TRANSITIONS[type] || {};
    const dd = dir || (def.dirs ? def.dirs[0] : undefined);
    const nb = core.neighbors(P(), c);
    if (edge === 'in') {
      c.transIn = { type, d, dir: dd };
      if (nb.prev) nb.prev.transOut = { type, d, dir: dd };
    } else {
      c.transOut = { type, d, dir: dd };
      if (nb.next) nb.next.transIn = { type, d, dir: dd };
    }
  }
  function removeTransition(c, edge) {
    const nb = core.neighbors(P(), c);
    if (edge === 'in') { c.transIn = null; if (nb.prev && nb.prev.transOut) nb.prev.transOut = null; }
    else { c.transOut = null; if (nb.next && nb.next.transIn) nb.next.transIn = null; }
  }

  async function matchLoudness(clips) {
    const list = clips.filter(c => hasAudioClip(c) && c.mediaId);
    if (!list.length) { SC.ui.toast(t('toast.noAudio')); return; }
    SC.ui.toast(t('toast.measuring'));
    const target = -16;
    const res = [];
    for (const c of list) {
      const m = core.mediaById(P(), c.mediaId);
      const L = await window.api.loudness(m.path, c.in, c.out - c.in);
      if (L != null && isFinite(L)) res.push([c.id, Math.max(-20, Math.min(20, target - L))]);
    }
    store.change('match', () => {
      for (const [id, g] of res) { const c = store.clipById(id); if (c) c.volume = Math.round(g * 10) / 10; }
    });
    SC.ui.toast(t('toast.matched'), 'ok');
  }

  function duplicate(ids) {
    const out = [];
    for (const c of P().clips.filter(x => ids.has(x.id))) {
      const n = JSON.parse(JSON.stringify(c));
      n.id = core.uid('clip');
      const d = core.clipDuration(c);
      n.start = core.clipEnd(c);
      n.transIn = null; n.transOut = null;
      if (!isFree(n.trackId, n.start, n.start + d)) {
        const tid = findFreeTrack(n.trackId, n.start, n.start + d);
        if (tid) n.trackId = tid; else clearRange(n.trackId, n.start, n.start + d);
      }
      P().clips.push(n); out.push(n.id);
    }
    return out;
  }
  function copy(ids) {
    const list = P().clips.filter(c => ids.has(c.id));
    if (!list.length) return;
    const t0 = Math.min(...list.map(c => c.start));
    S.clipboard = list.map(c => Object.assign(JSON.parse(JSON.stringify(c)), { _rel: c.start - t0 }));
  }
  function paste(at) {
    if (!S.clipboard) return [];
    const out = [];
    for (const src of S.clipboard) {
      const n = JSON.parse(JSON.stringify(src));
      n.id = core.uid('clip'); n.start = at + (src._rel || 0); delete n._rel;
      if (!P().tracks.find(x => x.id === n.trackId)) n.trackId = S.selectedTrack || P().tracks[0].id;
      const d = core.clipDuration(n);
      if (!isFree(n.trackId, n.start, n.start + d)) {
        const tid = findFreeTrack(n.trackId, n.start, n.start + d);
        if (tid) n.trackId = tid; else clearRange(n.trackId, n.start, n.start + d);
      }
      if (n.mediaId && !core.mediaById(P(), n.mediaId)) continue;
      P().clips.push(n); out.push(n.id);
    }
    return out;
  }


  /* ---------------- async actions (render jobs / analysis) ---------------- */
  const t2 = (k) => SC.t(k);
  function busy(label) {
    const back = SC.ui.el('div', { class: 'busy-overlay' });
    const box = SC.ui.el('div', { class: 'busy-box' });
    const txt = SC.ui.el('div', { text: label });
    const bar = SC.ui.el('div', { class: 'progress' }, [SC.ui.el('div')]);
    box.append(SC.ui.el('div', { class: 'spinner' }), txt, bar);
    back.append(box); document.body.append(back);
    return { set(k) { bar.firstChild.style.width = Math.round(k * 100) + '%'; }, close() { back.remove(); } };
  }
  async function addDerivedMedia(file, base) {
    const list = await SC.media.importFiles([file]);
    const m = list[0];
    if (m && base) m.name = SC.ui.basename(file);
    return m;
  }
  /** replace clip source by a derived media file (reverse/stabilize) */
  async function deriveClip(c, kind) {
    const m = core.mediaById(P(), c.mediaId);
    if (!m || m.isImage || c.kind === 'text') { SC.ui.toast(t2('toast.onlyMovie')); return; }
    const jobId = core.uid('job');
    const b = busy(t2(kind === 'reverse' ? 'busy.reverse' : 'busy.stabilize'));
    const off = window.api.onJobProgress((id, k) => { if (id === jobId) b.set(k); });
    try {
      const info = { path: m.path, hasVideo: m.hasVideo && !m.isImage, hasAudio: m.hasAudio, isImage: false, duration: m.duration };
      const fn = kind === 'reverse' ? window.api.reverseMedia : window.api.stabilizeMedia;
      const file = await fn(jobId, info, c.in, c.out);
      const nm = await addDerivedMedia(file, true);
      if (!nm) return;
      store.change(kind, () => {
        const cc = store.clipById(c.id);
        if (!cc) return;
        cc.mediaId = nm.id; cc.in = 0; cc.out = nm.duration || (c.out - c.in);
        if (cc.keys) delete cc.keys;
      });
      SC.ui.toast(t2(kind === 'reverse' ? 'toast.reversed' : 'toast.stabilized'), 'ok');
    } catch (e) { SC.ui.toast(String(e.message || e), 'error'); } finally { off(); b.close(); }
  }
  /** freeze frame: split at playhead and insert a still image (ripple on this track) */
  async function freezeFrame(c, at, dur) {
    const m = core.mediaById(P(), c.mediaId);
    if (!m || c.kind !== 'video') { SC.ui.toast(t2('toast.onlyMovie')); return; }
    if (at <= c.start || at >= core.clipEnd(c)) at = c.start + core.clipDuration(c) / 2;
    const file = await window.api.freezeFrame(m.path, core.sourceTime(c, at));
    const im = await addDerivedMedia(file);
    if (!im) return;
    const d = dur || 3;
    store.change('freeze', () => {
      const cc = store.clipById(c.id);
      const right = split(cc, at);
      for (const o of P().clips) if (o.trackId === cc.trackId && o.start >= at - EPS && o !== cc) o.start += d;
      const still = makeClip(im, { trackId: cc.trackId, start: at, in: 0, out: d, fit: cc.fit, transform: Object.assign({}, cc.transform), effects: (cc.effects || []).filter(e => core.isColorEffect(e.type) || core.isGeoEffect(e.type)) });
      P().clips.push(still);
      void right;
    });
    SC.ui.toast(t2('toast.frozen'), 'ok');
  }
  /** normalise peaks to -1 dBFS */
  async function normalizePeak(clips) {
    const list = clips.filter(c => hasAudioClip(c) && c.mediaId);
    if (!list.length) { SC.ui.toast(t2('toast.noAudio')); return; }
    const res = [];
    for (const c of list) {
      const m = core.mediaById(P(), c.mediaId);
      const L = await window.api.audioLevels(m.path, c.in, c.out - c.in);
      if (L && L.max != null) res.push([c.id, Math.max(-20, Math.min(30, -1 - L.max))]);
    }
    store.change('normalize', () => { for (const [id, g] of res) { const c = store.clipById(id); if (c) c.volume = Math.round(g * 10) / 10; } });
    SC.ui.toast(t2('toast.normalized'), 'ok');
  }
  /** remove silent parts from a clip (splits + ripple) */
  async function removeSilence(c, thresholdDb, minDur) {
    const m = core.mediaById(P(), c.mediaId);
    if (!m || !hasAudioClip(c)) { SC.ui.toast(t2('toast.noAudio')); return; }
    const sp = c.speed || 1;
    // the clip's own gain shifts what counts as "silent" in the source file
    const th = (thresholdDb == null ? -40 : thresholdDb) - (+c.volume || 0);
    const sil = await window.api.detectSilence(m.path, c.in, c.out - c.in, Math.max(-90, Math.min(-5, th)), minDur || 0.6);
    const len = (c.out - c.in) / sp, s0 = c.start;
    if (!sil.length) { SC.ui.toast(t2('toast.noSilence')); return; }
    store.change('silence', () => {
      // work from the end so earlier positions stay valid
      const pieces = sil.map(([a, b]) => [c.start + a / sp, c.start + b / sp]).sort((x, y) => y[0] - x[0]);
      for (const [a0, b0] of pieces) {
        // keep a little breathing room, except at the clip's own start/end
        const a = a0 <= s0 + 0.02 ? a0 : a0 + 0.08, b = b0 >= s0 + len - 0.02 ? b0 : b0 - 0.08;
        if (b - a < 0.1) continue;
        const cur = P().clips.find(o => o.trackId === c.trackId && o.start <= a + EPS && core.clipEnd(o) >= b - EPS && (o.mediaId === c.mediaId));
        if (!cur) continue;
        const mid = split(cur, a) || cur;
        const tail = split(mid, b);
        const ids = new Set([mid.id]);
        rippleDelete(ids);
        void tail;
      }
    });
    SC.ui.toast(t2('toast.silenceRemoved'), 'ok');
  }
  async function runAction(type, clips) {
    const c = clips[0];
    switch (type) {
      case 'reverse': if (c) await deriveClip(c, 'reverse'); break;
      case 'stabilize': if (c) await deriveClip(c, 'stabilize'); break;
      case 'freeze': if (c) await freezeFrame(c, S.playhead); break;
      case 'normalize': await normalizePeak(clips.length ? clips : P().clips); break;
      case 'match': await matchLoudness(clips.length ? clips : P().clips); break;
      case 'silence': if (c) await removeSilence(c); break;
    }
  }

  /* ---------------- keyframes ---------------- */
  function keyAt(c, prop, tLocal) {
    const l = c.keys && c.keys[prop];
    return l ? l.find(k => Math.abs(k.t - tLocal) < 0.02) : null;
  }
  function setKey(c, prop, tLocal, v) {
    c.keys = Object.assign({}, c.keys || {});
    const l = (c.keys[prop] || []).slice();
    const ex = l.find(k => Math.abs(k.t - tLocal) < 0.02);
    if (ex) ex.v = v; else l.push({ t: Math.max(0, +tLocal.toFixed(3)), v });
    l.sort((a, b) => a.t - b.t);
    c.keys[prop] = l;
  }
  function removeKey(c, prop, tLocal) {
    if (!c.keys || !c.keys[prop]) return;
    c.keys = Object.assign({}, c.keys, { [prop]: c.keys[prop].filter(k => Math.abs(k.t - tLocal) >= 0.02) });
    if (!c.keys[prop].length) delete c.keys[prop];
  }
  function clearKeys(c, prop) { if (c.keys) { c.keys = Object.assign({}, c.keys); delete c.keys[prop]; } }

  /* ---------------- markers ---------------- */
  const MARKER_COLORS = ['#ffb547', '#3ad29f', '#ff5d6c', '#7fc4ff', '#c38cff'];
  function addMarker(t) {
    P().markers = P().markers || [];
    if (P().markers.some(m => Math.abs(m.t - t) < 0.05)) return null;
    const m = { id: core.uid('mk'), t, label: '', color: MARKER_COLORS[P().markers.length % MARKER_COLORS.length] };
    P().markers.push(m);
    P().markers.sort((a, b) => a.t - b.t);
    return m;
  }

  /* ---------------- audio selection editing (clip-range based, non-destructive) ---------------- */
  /** isolates [a,b] of clip c into its own piece and returns it */
  function isolate(c, a, b) {
    let mid = c;
    if (a > c.start + 0.02) mid = split(c, a) || c;
    if (b < core.clipEnd(mid) - 0.02) split(mid, b);
    return mid;
  }

  SC.edit = {
    runAction, deriveClip, freezeFrame, normalizePeak, removeSilence, keyAt, setKey, removeKey, clearKeys, addMarker, isolate, MARKER_COLORS,
    makeClip, makeText, clearRange, findFreeTrack, isFree, overlaps, addTrack, placeMedia, appendMedia, split, remove, rippleDelete,
    maxOut, setSpeed, detachAudio, applyEffect, applyTransition, removeTransition, matchLoudness, duplicate, copy, paste, clipsOn, hasVisual, hasAudioClip
  };
})();
