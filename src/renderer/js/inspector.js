/* SlaxxCUT – clip inspector (properties drawer over the left panel). Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $, iconBtn } = SC.ui;
  const core = SC.core, store = SC.store, S = store.S;
  const t = (k) => SC.t(k);

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
        if (info.live && (info.label === 'textpos')) return;
        this.render();
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
    range(labelKey, val, min, max, step, onInput, fmt) {
      const row = el('div', { class: 'row' }, [el('label', { text: t(labelKey) })]);
      const v = el('div', { class: 'val' });
      const r = el('input', { type: 'range', min, max, step, value: val });
      const n = el('input', { type: 'number', class: 'num', min, max, step, value: fmt ? fmt(val) : val });
      r.addEventListener('input', () => { n.value = fmt ? fmt(+r.value) : r.value; onInput(+r.value); });
      n.addEventListener('change', () => { const x = Math.min(max, Math.max(min, +n.value || 0)); r.value = x; onInput(x); });
      n.addEventListener('keydown', (e) => e.stopPropagation());
      r.addEventListener('dblclick', () => { /* noop */ });
      v.append(r, n); row.append(v);
      return row;
    },
    select(labelKey, val, opts, onChange) {
      const row = el('div', { class: 'row' }, [el('label', { text: t(labelKey) })]);
      const s = el('select', { class: 'sel' });
      for (const o of opts) s.append(el('option', { value: o.v, text: o.l, selected: String(o.v) === String(val) }));
      s.addEventListener('change', () => onChange(s.value));
      row.append(el('div', { class: 'val' }, [s]));
      return row;
    },
    color(labelKey, val, onInput) {
      const row = el('div', { class: 'row' }, [el('label', { text: t(labelKey) })]);
      const c = el('input', { type: 'color', value: val || '#ffffff' });
      c.addEventListener('input', () => onInput(c.value));
      row.append(el('div', { class: 'val' }, [c]));
      return row;
    },
    check(labelKey, val, onChange) {
      const row = el('div', { class: 'row' }, [el('label', { text: t(labelKey) })]);
      const lab = el('label', { class: 'check' });
      const c = el('input', { type: 'checkbox', checked: !!val });
      c.addEventListener('change', () => onChange(c.checked));
      lab.append(c);
      row.append(el('div', { class: 'val' }, [lab]));
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

    /* ---------- render ---------- */
    render() {
      const c = store.clipById(this.clipId);
      this.root.innerHTML = '';
      if (!c) return;
      const p = S.project;
      const m = c.mediaId ? core.mediaById(p, c.mediaId) : null;
      const scrollTop = this._body ? this._body.scrollTop : 0;
      const head = el('div', { class: 'insp-head' });
      const icon = { video: 'video', image: 'image', audio: 'audio', text: 'text' }[c.kind];
      head.innerHTML = SC.icon(icon);
      head.append(el('h3', { text: c.kind === 'text' ? t('fx.text') : (m ? m.name : t('insp.clip')) }));
      head.append(iconBtn('close', 'insp.close', () => this.close()));
      const body = el('div', { class: 'insp-body' });
      this._body = body;
      this.root.append(head, body);

      // --- clip timing
      const sc = this.section('insp.clip', 'props');
      sc.append(this.range('insp.start', +c.start.toFixed(2), 0, Math.max(600, Math.ceil(c.start + 60)), 0.01, (v) => this.live('start', () => { c.start = v; })));
      if (c.kind === 'image' || c.kind === 'text') {
        sc.append(this.range('insp.duration', +core.clipDuration(c).toFixed(2), 0.2, 600, 0.1, (v) => this.live('dur', () => {
          c.out = c.in + v;
          c.fadeIn = Math.min(c.fadeIn, v); c.fadeOut = Math.min(c.fadeOut, v);
        })));
      } else {
        sc.append(this.select('insp.speed', c.speed || 1, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4, 8, 16].map(v => ({ v, l: v + '×' })), (v) => this.now('speed', () => SC.edit.setSpeed(c, +v))));
      }
      body.append(sc);

      // --- picture
      if (SC.edit.hasVisual(c)) {
        const sv = this.section('insp.transform', 'image');
        c.transform = c.transform || { scale: 1, x: 0, y: 0 };
        if (c.kind !== 'text') sv.append(this.select('insp.fit', c.fit || 'contain', ['contain', 'cover', 'stretch'].map(v => ({ v, l: t('fit.' + v) })), (v) => this.now('fit', () => { c.fit = v; })));
        sv.append(this.range('insp.scale', Math.round((c.transform.scale || 1) * 100), 10, 400, 1, (v) => this.live('scale', () => { c.transform = Object.assign({}, c.transform, { scale: v / 100 }); })));
        sv.append(this.range('insp.posX', Math.round((c.transform.x || 0) * 100), -100, 100, 1, (v) => this.live('px', () => { c.transform = Object.assign({}, c.transform, { x: v / 100 }); })));
        sv.append(this.range('insp.posY', Math.round((c.transform.y || 0) * 100), -100, 100, 1, (v) => this.live('py', () => { c.transform = Object.assign({}, c.transform, { y: v / 100 }); })));
        sv.append(this.range('insp.opacity', Math.round((c.opacity == null ? 1 : c.opacity) * 100), 0, 100, 1, (v) => this.live('op', () => { c.opacity = v / 100; })));
        const rb = el('button', { class: 'btn', type: 'button', text: t('insp.reset') });
        rb.addEventListener('click', () => this.now('reset-tf', () => { c.transform = { scale: 1, x: 0, y: 0 }; c.opacity = 1; }));
        sv.append(rb);
        body.append(sv);
      }

      // --- text
      if (c.kind === 'text') body.append(this.textSection(c));

      // --- audio
      const hasA = c.kind === 'audio' || (c.kind === 'video' && m && m.hasAudio && !c.audioDetached);
      const sa = this.section('insp.audio', 'audio');
      if (hasA) {
        sa.append(this.range('insp.volume', +(c.volume || 0), -40, 24, 0.5, (v) => this.live('vol', () => { c.volume = v; })));
        sa.append(this.check('insp.muted', c.muted, (v) => this.now('mute', () => { c.muted = v; })));
      }
      const dmax = Math.max(0.1, +core.clipDuration(c).toFixed(2));
      sa.append(this.range('insp.fadeIn', +(c.fadeIn || 0), 0, dmax, 0.05, (v) => this.live('fi', () => { c.fadeIn = v; })));
      sa.append(this.range('insp.fadeOut', +(c.fadeOut || 0), 0, dmax, 0.05, (v) => this.live('fo', () => { c.fadeOut = v; })));
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
      if (c.kind !== 'audio' || true) {
        const st = this.section('tab.transitions', 'crossfade', 'trans');
        const opts = [{ v: '', l: t('insp.none2') }].concat(Object.keys(core.TRANSITIONS).map(k => ({ v: k, l: t('tr.' + k) })));
        for (const edge of ['in', 'out']) {
          const tr = edge === 'in' ? c.transIn : c.transOut;
          st.append(this.select(edge === 'in' ? 'insp.transIn' : 'insp.transOut', tr ? tr.type : '', opts, (v) => this.now('tr', () => {
            if (!v) SC.edit.removeTransition(c, edge); else SC.edit.applyTransition(c, edge, v, tr ? tr.d : null);
          })));
          if (tr) {
            st.append(this.range('insp.tdur', tr.d || 1, 0.1, 4, 0.05, (v) => this.live('td' + edge, () => {
              const nb = core.neighbors(S.project, c);
              tr.d = v;
              if (edge === 'in' && nb.prev && nb.prev.transOut) nb.prev.transOut.d = v;
              if (edge === 'out' && nb.next && nb.next.transIn) nb.next.transIn.d = v;
            })));
          }
        }
        body.append(st);
      }
      body.scrollTop = scrollTop;
    },

    effectCard(c, fx, i) {
      const def = core.EFFECTS[fx.type] || { params: [] };
      const card = el('div', { class: 'fx-card' + (fx.enabled === false ? ' off' : '') });
      const head = el('div', { class: 'fx-card-head' });
      const b = el('b'); b.innerHTML = SC.icon(def.icon) + '<span>' + SC.ui.escapeHtml(t('fx.' + fx.type)) + '</span>';
      const en = el('input', { type: 'checkbox', checked: fx.enabled !== false, 'data-tip': 'insp.enabled' });
      en.addEventListener('change', () => this.now('fx-en', () => { fx.enabled = en.checked; }));
      head.append(b, en,
        iconBtn('up', 'insp.up', () => this.now('fx-up', () => { if (i > 0) { const a = c.effects; [a[i - 1], a[i]] = [a[i], a[i - 1]]; } this.render(); })),
        iconBtn('down', 'insp.down', () => this.now('fx-down', () => { const a = c.effects; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; } this.render(); })),
        iconBtn('trash', 'insp.remove', () => { this.now('fx-rm', () => { c.effects.splice(i, 1); }); this.render(); })
      );
      card.append(head);
      fx.params = Object.assign(core.defaultParams(fx.type), fx.params || {});
      for (const pd of def.params) {
        const key = 'p.' + pd.k;
        const val = fx.params[pd.k];
        if (pd.t === 'range') card.append(this.range(key, val, pd.min, pd.max, pd.step, (v) => this.live('fx' + i + pd.k, () => { fx.params = Object.assign({}, fx.params, { [pd.k]: v }); })));
        else if (pd.t === 'select') card.append(this.select(key, val, pd.opts.map(o => ({ v: o, l: typeof o === 'number' ? o + '×' : t('dir.' + o) })), (v) => this.now('fx' + i + pd.k, () => { fx.params = Object.assign({}, fx.params, { [pd.k]: isNaN(+v) ? v : +v }); })));
        else if (pd.t === 'color') card.append(this.color(key, val, (v) => this.live('fx' + i + pd.k, () => { fx.params = Object.assign({}, fx.params, { [pd.k]: v }); })));
        else if (pd.t === 'check') card.append(this.check(key, val, (v) => this.now('fx' + i + pd.k, () => { fx.params = Object.assign({}, fx.params, { [pd.k]: v }); })));
        else if (pd.t === 'file') {
          const row = el('div', { class: 'row' }, [el('label', { text: t(key) })]);
          const v = el('div', { class: 'val' });
          const name = el('span', { class: 'muted-note', text: val ? SC.ui.basename(val) : t('lut.none'), style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } });
          const pick = el('button', { class: 'btn', type: 'button', text: t('lut.choose') });
          pick.addEventListener('click', async () => {
            const f = await window.api.openFile({ filters: [{ name: 'LUT', extensions: ['cube'] }] });
            if (f) { this.now('lut', () => { fx.params = Object.assign({}, fx.params, { lut: f }); }); this.render(); }
          });
          v.append(name, pick);
          if (val) v.append(iconBtn('close', 'insp.remove', () => { this.now('lut', () => { fx.params = Object.assign({}, fx.params, { lut: '' }); }); this.render(); }));
          row.append(v); card.append(row);
        }
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
      // text
      const row = el('div', { class: 'row' }, [el('label', { text: t('text.text') })]);
      const ta = el('textarea', {}); ta.value = P.text;
      ta.addEventListener('input', () => set('text', { text: ta.value }, true));
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      row.append(ta); sec.append(row);
      // font
      const frow = el('div', { class: 'row' }, [el('label', { text: t('text.font') })]);
      const fs = el('select', { class: 'sel' });
      const addOpt = (f) => fs.append(el('option', { value: f, text: f, selected: f === P.font, style: { fontFamily: '"' + f + '"' } }));
      const g1 = el('optgroup', { label: 'SlaxxCUT' });
      SC.text.BUNDLED_FONTS.forEach(f => g1.append(el('option', { value: f, text: f, selected: f === P.font })));
      fs.append(g1);
      SC.text.listFonts().then(list => {
        if (!list.system.length) return;
        const g2 = el('optgroup', { label: 'System' });
        list.system.forEach(f => g2.append(el('option', { value: f, text: f, selected: f === P.font })));
        fs.append(g2);
        if (![...fs.options].some(o => o.value === P.font)) addOpt(P.font);
        fs.value = P.font;
      });
      fs.addEventListener('change', () => set('font', { font: fs.value }));
      frow.append(el('div', { class: 'val' }, [fs])); sec.append(frow);
      sec.append(this.range('text.size', P.size, 8, 400, 1, (v) => set('size', { size: v }, true)));
      sec.append(this.color('text.color', P.color, (v) => set('color', { color: v }, true)));
      // style toggles + align
      const srow = el('div', { class: 'row' }, [el('label', { text: t('text.align') })]);
      const seg = el('div', { class: 'seg' });
      const mk = (icon, tip, active, fn) => { const b = el('button', { type: 'button', class: active ? 'active' : '', 'data-tip': tip }); b.innerHTML = SC.icon(icon); b.addEventListener('click', fn); return b; };
      seg.append(
        mk('alignLeft', 'text.align', P.align === 'left', () => set('al', { align: 'left' })),
        mk('alignCenter', 'text.align', P.align === 'center', () => set('al', { align: 'center' })),
        mk('alignRight', 'text.align', P.align === 'right', () => set('al', { align: 'right' }))
      );
      const seg2 = el('div', { class: 'seg' });
      const bb = el('button', { type: 'button', class: P.bold ? 'active' : '', 'data-tip': 'text.bold', html: '<b style="padding:0 4px">B</b>' });
      bb.addEventListener('click', () => set('b', { bold: !P.bold }));
      const ib = el('button', { type: 'button', class: P.italic ? 'active' : '', 'data-tip': 'text.italic', html: '<i style="padding:0 5px;font-family:serif">I</i>' });
      ib.addEventListener('click', () => set('i', { italic: !P.italic }));
      seg2.append(bb, ib);
      srow.append(el('div', { class: 'val' }, [seg, seg2])); sec.append(srow);
      // position grid
      const prow = el('div', { class: 'row', 'data-tip': 'tip.text.pos' }, [el('label', { text: t('text.position') })]);
      const grid = el('div', { class: 'pos-grid' });
      for (const y of [0.15, 0.5, 0.85]) for (const x of [0.2, 0.5, 0.8]) {
        const b = el('button', { type: 'button', class: Math.abs(P.x - x) < 0.02 && Math.abs(P.y - y) < 0.02 ? 'active' : '' });
        b.addEventListener('click', () => set('pos', { x, y, align: x < 0.3 ? 'left' : x > 0.7 ? 'right' : 'center' }));
        grid.append(b);
      }
      prow.append(el('div', { class: 'val' }, [grid])); sec.append(prow);
      // shadow
      sec.append(this.check('text.shadow', P.shadow.on, (v) => set('sh', (q) => ({ shadow: Object.assign({}, q.shadow, { on: v }) }))));
      if (P.shadow.on) {
        sec.append(this.color('text.shadowColor', P.shadow.color, (v) => set('shc', (q) => ({ shadow: Object.assign({}, q.shadow, { color: v }) }), true)));
        sec.append(this.range('text.shadowX', P.shadow.dx, -40, 40, 1, (v) => set('shx', (q) => ({ shadow: Object.assign({}, q.shadow, { dx: v }) }), true)));
        sec.append(this.range('text.shadowY', P.shadow.dy, -40, 40, 1, (v) => set('shy', (q) => ({ shadow: Object.assign({}, q.shadow, { dy: v }) }), true)));
        sec.append(this.range('text.shadowBlur', P.shadow.blur, 0, 60, 1, (v) => set('shb', (q) => ({ shadow: Object.assign({}, q.shadow, { blur: v }) }), true)));
      }
      // outline
      sec.append(this.check('text.outline', P.outline.on, (v) => set('ol', (q) => ({ outline: Object.assign({}, q.outline, { on: v }) }))));
      if (P.outline.on) {
        sec.append(this.color('text.outlineColor', P.outline.color, (v) => set('olc', (q) => ({ outline: Object.assign({}, q.outline, { color: v }) }), true)));
        sec.append(this.range('p.strength', P.outline.width, 1, 20, 1, (v) => set('olw', (q) => ({ outline: Object.assign({}, q.outline, { width: v }) }), true)));
      }
      // box
      sec.append(this.check('text.bg', P.box.on, (v) => set('bx', (q) => ({ box: Object.assign({}, q.box, { on: v }) }))));
      if (P.box.on) {
        sec.append(this.color('text.bgColor', P.box.color, (v) => set('bxc', (q) => ({ box: Object.assign({}, q.box, { color: v }) }), true)));
        sec.append(this.range('insp.opacity', Math.round(P.box.opacity * 100), 0, 100, 1, (v) => set('bxo', (q) => ({ box: Object.assign({}, q.box, { opacity: v / 100 }) }), true)));
      }
      return sec;
    }
  };

  SC.inspector = I;
})();
