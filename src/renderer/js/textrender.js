/* SlaxxCUT – text clip rendering incl. templates (preview + export use the same code). Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};

  const BUNDLED_FONTS = ['Inter', 'Montserrat', 'Roboto', 'Anton', 'Archivo Black', 'Bitter', 'Crimson Text', 'Comic Relief'];
  const COMMON_FONTS = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Segoe UI', 'Calibri', 'Futura', 'Avenir', 'Gill Sans', 'Menlo', 'DejaVu Sans', 'Liberation Sans', 'Ubuntu'];
  let systemFonts = null;
  const images = new Map(); // bg image path → HTMLImageElement

  async function listFonts() {
    if (systemFonts) return systemFonts;
    let fams = [];
    try {
      if (window.queryLocalFonts) {
        const fonts = await window.queryLocalFonts();
        fams = Array.from(new Set(fonts.map(f => f.family))).sort((a, b) => a.localeCompare(b));
      }
    } catch (e) { /* permission or not supported */ }
    if (!fams.length) fams = COMMON_FONTS.filter(f => document.fonts.check('12px "' + f + '"'));
    systemFonts = { bundled: BUNDLED_FONTS, system: fams.filter(f => !BUNDLED_FONTS.includes(f)) };
    return systemFonts;
  }

  const TPL_DEFAULTS = {
    free: { x: 0.5, y: 0.5, size: 96, align: 'center', bg: { type: 'none' } },
    lower: { x: 0.27, y: 0.83, size: 54, size2: 32, align: 'left', bg: { type: 'color', color: '#0b1d3f', color2: '#3b8cff', opacity: 0.9, radius: 6, padding: 0.5, accent: true }, anim: { in: 'slideLeft', out: 'slideLeft', d: 0.6 } },
    bar: { x: 0.5, y: 0.92, size: 44, size2: 30, align: 'left', bg: { type: 'color', color: '#0b1d3f', color2: '#3b8cff', opacity: 0.85, radius: 0, padding: 0.45, accent: false }, anim: { in: 'slideUp', out: 'fade', d: 0.5 } },
    box: { x: 0.5, y: 0.5, size: 90, size2: 40, align: 'center', bg: { type: 'gradient', color: '#0b1d3f', color2: '#2f6fd6', opacity: 0.88, radius: 18, padding: 0.6, angle: 90 }, anim: { in: 'pop', out: 'fade', d: 0.5 } },
    badge: { x: 0.86, y: 0.1, size: 36, size2: 24, align: 'center', bg: { type: 'color', color: '#3b8cff', color2: '#0b1d3f', opacity: 0.95, radius: 999, padding: 0.5 }, anim: { in: 'pop', out: 'pop', d: 0.4 } },
    ticker: { x: 0.5, y: 0.93, size: 40, align: 'left', speed: 0.15, bg: { type: 'color', color: '#0b1d3f', color2: '#3b8cff', opacity: 0.85, radius: 0, padding: 0.4 }, anim: { in: 'fade', out: 'fade', d: 0.4 } },
    credits: { x: 0.5, y: 0.5, size: 48, align: 'center', bg: { type: 'color', color: '#000000', opacity: 1 }, anim: { in: 'fade', out: 'fade', d: 0.8 } }
  };
  function defaults(template) {
    const t = template || 'free';
    const base = {
      template: t, text: SC.t('text.default'), line2: '', font: 'Montserrat', size: 96, size2: 40, color: '#ffffff', color2: '#cde3ff',
      bold: true, italic: false, align: 'center', x: 0.5, y: 0.5, speed: 0.15,
      shadow: { on: true, color: '#000000', dx: 4, dy: 4, blur: 8 },
      outline: { on: false, color: '#0b1d3f', width: 4 },
      bg: { type: 'none', color: '#0b1d3f', color2: '#3b8cff', opacity: 0.85, radius: 8, padding: 0.5, angle: 90, image: '', accent: false },
      anim: { in: 'none', out: 'none', d: 0.6 }
    };
    if (t === 'lower') { base.text = SC.t('tpl.name'); base.line2 = SC.t('tpl.role'); base.shadow.on = false; }
    if (t === 'bar') { base.text = SC.t('tpl.info'); base.shadow.on = false; }
    if (t === 'box') { base.text = SC.t('tpl.title'); base.line2 = SC.t('tpl.subtitle'); base.shadow.on = false; }
    if (t === 'badge') { base.text = 'LIVE'; base.shadow.on = false; }
    if (t === 'ticker') { base.text = SC.t('tpl.tickerText'); base.shadow.on = false; base.bold = false; }
    if (t === 'credits') { base.text = SC.t('tpl.creditsText'); base.shadow.on = false; base.bold = false; }
    const d = TPL_DEFAULTS[t] || {};
    return Object.assign(base, d, { bg: Object.assign(base.bg, d.bg || {}), anim: Object.assign(base.anim, d.anim || {}) });
  }
  function props(c) {
    const p = c.text || {};
    const d = defaults(p.template);
    // migrate v1 box option
    if (p.box && p.box.on && (!p.bg || p.bg.type === 'none')) d.bg = Object.assign(d.bg, { type: 'color', color: p.box.color, opacity: p.box.opacity });
    return Object.assign(d, p, {
      shadow: Object.assign(d.shadow, p.shadow || {}),
      outline: Object.assign(d.outline, p.outline || {}),
      bg: Object.assign(d.bg, p.bg || {}),
      anim: Object.assign(d.anim, p.anim || {})
    });
  }
  function fontString(p, k, size, bold) {
    return (p.italic ? 'italic ' : '') + ((bold != null ? bold : p.bold) ? '700 ' : '400 ') + Math.max(4, size * k).toFixed(1) + 'px "' + p.font + '", Inter, sans-serif';
  }
  async function ensureFont(c) {
    const p = props(c);
    try { await document.fonts.load(fontString(p, 1, p.size), p.text || 'A'); await document.fonts.load(fontString(p, 1, p.size2, false), 'A'); } catch (e) { /* */ }
  }
  function bgImage(file, onReady) {
    if (!file) return null;
    let im = images.get(file);
    if (!im) {
      im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => { if (onReady) onReady(); };
      im.src = window.api.mediaUrl(file);
      images.set(file, im);
    } else if (!im.complete && onReady) im.addEventListener('load', onReady, { once: true });
    return im.complete && im.naturalWidth ? im : null;
  }
  function loadBg(file) {
    return new Promise((res) => { const im = bgImage(file, () => res(images.get(file))); if (im) res(im); setTimeout(() => res(null), 4000); });
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function paintBg(ctx, p, x, y, w, h, k, onAsync) {
    const bg = p.bg;
    if (!bg || bg.type === 'none') return;
    ctx.save();
    ctx.globalAlpha = +bg.opacity;
    roundRect(ctx, x, y, w, h, (+bg.radius || 0) * k);
    if (bg.type === 'image') {
      ctx.clip();
      const im = bgImage(bg.image, onAsync);
      if (im) {
        const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
        const iw = im.naturalWidth * s, ih = im.naturalHeight * s;
        ctx.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
      } else { ctx.fillStyle = bg.color; ctx.fill(); }
    } else if (bg.type === 'gradient') {
      const a = (+bg.angle || 0) * Math.PI / 180, cx = x + w / 2, cy = y + h / 2, r = Math.hypot(w, h) / 2;
      const gr = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      gr.addColorStop(0, bg.color); gr.addColorStop(1, bg.color2);
      ctx.fillStyle = gr; ctx.fill();
    } else { ctx.fillStyle = bg.color; ctx.fill(); }
    ctx.restore();
    if (bg.accent) {
      ctx.save(); ctx.fillStyle = bg.color2;
      ctx.fillRect(x, y, Math.max(3, 8 * k), h);
      ctx.restore();
    }
  }
  function drawLine(ctx, p, str, x, y) {
    ctx.save();
    if (p.shadow.on) {
      ctx.shadowColor = p.shadow.color;
      ctx.shadowOffsetX = p.shadow.dx * ctx._k; ctx.shadowOffsetY = p.shadow.dy * ctx._k; ctx.shadowBlur = p.shadow.blur * ctx._k;
    }
    if (p.outline.on && p.outline.width > 0) {
      ctx.lineJoin = 'round';
      ctx.strokeStyle = p.outline.color; ctx.lineWidth = p.outline.width * ctx._k * 2;
      ctx.strokeText(str, x, y);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /** text block layout: lines of line1 (size) followed by line2 lines (size2) */
  function layoutBlock(ctx, p, k) {
    const rows = [];
    for (const l of String(p.text || '').split('\n')) rows.push({ s: l, size: p.size, bold: p.bold, color: p.color });
    if (p.line2 && p.template !== 'free' && p.template !== 'ticker' && p.template !== 'credits') for (const l of String(p.line2).split('\n')) rows.push({ s: l, size: p.size2, bold: false, color: p.color2 });
    let w = 1, h = 0;
    for (const r of rows) {
      ctx.font = fontString(p, k, r.size, r.bold);
      const m = ctx.measureText(r.s || ' ');
      r.w = m.width; r.lh = r.size * k * 1.22; r.asc = r.size * k * 0.92;
      w = Math.max(w, r.w); h += r.lh;
    }
    return { rows, w, h };
  }
  function drawBlock(ctx, p, B, left, top, k) {
    let y = top;
    for (const r of B.rows) {
      ctx.font = fontString(p, k, r.size, r.bold);
      ctx.fillStyle = r.color;
      let x = left;
      if (p.align === 'center') x = left + (B.w - r.w) / 2;
      else if (p.align === 'right') x = left + B.w - r.w;
      drawLine(ctx, p, r.s, x, y + r.asc + (r.lh - r.size * k * 1.12) / 2);
      y += r.lh;
    }
  }

  /**
   * Renders a text clip part into canvas.
   * part: null (complete static template), 'bg' (ticker/credits background), 'strip' (moving text)
   */
  function renderPart(canvas, c, W, H, part, onAsync) {
    const p = props(c);
    const k = Math.min(W, H) / 1080;
    const tpl = p.template;
    if (part === 'strip') return renderStrip(canvas, c, p, W, H, k);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');
    ctx._k = k;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    if (part === 'bg') {
      if (tpl === 'credits') paintBg(ctx, p, 0, 0, W, H, 0, onAsync);
      else {
        const lh = p.size * k * 1.22, pad = p.size * k * (+p.bg.padding || 0.4);
        const h = lh + pad * 2;
        paintBg(ctx, Object.assign({}, p, { bg: Object.assign({}, p.bg, { radius: 0 }) }), 0, p.y * H - h / 2, W, h, k, onAsync);
      }
      return { bbox: null };
    }
    const B = layoutBlock(ctx, p, k);
    const pad = p.size * k * (+p.bg.padding || 0.4);
    const hasBg = p.bg.type !== 'none';
    const padX = hasBg ? pad * 1.4 + (p.bg.accent ? 10 * k : 0) : 0, padY = hasBg ? pad * 0.7 : 0;
    let bw = B.w + padX * 2, bh = B.h + padY * 2;
    let bx = p.x * W - bw / 2, by = p.y * H - bh / 2;
    if (tpl === 'bar') { bx = 0; bw = W; }
    if (hasBg) paintBg(ctx, p, bx, by, bw, bh, k, onAsync);
    let left = bx + padX;
    if (tpl === 'bar') left = p.align === 'center' ? (W - B.w) / 2 : p.align === 'right' ? W - B.w - padX : padX + W * 0.03;
    drawBlock(ctx, p, B, left, by + padY, k);
    const bbox = tpl === 'bar' ? { x: bx, y: by, w: bw, h: bh } : { x: bx, y: by, w: bw, h: bh };
    if (!hasBg) { const pp = p.size * k * 0.25; bbox.x -= pp; bbox.y -= pp * 0.6; bbox.w += pp * 2; bbox.h += pp * 1.2; }
    return { bbox };
  }

  function renderStrip(canvas, c, p, W, H, k) {
    const ctx0 = canvas.getContext('2d');
    ctx0._k = k;
    if (p.template === 'ticker') {
      const str = String(p.text || '').split('\n').filter(Boolean).join('   •   ') + '   •   ';
      ctx0.font = fontString(p, k, p.size);
      const tw = Math.min(16000, Math.ceil(ctx0.measureText(str).width) + 4);
      const th = Math.ceil(p.size * k * 1.4);
      canvas.width = tw; canvas.height = th;
      const ctx = canvas.getContext('2d'); ctx._k = k;
      ctx.clearRect(0, 0, tw, th);
      ctx.font = fontString(p, k, p.size); ctx.fillStyle = p.color; ctx.textBaseline = 'middle';
      drawLine(ctx, p, str, 2, th / 2);
      setMeasure(c, tw / W, th / H);
    } else {
      // credits: centred lines; lines starting with '#' are headings
      const lines = String(p.text || '').split('\n');
      const rows = lines.map(l => {
        const head = l.startsWith('#');
        return { s: head ? l.replace(/^#+\s*/, '') : l, size: head ? p.size * 1.25 : p.size, bold: head ? true : p.bold, color: head ? p.color2 : p.color };
      });
      let h = 0, w = 1;
      for (const r of rows) { ctx0.font = fontString(p, k, r.size, r.bold); r.w = ctx0.measureText(r.s || ' ').width; r.lh = r.size * k * 1.45; h += r.lh; w = Math.max(w, r.w); }
      const cw = Math.min(W, Math.ceil(w + 40 * k)), ch = Math.min(16000, Math.ceil(h + 20 * k));
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d'); ctx._k = k;
      ctx.clearRect(0, 0, cw, ch); ctx.textBaseline = 'middle';
      let y = 10 * k;
      for (const r of rows) {
        ctx.font = fontString(p, k, r.size, r.bold); ctx.fillStyle = r.color;
        drawLine(ctx, p, r.s, (cw - r.w) / 2, y + r.lh / 2);
        y += r.lh;
      }
      setMeasure(c, cw / W, ch / H);
    }
    return { bbox: null };
  }
  function setMeasure(c, w, h) {
    const m = c.text && c.text.measure;
    if (!m || Math.abs(m.w - w) > 1e-3 || Math.abs(m.h - h) > 1e-3) {
      c.text = Object.assign({}, c.text, { measure: { w: +w.toFixed(5), h: +h.toFixed(5) } });
      if (SC.program) SC.program.needsRender = true;
    }
  }

  // v1 API
  function render(canvas, c, W, H) { return renderPart(canvas, c, W, H, null).bbox; }

  /** PNG data-URLs at export resolution: {id} or {id:bg, id:strip} */
  async function toImages(c, W, H) {
    await ensureFont(c);
    const p = props(c);
    if (p.bg.type === 'image' && p.bg.image) await loadBg(p.bg.image);
    const out = {};
    const scroll = SC.core.textScroll(Object.assign({}, c, { text: p }));
    if (!scroll) {
      const cv = document.createElement('canvas'); renderPart(cv, c, W, H, null); out[c.id] = cv.toDataURL('image/png');
    } else {
      const cs = document.createElement('canvas'); renderPart(cs, c, W, H, 'strip'); out[c.id + ':strip'] = cs.toDataURL('image/png');
      if (p.bg.type !== 'none') { const cb = document.createElement('canvas'); renderPart(cb, c, W, H, 'bg'); out[c.id + ':bg'] = cb.toDataURL('image/png'); }
    }
    return out;
  }
  async function toDataURL(c, W, H) { const r = await toImages(c, W, H); return r[c.id] || Object.values(r)[0]; }

  SC.text = { defaults, props, render, renderPart, ensureFont, toImages, toDataURL, listFonts, loadBg, BUNDLED_FONTS };
})();
