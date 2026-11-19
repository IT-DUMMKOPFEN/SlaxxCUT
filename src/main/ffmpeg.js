/* SlaxxCUT – FFmpeg helpers (main process). Done by IT-DUMMKOPFEN */
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let FFMPEG = process.env.SLAXX_FFMPEG || null;
function ffmpegPath() {
  if (FFMPEG) return FFMPEG;
  try {
    let p = require('ffmpeg-static');
    if (p && p.includes('app.asar') && !p.includes('app.asar.unpacked')) p = p.replace('app.asar', 'app.asar.unpacked');
    if (p && fs.existsSync(p)) { FFMPEG = p; return p; }
  } catch (e) { /* ignore */ }
  FFMPEG = 'ffmpeg';
  return FFMPEG;
}

function run(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), args, { windowsHide: true, cwd: opts.cwd || undefined });
    const out = []; let err = '';
    proc.stdout.on('data', d => { if (opts.collect !== false) out.push(d); if (opts.onStdout) opts.onStdout(d); });
    proc.stderr.on('data', d => { err += d.toString(); if (err.length > 2e6) err = err.slice(-1e6); if (opts.onStderr) opts.onStderr(d.toString()); });
    proc.on('error', reject);
    proc.on('close', code => resolve({ code, stdout: Buffer.concat(out), stderr: err }));
    if (opts.onSpawn) opts.onSpawn(proc);
  });
}

/* ---------------- probe ---------------- */
function parseTime(s) {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]) : 0;
}
async function probe(file) {
  const { stderr } = await run(['-hide_banner', '-i', file]);
  const info = { path: file, duration: 0, hasVideo: false, hasAudio: false, width: 0, height: 0, fps: 0, vcodec: '', acodec: '', rotation: 0, isImage: false };
  const dm = /Duration:\s*([\d:.]+)/.exec(stderr);
  if (dm) info.duration = parseTime(dm[1]);
  const lines = stderr.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const vm = /Stream #\d+:\d+.*?: Video: ([^\s,]+)(.*)/.exec(l);
    if (vm && !info.hasVideo) {
      if (/attached pic/.test(l)) continue; // cover art in mp3
      info.hasVideo = true; info.vcodec = vm[1];
      const sz = /, (\d{2,5})x(\d{2,5})/.exec(vm[2]);
      if (sz) { info.width = +sz[1]; info.height = +sz[2]; }
      const fr = /([\d.]+) fps/.exec(vm[2]) || /([\d.]+) tbr/.exec(vm[2]);
      if (fr) info.fps = parseFloat(fr[1]);
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        const rm = /rotation of (-?[\d.]+) degrees/.exec(lines[j]) || /rotate\s*:\s*(-?\d+)/.exec(lines[j]);
        if (rm) { info.rotation = Math.round(parseFloat(rm[1])); break; }
        if (/Stream #/.test(lines[j])) break;
      }
    }
    const am = /Stream #\d+:\d+.*?: Audio: ([^\s,]+)/.exec(l);
    if (am && !info.hasAudio) { info.hasAudio = true; info.acodec = am[1]; }
  }
  if (Math.abs(info.rotation) % 180 === 90) { const w = info.width; info.width = info.height; info.height = w; }
  const imgCodecs = ['png', 'mjpeg', 'bmp', 'webp', 'tiff', 'gif', 'heic', 'hevc'];
  const ext = path.extname(file).slice(1).toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'heic', 'heif'].includes(ext) && imgCodecs.includes(info.vcodec)) {
    info.isImage = true; info.duration = 0; info.hasAudio = false;
  }
  if (!info.hasVideo && !info.hasAudio) throw new Error('Unsupported or unreadable file: ' + path.basename(file));
  return info;
}

