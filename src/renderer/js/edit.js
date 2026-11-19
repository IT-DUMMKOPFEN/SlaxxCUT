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
  function makeText(o) {
    return Object.assign({
      id: core.uid('clip'), trackId: null, kind: 'text', mediaId: null,
      start: 0, in: 0, out: 5, speed: 1, volume: 0, fadeIn: 0.4, fadeOut: 0.4, opacity: 1,
      fit: 'stretch', transform: { scale: 1, x: 0, y: 0 }, effects: [], transIn: null, transOut: null,
      text: SC.text.defaults()
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
    }
    if ((def.cat === 'color' || def.cat === 'motion') && !hasVisual(c)) return 'toast.onlyVisual';
    if (type === 'dynnorm' && !hasAudioClip(c)) return 'toast.noAudio';
    c.effects = c.effects || [];
    // motion effects of the same type replace each other
    const existing = c.effects.find(e => e.type === type);
    if (existing) return null;
    c.effects.push({ id: core.uid('fx'), type, params: core.defaultParams(type), enabled: true });
    return 'toast.fxAdded';
  }

  /** transition at a clip edge; if there's an adjacent clip, both sides are set (paired) */
  function applyTransition(c, edge, type, dur) {
    const d = dur || S.settings.transitionDuration || 1;
    const nb = core.neighbors(P(), c);
    if (edge === 'in') {
      c.transIn = { type, d };
      if (nb.prev) nb.prev.transOut = { type, d };
    } else {
      c.transOut = { type, d };
      if (nb.next) nb.next.transIn = { type, d };
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

  SC.edit = {
    makeClip, makeText, clearRange, findFreeTrack, isFree, overlaps, addTrack, placeMedia, appendMedia, split, remove, rippleDelete,
    maxOut, setSpeed, detachAudio, applyEffect, applyTransition, removeTransition, matchLoudness, duplicate, copy, paste, clipsOn, hasVisual, hasAudioClip
  };
})();
