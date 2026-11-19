/* SlaxxCUT – export via FFmpeg (main process): MP4/MOV video, WAV/MP3/FLAC/OGG/M4A audio, PNG still. Done by IT-DUMMKOPFEN */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../shared/core.js');
const ff = require('./ffmpeg.js');

const QUALITY = {
  low: { crf: 28, cq: 30, bpp: 0.05 },
  medium: { crf: 23, cq: 25, bpp: 0.08 },
  high: { crf: 19, cq: 21, bpp: 0.12 },
  max: { crf: 16, cq: 18, bpp: 0.2 }
};
const N = core.num;
const hex = (rgb) => '0x' + rgb.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

/* ---------- per-pixel primitives → filters (FW×FH = layer size in pixels) ---------- */
function colorFilters(ops, ctx, FW, FH) {
  const f = [];
  for (const o of ops) {
    switch (o.op) {
      case 'matrix': {
        const m = o.m.map(N);
        f.push(`colorchannelmixer=rr=${m[0]}:rg=${m[1]}:rb=${m[2]}:gr=${m[3]}:gg=${m[4]}:gb=${m[5]}:br=${m[6]}:bg=${m[7]}:bb=${m[8]}`);
        break;
      }
      case 'curve': f.push('lutrgb=' + ['r', 'g', 'b'].map((k, i) => `${k}='clip((val-127.5)*${N(o.c[i])}+127.5+${N(o.b[i] * 255)},0,255)'`).join(':')); break;
      case 'duotone': f.push('lutrgb=' + ['r', 'g', 'b'].map((k, i) => `${k}='clip(${N(o.a[i] * 255)}+${N(o.b[i] - o.a[i])}*val,0,255)'`).join(':')); break;
      case 'posterize': {
        const L = Math.max(2, o.levels);
        f.push('lutrgb=' + ['r', 'g', 'b'].map(k => `${k}='floor(val/256*${L})*255/${L - 1}'`).join(':'));
        break;
      }
      case 'vignette': {
        const k = `pow(cos(min(${N(o.a)}*hypot(X-W/2,Y-H/2)/hypot(W/2,H/2),PI/2)),4)`;
        f.push(`geq=r='r(X,Y)*${k}':g='g(X,Y)*${k}':b='b(X,Y)*${k}':a='alpha(X,Y)'`);
        break;
      }
      case 'grain': f.push(`format=gbrap,noise=c0s=${Math.round(o.n)}:c1s=${Math.round(o.n)}:c2s=${Math.round(o.n)}:allf=t+u,format=rgba`); break;
      case 'bars': f.push(`drawbox=x=0:y=0:w=iw:h=ih*${N(o.h)}:color=black@1:t=fill,drawbox=x=0:y=ih-ih*${N(o.h)}:w=iw:h=ih*${N(o.h)}:color=black@1:t=fill`); break;
      case 'sharpen': f.push(`unsharp=lx=13:ly=13:la=${N(o.amount)}:cx=13:cy=13:ca=${N(o.amount)}`); break;
      case 'blur': f.push(`gblur=sigma=${N(Math.max(0.3, o.s * FH))},format=rgba`); break;
      case 'shift': { const px = Math.max(1, Math.round(o.s * FW)); f.push(`rgbashift=rh=-${px}:bh=${px}`); break; }
      case 'scan': { const sp = Math.max(2, Math.round(FH / 270)); f.push(`drawgrid=x=-8:y=0:w=iw+16:h=${sp}:t=1:color=black@${N(o.a)}`); break; }
      case 'glow': {
        const id = ctx.uid();
        f.push(`split[gla${id}][glb${id}];[glb${id}]gblur=sigma=${N(Math.max(0.5, o.r * FH))},format=rgba[glc${id}];[gla${id}][glc${id}]blend=all_mode=screen:all_opacity=${N(o.k)},format=rgba`);
        break;
      }
      case 'pixel': {
        const bs = Math.max(2, Math.round(o.s * FH));
        if (!o.rect) f.push(`pixelize=w=${bs}:h=${bs}`);
        else {
          const id = ctx.uid();
          const x = Math.round(o.rect[0] * FW), y = Math.round(o.rect[1] * FH);
          const w = Math.max(2, Math.min(FW - x, Math.round(o.rect[2] * FW))), h = Math.max(2, Math.min(FH - y, Math.round(o.rect[3] * FH)));
          f.push(`split[pxa${id}][pxb${id}];[pxb${id}]crop=${w}:${h}:${x}:${y},pixelize=w=${bs}:h=${bs}[pxc${id}];[pxa${id}][pxc${id}]overlay=x=${x}:y=${y}:format=auto,format=rgba`);
        }
        break;
      }
      case 'key': f.push(`colorkey=color=${hex(o.color)}:similarity=${N(Math.max(0.01, o.sim))}:blend=${N(o.blend)}`); break;
      case 'border': f.push(`drawbox=x=0:y=0:w=iw:h=ih:color=${hex(o.color)}@1:t=${Math.max(1, Math.round(o.w * Math.min(FW, FH) * 3))}`); break;
      case 'lut': {
        if (o.file && fs.existsSync(o.file)) {
          const name = 'lut_' + ctx.uid() + path.extname(o.file);
          fs.copyFileSync(o.file, path.join(ctx.tmp, name));
          f.push(`lut3d=file=${name}`);
        }
        break;
      }
    }
  }
  return f;
}
function geoFilters(g) {
  const f = [];
  if (g.crop) {
    const [l, t, r, b] = g.crop;
    f.push(`crop=w='trunc(iw*${N(1 - l - r)}/2)*2':h='trunc(ih*${N(1 - t - b)}/2)*2':x='iw*${N(l)}':y='ih*${N(t)}'`);
  }
  if (g.flipH) f.push('hflip');
  if (g.flipV) f.push('vflip');
  if (g.rot === 90) f.push('transpose=1');
  if (g.rot === 180) f.push('hflip,vflip');
  if (g.rot === 270) f.push('transpose=2');
  return f;
}