/** which files the built-in Chromium player can play directly */
function needsProxy(info, ext, opts = {}) {
  if (info.isImage) return !['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext);
  if (info.hasVideo) {
    const okV = ['h264', 'vp8', 'vp9', 'av1'].includes(info.vcodec);
    const okC = ['mp4', 'm4v', 'mov', 'webm', 'mkv'].includes(ext);
    const okA = !info.hasAudio || ['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(info.acodec) || info.acodec.startsWith('pcm_');
    if (!okV || !okC || !okA) return true;
    if (opts.proxyLarge && Math.max(info.width, info.height) > 1920) return true;
    return false;
  }
  const okA = ['mp3', 'aac', 'flac', 'opus', 'vorbis'].includes(info.acodec) || info.acodec.startsWith('pcm_');
  const okC = ['mp3', 'wav', 'flac', 'ogg', 'oga', 'opus', 'm4a', 'aac'].includes(ext);
  return !(okA && okC);
}

function cacheKey(file) {
  let st = { size: 0, mtimeMs: 0 };
  try { st = fs.statSync(file); } catch (e) { /* ignore */ }
  return crypto.createHash('sha1').update(file + '|' + st.size + '|' + st.mtimeMs).digest('hex').slice(0, 16);
}

/* ---------------- proxy ---------------- */
async function makeProxy(file, info, cacheDir, onProgress, onSpawn) {
  const key = cacheKey(file);
  const isImg = info.isImage;
  const out = path.join(cacheDir, key + (isImg ? '_proxy.png' : info.hasVideo ? '_proxy.mp4' : '_proxy.m4a'));
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return out;
  const tmp = out + '.part' + path.extname(out);
  let args;
  if (isImg) args = ['-y', '-hide_banner', '-i', file, '-frames:v', '1', tmp];
  else if (info.hasVideo) {
    args = ['-y', '-hide_banner', '-i', file, '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', "scale='min(1280,iw)':-2,format=yuv420p", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-g', '15',
      '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', tmp];
  } else {
    args = ['-y', '-hide_banner', '-i', file, '-vn', '-c:a', 'aac', '-b:a', '192k', '-progress', 'pipe:1', '-nostats', tmp];
  }
  const res = await run(args, {
    collect: false, onSpawn,
    onStdout: (d) => {
      const m = /out_time_ms=(\d+)/.exec(d.toString());
      if (m && info.duration && onProgress) onProgress(Math.min(1, +m[1] / 1e6 / info.duration));
    }
  });
  if (res.code !== 0) { try { fs.unlinkSync(tmp); } catch (e) { /* */ } throw new Error('Proxy failed: ' + res.stderr.slice(-400)); }
  fs.renameSync(tmp, out);
  return out;
}

/* ---------------- thumbnails (filmstrip) ---------------- */
async function filmstrip(file, info, cacheDir) {
  const key = cacheKey(file);
  const out = path.join(cacheDir, key + '_strip.jpg');
  if (fs.existsSync(out)) return out;
  const n = 10;
  let args;
  if (info.isImage) {
    args = ['-y', '-hide_banner', '-i', file, '-vf', 'scale=-2:72', '-frames:v', '1', out];
  } else {
    const d = Math.max(0.1, info.duration);
    args = ['-y', '-hide_banner', '-skip_frame', 'nokey', '-i', file, '-an', '-vf',
      `fps=${(n / d).toFixed(6)},scale=128:72:force_original_aspect_ratio=decrease,pad=128:72:(ow-iw)/2:(oh-ih)/2,tile=${n}x1`,
      '-frames:v', '1', '-q:v', '5', out];
  }
  let res = await run(args);
  if (res.code !== 0 || !fs.existsSync(out)) {
    // fallback without keyframe skipping (short clips)
    args = args.filter(a => a !== '-skip_frame' && a !== 'nokey');
    res = await run(args);
  }
  return fs.existsSync(out) ? out : null;
}

async function poster(file, info, cacheDir) {
  const key = cacheKey(file);
  const out = path.join(cacheDir, key + '_poster.jpg');
  if (fs.existsSync(out)) return out;
  const at = info.isImage ? 0 : Math.min(1, info.duration / 3);
  const args = ['-y', '-hide_banner', '-ss', String(at), '-i', file, '-frames:v', '1', '-vf', 'scale=320:180:force_original_aspect_ratio=decrease', '-q:v', '4', out];
  await run(args);
  return fs.existsSync(out) ? out : null;
}

/* ---------------- waveform peaks ---------------- */
async function waveform(file, cacheDir) {
  const key = cacheKey(file);
  const out = path.join(cacheDir, key + '_wave.json');
  if (fs.existsSync(out)) { try { return JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { /* regenerate */ } }
  const rate = 4000, per = 40; // 100 peaks per second
  const res = await run(['-hide_banner', '-i', file, '-vn', '-ac', '1', '-ar', String(rate), '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1']);
  const buf = res.stdout;
  const samples = Math.floor(buf.length / 2);
  const peaks = [];
  for (let i = 0; i < samples; i += per) {
    let m = 0;
    for (let j = i; j < Math.min(samples, i + per); j++) { const v = Math.abs(buf.readInt16LE(j * 2)); if (v > m) m = v; }
    peaks.push(Math.round(m / 327.67));
  }
  const data = { pps: rate / per, peaks };
  try { fs.writeFileSync(out, JSON.stringify(data)); } catch (e) { /* ignore */ }
  return data;
}

/* ---------------- loudness ---------------- */
async function measureLoudness(file, start, dur) {
  const args = ['-hide_banner', '-nostats'];
  if (start > 0) args.push('-ss', String(start));
  args.push('-i', file);
  if (dur > 0) args.push('-t', String(dur));
  args.push('-vn', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-');
  const { stderr } = await run(args);
  const m = /Integrated loudness:\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/.exec(stderr);
  if (!m || m[1] === '-inf') return null;
  return parseFloat(m[1]);
}

/* ---------------- encoders ---------------- */
let encCache = null;
async function encoders() {
  if (encCache) return encCache;
  const { stdout } = await run(['-hide_banner', '-encoders']);
  const s = stdout.toString();
  const has = (n) => new RegExp('\\s' + n + '\\s').test(s);
  const list = { libx264: has('libx264'), h264_videotoolbox: has('h264_videotoolbox'), h264_nvenc: has('h264_nvenc'), h264_qsv: has('h264_qsv'), h264_amf: has('h264_amf') };
  // verify hardware encoders actually work on this machine
  for (const hw of ['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'h264_amf']) {
    if (!list[hw]) continue;
    const r = await run(['-hide_banner', '-f', 'lavfi', '-i', 'color=c=black:s=256x144:d=0.2', '-c:v', hw, '-f', 'null', '-']);
    list[hw] = r.code === 0;
  }
  encCache = list;
  return list;
}

module.exports = { ffmpegPath, run, probe, needsProxy, makeProxy, filmstrip, poster, waveform, measureLoudness, encoders, cacheKey };
