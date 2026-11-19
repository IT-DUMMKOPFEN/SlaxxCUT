/* SlaxxCUT – FFmpeg filter diagnostics (CI helper). Runs filter graphs with a timeout and reports which ones stall. */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
let ff; try { ff = require('ffmpeg-static'); } catch (e) { ff = 'ffmpeg'; }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slaxx-diag-'));
const run = (args, to) => spawnSync(ff, ['-nostdin', '-hide_banner', '-y', ...args], { timeout: to || 60000, cwd: dir });
const vid = path.join(dir, 'v.mp4'), png = path.join(dir, 't.png');
console.log('make video', run(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=4', '-f', 'lavfi', '-i', 'sine=d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', vid]).status);
console.log('make png', run(['-f', 'lavfi', '-i', 'color=c=black@0:s=640x360,format=rgba', '-frames:v', '1', png]).status);
const L = '[0:v]setpts=(PTS-STARTPTS)/1,fps=25,tpad=start_duration=0:start_mode=clone:stop_duration=3:stop_mode=clone,trim=duration=2,setpts=PTS-STARTPTS,scale=640:360:flags=bicubic,setsar=1,format=rgba';
const base = 'color=c=black:s=640x360:r=25:d=2,format=yuv420p,setsar=1[base]';
const tests = {
  'plain': '[0:v]null[vout]',
  'setpts-fps': '[0:v]setpts=(PTS-STARTPTS)/1,fps=25[vout]',
  'tpad': '[0:v]setpts=PTS-STARTPTS,fps=25,tpad=start_duration=0:start_mode=clone:stop_duration=3:stop_mode=clone,trim=duration=2[vout]',
  'layer': L + '[vout]',
  'overlay': base + ';' + L + '[l];[base][l]overlay=x=0:y=0:eof_action=pass:eval=frame:format=auto[o];[o]format=yuv420p,trim=duration=2[vout]',
  'overlay-expr': base + ';' + L + '[l];[base][l]overlay=x=\'(W-w)/2+(0.01*sin(t))*W\':y=\'(H-h)/2\':eof_action=pass:eval=frame:format=auto[o];[o]format=yuv420p,trim=duration=2[vout]',
  'matrix-lut': L + ",colorchannelmixer=rr=0.9:gg=0.9,lutrgb=r='clip(val*1.1,0,255)'[vout]",
  'geq': L + ",geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)'[vout]",
  'noise': L + ',format=gbrap,noise=c0s=8:c1s=8:c2s=8:allf=t+u,format=rgba[vout]',
  'fade-alpha': L + ',fade=t=in:st=0:d=1:alpha=1[vout]',
  'scale-frame': L + ",scale=w='max(2,trunc(iw*(1+0.1*t)))':h='max(2,trunc(ih*(1+0.1*t)))':eval=frame[vout]",
  'png-loop': '[1:v]setpts=PTS-STARTPTS,trim=duration=2,setpts=PTS-STARTPTS,scale=640:360,format=rgba[vout]',
  'two-inputs-same-file': base + ';' + L + '[l];[2:v]setpts=PTS-STARTPTS,fps=25,trim=duration=2,setpts=PTS-STARTPTS,format=rgba[m];[base][l]overlay=eof_action=pass[o1];[o1][m]overlay=eof_action=pass[o];[o]format=yuv420p,trim=duration=2[vout]'
};
for (const [name, g] of Object.entries(tests)) {
  const gf = path.join(dir, name + '.txt');
  fs.writeFileSync(gf, g);
  const t0 = Date.now();
  const r = run(['-ss', '0', '-t', '3', '-i', vid, '-loop', '1', '-framerate', '25', '-t', '2.1', '-i', png, '-ss', '1', '-t', '3', '-i', vid,
    '-filter_complex_script', gf, '-map', '[vout]', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '25', path.join(dir, name + '.mp4')], 30000);
  const err = r.error ? 'TIMEOUT/ERR ' + r.error.code : 'exit ' + r.status;
  console.log((name + '                    ').slice(0, 22), err, (Date.now() - t0) + 'ms', r.status ? String(r.stderr).split('\n').slice(-3).join(' | ') : '');
}
// the real exporter graph
try {
  const core = require('../src/shared/core.js');
  const { ExportJob } = require('../src/main/exporter.js');
  const fx = require('../src/main/ffmpeg.js');
  (async () => {
    const info = await fx.probe(vid);
    const p = core.newProject();
    p.media.push(Object.assign({ id: 'm' }, info));
    const C = (o) => Object.assign({ id: core.uid('c'), speed: 1, volume: 0, fadeIn: 0, fadeOut: 0, effects: [] }, o);
    p.clips.push(C({ trackId: p.tracks[1].id, kind: 'video', mediaId: 'm', start: 0, in: 0, out: 2 }));
    const job = new ExportJob(p, { path: path.join(dir, 'job.mp4'), short: 360, aspect: '16:9', fps: 25, quality: 'low', encoder: 'libx264' }, {}, () => { });
    const to = setTimeout(() => { console.log('exporter: TIMEOUT', JSON.stringify(job.debugLog).slice(0, 1500)); job.cancel(); process.exit(0); }, 40000);
    const r = await job.start();
    clearTimeout(to);
    console.log('exporter: OK', r.encoder);
  })().catch(e => console.log('exporter: ERR', e.message));
} catch (e) { console.log('exporter: load error', e.message); }
