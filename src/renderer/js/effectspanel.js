/* SlaxxCUT – effects and transitions tabs (search, categories, text templates, audio mode). Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $ } = SC.ui;
  const core = SC.core;
  const t = (k) => SC.t(k);
  const ASYNC = ['reverse', 'freeze', 'stabilize', 'normalize', 'match', 'silence'];

  let fxSearch = '', trSearch = '';

  function fxItem(kind, type, icon, labelKey, descKey, opts) {
    opts = opts || {};
    const it = el('div', { class: 'fx-item' + (opts.wide ? ' wide' : ''), draggable: 'true', 'data-tip': descKey, 'data-tip-text': opts.tipText });
    it.innerHTML = SC.icon(icon) + '<span>' + SC.ui.escapeHtml(opts.label || t(labelKey)) + '</span>';
    it.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-slaxx-' + kind, type);
      e.dataTransfer.effectAllowed = 'copy';
      SC.dragPayload = { kind, type, template: opts.template, props: opts.props };
    });
    it.addEventListener('dragend', () => { SC.dragPayload = null; SC.timeline && SC.timeline.clearDropHints(); });
    it.addEventListener('click', () => {
      const sel = SC.store.selectedClips();
      if (kind === 'fx' && type === 'text') { SC.timeline.addTextAt(SC.store.S.playhead, null, opts.template, opts.props); return; }
      if (kind === 'fx' && (type === 'match' || type === 'normalize')) { SC.edit.runAction(type, sel); return; }
      if (!sel.length) { SC.ui.toast(t('toast.noSel')); return; }
      if (kind === 'fx') SC.timeline.applyEffectTo(sel, type);
      else SC.timeline.applyTransitionTo(sel[0], 'out', type);
    });
    if (opts.onContext) it.addEventListener('contextmenu', (e) => { e.preventDefault(); opts.onContext(e); });
    return it;
  }

  function searchBox(onInput) {
    const sb = el('label', { class: 'searchbox', 'data-tip': 'tip.fx.search', style: { margin: '8px 10px 0', flex: 'none' } });
    sb.innerHTML = SC.icon('search');
    const inp = el('input', { type: 'text', 'data-i18n-ph': 'media.search', placeholder: t('media.search') });
    inp.addEventListener('input', () => onInput(inp.value.toLowerCase()));
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    sb.append(inp);
    return sb;
  }
  const matches = (q, ...keys) => !q || keys.some(k => String(k).toLowerCase().includes(q));

  function renderEffects() {
    const sc = $('#fxScroll');
    sc.innerHTML = '';
    const audioMode = SC.app && SC.app.mode === 'audio';
    sc.append(el('div', { class: 'fx-hint', text: t(audioMode ? 'fx.hintAudio' : 'fx.hint') }));
    const cats = audioMode ? core.AUDIO_CATS : core.EFFECT_CATS;
    for (const cat of cats) {
      const types = Object.keys(core.EFFECTS).filter(k => core.EFFECTS[k].cat === cat && k !== 'text' && matches(fxSearch, t('fx.' + k), t('fxd.' + k)));
      const isText = cat === 'text';
      const grid = el('div', { class: 'fx-grid' });
      for (const ty of types) {
        grid.append(fxItem('fx', ty, core.EFFECTS[ty].icon, 'fx.' + ty, 'fxd.' + ty));
      }
      if (isText) {
        const tpls = [['free', 'text'], ['lower', 'template'], ['bar', 'template'], ['box', 'template'], ['badge', 'template'], ['ticker', 'template'], ['credits', 'template']];
        for (const [tp, ic] of tpls) {
          if (!matches(fxSearch, t('tpl.' + tp), t('tpld.' + tp))) continue;
          grid.append(fxItem('fx', 'text', ic, 'tpl.' + tp, 'tpld.' + tp, { template: tp }));
        }
        for (const ut of (SC.store.S.settings.textTemplates || [])) {
          if (!matches(fxSearch, ut.name)) continue;
          grid.append(fxItem('fx', 'text', 'star', null, null, {
            label: ut.name, tipText: t('tpld.user'), props: ut.props, template: ut.props.template,
            onContext: (e) => SC.ui.contextMenu(e.clientX, e.clientY, [{
              label: t('tpl.delete'), icon: 'trash', action: () => {
                SC.app.saveSettings({ textTemplates: (SC.store.S.settings.textTemplates || []).filter(x => x !== ut) });
                renderEffects();
              }
            }])
          }));
        }
      }
      if (!grid.children.length) continue;
      sc.append(el('div', { class: 'fx-cat', text: t('cat.' + cat) }), grid);
    }
  }

  function renderTransitions() {
    const sc = $('#trScroll');
    sc.innerHTML = '';
    sc.append(el('div', { class: 'fx-hint', text: t('tr.hint') }));
    const audioMode = SC.app && SC.app.mode === 'audio';
    const grid = el('div', { class: 'fx-grid' });
    for (const ty of Object.keys(core.TRANSITIONS)) {
      if (audioMode && !['fade', 'crossfade'].includes(ty)) continue;
      if (!matches(trSearch, t('tr.' + ty), t('trd.' + ty))) continue;
      grid.append(fxItem('tr', ty, core.TRANSITIONS[ty].icon, 'tr.' + ty, 'trd.' + ty));
    }
    sc.append(grid);
  }

  function build() {
    const fx = $('#pageEffects');
    fx.append(searchBox((q) => { fxSearch = q; renderEffects(); }), el('div', { class: 'fx-scroll', id: 'fxScroll' }));
    const tr = $('#pageTransitions');
    tr.append(searchBox((q) => { trSearch = q; renderTransitions(); }), el('div', { class: 'fx-scroll', id: 'trScroll' }));
    renderEffects(); renderTransitions();
  }
  function refresh() { renderEffects(); renderTransitions(); }

  SC.effectsPanel = { build, refresh, ASYNC };
})();
