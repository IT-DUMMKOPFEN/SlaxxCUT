/* SlaxxCUT – effects and transitions tabs. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const { el, $ } = SC.ui;
  const core = SC.core;
  const t = (k) => SC.t(k);

  function fxItem(kind, type, icon, labelKey, descKey, wide) {
    const it = el('div', { class: 'fx-item' + (wide ? ' wide' : ''), draggable: 'true', 'data-tip': descKey });
    it.innerHTML = SC.icon(icon) + '<span data-i18n="' + labelKey + '"></span>';
    it.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('application/x-slaxx-' + kind, type);
      e.dataTransfer.effectAllowed = 'copy';
      SC.dragPayload = { kind, type };
    });
    it.addEventListener('dragend', () => { SC.dragPayload = null; SC.timeline && SC.timeline.clearDropHints(); });
    // click = apply to the selected clip(s)
    it.addEventListener('click', () => {
      const sel = SC.store.selectedClips();
      if (kind === 'fx' && type === 'text') { SC.timeline.addTextAt(SC.store.S.playhead); return; }
      if (kind === 'fx' && type === 'match') { SC.edit.matchLoudness(sel.length ? sel : SC.store.S.project.clips); return; }
      if (!sel.length) { SC.ui.toast(t('toast.noSel')); return; }
      if (kind === 'fx') SC.timeline.applyEffectTo(sel, type);
      else SC.timeline.applyTransitionTo(sel[0], 'out', type);
    });
    return it;
  }

  function build() {
    const fx = $('#pageEffects');
    const sc = el('div', { class: 'fx-scroll' });
    sc.append(el('div', { class: 'fx-hint', 'data-i18n': 'fx.hint' }));
    for (const cat of core.EFFECT_CATS) {
      sc.append(el('div', { class: 'fx-cat', 'data-i18n': 'cat.' + cat }));
      const grid = el('div', { class: 'fx-grid' });
      const types = Object.keys(core.EFFECTS).filter(k => core.EFFECTS[k].cat === cat);
      for (const ty of types) grid.append(fxItem('fx', ty, core.EFFECTS[ty].icon, 'fx.' + ty, 'fxd.' + ty, ty === 'text' || ty === 'detach' || ty === 'match' || ty === 'dynnorm'));
      sc.append(grid);
    }
    fx.append(sc);

    const tr = $('#pageTransitions');
    const sc2 = el('div', { class: 'fx-scroll' });
    sc2.append(el('div', { class: 'fx-hint', 'data-i18n': 'tr.hint' }));
    const grid = el('div', { class: 'fx-grid' });
    for (const ty of Object.keys(core.TRANSITIONS)) grid.append(fxItem('tr', ty, core.TRANSITIONS[ty].icon, 'tr.' + ty, 'trd.' + ty));
    sc2.append(grid);
    tr.append(sc2);
  }

  SC.effectsPanel = { build };
})();
