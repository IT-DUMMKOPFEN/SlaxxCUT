/* SlaxxCUT – application state, undo/redo, events. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const core = SC.core;

  const listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return () => off(ev, fn); }
  function off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); }
  function emit(ev, ...a) { for (const f of (listeners[ev] || []).slice()) { try { f(...a); } catch (e) { console.error(e); } } }

  const S = {
    project: core.newProject(),
    projectPath: null,
    dirty: false,
    selection: new Set(),     // clip ids
    selectedTrack: null,      // track id
    playhead: 0,
    zoom: 80,                 // pixels per second
    snap: true,
    tool: 'select',
    settings: {},
    runtime: {},              // media runtime info: id → {url, proxy, strip, poster, wave, status, progress}
    clipboard: null
  };

  /* ---------------- undo / redo (snapshot based) ---------------- */
  const undoStack = [], redoStack = [];
  let lastSnap = null;
  function snapshot() { return JSON.stringify({ p: S.project }); }
  function initHistory() { undoStack.length = 0; redoStack.length = 0; lastSnap = snapshot(); }
  /** call before a modification: f() modifies S.project; records undo step */
  function change(label, f, opts) {
    const before = lastSnap || snapshot();
    const r = f();
    const after = snapshot();
    if (after !== before) {
      undoStack.push(before);
      if (undoStack.length > 150) undoStack.shift();
      redoStack.length = 0;
      lastSnap = after;
      S.dirty = true;
      emit('project', { label, structural: !(opts && opts.light) });
      emit('dirty');
    }
    return r;
  }
  /** for continuous edits (slider drags): coalesce into one undo step */
  let pending = null;
  function changeLive(key, f) {
    if (!pending || pending.key !== key) { commitLive(); pending = { key, before: lastSnap || snapshot() }; }
    f();
    S.dirty = true;
    emit('project', { label: key, live: true });
    clearTimeout(pending.timer);
    pending.timer = setTimeout(commitLive, 600);
  }
  function commitLive() {
    if (!pending) return;
    clearTimeout(pending.timer);
    const after = snapshot();
    if (after !== pending.before) { undoStack.push(pending.before); redoStack.length = 0; lastSnap = after; emit('dirty'); }
    pending = null;
  }
  function restore(snap) {
    const o = JSON.parse(snap);
    S.project = o.p;
    lastSnap = snap;
    for (const id of Array.from(S.selection)) if (!S.project.clips.find(c => c.id === id)) S.selection.delete(id);
    if (!S.project.tracks.find(t => t.id === S.selectedTrack)) S.selectedTrack = S.project.tracks[0] && S.project.tracks[0].id;
    S.dirty = true;
    emit('project', { label: 'history', structural: true });
    emit('selection');
    emit('dirty');
  }
  function undo() { commitLive(); if (!undoStack.length) return; redoStack.push(snapshot()); restore(undoStack.pop()); }
  function redo() { commitLive(); if (!redoStack.length) return; undoStack.push(snapshot()); restore(redoStack.pop()); }
  function canUndo() { return undoStack.length > 0 || !!pending; }
  function canRedo() { return redoStack.length > 0; }

  function setProject(p, path) {
    S.project = p; S.projectPath = path || null; S.dirty = false;
    S.selection.clear();
    S.selectedTrack = p.tracks[0] && p.tracks[0].id;
    S.playhead = 0;
    initHistory();
    emit('project', { label: 'load', structural: true, load: true });
    emit('selection'); emit('dirty'); emit('playhead');
  }

  function select(ids, additive) {
    if (!additive) S.selection.clear();
    for (const id of [].concat(ids || [])) {
      if (additive && S.selection.has(id)) S.selection.delete(id); else S.selection.add(id);
    }
    const first = S.project.clips.find(c => S.selection.has(c.id));
    if (first) S.selectedTrack = first.trackId;
    emit('selection');
  }
  function selectedClips() { return S.project.clips.filter(c => S.selection.has(c.id)); }
  function clipById(id) { return S.project.clips.find(c => c.id === id) || null; }
  function setPlayhead(t, src) {
    const d = core.projectDuration(S.project);
    S.playhead = Math.max(0, Math.min(t, Math.max(d, 0)));
    emit('playhead', src);
  }

  SC.store = { S, on, off, emit, change, changeLive, commitLive, undo, redo, canUndo, canRedo, initHistory, setProject, select, selectedClips, clipById, setPlayhead };
})();
