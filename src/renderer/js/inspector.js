/* SlaxxCUT – clip inspector (properties drawer over the left panel). Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $, iconBtn } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S;
  const t = (k) => SC.t(k);
  const tt = (k, fb) => { const v = SC.t(k); return v === k ? fb : v; };

  const I = {
    clipId: null,
    build() {
      this.root = $('#inspector');
      store.on('selection', () => {
        if (!this.isOpen()) return;
        const sel = store.selectedClips();
        if (sel.length === 1 && sel[0].id !== this.clipId) { this.clipId = sel[0].id; this.render(); }
        else if (!sel.length) this.close();
      });
      store.on('project', (info) => {
        if (!this.isOpen()) return;
        if (info.label && String(info.label).startsWith('insp')) return;
        if (!store.clipById(this.clipId)) { this.close(); return; }
        if (info.live && info.label === 'textpos') return;
        this.render();
      });
      store.on('playhead', () => {
        if (!this.isOpen() || SC.program.playing) return;
        const c = store.clipById(this.clipId);
        if (c && c.keys && Object.keys(c.keys).length) { clearTimeout(this._ph); this._ph = setTimeout(() => this.render(), 80); }
      });
    },
    isOpen() { return this.root.classList.contains('open'); },
    open(id, focus) {
      this.clipId = id;
      this.root.classList.add('open');
      this.render();
      if (focus) {
        const sec = this.root.querySelector('[data-sec="' + focus + '"]');
        if (sec) sec.scrollIntoView({ block: 'start' });
      }
    },
    close() { this.root.classList.remove('open'); this.clipId = null; },
    toggle() {
      if (this.isOpen()) { this.close(); return; }
      const sel = store.selectedClips();
      if (!sel.length) { SC.ui.toast(t('toast.noSel')); return; }
      this.open(sel[0].id);
    },
    refresh() { if (this.isOpen()) this.render(); },

    /* ---------- field builders ---------- */
    range(label, val, min, max, step, onInput, kf) {
      const row = el('div', { class: 'row' + (kf && kf.animated ? ' keyed' : '') }, [el('label', { text: label })]);
      const v = el('div', { class: 'val' });
      const r = el('input', { type: 'range', min, max, step, value: val });
      const n = el('input', { type: 'number', class: 'num', min, max, step, value: Math.round(val * 1000) / 1000 });
      r.addEventListener('input', () => { n.value = r.value; onInput(+r.value); });
      n.addEventListener('change', () => { const x = Math.min(max, Math.max(min, +n.value || 0)); r.value = x; onInput(x); });
      n.addEventListener('keydown', (e) => e.stopPropagation());
      v.append(r, n);
      if (kf) v.append(this.kfControls(kf));
      row.append(v);
      return row;
    },
    select(label, val, opts, onChange) {
      const row = el('div', { class: 'row' }, [el('label', { text: label })]);
      const s = el('select', { class: 'sel' });
      for (const o of opts) s.append(el('option', { value: o.v, text: o.l, selected: String(o.v) === String(val) }));
      s.addEventListener('change', () => onChange(s.value));
      row.append(el('div', { class: 'val' }, [s]));
      return row;
    },
    color(label, val, onInput) {
      const row = el('div', { class: 'row' }, [el('label', { text: label })]);
      const c = el('input', { type: 'color', value: val || '#ffffff' });
      c.addEventListener('input', () => onInput(c.value));
      row.append(el('div', { class: 'val' }, [c]));
      return row;
    },
    check(label, val, onChange) {
      const row = el('div', { class: 'row' }, [el('label', { text: label })]);
      const lab = el('label', { class: 'check' });
      const c = el('input', { type: 'checkbox', checked: !!val });
      c.addEventListener('change', () => onChange(c.checked));
      lab.append(c);
      row.append(el('div', { class: 'val' }, [lab]));
      return row;
    },
    segRow(label, val, opts, onChange) {
      const row = el('div', { class: 'row' }, [el('label', { text: label })]);
      const seg = el('div', { class: 'seg-wide' });
      for (const o of opts) {
        const b = el('button', { type: 'button', class: String(o.v) === String(val) ? 'active' : '' });
        b.innerHTML = (o.icon ? SC.icon(o.icon) : '') + '<span>' + SC.ui.escapeHtml(o.l) + '</span>';
        b.addEventListener('click', () => onChange(o.v));
        seg.append(b);
      }
      row.append(el('div', { class: 'val' }, [seg]));
      return row;
    },
    section(titleKey, icon, key) {
      const s = el('div', { class: 'insp-sec', 'data-sec': key || '' });
      const h = el('div', { class: 'sec-title' });
      h.innerHTML = (icon ? SC.icon(icon) : '') + '<span>' + SC.ui.escapeHtml(t(titleKey)) + '</span>';
      s.append(h);
      return s;
    },
    live(key, fn) { store.changeLive('insp-' + key, fn); },
    now(key, fn) { store.change('insp-' + key, fn); this.render(); },

    /* ---------- keyframes ---------- */
    local(c) { return Math.max(0, Math.min(core.clipDuration(c), S.playhead - c.start)); },
    kfSpec(c, prop, toV, fromV, staticGet, staticSet) {
      const animated = !!core.keyList(c, prop);
      const tl = this.local(c);
      const cur = animated ? core.keyValueAt(c, prop, tl) : staticGet();
      return {
        prop, animated, value: fromV(cur), onKey: SC.edit.keyAt(c, prop, tl),
        set: (sliderVal) => {
          const v = toV(sliderVal);
          if (animated) this.live('kf-' + prop, () => SC.edit.setKey(c, prop, this.local(c), v));
          else this.live('st-' + prop, () => staticSet(v));
        },
        toggle: () => {
          const l = this.local(c);
          this.now('kft-' + prop, () => {
            if (SC.edit.keyAt(c, prop, l)) SC.edit.removeKey(c, prop, l);
            else SC.edit.setKey(c, prop, l, animated ? core.keyValueAt(c, prop, l) : staticGet());
          });
        },
        jump: (dir) => {
          const l = core.keyList(c, prop) || [];
          const cur2 = this.local(c);
          const k = dir < 0 ? l.slice().reverse().find(x => x.t < cur2 - 0.01) : l.find(x => x.t > cur2 + 0.01);
          if (k) SC.program.seek(c.start + k.t);
        },
        clear: () => this.now('kfc-' + prop, () => SC.edit.clearKeys(c, prop))
      };
    },
    kfControls(kf) {
      const w = el('span', { class: 'kfc' });
      const prev = iconBtn('keyPrev', 'kf.prev', () => kf.jump(-1));
      const tog = iconBtn('keyframe', 'kf.toggle', () => kf.toggle());
      if (kf.onKey) tog.classList.add('on'); else if (kf.animated) tog.classList.add('has');
      const next = iconBtn('keyNext', 'kf.next', () => kf.jump(1));
      w.append(prev, tog, next);
      if (kf.animated) tog.addEventListener('contextmenu', (e) => { e.preventDefault(); SC.ui.contextMenu(e.clientX, e.clientY, [{ label: t('kf.clear'), icon: 'trash', action: kf.clear }]); });
      return w;
    },
    kfRange(c, label, prop, min, max, step, toV, fromV, staticGet, staticSet) {
      const kf = this.kfSpec(c, prop, toV, fromV, staticGet, staticSet);
      return this.range(label, kf.value, min, max, step, kf.set, kf);
    },

    /* ---------- render ---------- */
    render() {
      const c = store.clipById(this.clipId);
      const scrollTop = this._body ? this._body.scrollTop : 0;
      this.root.innerHTML = '';
      if (!c) return;
      const p = S.project;
      const m = c.mediaId ? core.mediaById(p, c.mediaId) : null;
      const head = el('div', { class: 'insp-head' });
      head.innerHTML = SC.icon({ video: 'video', image: 'image', audio: 'audio', text: 'text' }[c.kind]);
      head.append(el('h3', { text: c.kind === 'text' ? t('fx.text') : (m ? m.name : t('insp.clip')) }));
      head.append(iconBtn('close', 'insp.close', () => this.close()));
      const body = el('div', { class: 'insp-body' });
      this._body = body;
      this.root.append(head, body);

      // --- clip timing
      const sc = this.section('insp.clip', 'props');
      sc.append(this.range(t('insp.start'), +c.start.toFixed(2), 0, Math.max(600, Math.ceil(c.start + 60)), 0.01, (v) => this.live('start', () => { c.start = v; })));
      if (c.kind === 'image' || c.kind === 'text') {
        sc.append(this.range(t('insp.duration'), +core.clipDuration(c).toFixed(2), 0.2, 600, 0.1, (v) => this.live('dur', () => {
          c.out = c.in + v; c.fadeIn = Math.min(c.fadeIn, v); c.fadeOut = Math.min(c.fadeOut, v);
        })));
      } else {
        sc.append(this.select(t('insp.speed'), c.speed || 1, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8, 16].map(v => ({ v, l: v + '×' })), (v) => this.now('speed', () => SC.edit.setSpeed(c, +v))));
      }
      body.append(sc);

      // --- picture (with keyframes)
      if (SC.edit.hasVisual(c)) {
        const sv = this.section('insp.transform', 'image');
        c.transform = c.transform || { scale: 1, x: 0, y: 0, rot: 0 };
        const tf = () => c.transform;
        const setTf = (k) => (v) => { c.transform = Object.assign({}, c.transform, { [k]: v }); };
        if (c.kind !== 'text') sv.append(this.select(t('insp.fit'), c.fit || 'contain', ['contain', 'cover', 'stretch'].map(v => ({ v, l: t('fit.' + v) })), (v) => this.now('fit', () => { c.fit = v; })));
        sv.append(this.kfRange(c, t('insp.scale'), 'scale', 10, 400, 1, (x) => x / 100, (v) => Math.round(v * 100), () => tf().scale == null ? 1 : +tf().scale, setTf('scale')));
        sv.append(this.kfRange(c, t('insp.posX'), 'x', -100, 100, 1, (x) => x / 100, (v) => Math.round(v * 100), () => +tf().x || 0, setTf('x')));
        sv.append(this.kfRange(c, t('insp.posY'), 'y', -100, 100, 1, (x) => x / 100, (v) => Math.round(v * 100), () => +tf().y || 0, setTf('y')));
        sv.append(this.kfRange(c, t('insp.rot'), 'rot', -180, 180, 1, (x) => x, (v) => Math.round(v), () => +tf().rot || 0, setTf('rot')));
        sv.append(this.kfRange(c, t('insp.opacity'), 'opacity', 0, 100, 1, (x) => x / 100, (v) => Math.round(v * 100), () => (c.opacity == null ? 1 : c.opacity), (v) => { c.opacity = v; }));
        sv.append(el('div', { class: 'muted-note', text: t('kf.hint') }));
        const rb = el('button', { class: 'btn', type: 'button', text: t('insp.reset') });
        rb.addEventListener('click', () => this.now('reset-tf', () => { c.transform = { scale: 1, x: 0, y: 0, rot: 0 }; c.opacity = 1; if (c.keys) { for (const k of ['scale', 'x', 'y', 'rot', 'opacity']) delete c.keys[k]; } }));
        sv.append(rb);
        body.append(sv);
      }

      // --- text
      if (c.kind === 'text') body.append(this.textSection(c));

      // --- audio
      const hasA = c.kind === 'audio' || (c.kind === 'video' && m && m.hasAudio && !c.audioDetached);
      const sa = this.section('insp.audio', 'audio');
      if (hasA) {
        sa.append(this.kfRange(c, t('insp.volume'), 'volume', -40, 24, 0.5, (x) => x, (v) => Math.round(v * 10) / 10, () => +(c.volume || 0), (v) => { c.volume = v; }));
        sa.append(this.check(t('insp.muted'), c.muted, (v) => this.now('mute', () => { c.muted = v; })));
      }
      const dmax = Math.max(0.1, +core.clipDuration(c).toFixed(2));
      sa.append(this.range(t('insp.fadeIn'), +(c.fadeIn || 0), 0, dmax, 0.05, (v) => this.live('fi', () => { c.fadeIn = v; })));
      sa.append(this.range(t('insp.fadeOut'), +(c.fadeOut || 0), 0, dmax, 0.05, (v) => this.live('fo', () => { c.fadeOut = v; })));
      if (c.kind === 'video' && m && m.hasAudio && !c.audioDetached) {
        const db = el('button', { class: 'btn', type: 'button' });
        db.innerHTML = SC.icon('detach') + '<span>' + SC.ui.escapeHtml(t('fx.detach')) + '</span>';
        db.addEventListener('click', () => store.change('detach', () => { if (SC.edit.detachAudio(c)) SC.ui.toast(t('toast.detached'), 'ok'); }));
        sa.append(db);
      }
      body.append(sa);

      // --- effects
      const sf = this.section('insp.effects', 'grading', 'fx');
      const fxs = c.effects || [];
      if (!fxs.length) sf.append(el('div', { class: 'muted-note', text: t('insp.noEffects') }));
      fxs.forEach((fx, i) => sf.append(this.effectCard(c, fx, i)));
      body.append(sf);

      // --- transitions
      const st = this.section('tab.transitions', 'crossfade', 'trans');
      const opts = [{ v: '', l: t('insp.none2') }].concat(Object.keys(core.TRANSITIONS).map(k => ({ v: k, l: t('tr.' + k) })));
      for (const edge of ['in', 'out']) {
        const tr = edge === 'in' ? c.transIn : c.transOut;
        st.append(this.select(t(edge === 'in' ? 'insp.transIn' : 'insp.transOut'), tr ? tr.type : '', opts, (v) => this.now('tr', () => {
          if (!v) SC.edit.removeTransition(c, edge); else SC.edit.applyTransition(c, edge, v, tr ? tr.d : null);
        })));
        if (tr) {
          const def = core.TRANSITIONS[tr.type] || {};
          if (def.dirs) {
            st.append(this.segRow(t('insp.tdir'), core.transDir(tr), def.dirs.map(d => ({ v: d, l: t('dir.' + d) })), (v) => this.now('trdir', () => {
              SC.edit.applyTransition(c, edge, tr.type, tr.d, v);
            })));
          }
          st.append(this.range(t('insp.tdur'), tr.d || 1, 0.1, 4, 0.05, (v) => this.live('td' + edge, () => {
            const nb = core.neighbors(S.project, c);
            tr.d = v;
            if (edge === 'in' && nb.prev && nb.prev.transOut) nb.prev.transOut.d = v;
            if (edge === 'out' && nb.next && nb.next.transIn) nb.next.transIn.d = v;
          })));
        }
      }
      body.append(st);
      body.scrollTop = scrollTop;
    },

    optLabel(pd, o) {
      if (typeof o === 'number') return pd.k === 'angle' ? o + '°' : pd.k === 'freq' ? o + ' Hz' : String(o);
      return tt('dir.' + o, tt('opt.' + o, o));
    },
    effectCard(c, fx, i) {
      const def = core.EFFECTS[fx.type] || { params: [] };
      const card = el('div', { class: 'fx-card' + (fx.enabled === false ? ' off' : '') });
      const head = el('div', { class: 'fx-card-head' });
      const b = el('b'); b.innerHTML = SC.icon(def.icon) + '<span>' + SC.ui.escapeHtml(t('fx.' + fx.type)) + '</span>';
      const en = el('input', { type: 'checkbox', checked: fx.enabled !== false, 'data-tip': 'insp.enabled' });
      en.addEventListener('change', () => this.now('fx-en', () => { fx.enabled = en.checked; }));
      head.append(b, en,
        iconBtn('up', 'insp.up', () => this.now('fx-up', () => { if (i > 0) { const a = c.effects; [a[i - 1], a[i]] = [a[i], a[i - 1]]; } })),
        iconBtn('down', 'insp.down', () => this.now('fx-down', () => { const a = c.effects; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; } })),
        iconBtn('trash', 'insp.remove', () => this.now('fx-rm', () => { c.effects.splice(i, 1); }))
      );
      card.append(head);
      fx.params = Object.assign(core.defaultParams(fx.type), fx.params || {});
      const setP = (k, v) => { fx.params = Object.assign({}, fx.params, { [k]: v }); };
      for (const pd of def.params) {
        const label = pd.label || t('p.' + pd.k);
        const val = fx.params[pd.k];
        if (fx.type === 'pixelate' && ['ax', 'ay', 'aw', 'ah'].includes(pd.k) && !fx.params.area) continue;
        if (pd.t === 'range') card.append(this.range(label, val, pd.min, pd.max, pd.step, (v) => this.live('fx' + i + pd.k, () => setP(pd.k, v))));
        else if (pd.t === 'select') card.append(this.segRow(label, val, pd.opts.map(o => ({ v: o, l: this.optLabel(pd, o) })), (v) => this.now('fx' + i + pd.k, () => setP(pd.k, isNaN(+v) ? v : +v))));
        else if (pd.t === 'color') card.append(this.color(label, val, (v) => this.live('fx' + i + pd.k, () => setP(pd.k, v))));
        else if (pd.t === 'check') card.append(this.check(label, val, (v) => this.now('fx' + i + pd.k, () => setP(pd.k, v))));
        else if (pd.t === 'file') {
          const row = el('div', { class: 'row' }, [el('label', { text: label })]);
          const v = el('div', { class: 'val' });
          const name = el('span', { class: 'muted-note', text: val ? SC.ui.basename(val) : t('lut.none'), style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
          const pick = el('button', { class: 'btn', type: 'button', text: t('lut.choose') });
          pick.addEventListener('click', async () => {
            const f = await window.api.openFile({ filters: [{ name: 'LUT', extensions: ['cube'] }] });
            if (f) this.now('lut', () => setP('lut', f));
          });
          v.append(name, pick);
          if (val) v.append(iconBtn('close', 'insp.remove', () => this.now('lut', () => setP('lut', ''))));
          row.append(v); card.append(row);
        }
      }
      if (def.render) {
        const job = core.audioRenderJob(S.project, c);
        const busy = job && SC.program.rendering[job.key] != null;
        card.append(el('div', { class: 'muted-note', text: busy ? t('busy.render') + ' ' + Math.round(SC.program.rendering[job.key] * 100) + '%' : t('fx.renderNote') }));
      }
      if (fx.type === 'denoise') {
        const np = S.project.noiseProfile;
        card.append(el('div', { class: 'muted-note', text: np ? t('np.set') + ' (' + np.level.toFixed(1) + ' dB)' : t('np.none') }));
      }
      return card;
    },

    textSection(c) {
      const sec = this.section('cat.text', 'text');
      const P = SC.text.props(c);
      const set = (key, patch, liveMode) => {
        const fn = () => { c.text = Object.assign({}, SC.text.props(c), typeof patch === 'function' ? patch(SC.text.props(c)) : patch); };
        if (liveMode) this.live('txt-' + key, fn); else this.now('txt-' + key, fn);
      };
      // template
      const trow = el('div', { class: 'row' }, [el('label', { text: t('tpl.template') })]);
      const grid = el('div', { class: 'tpl-grid' });
      for (const tp of core.TEXT_TEMPLATES) {
        const b = el('button', { type: 'button', class: P.template === tp ? 'active' : '', text: t('tpl.' + tp), 'data-tip': 'tpld.' + tp });
        b.addEventListener('click', () => this.now('tpl', () => {
          const d = SC.text.defaults(tp);
          c.text = Object.assign(d, { text: P.text || d.text, line2: P.line2 || d.line2, font: P.font, color: P.color });
          if ((tp === 'ticker' || tp === 'credits') && core.clipDuration(c) < 8) c.out = c.in + 12;
        }));
        grid.append(b);
      }
      trow.append(el('div', { class: 'val' }, [grid]));
      sec.append(trow);
      // text
      const mkTa = (labelKey, val, k) => {
        const row = el('div', { class: 'row' }, [el('label', { text: t(labelKey) })]);
        const ta = el('textarea', {}); ta.value = val || '';
        ta.addEventListener('input', () => set(k, { [k]: ta.value }, true));
        ta.addEventListener('keydown', (e) => e.stopPropagation());
        row.append(ta); return row;
      };
      sec.append(mkTa(P.template === 'credits' ? 'text.credits' : 'text.text', P.text, 'text'));
      const two = ['lower', 'bar', 'box', 'badge'].includes(P.template);
      if (two) sec.append(mkTa('text.line2', P.line2, 'line2'));
      // font
      const frow = el('div', { class: 'row' }, [el('label', { text: t('text.font') })]);
      const fs = el('select', { class: 'sel' });
      const g1 = el('optgroup', { label: 'SlaxxCUT' });
      SC.text.BUNDLED_FONTS.forEach(f => g1.append(el('option', { value: f, text: f, selected: f === P.font })));
      fs.append(g1);
      SC.text.listFonts().then(list => {
        if (!list.system.length) return;
        const g2 = el('optgroup', { label: 'System' });
        list.system.forEach(f => g2.append(el('option', { value: f, text: f, selected: f === P.font })));
        fs.append(g2);
        if (![...fs.options].some(o => o.value === P.font)) fs.append(el('option', { value: P.font, text: P.font }));
        fs.value = P.font;
      });
      fs.addEventListener('change', () => set('font', { font: fs.value }));
      frow.append(el('div', { class: 'val' }, [fs])); sec.append(frow);
      sec.append(this.range(t('text.size'), P.size, 8, 400, 1, (v) => set('size', { size: v }, true)));
      sec.append(this.color(t('text.color'), P.color, (v) => set('color', { color: v }, true)));
      if (two) {
        sec.append(this.range(t('text.size2'), P.size2, 8, 300, 1, (v) => set('size2', { size2: v }, true)));
        sec.append(this.color(t('text.color2'), P.color2, (v) => set('color2', { color2: v }, true)));
      }
      if (P.template === 'credits') sec.append(this.color(t('text.headColor'), P.color2, (v) => set('color2', { color2: v }, true)));
      // style + align
      const srow = el('div', { class: 'row' }, [el('label', { text: t('text.align') })]);
      const seg = el('div', { class: 'seg' });
      const mk = (icon, tip, active, fn) => { const b = el('button', { type: 'button', class: active ? 'active' : '', 'data-tip': tip }); b.innerHTML = SC.icon(icon); b.addEventListener('click', fn); return b; };
      seg.append(
        mk('alignLeft', 'text.align', P.align === 'left', () => set('al', { align: 'left' })),
        mk('alignCenter', 'text.align', P.align === 'center', () => set('al', { align: 'center' })),
        mk('alignRight', 'text.align', P.align === 'right', () => set('al', { align: 'right' })));
      const seg2 = el('div', { class: 'seg' });
      const bb = el('button', { type: 'button', class: P.bold ? 'active' : '', 'data-tip': 'text.bold', html: '<b style="padding:0 4px">B</b>' });
      bb.addEventListener('click', () => set('b', { bold: !P.bold }));
      const ib = el('button', { type: 'button', class: P.italic ? 'active' : '', 'data-tip': 'text.italic', html: '<i style="padding:0 5px;font-family:serif">I</i>' });
      ib.addEventListener('click', () => set('i', { italic: !P.italic }));
      seg2.append(bb, ib);
      srow.append(el('div', { class: 'val' }, [seg, seg2])); sec.append(srow);
      // position
      if (P.template !== 'credits') {
        const prow = el('div', { class: 'row', 'data-tip': 'tip.text.pos' }, [el('label', { text: t('text.position') })]);
        const pg = el('div', { class: 'pos-grid' });
        for (const y of [0.12, 0.5, 0.86]) for (const x of [0.22, 0.5, 0.78]) {
          const b = el('button', { type: 'button', class: Math.abs(P.x - x) < 0.02 && Math.abs(P.y - y) < 0.02 ? 'active' : '' });
          b.addEventListener('click', () => set('pos', { x, y }));
          pg.append(b);
        }
        prow.append(el('div', { class: 'val' }, [pg])); sec.append(prow);
      }
      if (P.template === 'ticker') sec.append(this.range(t('text.speed'), P.speed, 0.03, 0.6, 0.01, (v) => set('speed', { speed: v }, true)));
      // background
      const bgSec = el('div', { class: 'fx-card' });
      bgSec.append(el('div', { class: 'fx-card-head' }, [el('b', { html: SC.icon('template') + '<span>' + SC.ui.escapeHtml(t('text.bg')) + '</span>' })]));
      const setBg = (k, v, lv) => set('bg' + k, (q) => ({ bg: Object.assign({}, q.bg, { [k]: v }) }), lv);
      bgSec.append(this.segRow(t('bg.type'), P.bg.type, ['none', 'color', 'gradient', 'image'].map(v => ({ v, l: t('bg.' + v) })), (v) => setBg('type', v)));
      if (P.bg.type !== 'none') {
        if (P.bg.type !== 'image' || true) bgSec.append(this.color(t(P.bg.type === 'gradient' ? 'bg.color1' : 'bg.color'), P.bg.color, (v) => setBg('color', v, true)));
        if (P.bg.type === 'gradient' || P.bg.accent) bgSec.append(this.color(t(P.bg.type === 'gradient' ? 'bg.color2' : 'bg.accentColor'), P.bg.color2, (v) => setBg('color2', v, true)));
        if (P.bg.type === 'gradient') bgSec.append(this.range(t('bg.angle'), +P.bg.angle || 0, 0, 360, 5, (v) => setBg('angle', v, true)));
        if (P.bg.type === 'image') {
          const row = el('div', { class: 'row' }, [el('label', { text: t('bg.image') })]);
          const v = el('div', { class: 'val' });
          const name = el('span', { class: 'muted-note', text: P.bg.image ? SC.ui.basename(P.bg.image) : t('lut.none'), style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
          const pick = el('button', { class: 'btn', type: 'button', text: t('lut.choose') });
          pick.addEventListener('click', async () => {
            const f = await window.api.openFile({ filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] });
            if (f) setBg('image', f);
          });
          v.append(name, pick); row.append(v); bgSec.append(row);
        }
        bgSec.append(this.range(t('insp.opacity'), Math.round((+P.bg.opacity) * 100), 0, 100, 1, (v) => setBg('opacity', v / 100, true)));
        if (P.template !== 'credits') {
          bgSec.append(this.range(t('bg.radius'), +P.bg.radius || 0, 0, 80, 1, (v) => setBg('radius', v, true)));
          bgSec.append(this.range(t('bg.padding'), +P.bg.padding || 0.4, 0.1, 1.5, 0.05, (v) => setBg('padding', v, true)));
          bgSec.append(this.check(t('bg.accent'), P.bg.accent, (v) => setBg('accent', v)));
        }
      }
      sec.append(bgSec);
      // shadow / outline
      sec.append(this.check(t('text.shadow'), P.shadow.on, (v) => set('sh', (q) => ({ shadow: Object.assign({}, q.shadow, { on: v }) }))));
      if (P.shadow.on) {
        sec.append(this.color(t('text.shadowColor'), P.shadow.color, (v) => set('shc', (q) => ({ shadow: Object.assign({}, q.shadow, { color: v }) }), true)));
        sec.append(this.range(t('text.shadowX'), P.shadow.dx, -40, 40, 1, (v) => set('shx', (q) => ({ shadow: Object.assign({}, q.shadow, { dx: v }) }), true)));
        sec.append(this.range(t('text.shadowY'), P.shadow.dy, -40, 40, 1, (v) => set('shy', (q) => ({ shadow: Object.assign({}, q.shadow, { dy: v }) }), true)));
        sec.append(this.range(t('text.shadowBlur'), P.shadow.blur, 0, 60, 1, (v) => set('shb', (q) => ({ shadow: Object.assign({}, q.shadow, { blur: v }) }), true)));
      }
      sec.append(this.check(t('text.outline'), P.outline.on, (v) => set('ol', (q) => ({ outline: Object.assign({}, q.outline, { on: v }) }))));
      if (P.outline.on) {
        sec.append(this.color(t('text.outlineColor'), P.outline.color, (v) => set('olc', (q) => ({ outline: Object.assign({}, q.outline, { color: v }) }), true)));
        sec.append(this.range(t('p.strength'), P.outline.width, 1, 20, 1, (v) => set('olw', (q) => ({ outline: Object.assign({}, q.outline, { width: v }) }), true)));
      }
      // animation
      const anims = core.TEXT_ANIMS.map(v => ({ v, l: t('anim.' + v) }));
      sec.append(this.select(t('anim.in'), P.anim.in, anims, (v) => set('ain', (q) => ({ anim: Object.assign({}, q.anim, { in: v }) }))));
      sec.append(this.select(t('anim.out'), P.anim.out, anims, (v) => set('aout', (q) => ({ anim: Object.assign({}, q.anim, { out: v }) }))));
      sec.append(this.range(t('anim.d'), +P.anim.d || 0.6, 0.1, 3, 0.05, (v) => set('ad', (q) => ({ anim: Object.assign({}, q.anim, { d: v }) }), true)));
      // save as template
      const sv = el('button', { class: 'btn', type: 'button', style: { marginTop: '8px' } });
      sv.innerHTML = SC.icon('star') + '<span>' + SC.ui.escapeHtml(t('tpl.save')) + '</span>';
      sv.addEventListener('click', () => this.saveTemplate(c));
      sec.append(sv);
      return sec;
    },
    saveTemplate(c) {
      const inp = el('input', { type: 'text', value: '', placeholder: t('tpl.nameHint'), style: { width: '100%', height: '32px', borderRadius: '7px', border: '1px solid var(--line)', background: 'var(--bg2)', padding: '0 8px' } });
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); });
      const md = SC.ui.modal({ title: t('tpl.save'), body: inp, cls: 'small' });
      const ok = () => {
        const name = inp.value.trim() || t('tpl.' + (SC.text.props(c).template || 'free'));
        const props = JSON.parse(JSON.stringify(SC.text.props(c)));
        delete props.measure;
        SC.app.saveSettings({ textTemplates: (S.settings.textTemplates || []).concat([{ name, props }]) });
        SC.effectsPanel.refresh();
        SC.ui.toast(t('tpl.saved'), 'ok');
        md.close();
      };
      md.button(t('dlg.cancel'), '', () => md.close());
      md.button(t('dlg.save'), 'primary', ok);
      setTimeout(() => inp.focus(), 50);
    }
  };

  SC.inspector = I;
})();