/* chunk boundaries must not cut animated windows */
function chunkBoundaries(p, D, fps, target) {
  const busy = [];
  for (const L of core.planVisual(p, 0, D)) {
    for (const r of L.alpha.concat(L.bright, L.white)) busy.push([r.a, r.b]);
    if (L.mask) busy.push([L.mask.a, L.mask.b]);
    for (const g of L.glitch.concat(L.blur, L.tblur, L.tpix)) busy.push([g.a, g.b]);
  }
  const free = (t) => !busy.some(([a, b]) => t > a - 0.02 && t < b + 0.02);
  const snap = (t) => Math.round(t * fps) / fps;
  const bounds = [0];
  let t = target;
  while (t < D - 1) {
    let c = snap(t), guard = 0;
    while (!free(c) && c < D && guard++ < 4000) c = snap(c + 1 / fps);
    if (c >= D - 0.5) break;
    if (c > bounds[bounds.length - 1] + 0.5) bounds.push(c);
    t = c + target;
  }
  bounds.push(snap(D) || D);
  return bounds;
}

function videoEncoderArgs(o, W, H, fps, enc) {
  const Q = QUALITY[o.quality] || QUALITY.high;
  if (o.vcodec === 'prores') {
    const prof = { low: 0, medium: 1, high: 2, max: 3 }[o.quality];
    return ['-c:v', 'prores_ks', '-profile:v', String(prof == null ? 2 : prof), '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0', '-r', String(fps)];
  }
  const bitrate = Math.round(W * H * fps * Q.bpp / 1000) + 'k';
  const common = ['-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(Math.round(fps * 2))];
  switch (enc) {
    case 'h264_videotoolbox': return ['-c:v', 'h264_videotoolbox', '-b:v', bitrate, '-maxrate', bitrate, '-profile:v', 'high', ...common];
    case 'h264_nvenc': return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', String(Q.cq), '-b:v', '0', ...common];
    case 'h264_qsv': return ['-c:v', 'h264_qsv', '-b:v', bitrate, ...common];
    case 'h264_amf': return ['-c:v', 'h264_amf', '-b:v', bitrate, ...common];
    default: return ['-c:v', 'libx264', '-preset', o.preset || 'medium', '-crf', String(Q.crf), '-profile:v', 'high', ...common];
  }
}
function audioEncoderArgs(o) {
  const sr = String(o.sampleRate || 48000);
  switch (o.format) {
    case 'wav': return ['-c:a', o.bits === 24 ? 'pcm_s24le' : 'pcm_s16le', '-ar', sr];
    case 'mp3': return ['-c:a', 'libmp3lame', '-b:a', (o.bitrate || 320) + 'k', '-ar', sr];
    case 'flac': return ['-c:a', 'flac', '-compression_level', '5', '-ar', sr].concat(o.bits === 24 ? ['-sample_fmt', 's32'] : ['-sample_fmt', 's16']);
    case 'ogg': return ['-c:a', 'libvorbis', '-q:a', String(o.oggq || 6), '-ar', sr];
    case 'm4a': return ['-c:a', 'aac', '-b:a', (o.bitrate || 256) + 'k', '-ar', sr];
    default: return ['-c:a', 'aac', '-b:a', '192k', '-ar', sr];
  }
}

async function pickEncoder(o) {
  if (o.vcodec === 'prores') return 'prores_ks';
  const e = await ff.encoders();
  if (o.encoder && o.encoder !== 'auto') return e[o.encoder] ? o.encoder : 'libx264';
  for (const hw of ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf']) if (e[hw]) return hw;
  return 'libx264';
}

/* ---------- one video chunk ---------- */
function buildChunk(p, c0, c1, W, H, fps, ctx) {
  const layers = core.planVisual(p, c0, c1);
  const dur = c1 - c0;
  const inputs = [];
  const graph = [`color=c=black:s=${W}x${H}:r=${fps}:d=${N(dur)},format=yuv420p,setsar=1[base]`];
  let last = 'base';
  layers.forEach((L, li) => {
    const lc0 = Math.max(L.vs, c0), lc1 = Math.min(L.ve, c1);
    const ld = lc1 - lc0;
    if (ld <= 1 / fps / 2) return;
    let alphaZero = false;
    for (const r of L.alpha) {
      if (r.dir === 'in' && r.a >= lc1) alphaZero = true;
      if (r.dir === 'out' && r.b <= lc0) alphaZero = true;
    }
    if (alphaZero || (!L.opacityExpr && L.opacity <= 0)) return;
    const c = L.clip, m = L.media;
    const idx = inputs.length;
    const chain = [];
    let srcW, srcH;
    if (c.kind === 'text') {
      const png = ctx.textImages[c.id + (L.part ? ':' + L.part : '')];
      if (!png) return;
      inputs.push(['-loop', '1', '-framerate', String(fps), '-t', N(ld + 0.1), '-i', png]);
      chain.push(`[${idx}:v]setpts=PTS-STARTPTS`);
      srcW = W; srcH = H;
    } else if (c.kind === 'image' || (m && m.isImage)) {
      inputs.push(['-loop', '1', '-framerate', String(fps), '-t', N(ld + 0.1), '-i', m.path]);
      chain.push(`[${idx}:v]setpts=PTS-STARTPTS`);
      srcW = m.width; srcH = m.height;
    } else {
      if (!m) return;
      const sp = L.speed;
      const s0 = core.sourceTime(c, lc0);
      const a = Math.min(Math.max(0, s0), Math.max(0, (m.duration || 0) - 0.15));
      const preMissing = s0 < 0 ? -s0 / sp : 0;
      inputs.push(['-ss', N(a), '-t', N(ld * sp + 1), '-i', m.path]);
      chain.push(`[${idx}:v]setpts=(PTS-STARTPTS)/${N(sp)}`, `fps=${fps}`,
        `tpad=start_duration=${N(preMissing)}:start_mode=clone:stop_duration=${N(ld + 1)}:stop_mode=clone`);
      srcW = m.width; srcH = m.height;
    }
    chain.push(`trim=duration=${N(ld)}`, 'setpts=PTS-STARTPTS');
    if (c.kind !== 'text') chain.push(...geoFilters(L.geo));
    const fit = core.layerFit(L, srcW, srcH, W, H);
    const FW = Math.max(2, Math.round(fit.w)), FH = Math.max(2, Math.round(fit.h));
    chain.push(`scale=${FW}:${FH}:flags=bicubic`, 'setsar=1', 'format=rgba');
    for (const e of L.colorEffects) chain.push(...colorFilters(core.colorOps(e), ctx, FW, FH));
    const Tloc = 't+' + N(lc0);
    const en = (a, b) => `enable='between(t,${N(a - lc0)},${N(b - lc0)})'`;
    if (L.opacityExpr) {
      const E = core.subst(L.opacityExpr, 'T', 'T+' + N(lc0));
      chain.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${E})'`);
    } else if (L.opacity < 1) chain.push(`colorchannelmixer=aa=${N(L.opacity)}`);
    if (L.mask) {
      const k = `clip((T+${N(lc0)}-${N(L.mask.a)})/${N(L.mask.b - L.mask.a)},0,1)`;
      const S = core.maskS(L.mask.kind, L.mask.dir), e = core.MASK_EDGE;
      let fac = `clip((${k}*${N(1 + e)}-${S})/${N(e)},0,1)`;
      if (L.mask.mode === 'hide') fac = `(1-${fac})`;
      chain.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${fac}':${en(L.mask.a, L.mask.b + (L.mask.mode === 'reveal' ? 0.5 : 0))}`);
    }
    for (const g of L.glitch) {
      const sh = Math.max(2, Math.round(FW * 0.012));
      chain.push(`rgbashift=rh=-${sh}:bh=${sh}:gv=${Math.round(sh / 2)}:${en(g.a, g.b)}`);
      chain.push(`format=gbrap,noise=c0s=40:c1s=40:c2s=40:allf=t:${en(g.a, g.b)},format=rgba`);
    }
    for (const b of L.blur) {
      if (b.vertical) chain.push(`avgblur=sizeX=1:sizeY=${Math.max(2, Math.round(FH * 0.03))}:${en(b.a, b.b)}`);
      else chain.push(`avgblur=sizeX=${Math.max(2, Math.round(FW * 0.03))}:sizeY=1:${en(b.a, b.b)}`);
    }
    for (const s of L.tblur) chain.push(`gblur=sigma=${N(Math.max(0.3, s.level * FH))}:${en(s.a, s.b - 1e-3)},format=rgba`);
    for (const s of L.tpix) { const bs = Math.max(2, Math.round(s.level * FH)); chain.push(`pixelize=w=${bs}:h=${bs}:${en(s.a, s.b - 1e-3)}`); }
    const fades = (list, extra) => {
      for (const r of list) {
        if (r.dir === 'in' && r.b <= lc0) continue;
        if (r.dir === 'out' && r.a >= lc1) continue;
        chain.push(`fade=t=${r.dir}:st=${N(Math.max(0, r.a - lc0))}:d=${N(Math.max(1 / fps, r.b - r.a))}:${extra}`);
      }
    };
    fades(L.alpha, 'alpha=1');
    fades(L.bright, 'color=black');
    fades(L.white, 'color=white');
    if (L.rot !== '0') {
      const R = core.subst(L.rot, 'T', Tloc);
      chain.push(`rotate=a='${R}':c=black@0:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`);
    }
    if (L.s !== '1') {
      if (/^[\d.]+$/.test(L.s)) chain.push(`scale=w='max(2,trunc(iw*${L.s}))':h='max(2,trunc(ih*${L.s}))'`);
      else {
        const S = core.subst(L.s, 'T', Tloc);
        chain.push(`scale=w='max(2,trunc(iw*(${S})))':h='max(2,trunc(ih*(${S})))':eval=frame`);
      }
    }
    chain.push(`setpts=PTS+${N(lc0 - c0)}/TB`);
    const lbl = 'L' + li;
    graph.push(chain.join(',') + `[${lbl}]`);
    const Tm = 't+' + N(c0);
    const X = core.subst(L.x, 'T', Tm), Y = core.subst(L.y, 'T', Tm);
    const out = 'o' + li;
    graph.push(`[${last}][${lbl}]overlay=x='(W-w)/2+(${X})*W':y='(H-h)/2+(${Y})*H':eof_action=pass:eval=frame:format=auto[${out}]`);
    last = out;
  });
  graph.push(`[${last}]format=yuv420p,trim=duration=${N(dur)}[vout]`);
  return { inputs, graph: graph.join(';\n') };
}

/* ---------- audio ---------- */
function writeWavFloat(file, L, R, rate) {
  const n = L.length, data = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) { data.writeFloatLE(L[i], i * 8); data.writeFloatLE(R[i], i * 8 + 4); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

function buildAudio(p, D, opts, ctx) {
  const items = core.planAudio(p).filter(A => A.media && A.ae > A.as);
  const inputs = [], graph = [], labels = [];
  items.forEach((A, i) => {
    const c = A.clip, m = A.media;
    const ld = A.ae - A.as;
    const s0 = core.sourceTime(c, A.as);
    const preMissing = s0 < 0 ? -s0 / A.speed : 0;
    let src = m.path, a = Math.max(0, s0);
    if (A.render && ctx.rendered[A.render.key]) { src = ctx.rendered[A.render.key]; a = Math.max(0, a - A.render.start); }
    else if (m.duration && a >= m.duration) return;
    const idx = inputs.length;
    inputs.push(['-ss', N(a), '-t', N(ld * A.speed + 0.5), '-i', src]);
    let ch = [`[${idx}:a]aresample=48000`, 'aformat=sample_fmts=fltp:channel_layouts=stereo', 'asetpts=PTS-STARTPTS', ...core.atempoChain(A.speed)];
    ch.push(`apad=whole_dur=${N(ld)}`, `atrim=duration=${N(ld - preMissing)}`);
    const tOff = A.as + preMissing;
    if (A.gainExpr) ch.push(`volume=volume='pow(10,(${core.subst(A.gainExpr, 'T', 't+' + N(tOff))})/20)':eval=frame`);
    else if (A.gainDb) ch.push(`volume=${N(A.gainDb)}dB`);
    let seg = 0;
    for (const it of A.live) {
      if (it.f) { ch.push(it.f); continue; }
      // reverb / echo: convolution with an impulse response (extra input)
      const ir = core.impulseResponse(it.ir, 48000);
      const irFile = path.join(ctx.tmp, `ir_${i}_${seg}.wav`);
      writeWavFloat(irFile, ir.L, ir.R, 48000);
      const lbl = `ac${i}_${seg}`;
      graph.push(ch.join(',') + `[${lbl}]`);
      inputs.push(['-i', irFile]);
      ch = [`[${lbl}][${inputs.length - 1}:a]afir=gtype=none:dry=1:wet=1`, 'aformat=sample_fmts=fltp:channel_layouts=stereo'];
      seg++;
    }
    for (const r of A.fades) ch.push(`afade=t=${r.dir}:st=${N(Math.max(0, r.a - tOff))}:d=${N(Math.max(0.01, r.b - r.a))}`);
    const delay = Math.round(tOff * 1000);
    if (delay > 0) ch.push(`adelay=delays=${delay}:all=1`);
    const lbl = 'a' + i;
    graph.push(ch.join(',') + `[${lbl}]`);
    labels.push(lbl);
  });
  let tail = `apad=whole_dur=${N(D)},atrim=duration=${N(D)}`;
  if (opts.normalize) tail += ',loudnorm=I=-14:TP=-1.5:LRA=11';
  tail += ',aresample=' + (opts.sampleRate || 48000);
  if (!labels.length) graph.push(`anullsrc=r=${opts.sampleRate || 48000}:cl=stereo,atrim=duration=${N(D)}[aout]`);
  else if (labels.length === 1) graph.push(`[${labels[0]}]${tail}[aout]`);
  else graph.push(labels.map(l => `[${l}]`).join('') + `amix=inputs=${labels.length}:normalize=0:dropout_transition=0,${tail}[aout]`);
  return { inputs, graph: graph.join(';\n') };
}

/* ---------- export job ---------- */
class ExportJob {
  constructor(project, opts, textImages, onProgress) {
    this.p = project; this.opts = opts; this.textImages = textImages || {}; this.onProgress = onProgress || (() => { });
    this.cancelled = false; this.proc = null;
    this.debugLog = [];
  }
  cancel() { this.cancelled = true; if (this.proc) try { this.proc.kill('SIGKILL'); } catch (e) { /* */ } }

  async runFF(args, cwd, base, span, durSec) {
    if (this.cancelled) throw new Error('CANCELLED');
    let log = '';
    const entry = { t: Date.now(), args: args.filter(a => !String(a).includes('\n')).join(' ').slice(0, 300) };
    this.debugLog.push(entry);
    if (this.debugLog.length > 30) this.debugLog.shift();
    const res = await ff.run(args.concat(['-progress', 'pipe:1', '-nostats']), {
      collect: false,
      onSpawn: (pr) => { this.proc = pr; },
      onStderr: (s) => { log += s; if (log.length > 40000) log = log.slice(-20000); entry.tail = log.slice(-600); },
      onStdout: (d) => {
        const mm = /out_time_us=(\d+)/.exec(d.toString()) || /out_time_ms=(\d+)/.exec(d.toString());
        if (mm && durSec > 0) this.onProgress(base + span * Math.min(1, (+mm[1] / 1e6) / durSec));
      },
      cwd
    });
    this.proc = null;
    if (this.cancelled) throw new Error('CANCELLED');
    if (res.code !== 0) throw new Error('FFmpeg: ' + (log.split('\n').filter(l => /error|invalid|failed|no such|cannot/i.test(l)).slice(-6).join('\n') || log.slice(-800)));
  }

  /** audio effects that are pre-rendered (denoise, declick, de-esser, pitch) */
  async renderAudioFx(p, ctx, base, span) {
    const jobs = core.planAudio(p).map(A => A.render).filter(Boolean);
    let i = 0;
    for (const j of jobs) {
      if (this.cancelled) throw new Error('CANCELLED');
      ctx.rendered[j.key] = await ff.renderAudio(j, ctx.audioCache || ctx.tmp, null, (pr) => { this.proc = pr; });
      this.onProgress(base + span * (++i / jobs.length));
    }
  }

  async start() {
    const o = this.opts;
    let p = this.p;
    if (o.range && o.range.b > o.range.a) p = core.sliceProject(p, o.range.a, o.range.b);
    const D = core.projectDuration(p);
    if (D <= 0) throw new Error('EMPTY');
    const fmt = o.format || 'mp4';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slaxxcut-'));
    let uidN = 0;
    const ctx = { tmp, textImages: this.textImages, uid: () => (++uidN).toString(36), rendered: {}, audioCache: o.audioCache };
    this.tmp = tmp;
    try {
      const isAudioOnly = ['wav', 'mp3', 'flac', 'ogg', 'm4a'].includes(fmt);
      const { w: W, h: H } = core.outputSize(o.aspect || p.settings.aspect, o.short || 1080);
      const fps = +o.fps || p.settings.fps || 30;

      if (fmt === 'png') {
        const t = Math.max(0, Math.min(D - 1 / fps, o.time || 0));
        const { inputs, graph } = buildChunk(p, t, t + 2 / fps, W, H, fps, ctx);
        fs.writeFileSync(path.join(tmp, 'g.txt'), graph.replace(/format=yuv420p,trim=duration=([\d.]+)\[vout\]$/, 'format=rgb24,trim=duration=$1[vout]'));
        await this.runFF(['-y', '-hide_banner', ...inputs.flat(), '-filter_complex_script', 'g.txt', '-map', '[vout]', '-frames:v', '1', o.path], tmp, 0, 1, 1);
        this.onProgress(1);
        return { path: o.path, width: W, height: H, duration: 0, encoder: 'png' };
      }

      await this.renderAudioFx(p, ctx, 0, isAudioOnly ? 0.3 : 0.05);

      if (isAudioOnly) {
        const au = buildAudio(p, D, o, ctx);
        fs.writeFileSync(path.join(tmp, 'agraph.txt'), au.graph);
        await this.runFF(['-y', '-hide_banner', ...au.inputs.flat(), '-filter_complex_script', 'agraph.txt', '-map', '[aout]', ...audioEncoderArgs(o), o.path], tmp, 0.3, 0.7, D);
        this.onProgress(1);
        return { path: o.path, duration: D, encoder: fmt };
      }

      const enc = await pickEncoder(o);
      this.debugLog.push({ t: Date.now(), encoder: enc });
      const prores = o.vcodec === 'prores';
      const cext = prores ? '.mov' : '.mp4';
      const bounds = chunkBoundaries(p, D, fps, 20);
      const list = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const c0 = bounds[i], c1 = bounds[i + 1];
        const { inputs, graph } = buildChunk(p, c0, c1, W, H, fps, ctx);
        const gfile = path.join(tmp, `graph_${i}.txt`);
        fs.writeFileSync(gfile, prores ? graph.replace(/format=yuv420p,trim=duration=([\d.]+)\[vout\]$/, 'format=yuv422p10le,trim=duration=$1[vout]') : graph);
        const name = `chunk_${String(i).padStart(4, '0')}${cext}`;
        const mk = (e) => ['-y', '-hide_banner', ...inputs.flat(), '-filter_complex_script', gfile, '-map', '[vout]', '-an', ...videoEncoderArgs(o, W, H, fps, e), path.join(tmp, name)];
        try {
          await this.runFF(mk(enc), tmp, 0.05 + 0.83 * c0 / D, 0.83 * (c1 - c0) / D, c1 - c0);
        } catch (e) {
          if (!prores && enc !== 'libx264' && String(e.message) !== 'CANCELLED') await this.runFF(mk('libx264'), tmp, 0.05 + 0.83 * c0 / D, 0.83 * (c1 - c0) / D, c1 - c0);
          else throw e;
        }
        list.push(`file '${name}'`);
      }
      fs.writeFileSync(path.join(tmp, 'list.txt'), list.join('\n'));
      const vfile = path.join(tmp, 'video' + cext);
      await this.runFF(['-y', '-hide_banner', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', vfile], tmp, 0.88, 0.02, D);
      const au = buildAudio(p, D, o, ctx);
      const afile = path.join(tmp, prores ? 'audio.wav' : 'audio.m4a');
      fs.writeFileSync(path.join(tmp, 'agraph.txt'), au.graph);
      await this.runFF(['-y', '-hide_banner', ...au.inputs.flat(), '-filter_complex_script', 'agraph.txt', '-map', '[aout]',
        ...(prores ? ['-c:a', 'pcm_s16le'] : ['-c:a', 'aac', '-b:a', o.audioBitrate || '192k']), afile], tmp, 0.9, 0.08, D);
      await this.runFF(['-y', '-hide_banner', '-i', vfile, '-i', afile, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', o.path], tmp, 0.98, 0.02, D);
      this.onProgress(1);
      return { path: o.path, encoder: enc, width: W, height: H, duration: D };
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* */ }
    }
  }
}

module.exports = { ExportJob, buildChunk, buildAudio, chunkBoundaries, writeWavFloat };
