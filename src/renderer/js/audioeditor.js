/* SlaxxCUT – audio editor (audio mode): waveform, selection editing, volume envelope, noise profile, recording. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $, iconBtn, toast, clamp } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S, edit = SC.edit;
  const t = (k) => SC.t(k);
  const DB_TOP = 12, DB_BOTTOM = -40; // envelope range

  const AE = {
    clipId: null, sel: null, view: null, // view: [a, b] timeline seconds
    build() {
      const root = $('#audioEditor');
      root.addEventListener('mousedown', () => { SC.activeMonitor = 'program'; });
      // head
      const head = el('div', { class: 'ae-head' }, [el('h3', { text: t('ae.title') })]);
      this.fileEl = el('div', { class: 'file' });
      this.soloBtn = iconBtn('solo', 'ae.solo', () => this.toggleSolo());
      this.devSel = el('select', { class: 'sel', style: { width: '170px' }, 'data-tip': 'ae.device' });
      this.recBtn = iconBtn('record', 'ae.record', () => this.toggleRecord(), { class: 'ibtn rec-btn' });
      this.recTime = el('span', { class: 'tc', text: '' });
      this.playAlong = el('input', { type: 'checkbox', checked: true });
      const pa = el('label', { class: 'check', 'data-tip': 'ae.playAlong' }, [this.playAlong, el('span', { text: t('ae.playAlongShort'), style: { fontSize: '12px' } })]);
      this.vu = el('div', { class: 'vu', 'data-tip': 'ae.vu' }, [el('div', {}, [el('i')]), el('div', {}, [el('i')])]);
      head.append(this.fileEl, this.soloBtn, el('div', { class: 'sep', style: { width: '1px', height: '22px', background: 'var(--line)' } }), this.devSel, pa, this.recBtn, this.recTime, this.vu);
      // canvas
      this.wrap = el('div', { class: 'ae-canvas-wrap' });
      this.cv = el('canvas');
      this.empty = el('div', { class: 'empty', html: SC.icon('wave') + '<div>' + SC.ui.escapeHtml(t('ae.empty')) + '</div>' });
      this.wrap.append(this.cv, this.empty);
      // tools
      const tools = el('div', { class: 'ae-tools' });
      const b = (icon, tip, fn) => iconBtn(icon, tip, fn);
      this.playBtn = b('play', 'tip.play', () => SC.program.toggle());
      this.loopBtn = b('loop', 'ae.loopSel', () => { SC.program.loop = !SC.program.loop; this.loopBtn.classList.toggle('active', SC.program.loop); });
      this.selTc = el('span', { class: 'tc' });
      tools.append(
        b('playSel', 'ae.playSel', () => this.playSelection()), this.playBtn, this.loopBtn, el('div', { class: 'sep' }),
        b('scissors', 'ae.cut', () => this.op('cut')), b('copy', 'ae.copy', () => this.op('copy')), b('trashSel', 'ae.delete', () => this.op('delete')), b('mute2', 'ae.silence', () => this.op('silence')), el('div', { class: 'sep' }),
        b('fadeInSel', 'ae.fadeIn', () => this.op('fadeIn')), b('fadeOutSel', 'ae.fadeOut', () => this.op('fadeOut')),
        b('louder', 'ae.gainUp', () => this.op('gainUp')), b('quieter', 'ae.gainDown', () => this.op('gainDown')), b('peak', 'ae.normalize', () => this.op('normalize')), el('div', { class: 'sep' }),
        b('noiseProfile', 'ae.noiseProfile', () => this.noiseProfile()), b('denoise', 'ae.denoise', () => this.op('fx', 'denoise')), b('grading', 'ae.fxSel', (e) => this.fxMenu(e)),
        b('reverse', 'ae.reverse', () => this.op('reverse')), b('silence', 'ae.removeSilence', () => this.removeSilence()), el('div', { class: 'sep' }),
        b('zoomOut', 'tool.zoomOut', () => this.zoom(1.5)), b('zoomIn', 'tool.zoomIn', () => this.zoom(1 / 1.5)), b('zoomFit', 'tool.zoomFit', () => { this.view = null; this.draw(); }),
        el('div', { class: 'spacer' }), this.selTc
      );
      root.append(head, this.wrap, tools);
      new ResizeObserver(() => this.draw()).observe(this.wrap);
      this.initMouse();
      store.on('selection', () => this.syncClip());
      store.on('project', () => { if (SC.app.mode === 'audio') { this.syncClip(); this.draw(); } });
      store.on('playhead', () => { if (SC.app.mode === 'audio') this.draw(); });
      store.on('runtime', () => this.draw());
      SC.program.onState((pl) => { this.playBtn.innerHTML = SC.icon(pl ? 'pause' : 'play'); });
      navigator.mediaDevices && navigator.mediaDevices.addEventListener && navigator.mediaDevices.addEventListener('devicechange', () => this.listDevices());
    },
    activate() { this.listDevices(); this.syncClip(); this.draw(); },
    clip() { return this.clipId ? store.clipById(this.clipId) : null; },
    syncClip() {
      const sel = store.selectedClips().filter(c => edit.hasAudioClip(c));
      const c = sel[0] || null;
      if ((c && c.id) !== this.clipId) { this.clipId = c ? c.id : null; this.view = null; this.sel = null; }
      const m = c && core.mediaById(S.project, c.mediaId);
      this.fileEl.textContent = c ? (m ? m.name : '') : '';
      this.empty.style.display = c ? 'none' : 'flex';
      this.soloBtn.classList.toggle('solo-on', !!SC.program.soloClip && SC.program.soloClip === this.clipId);
      this.draw();
    },
    range() {
      const c = this.clip();
      if (!c) return [0, 1];
      if (this.view) return this.view;
      return [c.start, core.clipEnd(c)];
    },
    zoom(k) {
      const c = this.clip(); if (!c) return;
      const [a, b] = this.range();
      const mid = (S.playhead >= a && S.playhead <= b) ? S.playhead : (a + b) / 2;
      const half = Math.max(0.05, (b - a) * k / 2);
      this.view = [Math.max(c.start, mid - half), Math.min(core.clipEnd(c), mid + half)];
      if (this.view[1] - this.view[0] >= core.clipDuration(c) - 1e-3) this.view = null;
      this.draw();
    },
    xToT(x) { const [a, b] = this.range(); return a + (b - a) * x / this.cv.clientWidth; },
    tToX(tt) { const [a, b] = this.range(); return (tt - a) / (b - a) * this.cv.clientWidth; },
    dbToY(db, H) { return (DB_TOP - db) / (DB_TOP - DB_BOTTOM) * H; },
    yToDb(y, H) { return DB_TOP - y / H * (DB_TOP - DB_BOTTOM); },

    draw() {
      if (!this.cv || SC.app.mode !== 'audio') return;
      const W = this.cv.clientWidth, H = this.cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (!W || !H) return;
      if (this.cv.width !== W * dpr || this.cv.height !== H * dpr) { this.cv.width = W * dpr; this.cv.height = H * dpr; }
      const ctx = this.cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const c = this.clip();
      this.updateSelTc();
      if (!c) return;
      const m = core.mediaById(S.project, c.mediaId);
      const rt = m ? (S.runtime[m.id] || {}) : {};
      const [a, b] = this.range();
      // grid
      ctx.strokeStyle = 'rgba(127,160,210,.12)'; ctx.fillStyle = 'rgba(160,190,230,.6)'; ctx.font = '10px Inter, sans-serif';
      const step = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60].find(s => s / (b - a) * W > 80) || 60;
      for (let x0 = Math.ceil(a / step) * step; x0 <= b; x0 += step) {
        const x = Math.round(this.tToX(x0)) + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        ctx.fillText(core.fmtTime(x0, S.project.settings.fps, step < 1), x + 3, 12);
      }
      // waveform (stereo-like mirrored)
      const mid = H / 2;
      if (rt.wave && rt.wave.peaks) {
        const pps = rt.wave.pps, peaks = rt.wave.peaks;
        ctx.fillStyle = 'rgba(127,196,255,.85)';
        for (let x = 0; x < W; x++) {
          const t0 = this.xToT(x), t1 = this.xToT(x + 1);
          const s0 = core.sourceTime(c, t0), s1 = core.sourceTime(c, t1);
          let mx = 0;
          for (let i = Math.floor(s0 * pps); i <= Math.min(peaks.length - 1, Math.ceil(s1 * pps)); i++) if (peaks[i] > mx) mx = peaks[i];
          const A = { gainDb: +(c.volume || 0), gainExpr: core.keyExpr(c, 'volume'), fades: [] };
          const g = Math.min(2, core.audioGainAt(A, t0));
          const h = Math.max(1, mx / 100 * (H * 0.45) * g);
          ctx.fillRect(x, mid - h, 1, h * 2);
        }
      }
      ctx.strokeStyle = 'rgba(127,196,255,.25)'; ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(W, mid + 0.5); ctx.stroke();
      // fades shading
      const D = core.clipDuration(c);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      if (c.fadeIn > 0) { const x1 = this.tToX(c.start + c.fadeIn); ctx.beginPath(); ctx.moveTo(this.tToX(c.start), 0); ctx.lineTo(x1, 0); ctx.lineTo(this.tToX(c.start), H); ctx.fill(); }
      if (c.fadeOut > 0) { const x0 = this.tToX(c.start + D - c.fadeOut); ctx.beginPath(); ctx.moveTo(this.tToX(c.start + D), 0); ctx.lineTo(x0, 0); ctx.lineTo(this.tToX(c.start + D), H); ctx.fill(); }
      // selection
      if (this.sel) {
        const x0 = this.tToX(this.sel[0]), x1 = this.tToX(this.sel[1]);
        ctx.fillStyle = 'rgba(59,140,255,.28)'; ctx.fillRect(x0, 0, x1 - x0, H);
        ctx.strokeStyle = '#7fc4ff'; ctx.strokeRect(x0 + 0.5, 0.5, x1 - x0 - 1, H - 1);
      }
      // volume envelope
      const keys = core.keyList(c, 'volume');
      ctx.strokeStyle = '#ffb547'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let x = 0; x <= W; x += 2) {
        const tt = this.xToT(x);
        const db = keys ? core.keyValueAt(c, 'volume', tt - c.start) : +(c.volume || 0);
        const y = this.dbToY(db, H);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke(); ctx.lineWidth = 1;
      if (keys) {
        ctx.fillStyle = '#ffb547';
        for (const k of keys) { const x = this.tToX(c.start + k.t), y = this.dbToY(k.v, H); ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.fillStyle = 'rgba(255,181,71,.8)'; ctx.fillText('0 dB', 4, this.dbToY(0, H) - 3);
      // noise profile marker
      const np = S.project.noiseProfile;
      if (np && np.mediaId === c.mediaId) {
        const x0 = this.tToX(c.start + (np.start - c.in) / (c.speed || 1)), x1 = this.tToX(c.start + (np.end - c.in) / (c.speed || 1));
        ctx.fillStyle = 'rgba(58,210,159,.18)'; ctx.fillRect(x0, H - 14, x1 - x0, 14);
        ctx.fillStyle = '#3ad29f'; ctx.fillText(t('np.label'), x0 + 3, H - 3);
      }
      // playhead
      const px = this.tToX(S.playhead);
      if (px >= 0 && px <= W) { ctx.fillStyle = '#ff4f6a'; ctx.fillRect(Math.round(px) - 1, 0, 2, H); }
    },
    updateSelTc() {
      if (!this.selTc) return;
      const fps = S.project.settings.fps;
      this.selTc.innerHTML = this.sel ? t('ae.selection') + ': <b>' + core.fmtTime(this.sel[0], fps, true) + '</b> – <b>' + core.fmtTime(this.sel[1], fps, true) + '</b> (' + (this.sel[1] - this.sel[0]).toFixed(2) + ' s)' : t('ae.noSel');
    },

    initMouse() {
      const cv = this.cv;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, H: r.height }; };
      const keyHit = (p) => {
        const c = this.clip(); const keys = c && core.keyList(c, 'volume');
        if (!keys) return null;
        return keys.find(k => Math.hypot(this.tToX(c.start + k.t) - p.x, this.dbToY(k.v, p.H) - p.y) < 7) || null;
      };
      cv.addEventListener('mousedown', (e) => {
        const c = this.clip(); if (!c || e.button !== 0) return;
        const p = pos(e);
        // envelope point drag
        const k = keyHit(p);
        const envY = this.dbToY(core.keyList(c, 'volume') ? core.keyValueAt(c, 'volume', this.xToT(p.x) - c.start) : +(c.volume || 0), p.H);
        if (k || (e.altKey) || Math.abs(p.y - envY) < 5) {
          let key = k;
          if (!key) {
            const tl = clamp(this.xToT(p.x) - c.start, 0, core.clipDuration(c));
            store.changeLive('env', () => edit.setKey(c, 'volume', tl, Math.round(this.yToDb(p.y, p.H) * 10) / 10));
            key = core.keyList(c, 'volume').find(q => Math.abs(q.t - tl) < 0.02);
          }
          const t0 = key.t;
          const mv = (ev) => {
            const q = pos(ev);
            store.changeLive('env', () => {
              const l = c.keys.volume.find(x => Math.abs(x.t - t0) < 1e-6 || x === key) || key;
              l.t = +clamp(this.xToT(q.x) - c.start, 0, core.clipDuration(c)).toFixed(3);
              l.v = Math.round(clamp(this.yToDb(q.y, q.H), DB_BOTTOM, DB_TOP) * 10) / 10;
              key = l;
              c.keys = Object.assign({}, c.keys, { volume: c.keys.volume.slice().sort((a, b) => a.t - b.t) });
            });
            this.draw();
          };
          const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); store.commitLive(); };
          window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
          return;
        }
        // selection
        const t0 = clamp(this.xToT(p.x), c.start, core.clipEnd(c));
        this.sel = null;
        SC.program.seek(t0);
        const mv = (ev) => {
          const q = pos(ev);
          const t1 = clamp(this.xToT(q.x), c.start, core.clipEnd(c));
          this.sel = Math.abs(t1 - t0) > 0.005 ? [Math.min(t0, t1), Math.max(t0, t1)] : null;
          this.draw();
        };
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); this.draw(); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      });
      cv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const c = this.clip(); if (!c) return;
        const k = keyHit(pos(e));
        if (k) { store.change('env-rm', () => edit.removeKey(c, 'volume', k.t)); return; }
        SC.ui.contextMenu(e.clientX, e.clientY, [
          { label: t('ae.cut'), icon: 'scissors', action: () => this.op('cut'), disabled: !this.sel },
          { label: t('ae.copy'), icon: 'copy', action: () => this.op('copy'), disabled: !this.sel },
          { label: t('ae.delete'), icon: 'trashSel', action: () => this.op('delete'), disabled: !this.sel },
          { label: t('ae.silence'), icon: 'mute2', action: () => this.op('silence'), disabled: !this.sel },
          '-',
          { label: t('ae.noiseProfile'), icon: 'noiseProfile', action: () => this.noiseProfile(), disabled: !this.sel },
          { label: t('kf.clear'), icon: 'trash', action: () => store.change('env-clear', () => edit.clearKeys(c, 'volume')), disabled: !core.keyList(c, 'volume') }
        ]);
      });
      cv.addEventListener('wheel', (e) => {
        if (!this.clip()) return;
        e.preventDefault();
        if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) this.zoom(e.deltaY > 0 ? 1.25 : 0.8);
        else if (this.view) {
          const c = this.clip(), d = (this.view[1] - this.view[0]) * e.deltaX / 600;
          const a = clamp(this.view[0] + d, c.start, core.clipEnd(c) - (this.view[1] - this.view[0]));
          this.view = [a, a + (this.view[1] - this.view[0])]; this.draw();
        }
      }, { passive: false });
    },

    need() {
      const c = this.clip();
      if (!c) { toast(t('ae.empty')); return null; }
      if (!this.sel) { toast(t('ae.needSel')); return null; }
      if (S.project.tracks.find(x => x.id === c.trackId).locked) { toast(t('toast.locked')); return null; }
      return c;
    },
    op(kind, arg) {
      const c = this.need(); if (!c) return;
      const [a, b] = this.sel;
      let piece = null;
      if (kind === 'copy') {
        const n = JSON.parse(JSON.stringify(c));
        n.id = core.uid('clip'); n.start = a; n.in = core.sourceTime(c, a); n.out = core.sourceTime(c, b);
        n.transIn = n.transOut = null; n.fadeIn = n.fadeOut = 0; delete n.keys; n._rel = 0;
        S.clipboard = [n];
        toast(t('toast.copied'));
        return;
      }
      if (kind === 'normalize') {
        store.change('ae-iso', () => { piece = edit.isolate(c, a, b); });
        edit.normalizePeak([piece]); this.afterOp(piece); return;
      }
      if (kind === 'reverse') {
        store.change('ae-iso', () => { piece = edit.isolate(c, a, b); });
        edit.deriveClip(piece, 'reverse'); this.afterOp(piece); return;
      }
      store.change('ae-' + kind, () => {
        piece = edit.isolate(c, a, b);
        switch (kind) {
          case 'cut': {
            const n = JSON.parse(JSON.stringify(piece)); n._rel = 0; S.clipboard = [n];
            edit.rippleDelete(new Set([piece.id])); piece = null; break;
          }
          case 'delete': edit.rippleDelete(new Set([piece.id])); piece = null; break;
          case 'silence': edit.remove(new Set([piece.id])); piece = null; break;
          case 'fadeIn': piece.fadeIn = core.clipDuration(piece); break;
          case 'fadeOut': piece.fadeOut = core.clipDuration(piece); break;
          case 'gainUp': piece.volume = Math.min(24, (+piece.volume || 0) + 3); break;
          case 'gainDown': piece.volume = Math.max(-60, (+piece.volume || 0) - 3); break;
          case 'fx': edit.applyEffect(piece, arg); break;
        }
      });
      this.afterOp(piece);
      if (kind === 'fx') toast(t('toast.fxAdded'), 'ok');
    },
    afterOp(piece) {
      this.sel = null;
      if (piece && store.clipById(piece.id)) store.select(piece.id);
      this.syncClip();
    },
    fxMenu(e) {
      const types = Object.keys(core.EFFECTS).filter(k => core.isAudioEffect(k));
      const r = e && e.currentTarget ? e.currentTarget.getBoundingClientRect() : { left: 200, bottom: 200 };
      SC.ui.contextMenu(r.left, r.bottom + 4, types.map(ty => ({ label: t('fx.' + ty), icon: core.EFFECTS[ty].icon, action: () => this.op('fx', ty) })));
    },
    async noiseProfile() {
      const c = this.need(); if (!c) return;
      const m = core.mediaById(S.project, c.mediaId);
      const s0 = core.sourceTime(c, this.sel[0]), s1 = core.sourceTime(c, this.sel[1]);
      const L = await window.api.audioLevels(m.path, s0, s1 - s0);
      if (!L || L.mean == null) { toast(t('np.failed'), 'error'); return; }
      store.change('noise-profile', () => { S.project.noiseProfile = { mediaId: m.id, start: s0, end: s1, level: L.mean }; });
      toast(t('np.saved') + ' (' + L.mean.toFixed(1) + ' dB)', 'ok');
      this.draw();
    },
    async removeSilence() {
      const c = this.clip(); if (!c) { toast(t('ae.empty')); return; }
      await edit.removeSilence(c);
      this.syncClip();
    },
    playSelection() {
      const c = this.clip(); if (!c) return;
      const [a, b] = this.sel || [c.start, core.clipEnd(c)];
      SC.program.seek(a);
      SC.program.stopAt = b; SC.program.loopFrom = a;
      SC.program.play();
    },
    toggleSolo() {
      const c = this.clip(); if (!c) { toast(t('ae.empty')); return; }
      SC.program.soloClip = SC.program.soloClip === c.id ? null : c.id;
      this.soloBtn.classList.toggle('solo-on', !!SC.program.soloClip);
      SC.program.needsRender = true;
    },

    /* ---------------- recording ---------------- */
    async listDevices() {
      try {
        const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
        const cur = this.devSel.value;
        this.devSel.innerHTML = '';
        devs.forEach((d, i) => this.devSel.append(el('option', { value: d.deviceId, text: d.label || (t('ae.mic') + ' ' + (i + 1)) })));
        if (cur) this.devSel.value = cur;
      } catch (e) { /* no devices */ }
    },
    async toggleRecord() {
      if (this.rec) { this.rec.recorder.stop(); return; }
      const ok = await window.api.micAccess();
      if (!ok) { toast(t('ae.micDenied'), 'error'); return; }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: this.devSel.value ? { exact: this.devSel.value } : undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
      } catch (e) { toast(t('ae.micDenied') + '\n' + e.message, 'error'); return; }
      this.listDevices();
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : {});
      const chunks = [];
      const startT = S.playhead;
      const ctx = SC.program.audioCtx();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
      const buf = new Float32Array(1024);
      this.rec = { recorder, stream, startT, an, buf, t0: performance.now() };
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(tr => tr.stop());
        try { src.disconnect(); } catch (e) { /* */ }
        this.rec = null;
        this.recBtn.classList.remove('recording');
        this.recTime.textContent = '';
        if (SC.program.playing) SC.program.pause();
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size < 1000) return;
        try {
          const file = await window.api.saveRecording(await blob.arrayBuffer(), 'webm');
          const list = await SC.media.importFiles([file]);
          const m = list[0];
          if (m) {
            store.change('record', () => {
              const c = edit.placeMedia(m, S.selectedTrack || S.project.tracks[S.project.tracks.length - 1].id, startT);
              if (c) store.select(c.id);
            });
            toast(t('ae.recSaved'), 'ok');
          }
        } catch (e) { toast(String(e.message || e), 'error'); }
      };
      recorder.start(250);
      this.recBtn.classList.add('recording');
      if (this.playAlong.checked) { SC.program.stopAt = null; SC.program.play(); }
    },
    tickMeters() {
      let lv = SC.program.levels();
      if (this.rec) {
        this.rec.an.getFloatTimeDomainData(this.rec.buf);
        let m = 0; for (const v of this.rec.buf) m = Math.max(m, Math.abs(v));
        const db = m > 0 ? 20 * Math.log10(m) : -90;
        lv = [db, db];
        const s = (performance.now() - this.rec.t0) / 1000;
        this.recTime.textContent = '● ' + core.fmtTime(s);
      }
      const bars = this.vu.querySelectorAll('i');
      lv.forEach((db, i) => { bars[i].style.width = Math.max(0, Math.min(100, (db + 60) / 60 * 100)) + '%'; });
    }
  };

  SC.audioEditor = AE;
})();
