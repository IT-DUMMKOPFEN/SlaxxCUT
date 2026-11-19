/* SlaxxCUT – text clip rendering (preview + export use the same code). Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};

  const BUNDLED_FONTS = ['Inter', 'Montserrat', 'Roboto', 'Anton', 'Archivo Black', 'Bitter', 'Crimson Text', 'Comic Relief'];
  const COMMON_FONTS = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Segoe UI', 'Calibri', 'Futura', 'Avenir', 'Gill Sans', 'Menlo', 'DejaVu Sans', 'Liberation Sans', 'Ubuntu'];
  let systemFonts = null;

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

  function defaults() {
    return {
      text: SC.t('text.default'), font: 'Montserrat', size: 96, color: '#ffffff', bold: true, italic: false, align: 'center',
      x: 0.5, y: 0.5,
      shadow: { on: true, color: '#000000', dx: 4, dy: 4, blur: 8 },
      outline: { on: false, color: '#0b1d3f', width: 4 },
      box: { on: false, color: '#0b1d3f', opacity: 0.6 }
    };
  }
  function props(c) {
    const d = defaults(), p = c.text || {};
    return Object.assign(d, p, {
      shadow: Object.assign(d.shadow, p.shadow || {}),
      outline: Object.assign(d.outline, p.outline || {}),
      box: Object.assign(d.box, p.box || {})
    });
  }
  function fontString(p, k) {
    return (p.italic ? 'italic ' : '') + (p.bold ? '700 ' : '400 ') + Math.max(4, p.size * k).toFixed(1) + 'px "' + p.font + '", Inter, sans-serif';
  }
  async function ensureFont(c) {
    const p = props(c);
    try { await document.fonts.load(fontString(p, 1), p.text || 'A'); } catch (e) { /* ignore */ }
  }

  /** draws the text clip into canvas (W×H, transparent). Returns the text bounding box in pixels. */
  function render(canvas, c, W, H) {
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const p = props(c);
    const k = Math.min(W, H) / 1080;
    ctx.font = fontString(p, k);
    ctx.textBaseline = 'alphabetic';
    const lines = String(p.text || '').split('\n');
    const lh = p.size * k * 1.18;
    const metrics = lines.map(l => ctx.measureText(l || ' '));
    const widths = metrics.map(m => m.width);
    const bw = Math.max(1, ...widths);
    const asc = metrics[0] ? (metrics[0].fontBoundingBoxAscent || p.size * k * 0.8) : p.size * k * 0.8;
    const bh = lh * lines.length;
    const cx = p.x * W, cy = p.y * H;
    const left = cx - bw / 2, top = cy - bh / 2;
    const pad = p.size * k * 0.25;
    if (p.box.on) {
      ctx.save();
      ctx.globalAlpha = +p.box.opacity;
      ctx.fillStyle = p.box.color;
      const r = pad * 0.8;
      roundRect(ctx, left - pad, top - pad * 0.6, bw + pad * 2, bh + pad * 1.2, r);
      ctx.fill();
      ctx.restore();
    }
    lines.forEach((line, i) => {
      let x = left;
      if (p.align === 'center') x = cx - widths[i] / 2;
      else if (p.align === 'right') x = left + bw - widths[i];
      const y = top + i * lh + asc + (lh - p.size * k * 1.0) / 2;
      ctx.save();
      if (p.shadow.on) {
        ctx.shadowColor = p.shadow.color;
        ctx.shadowOffsetX = p.shadow.dx * k; ctx.shadowOffsetY = p.shadow.dy * k; ctx.shadowBlur = p.shadow.blur * k;
      }
      if (p.outline.on && p.outline.width > 0) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = p.outline.color; ctx.lineWidth = p.outline.width * k * 2;
        ctx.strokeText(line, x, y);
        ctx.shadowColor = 'transparent';
      }
      ctx.fillStyle = p.color;
      ctx.fillText(line, x, y);
      ctx.restore();
    });
    return { x: left - pad, y: top - pad * 0.6, w: bw + pad * 2, h: bh + pad * 1.2 };
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  /** PNG data-URL at export resolution */
  async function toDataURL(c, W, H) {
    await ensureFont(c);
    const cv = document.createElement('canvas');
    render(cv, c, W, H);
    return cv.toDataURL('image/png');
  }

  SC.text = { defaults, props, render, ensureFont, toDataURL, listFonts, BUNDLED_FONTS };
})();
