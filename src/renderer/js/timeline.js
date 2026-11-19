/* SlaxxCUT – timeline: tracks, clips, drag & drop, trimming, fades, zoom, snapping. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $, iconBtn, toast, contextMenu, clamp } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S, edit = SC.edit;
  const t = (k) => SC.t(k);
  const TH = () => S.trackH || 54;
  const SNAP_PX = 9;

  const TL = {
    build() {
      const root = $('#timeline');
      this.root = root;
      // corner
      this.corner = el('div', { class: 'tl-corner' });
      this.corner.append(
        iconBtn('plus', 'tool.addTrack', () => this.addTrack()),
        iconBtn('minus', 'tool.removeTrack', () => this.removeTrack())
      );
      this.countEl = el('span', { class: 'count' });
      this.corner.append(this.countEl);
      // ruler
      this.ruler = el('div', { class: 'tl-ruler', 'data-tip': 'tip.ruler' });
      this.rulerCv = el('canvas');
      this.phHead = el('div', { class: 'playhead-head' });
      this.ruler.append(this.rulerCv, this.phHead);
      // heads + scroll
      this.heads = el('div', { class: 'tl-heads' });
      this.scroll = el('div', { class: 'tl-scroll' });
      this.content = el('div', { class: 'tl-content' });
      this.tracksEl = el('div', { class: 'tl-tracks' });
      this.playhead = el('div', { class: 'playhead' });
      this.snapLine = el('div', { class: 'snap-line' });
      this.bladeLine = el('div', { class: 'blade-line' });
      this.cutHint = el('div', { class: 'cut-hint' });
      this.content.append(this.tracksEl, this.playhead, this.snapLine, this.bladeLine, this.cutHint);
      this.scroll.append(this.content);
      root.append(this.corner, this.ruler, this.heads, this.scroll);

      this.scroll.addEventListener('scroll', () => {
        this.heads.scrollTop = this.scroll.scrollTop;
        this.drawRuler();
        this.updatePlayhead();
      });
      new ResizeObserver(() => { this.render(); }).observe(this.scroll);
      this.initRuler();
      this.initZoomGestures();
      this.initDrop();
      this.initMarquee();
      store.on('project', (info) => { if (!info.live || info.label !== 'drag') this.render(); });
      store.on('selection', () => this.updateSelection());
      store.on('playhead', () => { this.updatePlayhead(); this.autoScroll(); });
      store.on('runtime', () => this.render());
      store.on('renderprogress', () => { clearTimeout(this._rp); this._rp = setTimeout(() => this.render(), 150); });
      this.render();
    },

    /* ---------------- coordinates ---------------- */
    x(time) { return time * S.zoom; },
    time(x) { return x / S.zoom; },
    clientToTime(clientX) { const r = this.scroll.getBoundingClientRect(); return Math.max(0, (clientX - r.left + this.scroll.scrollLeft) / S.zoom); },
    clientToTrack(clientY) {
      const r = this.scroll.getBoundingClientRect();
      const i = Math.floor((clientY - r.top + this.scroll.scrollTop) / TH());
      return clamp(i, 0, S.project.tracks.length - 1);
    },
    contentWidth() {
      const d = core.projectDuration(S.project);
      return Math.max(this.scroll.clientWidth, (d + 60) * S.zoom);
    },

    /* ---------------- rendering ---------------- */
    render() {
      if (!this.content) return;
      const p = S.project;
      this.countEl.textContent = p.tracks.length + '/' + core.MAX_TRACKS;
      const W = this.contentWidth();
      this.content.style.width = W + 'px';
      this.content.style.height = (p.tracks.length * TH()) + 'px';
      // heads
      this.heads.innerHTML = '';
      this.tracksEl.innerHTML = '';
      this.clipEls = new Map();
      p.tracks.forEach((tr, i) => {
        const h = el('div', { class: 'tl-head' + (S.selectedTrack === tr.id ? ' sel' : '') });
        const isDefault = !tr.name || /^(Spur|Track) \d+$/.test(tr.name);
        const name = el('div', { class: 'tname', text: isDefault ? t('track') + ' ' + (i + 1) : tr.name });
        name.addEventListener('click', () => { S.selectedTrack = tr.id; this.render(); });
        name.addEventListener('dblclick', () => this.renameTrack(tr, name));
        const mute = iconBtn(tr.muted ? 'speakerOff' : 'speaker', 'tip.track.mute', () => store.change('track', () => { tr.muted = !tr.muted; }));
        if (tr.muted) mute.classList.add('on');
        const hide = iconBtn(tr.hidden ? 'eyeOff' : 'eye', 'tip.track.hide', () => store.change('track', () => { tr.hidden = !tr.hidden; }));
        if (tr.hidden) hide.classList.add('on');
        const lock = iconBtn(tr.locked ? 'lock' : 'unlock', 'tip.track.lock', () => store.change('track', () => { tr.locked = !tr.locked; }));
        if (tr.locked) lock.classList.add('on');
        const rm = iconBtn('minus', 'tip.track.remove', () => this.removeTrack(tr));
        h.append(name, mute, hide, lock, rm);
        this.heads.append(h);
        const row = el('div', { class: 'tl-track' + (tr.locked ? ' locked' : '') + (tr.hidden ? ' hidden-track' : '') });
        row.dataset.track = tr.id;
        row.style.width = W + 'px';
        this.tracksEl.append(row);
        for (const c of p.clips.filter(c => c.trackId === tr.id)) row.append(this.clipEl(c));
      });
      this.heads.append(el('div', { style: { height: '40px' } }));
      this.drawRuler();
      this.updatePlayhead();
    },

    clipEl(c) {
      const p = S.project;
      const m = c.mediaId ? core.mediaById(p, c.mediaId) : null;
      const d = core.clipDuration(c);
      const w = Math.max(2, d * S.zoom);
      const e = el('div', { class: 'clip ' + c.kind + (S.selection.has(c.id) ? ' sel' : ''), 'data-tip': 'tip.clip' });
      e.dataset.id = c.id;
      e.style.left = this.x(c.start) + 'px';
      e.style.width = w + 'px';
      const rt = m ? (S.runtime[m.id] || {}) : {};
      // filmstrip
      if ((c.kind === 'video' || c.kind === 'image') && rt.strip) {
        const st = el('div', { class: 'strip' });
        st.style.backgroundImage = 'url("' + window.api.mediaUrl(rt.strip) + '")';
        if (c.kind === 'video' && m.duration) {
          const full = m.duration / (c.speed || 1) * S.zoom;
          st.style.backgroundSize = full + 'px 100%';
          st.style.backgroundPosition = (-c.in / (c.speed || 1) * S.zoom) + 'px 0';
          st.style.backgroundRepeat = 'no-repeat';
        }
        if (c.audioDetached || !m.hasAudio) st.style.bottom = '0';
        else st.style.bottom = '16px';
        e.append(st);
      }
      // waveform
      const audible = c.kind === 'audio' || (c.kind === 'video' && m && m.hasAudio && !c.audioDetached);
      if (audible && rt.wave) {
        const hh = c.kind === 'audio' ? Math.max(30, TH() - 24) : (S.trackH > 60 ? 28 : 16);
        const cw = Math.min(4000, Math.ceil(w));
        const cv = el('canvas', { class: 'wave', width: cw, height: hh * 2 });
        cv.style.height = hh + 'px';
        SC.media.drawWave(cv, rt.wave, c.in, c.out, c.muted ? 'rgba(255,255,255,.25)' : 'rgba(255,255,255,.7)');
        e.append(cv);
      }
      // label
      const icon = { video: 'video', image: 'image', audio: 'audio', text: 'text' }[c.kind];
      const name = c.kind === 'text' ? ((c.text && c.text.text) || 'Text').split('\n')[0] : (m ? m.name : '?');
      const lab = el('div', { class: 'label' });
      lab.innerHTML = SC.icon(icon) + '<span>' + SC.ui.escapeHtml(name) + '</span>';
      if ((c.speed || 1) !== 1) lab.append(el('span', { class: 'speed', text: (c.speed) + '×' }));
      if (c.volume) lab.append(el('span', { class: 'speed', text: (c.volume > 0 ? '+' : '') + c.volume + ' dB' }));
      const fxs = (c.effects || []).filter(f => f.enabled !== false);
      if (fxs.length) {
        const dots = el('span', { class: 'fxdots', title: fxs.map(f => t('fx.' + f.type)).join(', ') });
        for (let i = 0; i < Math.min(5, fxs.length); i++) dots.append(el('i'));
        lab.append(dots);
      }
      e.append(lab);
      if (c.muted || c.audioDetached) {
        if (c.kind === 'video' && m && m.hasAudio) e.append(el('span', { class: 'muted-ic', html: SC.icon('speakerOff') }));
      }
      // fade overlay
      if (c.fadeIn > 0 || c.fadeOut > 0) {
        const fi = Math.min(w, c.fadeIn * S.zoom), fo = Math.min(w, c.fadeOut * S.zoom);
        e.insertAdjacentHTML('beforeend', `<svg class="fadeov" viewBox="0 0 ${w} 47" preserveAspectRatio="none"><polygon points="0,0 ${fi},0 0,47" fill="rgba(0,0,0,.45)"/><polygon points="${w},0 ${w - fo},0 ${w},47" fill="rgba(0,0,0,.45)"/><line x1="0" y1="47" x2="${fi}" y2="0" stroke="#fff" stroke-width="1"/><line x1="${w}" y1="47" x2="${w - fo}" y2="0" stroke="#fff" stroke-width="1"/></svg>`);
      }
      // transitions badges
      for (const [edge, tr] of [['in', c.transIn], ['out', c.transOut]]) {
        if (!tr || !tr.type) continue;
        const b = el('div', { class: 'tbadge ' + (edge === 'in' ? 'l' : 'r'), 'data-tip-text': t('tr.' + tr.type) + ' · ' + tr.d + ' s — ' + t('tip.transBadge') });
        b.innerHTML = SC.icon(core.TRANSITIONS[tr.type] ? core.TRANSITIONS[tr.type].icon : 'crossfade');
        b.addEventListener('mousedown', (ev) => ev.stopPropagation());
        b.addEventListener('click', (ev) => { ev.stopPropagation(); store.select(c.id); SC.inspector.open(c.id, 'trans'); });
        b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); store.change('rm-trans', () => edit.removeTransition(c, edge)); });
        e.append(b);
      }
      // keyframe diamonds
      if (c.keys) {
        const times = new Set();
        for (const l of Object.values(c.keys)) for (const k of (l || [])) times.add(+k.t.toFixed(3));
        for (const kt of times) {
          const kd = el('div', { class: 'kf', style: { left: (kt * S.zoom) + 'px' } });
          kd.addEventListener('mousedown', (ev) => { ev.stopPropagation(); SC.program.seek(c.start + kt); });
          e.append(kd);
        }
      }
      // audio pre-render in progress
      const job = core.audioRenderJob(S.project, c);
      if (job && SC.program.rendering[job.key] != null) e.append(el('div', { class: 'rbadge', text: SC.t('busy.render') + ' ' + Math.round(SC.program.rendering[job.key] * 100) + '%' }));
      // handles
      const tl = el('div', { class: 'trim l' }), trr = el('div', { class: 'trim r' });
      const fl = el('div', { class: 'fadeh', 'data-tip': 'tip.fadeHandle' }), fr = el('div', { class: 'fadeh', 'data-tip': 'tip.fadeHandle' });
      fl.style.left = Math.min(w - 6, Math.max(6, c.fadeIn * S.zoom)) + 'px';
      fr.style.left = Math.max(6, Math.min(w - 6, w - c.fadeOut * S.zoom)) + 'px';
      e.append(tl, trr, fl, fr);
      tl.addEventListener('mousedown', (ev) => this.startTrim(ev, c, 'l'));
      trr.addEventListener('mousedown', (ev) => this.startTrim(ev, c, 'r'));
      fl.addEventListener('mousedown', (ev) => this.startFade(ev, c, 'in'));
      fr.addEventListener('mousedown', (ev) => this.startFade(ev, c, 'out'));
      e.addEventListener('mousedown', (ev) => this.clipDown(ev, c));
      e.addEventListener('dblclick', (ev) => { ev.stopPropagation(); SC.inspector.open(c.id); });
      e.addEventListener('contextmenu', (ev) => { ev.preventDefault(); this.clipMenu(ev, c); });
      this.clipEls.set(c.id, e);
      return e;
    },

    updateSelection() {
      if (!this.clipEls) return;
      for (const [id, e] of this.clipEls) e.classList.toggle('sel', S.selection.has(id));
      this.heads.querySelectorAll('.tl-head').forEach((h, i) => h.classList.toggle('sel', S.project.tracks[i] && S.project.tracks[i].id === S.selectedTrack));
    },

    drawRuler() {
      const cv = this.rulerCv;
      const w = this.ruler.clientWidth, h = this.ruler.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const cs = getComputedStyle(document.documentElement);
      const col = cs.getPropertyValue('--text3').trim() || '#789';
      const col2 = cs.getPropertyValue('--text2').trim() || '#9ab';
      // choose step
      const steps = [1 / 30, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
      let step = steps.find(s => s * S.zoom >= 70) || 600;
      const sub = step >= 1 ? (step >= 60 ? step / 6 : step / 5) : step / 2;
      const t0 = this.scroll.scrollLeft / S.zoom, t1 = t0 + w / S.zoom;
      ctx.font = '10.5px Inter, sans-serif';
      ctx.textBaseline = 'top';
      for (let i = Math.floor(t0 / sub); i * sub <= t1 + sub; i++) {
        const tt = Math.round(i * sub * 1000) / 1000;
        const x = Math.round((tt - t0) * S.zoom) + 0.5;
        const major = Math.abs(tt / step - Math.round(tt / step)) < 1e-6;
        ctx.strokeStyle = major ? col2 : col;
        ctx.globalAlpha = major ? 0.9 : 0.5;
        ctx.beginPath(); ctx.moveTo(x, major ? h - 12 : h - 6); ctx.lineTo(x, h); ctx.stroke();
        if (major) {
          ctx.globalAlpha = 1; ctx.fillStyle = col2;
          ctx.fillText(step < 1 ? core.fmtTime(tt, S.project.settings.fps, true) : core.fmtTime(tt), x + 3, 4);
        }
      }
      ctx.globalAlpha = 1;
      // markers
      for (const m of (S.project.markers || [])) {
        const x = Math.round((m.t - t0) * S.zoom) + 0.5;
        if (x < -10 || x > w + 10) continue;
        ctx.fillStyle = m.color || '#ffb547';
        ctx.beginPath(); ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x + 5, 9); ctx.lineTo(x, 14); ctx.lineTo(x - 5, 9); ctx.closePath(); ctx.fill();
        if (m.label) { ctx.fillStyle = col2; ctx.fillText(m.label, x + 8, h - 13); }
      }
      this.drawMarkerLines();
    },
    drawMarkerLines() {
      if (!this.markerLayer) { this.markerLayer = el('div', { class: 'marker-layer' }); this.content.append(this.markerLayer); }
      this.markerLayer.innerHTML = '';
      for (const m of (S.project.markers || [])) this.markerLayer.append(el('div', { class: 'marker-line', style: { left: this.x(m.t) + 'px', background: m.color || '#ffb547' } }));
    },
    markerAt(clientX) {
      const r = this.ruler.getBoundingClientRect();
      const x = clientX - r.left + this.scroll.scrollLeft;
      return (S.project.markers || []).find(m => Math.abs(m.t * S.zoom - x) < 7) || null;
    },
    editMarker(m) {
      const inp = el('input', { type: 'text', value: m.label || '', style: { width: '100%', height: '30px', borderRadius: '7px', border: '1px solid var(--line)', background: 'var(--bg2)', padding: '0 8px' } });
      const colors = el('div', { style: { display: 'flex', gap: '6px', marginTop: '10px' } });
      let col = m.color;
      for (const cc of SC.edit.MARKER_COLORS) {
        const b = el('button', { type: 'button', style: { width: '26px', height: '26px', borderRadius: '50%', border: cc === col ? '2px solid var(--text)' : '2px solid transparent', background: cc, cursor: 'pointer' } });
        b.addEventListener('click', () => { col = cc; colors.querySelectorAll('button').forEach(x => { x.style.borderColor = 'transparent'; }); b.style.borderColor = 'var(--text)'; });
        colors.append(b);
      }
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); });
      const md = SC.ui.modal({ title: SC.t('marker.edit'), body: el('div', {}, [inp, colors]), cls: 'small' });
      const ok = () => { store.change('marker', () => { const mm = (S.project.markers || []).find(x => x.id === m.id); if (mm) { mm.label = inp.value.trim(); mm.color = col; } }); md.close(); this.drawRuler(); };
      md.button(SC.t('ctx.delete'), 'danger', () => { store.change('marker-rm', () => { S.project.markers = S.project.markers.filter(x => x.id !== m.id); }); md.close(); this.drawRuler(); });
      md.button(SC.t('dlg.ok'), 'primary', ok);
      setTimeout(() => inp.focus(), 50);
    },

    updatePlayhead() {
      const x = this.x(S.playhead);
      this.playhead.style.left = x + 'px';
      this.phHead.style.left = (x - this.scroll.scrollLeft) + 'px';
    },
    autoScroll() {
      if (!SC.program.playing || this.userScrolling) return;
      const x = this.x(S.playhead);
      const sl = this.scroll.scrollLeft, w = this.scroll.clientWidth;
      if (x > sl + w - 40) this.scroll.scrollLeft = x - 60;
      else if (x < sl) this.scroll.scrollLeft = Math.max(0, x - 60);
    },

    /* ---------------- zoom ---------------- */
    setZoom(z, anchorClientX) {
      z = clamp(z, 2, 1200);
      const r = this.scroll.getBoundingClientRect();
      const ax = anchorClientX != null ? anchorClientX - r.left : this.x(S.playhead) - this.scroll.scrollLeft;
      const at = (this.scroll.scrollLeft + ax) / S.zoom;
      S.zoom = z;
      this.render();
      this.scroll.scrollLeft = Math.max(0, at * S.zoom - ax);
      this.drawRuler(); this.updatePlayhead();
      store.emit('zoom');
    },
    zoomFit() {
      const d = core.projectDuration(S.project) || 30;
      this.setZoom((this.scroll.clientWidth - 40) / d);
      this.scroll.scrollLeft = 0;
    },
    initZoomGestures() {
      // Ctrl/Cmd + wheel (also trackpad pinch) → zoom
      this.root.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.setZoom(S.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX);
        }
      }, { passive: false });
      // middle mouse button + move up/down → zoom
      const startMid = (e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        const y0 = e.clientY, z0 = S.zoom, ax = e.clientX;
        document.body.style.cursor = 'ns-resize';
        const mv = (ev) => this.setZoom(z0 * Math.exp((y0 - ev.clientY) * 0.012), ax);
        const up = () => { document.body.style.cursor = ''; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      };
      this.scroll.addEventListener('mousedown', startMid);
      this.ruler.addEventListener('mousedown', startMid);
      // prevent autoscroll icon on middle click
      this.root.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
    },

    /* ---------------- ruler / playhead ---------------- */
    initRuler() {
      this.ruler.addEventListener('dblclick', (e) => { const m = this.markerAt(e.clientX); if (m) this.editMarker(m); });
      this.ruler.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const m = this.markerAt(e.clientX);
        if (m) contextMenu(e.clientX, e.clientY, [
          { label: SC.t('marker.edit'), icon: 'marker', action: () => this.editMarker(m) },
          { label: SC.t('ctx.delete'), icon: 'trash', action: () => { store.change('marker-rm', () => { S.project.markers = S.project.markers.filter(x => x.id !== m.id); }); this.drawRuler(); } }
        ]);
        else contextMenu(e.clientX, e.clientY, [{ label: SC.t('tool.marker'), icon: 'marker', action: () => SC.app.cmd('marker') }]);
      });
      this.ruler.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const mk = this.markerAt(e.clientX);
        if (mk) { SC.program.seek(mk.t); return; }
        const r = this.ruler.getBoundingClientRect();
        const seek = (ev) => SC.program.seek(Math.max(0, (ev.clientX - r.left + this.scroll.scrollLeft) / S.zoom));
        seek(e);
        const up = () => { window.removeEventListener('mousemove', seek); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', seek); window.addEventListener('mouseup', up);
      });
      this.ruler.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        this.scroll.scrollLeft += e.deltaY + e.deltaX;
      }, { passive: false });
    },

    /* ---------------- snapping ---------------- */
    snapTime(tt, exclude, showLine) {
      if (!S.snap) { this.snapLine.style.display = 'none'; return { t: tt, snapped: false }; }
      const pts = core.snapPoints(S.project, exclude, S.playhead);
      let best = null, bd = SNAP_PX / S.zoom;
      for (const p of pts) { const d = Math.abs(p - tt); if (d < bd) { bd = d; best = p; } }
      if (best != null) {
        if (showLine !== false) { this.snapLine.style.display = 'block'; this.snapLine.style.left = this.x(best) + 'px'; }
        return { t: best, snapped: true };
      }
      if (showLine !== false) this.snapLine.style.display = 'none';
      return { t: tt, snapped: false };
    },
    hideSnap() { this.snapLine.style.display = 'none'; },

    /* ---------------- clip interactions ---------------- */
    clipDown(e, c) {
      if (e.button !== 0) return;
      e.stopPropagation();
      SC.activeMonitor = 'program';
      const tr = S.project.tracks.find(x => x.id === c.trackId);
      if (S.tool === 'blade') {
        if (tr.locked) { toast(t('toast.locked')); return; }
        let at = this.clientToTime(e.clientX);
        at = this.snapTime(at, null, false).t;
        store.change('blade', () => edit.split(c, at));
        return;
      }
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (additive) store.select(c.id, true);
      else if (!S.selection.has(c.id)) store.select(c.id);
      S.selectedTrack = c.trackId;
      if (tr.locked) return;
      // drag move
      const moving = S.project.clips.filter(x => S.selection.has(x.id));
      const startX = e.clientX, startY = e.clientY;
      const t0 = this.clientToTime(e.clientX);
      const tr0 = this.clientToTrack(e.clientY);
      const orig = moving.map(x => ({ c: x, start: x.start, ti: core.trackIndex(S.project, x.trackId) }));
      const excl = new Set(moving.map(x => x.id));
      let started = false, dt = 0, dti = 0;
      const nT = S.project.tracks.length;
      const minTi = Math.min(...orig.map(o => o.ti)), maxTi = Math.max(...orig.map(o => o.ti));
      const minStart = Math.min(...orig.map(o => o.start));
      const mv = (ev) => {
        if (!started && Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
        started = true;
        dt = this.clientToTime(ev.clientX) - t0;
        dt = Math.max(dt, -minStart);
        // snap the grabbed clip's start or end
        const cs = c.start + dt, ce = core.clipEnd(c) + dt;
        const s1 = this.snapTime(cs, excl, false), s2 = this.snapTime(ce, excl, false);
        if (s1.snapped && (!s2.snapped || Math.abs(s1.t - cs) <= Math.abs(s2.t - ce))) { dt = s1.t - c.start; this.snapLine.style.display = 'block'; this.snapLine.style.left = this.x(s1.t) + 'px'; }
        else if (s2.snapped) { dt = s2.t - core.clipEnd(c); this.snapLine.style.display = 'block'; this.snapLine.style.left = this.x(s2.t) + 'px'; }
        else this.hideSnap();
        dt = Math.max(dt, -minStart);
        dti = clamp(this.clientToTrack(ev.clientY) - tr0, -minTi, nT - 1 - maxTi);
        for (const o of orig) {
          const ce2 = this.clipEls.get(o.c.id);
          if (!ce2) continue;
          ce2.classList.add('dragging');
          ce2.style.left = this.x(o.start + dt) + 'px';
          ce2.style.transform = 'translateY(' + (dti * TH()) + 'px)';
        }
      };
      const up = () => {
        window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
        this.hideSnap();
        if (!started) { if (!additive && S.selection.size > 1) store.select(c.id); return; }
        if (Math.abs(dt) < 1e-6 && dti === 0) { this.render(); return; }
        const locked = orig.some(o => S.project.tracks[o.ti + dti].locked);
        if (locked) { toast(t('toast.locked')); this.render(); return; }
        store.change('move', () => {
          for (const o of orig) { o.c.start = Math.max(0, o.start + dt); o.c.trackId = S.project.tracks[o.ti + dti].id; }
          for (const o of orig) edit.clearRange(o.c.trackId, o.c.start, core.clipEnd(o.c), excl);
        });
      };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    },

    startTrim(e, c, side) {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      const tr = S.project.tracks.find(x => x.id === c.trackId);
      if (tr.locked) { toast(t('toast.locked')); return; }
      store.select(c.id);
      const sp = c.speed || 1;
      const o = { start: c.start, in: c.in, out: c.out };
      const others = edit.clipsOn(c.trackId, new Set([c.id]));
      const prevEnd = Math.max(0, ...others.filter(x => core.clipEnd(x) <= o.start + 1e-4).map(core.clipEnd));
      const nextStart = Math.min(Infinity, ...others.filter(x => x.start >= o.start + (o.out - o.in) / sp - 1e-4).map(x => x.start));
      const isStill = c.kind === 'image' || c.kind === 'text';
      const maxOut = edit.maxOut(c);
      const excl = new Set([c.id]);
      const mv = (ev) => {
        let tt = this.snapTime(this.clientToTime(ev.clientX), excl).t;
        store.changeLive('trim', () => {
          if (side === 'l') {
            tt = clamp(tt, prevEnd, o.start + (o.out - o.in) / sp - 0.05);
            let ni = o.in + (tt - o.start) * sp;
            if (!isStill && ni < 0) { ni = 0; tt = o.start - o.in / sp; }
            if (isStill) { c.start = tt; c.in = 0; c.out = (o.out - o.in) - (tt - o.start); }
            else { c.start = tt; c.in = ni; }
          } else {
            tt = clamp(tt, o.start + 0.05, nextStart);
            let no = c.in + (tt - c.start) * sp;
            if (no > maxOut) no = maxOut;
            c.out = no;
          }
          c.fadeIn = Math.min(c.fadeIn || 0, core.clipDuration(c));
          c.fadeOut = Math.min(c.fadeOut || 0, core.clipDuration(c));
        });
        this.render();
      };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); this.hideSnap(); store.commitLive(); this.render(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    },

    startFade(e, c, which) {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      if (S.project.tracks.find(x => x.id === c.trackId).locked) return;
      store.select(c.id);
      const mv = (ev) => {
        const tt = this.clientToTime(ev.clientX);
        const d = core.clipDuration(c);
        store.changeLive('fade', () => {
          if (which === 'in') c.fadeIn = Math.round(clamp(tt - c.start, 0, d - (c.fadeOut || 0)) * 100) / 100;
          else c.fadeOut = Math.round(clamp(core.clipEnd(c) - tt, 0, d - (c.fadeIn || 0)) * 100) / 100;
        });
        this.render();
      };
      const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); store.commitLive(); SC.inspector.refresh(); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    },

    clipMenu(e, c) {
      if (!S.selection.has(c.id)) store.select(c.id);
      const m = c.mediaId ? core.mediaById(S.project, c.mediaId) : null;
      const canDetach = c.kind === 'video' && m && m.hasAudio && !c.audioDetached;
      const items = [
        { label: t('ctx.props'), icon: 'props', action: () => SC.inspector.open(c.id) },
        '-',
        { label: t('ctx.split'), icon: 'split', key: 'S', action: () => SC.app.cmd('split') },
        { label: t('ctx.copy'), icon: 'copy', key: 'Ctrl+C', action: () => SC.app.cmd('copy') },
        { label: t('ctx.paste'), icon: 'paste', key: 'Ctrl+V', action: () => SC.app.cmd('paste'), disabled: !S.clipboard },
        { label: t('ctx.duplicate'), icon: 'duplicate', key: 'Ctrl+D', action: () => SC.app.cmd('duplicate') },
        '-'
      ];
      if (canDetach) items.push({ label: t('ctx.detach'), icon: 'detach', action: () => store.change('detach', () => { if (edit.detachAudio(c)) toast(t('toast.detached'), 'ok'); }) });
      if (c.kind === 'video' || c.kind === 'audio') items.push({ label: c.muted ? t('ctx.unmute') : t('ctx.mute'), icon: c.muted ? 'speaker' : 'speakerOff', action: () => store.change('mute', () => { c.muted = !c.muted; }) });
      items.push(
        { label: t('ctx.clearFx'), icon: 'close', action: () => store.change('clearfx', () => { c.effects = []; }), disabled: !(c.effects || []).length },
        { label: t('ctx.clearTrans'), icon: 'close', action: () => store.change('cleartr', () => { edit.removeTransition(c, 'in'); edit.removeTransition(c, 'out'); }), disabled: !c.transIn && !c.transOut },
        '-',
        { label: t('ctx.delete'), icon: 'trash', key: 'Del', action: () => SC.app.cmd('delete') },
        { label: t('ctx.ripple'), icon: 'ripple', key: 'Shift+Del', action: () => SC.app.cmd('ripple') }
      );
      contextMenu(e.clientX, e.clientY, items);
    },

    /* ---------------- marquee / empty area ---------------- */
    initMarquee() {
      this.scroll.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || e.target.closest('.clip')) return;
        SC.activeMonitor = 'program';
        const r = this.scroll.getBoundingClientRect();
        const ti = this.clientToTrack(e.clientY);
        if (S.project.tracks[ti]) { S.selectedTrack = S.project.tracks[ti].id; this.updateSelection(); }
        const x0 = e.clientX - r.left + this.scroll.scrollLeft, y0 = e.clientY - r.top + this.scroll.scrollTop;
        let box = null;
        const additive = e.shiftKey || e.ctrlKey || e.metaKey;
        const before = new Set(S.selection);
        const mv = (ev) => {
          const x1 = ev.clientX - r.left + this.scroll.scrollLeft, y1 = ev.clientY - r.top + this.scroll.scrollTop;
          if (!box && Math.abs(x1 - x0) + Math.abs(y1 - y0) < 5) return;
          if (!box) { box = el('div', { class: 'marquee' }); this.content.append(box); }
          const L = Math.min(x0, x1), T = Math.min(y0, y1), W = Math.abs(x1 - x0), H = Math.abs(y1 - y0);
          Object.assign(box.style, { left: L + 'px', top: T + 'px', width: W + 'px', height: H + 'px' });
          const ids = [];
          S.project.clips.forEach(c => {
            const i = core.trackIndex(S.project, c.trackId);
            const cx0 = this.x(c.start), cx1 = this.x(core.clipEnd(c)), cy0 = i * TH(), cy1 = cy0 + TH();
            if (cx1 > L && cx0 < L + W && cy1 > T && cy0 < T + H) ids.push(c.id);
          });
          S.selection = new Set(additive ? [...before, ...ids] : ids);
          store.emit('selection');
        };
        const up = (ev) => {
          window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
          if (box) box.remove();
          else {
            if (!additive) store.select([]);
            // click on empty space: move playhead there
            SC.program.seek(this.clientToTime(ev.clientX));
          }
        };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
      this.scroll.addEventListener('mousemove', (e) => {
        if (S.tool !== 'blade') { this.bladeLine.style.display = 'none'; return; }
        const tt = this.clientToTime(e.clientX);
        this.bladeLine.style.display = 'block';
        this.bladeLine.style.left = this.x(this.snapTime(tt, null, false).t) + 'px';
      });
      this.scroll.addEventListener('mouseleave', () => { this.bladeLine.style.display = 'none'; });
      this.scroll.addEventListener('scroll', () => { this.userScrolling = true; clearTimeout(this._usTimer); this._usTimer = setTimeout(() => { this.userScrolling = false; }, 800); });
    },

    /* ---------------- drop targets (media / effects / transitions / OS files) ---------------- */
    clipAt(clientX, clientY) {
      const ti = this.clientToTrack(clientY);
      const tr = S.project.tracks[ti];
      if (!tr) return null;
      const tt = this.clientToTime(clientX);
      return S.project.clips.find(c => c.trackId === tr.id && tt >= c.start && tt < core.clipEnd(c)) || null;
    },
    clearDropHints() {
      if (this.ghost) { this.ghost.remove(); this.ghost = null; }
      this.cutHint.style.display = 'none';
      this.hideSnap();
      if (this.clipEls) for (const e of this.clipEls.values()) e.classList.remove('drop-fx');
      this.tracksEl.querySelectorAll('.drop-target').forEach(x => x.classList.remove('drop-target'));
    },
    transitionTarget(e) {
      const c = this.clipAt(e.clientX, e.clientY);
      const tt = this.clientToTime(e.clientX);
      const ti = this.clientToTrack(e.clientY);
      const tr = S.project.tracks[ti];
      // near a cut between two adjacent clips?
      const tol = 14 / S.zoom;
      for (const a of S.project.clips) {
        if (a.trackId !== tr.id) continue;
        const end = core.clipEnd(a);
        if (Math.abs(end - tt) < tol) {
          const b = S.project.clips.find(x => x.trackId === tr.id && Math.abs(x.start - end) < 1e-3);
          if (b) return { clip: b, edge: 'in', x: end, ti };
        }
      }
      if (!c) return null;
      const mid = (c.start + core.clipEnd(c)) / 2;
      return tt < mid ? { clip: c, edge: 'in', x: c.start, ti } : { clip: c, edge: 'out', x: core.clipEnd(c), ti };
    },
    payload(e) {
      const dt = e.dataTransfer;
      if (dt.types.includes('application/x-slaxx-media')) return SC.dragPayload && SC.dragPayload.kind === 'media' ? SC.dragPayload : { kind: 'media', id: null };
      if (dt.types.includes('application/x-slaxx-fx')) return Object.assign({ kind: 'fx' }, SC.dragPayload || {}, { kind: 'fx' });
      if (dt.types.includes('application/x-slaxx-tr')) return { kind: 'tr', type: SC.dragPayload && SC.dragPayload.type };
      if (dt.types.includes('Files')) return { kind: 'files' };
      return null;
    },
    initDrop() {
      const target = this.scroll;
      target.addEventListener('dragover', (e) => {
        const pl = this.payload(e);
        if (!pl) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        this.clearDropHints();
        const ti = this.clientToTrack(e.clientY);
        const row = this.tracksEl.children[ti];
        if (pl.kind === 'media' || pl.kind === 'files') {
          const m = pl.id ? core.mediaById(S.project, pl.id) : null;
          let len = 5;
          if (m) {
            const inP = pl.inP != null ? pl.inP : 0;
            const outP = pl.outP != null ? pl.outP : (m.isImage ? (S.settings.imageDuration || 5) : m.duration);
            len = m.isImage ? (pl.outP != null ? outP - inP : outP) : outP - inP;
          }
          let st = this.clientToTime(e.clientX);
          const s1 = this.snapTime(st, null, false), s2 = this.snapTime(st + len, null, false);
          if (s1.snapped) st = s1.t; else if (s2.snapped) st = s2.t - len;
          st = Math.max(0, st);
          if (s1.snapped || s2.snapped) { this.snapLine.style.display = 'block'; this.snapLine.style.left = this.x(s1.snapped ? s1.t : s2.t) + 'px'; }
          this.dropInfo = { ti, start: st };
          this.ghost = el('div', { class: 'tl-ghost', style: { left: this.x(st) + 'px', width: Math.max(4, len * S.zoom) + 'px', top: (ti * TH() + 3) + 'px' } });
          this.content.append(this.ghost);
        } else if (pl.kind === 'fx') {
          if (pl.type === 'text') {
            const st = Math.max(0, this.clientToTime(e.clientX));
            this.dropInfo = { ti, start: st };
            this.ghost = el('div', { class: 'tl-ghost', style: { left: this.x(st) + 'px', width: 5 * S.zoom + 'px', top: (ti * TH() + 3) + 'px' } });
            this.content.append(this.ghost);
          } else {
            const c = this.clipAt(e.clientX, e.clientY);
            if (c && this.clipEls.get(c.id)) this.clipEls.get(c.id).classList.add('drop-fx');
            else if (row) row.classList.add('drop-target');
          }
        } else if (pl.kind === 'tr') {
          const tg = this.transitionTarget(e);
          if (tg) {
            this.cutHint.style.display = 'block';
            this.cutHint.style.left = this.x(tg.x) + 'px';
            this.cutHint.style.top = (tg.ti * TH() + 2) + 'px';
          }
        }
      });
      target.addEventListener('dragleave', (e) => { if (!target.contains(e.relatedTarget)) this.clearDropHints(); });
      target.addEventListener('drop', async (e) => {
        const pl = this.payload(e);
        this.clearDropHints();
        if (!pl) return;
        e.preventDefault();
        const ti = this.clientToTrack(e.clientY);
        const tr = S.project.tracks[ti];
        if (pl.kind === 'media') {
          const id = pl.id || e.dataTransfer.getData('application/x-slaxx-media');
          const m = core.mediaById(S.project, id);
          if (!m) return;
          const info = this.dropInfo || { start: this.clientToTime(e.clientX) };
          store.change('drop', () => {
            const isImg = m.isImage;
            const inP = pl.inP != null ? pl.inP : null, outP = pl.outP != null ? pl.outP : null;
            const c = edit.placeMedia(m, tr.id, info.start, isImg ? 0 : inP, isImg && outP != null ? outP - (inP || 0) : outP);
            if (c) store.select(c.id);
          });
        } else if (pl.kind === 'files') {
          const paths = SC.media.filesFromDrop(e);
          let st = (this.dropInfo && this.dropInfo.start) || this.clientToTime(e.clientX);
          const list = await SC.media.importFiles(paths);
          store.change('drop-files', () => {
            for (const m of list) {
              const c = edit.placeMedia(m, tr.id, st);
              if (c) st = core.clipEnd(c);
            }
          });
        } else if (pl.kind === 'fx') {
          const type = pl.type || e.dataTransfer.getData('application/x-slaxx-fx');
          if (type === 'text') { this.addTextAt(this.dropInfo ? this.dropInfo.start : this.clientToTime(e.clientX), tr.id, pl.template, pl.props); return; }
          const c = this.clipAt(e.clientX, e.clientY);
          if (type === 'match' || type === 'normalize') { SC.edit.runAction(type, S.selection.size ? store.selectedClips() : (c ? [c] : S.project.clips)); return; }
          if (!c) { toast(t('toast.noTarget')); return; }
          store.select(c.id);
          this.applyEffectTo([c], type);
        } else if (pl.kind === 'tr') {
          const type = pl.type || e.dataTransfer.getData('application/x-slaxx-tr');
          const tg = this.transitionTarget(e);
          if (!tg) { toast(t('toast.noTarget')); return; }
          this.applyTransitionTo(tg.clip, tg.edge, type);
        }
        this.dropInfo = null;
      });
    },

    applyEffectTo(clips, type) {
      if (SC.effectsPanel.ASYNC.includes(type)) { SC.edit.runAction(type, clips); return; }
      let msg = null;
      store.change('fx', () => { for (const c of clips) { const r = edit.applyEffect(c, type); if (r) msg = r; } });
      if (msg) toast(t(msg), msg === 'toast.fxAdded' || msg === 'toast.detached' || msg === 'toast.speedSet' ? 'ok' : '');
      if (clips.length === 1 && core.EFFECTS[type] && !core.EFFECTS[type].action) SC.inspector.open(clips[0].id, 'fx');
    },
    applyTransitionTo(c, edge, type) {
      if (S.project.tracks.find(x => x.id === c.trackId).locked) { toast(t('toast.locked')); return; }
      store.change('tr', () => edit.applyTransition(c, edge, type));
      toast(t('toast.trAdded'), 'ok');
    },
    addTextAt(start, trackId, template, props) {
      store.change('text', () => {
        const c = edit.makeText({ start: Math.max(0, start) }, template, props);
        const d = core.clipDuration(c);
        let tid = trackId || S.project.tracks[0].id;
        if (!edit.isFree(tid, c.start, c.start + d)) tid = edit.findFreeTrack(tid, c.start, c.start + d) || (edit.addTrack() || {}).id || tid;
        c.trackId = tid;
        S.project.clips.push(c);
        store.select(c.id);
      });
      const c = store.selectedClips()[0];
      if (c) SC.inspector.open(c.id);
    },

    /* ---------------- tracks ---------------- */
    addTrack() { store.change('add-track', () => { const tr = edit.addTrack(); if (tr) S.selectedTrack = tr.id; }); },
    async removeTrack(tr) {
      const p = S.project;
      if (p.tracks.length <= core.MIN_TRACKS) { toast(t('toast.minTracks')); return; }
      if (!tr) {
        // corner button: remove the selected track if empty, else the last empty one
        tr = p.tracks.find(x => x.id === S.selectedTrack && !p.clips.some(c => c.trackId === x.id))
          || p.tracks.slice().reverse().find(x => !p.clips.some(c => c.trackId === x.id))
          || p.tracks.find(x => x.id === S.selectedTrack) || p.tracks[p.tracks.length - 1];
      }
      if (p.clips.some(c => c.trackId === tr.id)) {
        const r = await SC.ui.ask(t('dlg.removeTrack'), [t('dlg.yes'), t('dlg.no')]);
        if (r !== 0) return;
      }
      store.change('rm-track', () => {
        p.clips = p.clips.filter(c => c.trackId !== tr.id);
        p.tracks = p.tracks.filter(x => x !== tr);
        if (S.selectedTrack === tr.id) S.selectedTrack = p.tracks[0].id;
      });
    },
    renameTrack(tr, nameEl) {
      const inp = el('input', { type: 'text', value: tr.name || '', style: { width: '100%', height: '22px', borderRadius: '5px', border: '1px solid var(--accent)', background: 'var(--bg2)', padding: '0 4px' } });
      nameEl.replaceWith(inp);
      inp.focus(); inp.select();
      const done = () => { const v = inp.value.trim(); store.change('rename', () => { tr.name = v || tr.name; }); this.render(); };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = tr.name; inp.blur(); } });
      inp.addEventListener('blur', done);
    }
  };

  SC.timeline = TL;
})();
