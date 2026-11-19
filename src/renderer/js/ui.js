/* SlaxxCUT – UI helpers: DOM, tooltips, toasts, dialogs, context menus. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};
  const t = (k, v) => SC.t(k, v);

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    if (children) for (const c of [].concat(children)) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
    return e;
  }
  function iconBtn(icon, tipKey, onClick, extra) {
    const b = el('button', Object.assign({ class: 'ibtn', 'data-tip': tipKey, type: 'button' }, extra || {}));
    b.innerHTML = SC.icon(icon);
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  /* ---------------- tooltip (delay configurable, default 2 s) ---------------- */
  const tip = { el: null, timer: null, target: null, delay: 2000 };
  function initTooltips() {
    tip.el = el('div', { class: 'tooltip', role: 'tooltip' });
    document.body.append(tip.el);
    document.addEventListener('mouseover', (e) => {
      const tg = e.target.closest && e.target.closest('[data-tip],[data-tip-text]');
      if (tg === tip.target) return;
      hideTip();
      if (!tg) return;
      tip.target = tg;
      tip.timer = setTimeout(() => showTip(tg), tip.delay);
    });
    document.addEventListener('mousedown', hideTip, true);
    document.addEventListener('wheel', hideTip, { passive: true, capture: true });
    document.addEventListener('keydown', hideTip, true);
    window.addEventListener('blur', hideTip);
  }
  function showTip(tg) {
    if (!document.body.contains(tg)) return;
    const txt = tg.dataset.tipText || t(tg.dataset.tip);
    if (!txt) return;
    tip.el.textContent = txt;
    tip.el.classList.add('show');
    const r = tg.getBoundingClientRect();
    const tr = tip.el.getBoundingClientRect();
    let x = r.left + r.width / 2 - tr.width / 2;
    let y = r.bottom + 8;
    if (y + tr.height > window.innerHeight - 4) y = r.top - tr.height - 8;
    x = Math.max(6, Math.min(window.innerWidth - tr.width - 6, x));
    tip.el.style.left = x + 'px'; tip.el.style.top = y + 'px';
  }
  function hideTip() {
    clearTimeout(tip.timer); tip.timer = null; tip.target = null;
    if (tip.el) tip.el.classList.remove('show');
  }
  function setTooltipDelay(ms) { tip.delay = Math.max(0, +ms || 0); }

  /* ---------------- toast ---------------- */
  let toastBox = null;
  function toast(msg, kind) {
    if (!toastBox) { toastBox = el('div', { class: 'toasts' }); document.body.append(toastBox); }
    const n = el('div', { class: 'toast ' + (kind || '') }, msg);
    toastBox.append(n);
    requestAnimationFrame(() => n.classList.add('show'));
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 300); }, kind === 'error' ? 6000 : 2600);
  }

  /* ---------------- modal ---------------- */
  function modal(opts) {
    const back = el('div', { class: 'modal-back' });
    const box = el('div', { class: 'modal ' + (opts.cls || '') });
    const head = el('div', { class: 'modal-head' }, [el('h2', { text: opts.title || '' })]);
    const close = iconBtn('close', 'dlg.cancel', () => api.close());
    if (opts.closable !== false) head.append(close);
    const body = el('div', { class: 'modal-body' });
    if (opts.body) body.append(opts.body);
    const foot = el('div', { class: 'modal-foot' });
    box.append(head, body, foot);
    back.append(box);
    document.body.append(back);
    requestAnimationFrame(() => back.classList.add('show'));
    const onKey = (e) => {
      if (e.key === 'Escape' && opts.closable !== false) { e.stopPropagation(); api.close(); }
    };
    document.addEventListener('keydown', onKey, true);
    const api = {
      el: box, body, foot, head,
      close(result) {
        document.removeEventListener('keydown', onKey, true);
        back.classList.remove('show');
        setTimeout(() => back.remove(), 180);
        if (opts.onClose) opts.onClose(result);
      },
      button(label, cls, fn) {
        const b = el('button', { class: 'btn ' + (cls || ''), type: 'button' }, label);
        b.addEventListener('click', () => fn && fn(b));
        foot.append(b);
        return b;
      }
    };
    if (opts.onBackdrop !== false) back.addEventListener('mousedown', (e) => { if (e.target === back && opts.closable !== false) api.close(); });
    return api;
  }
  /** choice dialog → resolves with the index of the clicked button (or -1) */
  function ask(text, buttons, opts) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title: (opts && opts.title) || 'SlaxxCUT', cls: 'small', body: el('p', { class: 'ask-text', text }),
        onClose: () => { if (!done) resolve(-1); }
      });
      buttons.forEach((b, i) => m.button(b, i === 0 ? 'primary' : '', () => { done = true; m.close(); resolve(i); }));
      setTimeout(() => { const b = m.foot.querySelector('.primary'); if (b) b.focus(); }, 50);
    });
  }

  /* ---------------- context menu ---------------- */
  let ctx = null;
  function contextMenu(x, y, items) {
    closeContext();
    ctx = el('div', { class: 'ctxmenu' });
    for (const it of items) {
      if (it === '-') { ctx.append(el('div', { class: 'sep' })); continue; }
      const row = el('div', { class: 'item' + (it.disabled ? ' disabled' : '') });
      row.innerHTML = (it.icon ? SC.icon(it.icon) : '<span class="ic"></span>') + '<span>' + escapeHtml(it.label) + '</span>' + (it.key ? '<kbd>' + it.key + '</kbd>' : '');
      if (!it.disabled) row.addEventListener('click', () => { closeContext(); it.action(); });
      ctx.append(row);
    }
    document.body.append(ctx);
    const r = ctx.getBoundingClientRect();
    ctx.style.left = Math.min(x, window.innerWidth - r.width - 4) + 'px';
    ctx.style.top = Math.min(y, window.innerHeight - r.height - 4) + 'px';
    setTimeout(() => document.addEventListener('mousedown', outside, true), 0);
  }
  function outside(e) { if (ctx && !ctx.contains(e.target)) closeContext(); }
  function closeContext() { if (ctx) { ctx.remove(); ctx = null; document.removeEventListener('mousedown', outside, true); } }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function basename(p) { return String(p).split(/[\\/]/).pop(); }
  function fmtBytes(n) { if (n < 1024) return n + ' B'; if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'; if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB'; return (n / 1073741824).toFixed(2) + ' GB'; }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  SC.ui = { $, $$, el, iconBtn, initTooltips, hideTip, setTooltipDelay, toast, modal, ask, contextMenu, closeContext, escapeHtml, basename, fmtBytes, clamp };
})();
