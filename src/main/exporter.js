/* SlaxxCUT – MP4 export via FFmpeg (main process). Done by IT-DUMMKOPFEN */
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

function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
const N = core.num;

/* ---------- colour primitives → filters ---------- */
function colorFilters(ops, ctx) {
  const f = [];
  for (const o of ops) {
    switch (o.op) {
      case 'matrix': {
        const m = o.m.map(N);
        f.push(`colorchannelmixer=rr=${m[0]}:rg=${m[1]}:rb=${m[2]}:gr=${m[3]}:gg=${m[4]}:gb=${m[5]}:br=${m[6]}:bg=${m[7]}:bb=${m[8]}`);
        break;
      }
      case 'curve': {
        const ch = ['r', 'g', 'b'].map((k, i) => `${k}='clip((val-127.5)*${N(o.c[i])}+127.5+${N(o.b[i] * 255)},0,255)'`);
        f.push('lutrgb=' + ch.join(':'));
        break;
      }
      case 'duotone': {
        const ch = ['r', 'g', 'b'].map((k, i) => `${k}='clip(${N(o.a[i] * 255)}+${N(o.b[i] - o.a[i])}*val,0,255)'`);
        f.push('lutrgb=' + ch.join(':'));
        break;
      }
      case 'vignette': {
        // vignette drops alpha → process colour and re-attach alpha
        const id = ctx.uid();
        f.push(`split[vga${id}][vgb${id}];[vgb${id}]alphaextract[vgal${id}];[vga${id}]vignette=angle=${N(o.a)},format=rgb24[vgc${id}];[vgc${id}][vgal${id}]alphamerge,format=rgba`);
        break;
      }
      case 'grain': f.push(`format=gbrap,noise=c0s=${Math.round(o.n)}:c1s=${Math.round(o.n)}:c2s=${Math.round(o.n)}:allf=t+u,format=rgba`); break;
      case 'bars': f.push(`drawbox=x=0:y=0:w=iw:h=ih*${N(o.h)}:color=black@1:t=fill,drawbox=x=0:y=ih-ih*${N(o.h)}:w=iw:h=ih*${N(o.h)}:color=black@1:t=fill`); break;
      case 'sharpen': f.push(`unsharp=lx=13:ly=13:la=${N(o.amount)}:cx=13:cy=13:ca=${N(o.amount)}`); break;
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

/* chunk boundaries must not cut animated windows (fades/transitions) */
function chunkBoundaries(p, D, fps, target) {
  const busy = [];
  for (const L of core.planVisual(p, 0, D)) {
    for (const r of L.alpha.concat(L.bright)) busy.push([r.a, r.b]);
    if (L.wipe) busy.push([L.wipe.a, L.wipe.b]);
    for (const g of L.glitch.concat(L.blur)) busy.push([g.a, g.b]);
  }
  const free = (t) => !busy.some(([a, b]) => t > a - 0.02 && t < b + 0.02);
  const snap = (t) => Math.round(t * fps) / fps;
  const bounds = [0];
  let t = target;
  while (t < D - 1) {
    let c = snap(t);
    let guard = 0;
    while (!free(c) && c < D && guard++ < 2000) c = snap(c + 1 / fps);
    if (c >= D - 0.5) break;
    if (c > bounds[bounds.length - 1] + 0.5) bounds.push(c);
    t = c + target;
  }
  bounds.push(snap(D) || D);
  return bounds;
}

function encoderArgs(opts, W, H, fps, enc) {
  const Q = QUALITY[opts.quality] || QUALITY.high;
  const bitrate = Math.round(W * H * fps * Q.bpp / 1000) + 'k';
  const common = ['-pix_fmt', 'yuv420p', '-r', String(fps), '-g', String(Math.round(fps * 2))];
  switch (enc) {
    case 'h264_videotoolbox': return ['-c:v', 'h264_videotoolbox', '-b:v', bitrate, '-maxrate', bitrate, '-profile:v', 'high', ...common];
    case 'h264_nvenc': return ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', String(Q.cq), '-b:v', '0', ...common];
    case 'h264_qsv': return ['-c:v', 'h264_qsv', '-b:v', bitrate, ...common];
    case 'h264_amf': return ['-c:v', 'h264_amf', '-b:v', bitrate, ...common];
    default: return ['-c:v', 'libx264', '-preset', opts.preset || 'medium', '-crf', String(Q.crf), '-profile:v', 'high', ...common];
  }
}

async function pickEncoder(opts) {
  const e = await ff.encoders();
  if (opts.encoder && opts.encoder !== 'auto') return e[opts.encoder] ? opts.encoder : 'libx264';
  if (opts.encoder === 'auto' || !opts.encoder) {
    for (const hw of ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf']) if (e[hw]) return hw;
  }
  return 'libx264';
}

/* ---------- one video chunk ---------- */
function buildChunk(p, c0, c1, W, H, fps, ctx) {
  const layers = core.planVisual(p, c0, c1);
  const dur = c1 - c0;
  const inputs = [];
  const graph = [];
  graph.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${N(dur)},format=yuv420p,setsar=1[base]`);
  let last = 'base';
  layers.forEach((L, li) => {
    const lc0 = Math.max(L.vs, c0), lc1 = Math.min(L.ve, c1);
    const ld = lc1 - lc0;
    if (ld <= 1 / fps / 2) return;
    // skip fully invisible
    let alphaZero = false;
    for (const r of L.alpha) {
      if (r.dir === 'in' && r.a >= lc1) alphaZero = true;
      if (r.dir === 'out' && r.b <= lc0) alphaZero = true;
    }
    if (alphaZero || L.opacity <= 0) return;
    const c = L.clip, m = L.media;
    const idx = inputs.length;
    const chain = [];
    let srcW, srcH;
    if (c.kind === 'text') {
      const png = ctx.textImages[c.id];
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
      const mdur = m.duration || 0;
      const a = Math.min(Math.max(0, s0), Math.max(0, mdur - 0.15));
      const preMissing = s0 < 0 ? -s0 / sp : 0;
      inputs.push(['-ss', N(a), '-t', N(ld * sp + 1), '-i', m.path]);
      chain.push(`[${idx}:v]setpts=(PTS-STARTPTS)/${N(sp)}`);
      chain.push(`fps=${fps}`);
      chain.push(`tpad=start_duration=${N(preMissing)}:start_mode=clone:stop_duration=${N(ld + 1)}:stop_mode=clone`);
      srcW = m.width; srcH = m.height;
    }
    chain.push(`trim=duration=${N(ld)}`, 'setpts=PTS-STARTPTS');
    const fit = core.fitSize(srcW, srcH, W, H, c.kind === 'text' ? 'stretch' : (c.fit || 'contain'));
    const FW = Math.max(2, Math.round(fit.w)), FH = Math.max(2, Math.round(fit.h));
    chain.push(`scale=${FW}:${FH}:flags=bicubic`, 'setsar=1', 'format=rgba');
    // colour effects
    for (const e of L.colorEffects) chain.push(...colorFilters(core.colorOps(e), ctx));
    if (L.opacity < 1) chain.push(`colorchannelmixer=aa=${N(L.opacity)}`);
    // local time t (0 at lc0) → absolute T
    const Tloc = 't+' + N(lc0);
    const en = (a, b) => `enable='between(t,${N(a - lc0)},${N(b - lc0)})'`;
    if (L.wipe) {
      const k = `clip((T+${N(lc0)}-${N(L.wipe.a)})/${N(L.wipe.b - L.wipe.a)},0,1)`;
      const cond = L.wipe.mode === 'reveal' ? `lt(X,W*${k})` : `gte(X,W*${k})`;
      chain.push(`geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(${cond},alpha(X,Y),0)':${en(L.wipe.a, L.wipe.b + 0.5)}`);
    }
    for (const g of L.glitch) {
      const sh = Math.max(2, Math.round(FW * 0.012));
      chain.push(`rgbashift=rh=-${sh}:bh=${sh}:gv=${Math.round(sh / 2)}:${en(g.a, g.b)}`);
      chain.push(`format=gbrap,noise=c0s=40:c1s=40:c2s=40:allf=t:${en(g.a, g.b)},format=rgba`);
    }
    for (const b of L.blur) {
      chain.push(`avgblur=sizeX=${Math.max(2, Math.round(FW * 0.03))}:sizeY=1:${en(b.a, b.b)}`);
    }
    for (const r of L.alpha) {
      if (r.dir === 'in' && r.b <= lc0) continue;
      if (r.dir === 'out' && r.a >= lc1) continue;
      chain.push(`fade=t=${r.dir}:st=${N(Math.max(0, r.a - lc0))}:d=${N(Math.max(1 / fps, r.b - r.a))}:alpha=1`);
    }
    for (const r of L.bright) {
      if (r.dir === 'in' && r.b <= lc0) continue;
      if (r.dir === 'out' && r.a >= lc1) continue;
      chain.push(`fade=t=${r.dir}:st=${N(Math.max(0, r.a - lc0))}:d=${N(Math.max(1 / fps, r.b - r.a))}:color=black`);
    }
    // rotation then per-frame scale
    if (L.rot !== '0') {
      const R = core.subst(L.rot, 'T', Tloc);
      chain.push(`rotate=a='${R}':c=black@0:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`);
    }
    const sConst = /^[\d.]+$/.test(L.s);
    if (L.s !== '1') {
      if (sConst) chain.push(`scale=w='max(2,trunc(iw*${L.s}))':h='max(2,trunc(ih*${L.s}))'`);
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
function atempoChain(sp) {
  const f = [];
  let s = sp;
  while (s > 2) { f.push('atempo=2'); s /= 2; }
  while (s < 0.5) { f.push('atempo=0.5'); s /= 0.5; }
  if (Math.abs(s - 1) > 1e-6) f.push('atempo=' + N(s));
  return f;
}

function buildAudio(p, D, opts) {
  const items = core.planAudio(p).filter(A => A.media && A.ae > A.as);
  const inputs = [], graph = [], labels = [];
  items.forEach((A, i) => {
    const c = A.clip, m = A.media;
    const ld = A.ae - A.as;
    const s0 = core.sourceTime(c, A.as);
    const preMissing = s0 < 0 ? -s0 / A.speed : 0;
    const a = Math.max(0, s0);
    if (m.duration && a >= m.duration) return;
    const idx = inputs.length;
    inputs.push(['-ss', N(a), '-t', N(ld * A.speed + 0.5), '-i', m.path]);
    const ch = [`[${idx}:a]aresample=48000`, 'aformat=sample_fmts=fltp:channel_layouts=stereo', 'asetpts=PTS-STARTPTS', ...atempoChain(A.speed)];
    ch.push(`apad=whole_dur=${N(ld)}`, `atrim=duration=${N(ld - preMissing)}`);
    if (A.gainDb) ch.push(`volume=${N(A.gainDb)}dB`);
    if (A.dynnorm > 0) ch.push(`dynaudnorm=f=200:g=15:m=${N(1 + 19 * A.dynnorm)}:p=0.95`);
    for (const r of A.fades) {
      const st = Math.max(0, r.a - A.as - preMissing);
      ch.push(`afade=t=${r.dir}:st=${N(st)}:d=${N(Math.max(0.01, r.b - r.a))}`);
    }
    const delay = Math.round((A.as + preMissing) * 1000);
    if (delay > 0) ch.push(`adelay=delays=${delay}:all=1`);
    const lbl = 'a' + i;
    graph.push(ch.join(',') + `[${lbl}]`);
    labels.push(lbl);
  });
  let tail = `apad=whole_dur=${N(D)},atrim=duration=${N(D)}`;
  if (opts.normalize) tail += ',loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000';
  if (!labels.length) {
    graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${N(D)}[aout]`);
  } else if (labels.length === 1) {
    graph.push(`[${labels[0]}]${tail}[aout]`);
  } else {
    graph.push(labels.map(l => `[${l}]`).join('') + `amix=inputs=${labels.length}:normalize=0:dropout_transition=0,${tail}[aout]`);
  }
  return { inputs, graph: graph.join(';\n') };
}

/* ---------- export job ---------- */
class ExportJob {
  constructor(project, opts, textImages, onProgress) {
    this.p = project; this.opts = opts; this.textImages = textImages || {}; this.onProgress = onProgress || (() => {});
    this.cancelled = false; this.proc = null;
  }
  cancel() { this.cancelled = true; if (this.proc) try { this.proc.kill('SIGKILL'); } catch (e) { /* */ } }

  async runFF(args, cwd, base, span, durSec) {
    if (this.cancelled) throw new Error('CANCELLED');
    let log = '';
    const res = await ff.run(args.concat(['-progress', 'pipe:1', '-nostats']), {
      collect: false,
      onSpawn: (pr) => { this.proc = pr; },
      onStderr: (s) => { log += s; if (log.length > 40000) log = log.slice(-20000); },
      onStdout: (d) => {
        const mm = /out_time_us=(\d+)/.exec(d.toString()) || /out_time_ms=(\d+)/.exec(d.toString());
        if (mm && durSec > 0) this.onProgress(base + span * Math.min(1, (+mm[1] / 1e6) / durSec));
      },
      cwd
    });
    this.proc = null;
    if (this.cancelled) throw new Error('CANCELLED');
    if (res.code !== 0) throw new Error('FFmpeg: ' + log.split('\n').filter(l => /error|invalid|failed|no such|cannot/i.test(l)).slice(-6).join('\n') || log.slice(-800));
  }

  async start() {
    const p = this.p, o = this.opts;
    const D = core.projectDuration(p);
    if (D <= 0) throw new Error('EMPTY');
    const { w: W, h: H } = core.outputSize(o.aspect || p.settings.aspect, o.short || 1080);
    const fps = +o.fps || p.settings.fps || 30;
    const enc = await pickEncoder(o);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slaxxcut-'));
    let uidN = 0;
    const ctx = { tmp, textImages: this.textImages, uid: () => (++uidN).toString(36) };
    this.tmp = tmp;
    try {
      const bounds = chunkBoundaries(p, D, fps, 20);
      const list = [];
      for (let i = 0; i < bounds.length - 1; i++) {
        const c0 = bounds[i], c1 = bounds[i + 1];
        const { inputs, graph } = buildChunk(p, c0, c1, W, H, fps, ctx);
        const gfile = path.join(tmp, `graph_${i}.txt`);
        fs.writeFileSync(gfile, graph);
        const name = `chunk_${String(i).padStart(4, '0')}.mp4`;
        const args = ['-y', '-hide_banner', ...inputs.flat(), '-filter_complex_script', gfile, '-map', '[vout]', '-an',
          ...encoderArgs(o, W, H, fps, enc), path.join(tmp, name)];
        try {
          await this.runFF(args, tmp, 0.88 * c0 / D, 0.88 * (c1 - c0) / D, c1 - c0);
        } catch (e) {
          if (enc !== 'libx264' && String(e.message) !== 'CANCELLED') {
            // hardware encoder failed → software fallback
            const args2 = ['-y', '-hide_banner', ...inputs.flat(), '-filter_complex_script', gfile, '-map', '[vout]', '-an',
              ...encoderArgs(o, W, H, fps, 'libx264'), path.join(tmp, name)];
            await this.runFF(args2, tmp, 0.88 * c0 / D, 0.88 * (c1 - c0) / D, c1 - c0);
          } else throw e;
        }
        list.push(`file '${name}'`);
      }
      fs.writeFileSync(path.join(tmp, 'list.txt'), list.join('\n'));
      const vfile = path.join(tmp, 'video.mp4');
      await this.runFF(['-y', '-hide_banner', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', vfile], tmp, 0.88, 0.02, D);
      // audio
      const au = buildAudio(p, D, o);
      const afile = path.join(tmp, 'audio.m4a');
      fs.writeFileSync(path.join(tmp, 'agraph.txt'), au.graph);
      await this.runFF(['-y', '-hide_banner', ...au.inputs.flat(), '-filter_complex_script', 'agraph.txt', '-map', '[aout]', '-c:a', 'aac', '-b:a', o.audioBitrate || '192k', afile], tmp, 0.9, 0.08, D);
      // mux
      await this.runFF(['-y', '-hide_banner', '-i', vfile, '-i', afile, '-map', '0:v', '-map', '1:a', '-c', 'copy', '-movflags', '+faststart', o.path], tmp, 0.98, 0.02, D);
      this.onProgress(1);
      return { path: o.path, encoder: enc, width: W, height: H, duration: D };
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* */ }
    }
  }
}

module.exports = { ExportJob, buildChunk, buildAudio, chunkBoundaries };
