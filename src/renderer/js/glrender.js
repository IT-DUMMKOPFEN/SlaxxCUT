/* SlaxxCUT – WebGL2 compositor for the edit preview. Mirrors the FFmpeg export filters. Done by IT-DUMMKOPFEN */
(function () {
  const SC = window.SC = window.SC || {};

  const VS_PASS = `#version 300 es
  in vec2 a_pos; out vec2 v_uv;
  void main(){ v_uv = a_pos + 0.5; gl_Position = vec4(a_pos * 2.0, 0.0, 1.0); }`;

  const FS_OP = `#version 300 es
  precision highp float; precision highp sampler3D;
  in vec2 v_uv; out vec4 o;
  uniform sampler2D u_tex; uniform sampler3D u_lut;
  uniform int u_op; uniform mat3 u_m; uniform vec3 u_c; uniform vec3 u_b; uniform vec3 u_a; uniform vec3 u_d;
  uniform float u_f; uniform float u_f2; uniform vec4 u_rect; uniform vec2 u_px; uniform vec2 u_size; uniform float u_seed; uniform float u_lutN;
  uniform int u_rot; uniform int u_flipH; uniform int u_flipV;
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + u_seed) * 43758.5453); }
  void main(){
    if (u_op == 18) {                                                                   // geometry: rotate / flip / crop
      vec2 q = v_uv;
      if (u_rot == 90) q = vec2(q.y, 1.0 - q.x);
      else if (u_rot == 180) q = vec2(1.0 - q.x, 1.0 - q.y);
      else if (u_rot == 270) q = vec2(1.0 - q.y, q.x);
      if (u_flipH == 1) q.x = 1.0 - q.x;
      if (u_flipV == 1) q.y = 1.0 - q.y;
      o = texture(u_tex, u_rect.xy + q * u_rect.zw);
      return;
    }
    vec4 s = texture(u_tex, v_uv);
    vec3 c = s.rgb; float a = s.a;
    if (u_op == 1) { c = clamp(u_m * c, 0.0, 1.0); }
    else if (u_op == 2) { c = clamp((c - 0.5) * u_c + 0.5 + u_b, 0.0, 1.0); }
    else if (u_op == 3) { c = clamp(u_a + (u_d - u_a) * c, 0.0, 1.0); }
    else if (u_op == 4) {
      vec2 d = (v_uv - 0.5) / u_px; float dmax = length(0.5 / u_px);
      float dn = length(d) / dmax; float k = cos(min(u_f * dn, 1.5707963)); c *= (k*k)*(k*k);
    }
    else if (u_op == 5) { c = clamp(c + (vec3(rnd(v_uv*731.0), rnd(v_uv*517.0+3.1), rnd(v_uv*913.0+7.7)) - 0.5) * 2.0 * u_f / 255.0, 0.0, 1.0); }
    else if (u_op == 6) { if (v_uv.y < u_f || v_uv.y > 1.0 - u_f) c = vec3(0.0); }
    else if (u_op == 7) {
      vec3 acc = vec3(0.0); float n = 0.0;
      for (int y = -3; y <= 3; y++) for (int x = -3; x <= 3; x++) { acc += texture(u_tex, v_uv + vec2(float(x), float(y)) * 2.0 * u_px).rgb; n += 1.0; }
      c = clamp(c + u_f * (c - acc / n), 0.0, 1.0);
    }
    else if (u_op == 8) { vec3 q = c * (u_lutN - 1.0) / u_lutN + 0.5 / u_lutN; c = texture(u_lut, q).rgb; }
    else if (u_op == 9) { c = floor(c * 255.0 / 256.0 * u_f) / (u_f - 1.0); }          // posterize
    else if (u_op == 10 || u_op == 11) {                                               // gaussian blur (separable)
      vec2 dir = u_op == 10 ? vec2(u_px.x, 0.0) : vec2(0.0, u_px.y);
      float sig = max(0.3, u_f); vec4 acc = vec4(0.0); float wsum = 0.0;
      for (int i = -12; i <= 12; i++) {
        float xo = float(i) * sig * 3.0 / 12.0; float w = exp(-0.5 * xo * xo / (sig * sig));
        acc += texture(u_tex, v_uv + dir * xo) * w; wsum += w;
      }
      vec4 r = acc / wsum; c = r.rgb; a = r.a;
    }
    else if (u_op == 12) { c.r = texture(u_tex, v_uv + vec2(u_f * u_px.x, 0.0)).r; c.b = texture(u_tex, v_uv - vec2(u_f * u_px.x, 0.0)).b; }  // chroma shift
    else if (u_op == 13) { float y = floor(v_uv.y / u_px.y); if (mod(y, u_f2) < 1.0) c *= (1.0 - u_f); }                                   // scanlines
    else if (u_op == 14) {                                                                                                                  // glow (screen)
      vec4 acc = vec4(0.0); float n = 0.0;
      for (int y = -4; y <= 4; y++) for (int x = -4; x <= 4; x++) {
        vec2 o2 = vec2(float(x), float(y)) / 4.0 * u_f2 * 1.5; float w = exp(-dot(o2,o2) / (2.0 * u_f2 * u_f2 + 1e-6));
        acc += texture(u_tex, v_uv + o2 * u_px) * w; n += w; }
      vec4 g = acc / n; vec4 sc = 1.0 - (1.0 - vec4(c, a)) * (1.0 - g);
      vec4 r = vec4(c, a) + (sc - vec4(c, a)) * u_f; c = r.rgb; a = r.a;
    }
    else if (u_op == 15) {                                                                                                                  // pixelate (optional rect)
      vec2 p = v_uv / u_px;
      bool inside = u_rect.z <= 0.0 || (v_uv.x >= u_rect.x && v_uv.x < u_rect.x + u_rect.z && v_uv.y >= u_rect.y && v_uv.y < u_rect.y + u_rect.w);
      if (inside) {
        vec2 origin = u_rect.z > 0.0 ? u_rect.xy / u_px : vec2(0.0);
        vec2 b0 = floor((p - origin) / u_f) * u_f + origin;
        vec4 acc = vec4(0.0);
        for (int y = 0; y < 3; y++) for (int x = 0; x < 3; x++) acc += texture(u_tex, (b0 + (vec2(float(x), float(y)) + 0.5) / 3.0 * u_f) * u_px);
        vec4 r = acc / 9.0; c = r.rgb; a = r.a;
      }
    }
    else if (u_op == 16) {                                                                                                                  // chroma key (ffmpeg colorkey)
      float diff = sqrt(dot(c - u_c, c - u_c) / 3.0);
      float k = u_f2 > 0.0 ? clamp((diff - u_f) / u_f2, 0.0, 1.0) : (diff > u_f ? 1.0 : 0.0);
      a *= k;
    }
    else if (u_op == 17) {                                                                                                                  // border
      vec2 p = v_uv / u_px;
      if (p.x < u_f || p.y < u_f || p.x > 1.0 / u_px.x - u_f || p.y > 1.0 / u_px.y - u_f) c = u_c;
    }
    o = vec4(c, a);
  }`;

  const VS_COMP = `#version 300 es
  in vec2 a_pos; out vec2 v_uv;
  uniform vec2 u_res; uniform vec2 u_center; uniform vec2 u_size; uniform float u_rot;
  void main(){
    v_uv = a_pos + 0.5;
    vec2 p = a_pos * u_size; float cs = cos(u_rot), sn = sin(u_rot);
    p = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs) + u_center;
    vec2 cl = p / u_res * 2.0 - 1.0;
    gl_Position = vec4(cl.x, -cl.y, 0.0, 1.0);
  }`;

  const FS_COMP = `#version 300 es
  precision highp float;
  in vec2 v_uv; out vec4 o;
  uniform sampler2D u_tex; uniform float u_alpha; uniform float u_bright; uniform float u_white;
  uniform int u_maskKind; uniform int u_maskDir; uniform int u_maskMode; uniform float u_maskK;
  uniform float u_glitch; uniform float u_blur; uniform int u_blurV; uniform float u_seed;
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + u_seed) * 43758.5453); }
  float maskS(vec2 q){
    if (u_maskKind == 4) { float d = abs(q.x - 0.5) + abs(q.y - 0.5); return u_maskDir == 1 ? 1.0 - d : d; }
    if (u_maskKind == 5) { float a = mod(atan(q.x - 0.5, 0.5 - q.y) + 6.2831853, 6.2831853) / 6.2831853; return u_maskDir == 1 ? 1.0 - a : a; }
    if (u_maskKind == 6) { return u_maskDir == 1 ? abs(q.y - 0.5) * 2.0 : abs(q.x - 0.5) * 2.0; }
    if (u_maskKind == 7) { return 0.5 * mod(floor(q.x * 8.0) + floor(q.y * 4.5), 2.0) + 0.5 * floor(q.x * 8.0) / 8.0; }
    if (u_maskKind == 8) { return 0.7 * length(fract(vec2(q.x * 16.0, q.y * 9.0)) - 0.5) / 0.70711 + 0.15 * (q.x + q.y); }
    if (u_maskKind == 9) { return 0.98 * fract(sin(floor(q.x * 16.0) * 12.9898 + floor(q.y * 9.0) * 78.233) * 437.5453); }
    if (u_maskKind == 10) {
      bool vert = u_maskDir == 2 || u_maskDir == 3; float a = vert ? q.y : q.x; float b = vert ? q.x : q.y;
      if (u_maskDir == 1 || u_maskDir == 3) a = 1.0 - a;
      return a * 0.86 + 0.07 + 0.07 * sin(b * 18.85);
    }
    if (u_maskKind == 11) {
      if (u_maskDir == 1) return mod(floor(q.x * 10.0), 2.0) > 0.5 ? 1.0 - q.y : q.y;
      return mod(floor(q.y * 10.0), 2.0) > 0.5 ? 1.0 - q.x : q.x;
    }
    if (u_maskKind == 2) { float d = length(q - 0.5) / 0.70711; return u_maskDir == 1 ? 1.0 - d : d; }
    if (u_maskKind == 3) { return u_maskDir == 1 ? fract(q.x * 8.0) : fract(q.y * 8.0); }
    if (u_maskDir == 0) return q.x; if (u_maskDir == 1) return 1.0 - q.x; if (u_maskDir == 2) return q.y; if (u_maskDir == 3) return 1.0 - q.y;
    if (u_maskDir == 4) return (q.x + q.y) / 2.0; if (u_maskDir == 5) return (1.0 - q.x + q.y) / 2.0;
    if (u_maskDir == 6) return (q.x + 1.0 - q.y) / 2.0; return (2.0 - q.x - q.y) / 2.0;
  }
  void main(){
    vec4 s;
    if (u_blur > 0.0) {
      vec4 acc = vec4(0.0);
      vec2 dir = u_blurV == 1 ? vec2(0.0, 0.03) : vec2(0.03, 0.0);
      for (int i = -12; i <= 12; i++) acc += texture(u_tex, v_uv + dir * float(i) / 24.0);
      s = acc / 25.0;
    } else s = texture(u_tex, v_uv);
    if (u_glitch > 0.0) {
      float sh = 0.012;
      s.r = texture(u_tex, v_uv + vec2(sh, 0.0)).r;
      s.b = texture(u_tex, v_uv - vec2(sh, 0.0)).b;
      s.g = texture(u_tex, v_uv - vec2(0.0, sh * 0.5)).g;
      s.rgb = clamp(s.rgb + (vec3(rnd(v_uv*631.0), rnd(v_uv*411.0+1.7), rnd(v_uv*257.0+5.3)) - 0.5) * 2.0 * 40.0 / 255.0, 0.0, 1.0);
    }
    float a = s.a * u_alpha;
    if (u_maskKind > 0) {
      float e = 0.04;
      float f = clamp((u_maskK * (1.0 + e) - maskS(v_uv)) / e, 0.0, 1.0);
      a *= u_maskMode == 1 ? f : 1.0 - f;
    }
    vec3 rgb = mix(s.rgb * u_bright, vec3(1.0), u_white);
    o = vec4(rgb * a, a);
  }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  const OPS = { matrix: 1, curve: 2, duotone: 3, vignette: 4, grain: 5, bars: 6, sharpen: 7, lut: 8, posterize: 9, blurH: 10, blurV: 11, shift: 12, scan: 13, glow: 14, pixel: 15, key: 16, border: 17, geo: 18 };

  class GLRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: false, antialias: true, preserveDrawingBuffer: true });
      if (!gl) throw new Error('WebGL2 not available');
      this.opP = program(gl, VS_PASS, FS_OP);
      this.compP = program(gl, VS_COMP, FS_COMP);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.srcTex = new Map();
      this.fbos = [];
      this.luts = new Map();
      this.dummy3d = this.makeLut3D(new Float32Array([0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1]), 2);
      this.frame = 0;
    }
    resize(W, H) {
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      this.W = W; this.H = H;
    }
    clear() {
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.W, this.H);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      this.frame++;
    }
    tex(key) {
      const gl = this.gl;
      let t = this.srcTex.get(key);
      if (!t) {
        t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.srcTex.set(key, t);
      }
      return t;
    }
    dropTexture(key) { const t = this.srcTex.get(key); if (t) { this.gl.deleteTexture(t); this.srcTex.delete(key); } }
    fbo(i, w, h) {
      const gl = this.gl;
      let f = this.fbos[i];
      if (!f) {
        f = { fb: gl.createFramebuffer(), tex: gl.createTexture(), w: 0, h: 0 };
        gl.bindTexture(gl.TEXTURE_2D, f.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.fbos[i] = f;
      }
      if (f.w !== w || f.h !== h) {
        gl.bindTexture(gl.TEXTURE_2D, f.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, f.tex, 0);
        f.w = w; f.h = h;
      }
      return f;
    }
    makeLut3D(data, n) {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_3D, t);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      for (const w of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, data);
      return { tex: t, n };
    }
    setLut(file, text) {
      if (this.luts.has(file)) return;
      let n = 0; const vals = [];
      for (const l of String(text).split(/\r?\n/)) {
        const s = l.trim();
        if (!s || s[0] === '#') continue;
        const m = /^LUT_3D_SIZE\s+(\d+)/i.exec(s);
        if (m) { n = +m[1]; continue; }
        if (/^[A-Z_]/i.test(s)) continue;
        const p = s.split(/\s+/).map(Number);
        if (p.length >= 3 && p.every(v => isFinite(v))) vals.push(p[0], p[1], p[2], 1);
      }
      if (!n || vals.length < n * n * n * 4) return;
      this.luts.set(file, this.makeLut3D(new Float32Array(vals.slice(0, n * n * n * 4)), n));
    }

    /** expands high-level ops into shader passes */
    expandOps(ops, fw, fh) {
      const out = [];
      for (const op of ops) {
        if (op.op === 'blur') { out.push({ op: 'blurH', f: op.s * fh }, { op: 'blurV', f: op.s * fh }); continue; }
        out.push(op);
      }
      return out;
    }

    /**
     * Draw one layer. src: video | image | canvas.
     * L: { key, upload, fitW, fitH, ops, geo, alpha, bright, white, s, x, y, rot, mask, glitch, blur, blurV }
     */
    drawLayer(src, L) {
      const gl = this.gl;
      const t = this.tex(L.key);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, t);
      if (L.upload !== false) {
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { return; }
      }
      let cur = t;
      const fw = Math.max(2, Math.min(Math.round(L.fitW), this.W * 2)), fh = Math.max(2, Math.min(Math.round(L.fitH), this.H * 2));
      const ops = [];
      const g = L.geo;
      if (g && (g.crop || g.flipH || g.flipV || g.rot)) ops.push({ op: 'geo', g });
      ops.push(...this.expandOps(L.ops || [], fw, fh));
      if (ops.length) {
        gl.disable(gl.BLEND);
        gl.useProgram(this.opP.p);
        const u = this.opP.u;
        let pi = 0;
        for (const op of ops) {
          const code = OPS[op.op];
          if (!code) continue;
          let lut = null;
          if (code === 8) { lut = this.luts.get(op.file); if (!lut) continue; }
          const f = this.fbo(pi % 2, fw, fh);
          gl.bindFramebuffer(gl.FRAMEBUFFER, f.fb);
          gl.viewport(0, 0, fw, fh);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur);
          gl.uniform1i(u.u_tex, 0);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_3D, (lut || this.dummy3d).tex);
          gl.uniform1i(u.u_lut, 1);
          gl.uniform1f(u.u_lutN, (lut || this.dummy3d).n);
          gl.uniform1i(u.u_op, code);
          gl.uniform2f(u.u_px, 1 / fw, 1 / fh);
          gl.uniform2f(u.u_size, fw, fh);
          gl.uniform1f(u.u_seed, (this.frame % 97) * 1.37);
          let f1 = 0, f2 = 0, rect = [0, 0, 0, 0], col = [0, 0, 0];
          switch (op.op) {
            case 'matrix': { const m = op.m; gl.uniformMatrix3fv(u.u_m, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]); break; }
            case 'curve': gl.uniform3fv(u.u_c, op.c); gl.uniform3fv(u.u_b, op.b); break;
            case 'duotone': gl.uniform3fv(u.u_a, op.a); gl.uniform3fv(u.u_d, op.b); break;
            case 'vignette': f1 = op.a; break;
            case 'grain': f1 = op.n; break;
            case 'bars': f1 = op.h; break;
            case 'sharpen': f1 = op.amount; break;
            case 'posterize': f1 = Math.max(2, op.levels); break;
            case 'blurH': case 'blurV': f1 = op.f; break;
            case 'shift': f1 = Math.max(1, Math.round(op.s * fw)); break;
            case 'scan': f1 = op.a; f2 = Math.max(2, Math.round(fh / 270)); break;
            case 'glow': f1 = op.k; f2 = Math.max(0.5, op.r * fh); break;
            case 'pixel': f1 = Math.max(2, Math.round(op.s * fh)); if (op.rect) rect = op.rect; break;
            case 'key': f1 = Math.max(0.01, op.sim); f2 = op.blend; col = op.color; break;
            case 'border': f1 = Math.max(1, Math.round(op.w * Math.min(fw, fh) * 3)); col = op.color; break;
            case 'geo': {
              const gg = op.g, cr = gg.crop || [0, 0, 0, 0];
              rect = [cr[0], cr[1], 1 - cr[0] - cr[2], 1 - cr[1] - cr[3]];
              gl.uniform1i(u.u_rot, gg.rot || 0); gl.uniform1i(u.u_flipH, gg.flipH ? 1 : 0); gl.uniform1i(u.u_flipV, gg.flipV ? 1 : 0);
              break;
            }
          }
          if (op.op === 'key' || op.op === 'border') gl.uniform3fv(u.u_c, col);
          gl.uniform1f(u.u_f, f1); gl.uniform1f(u.u_f2, f2);
          gl.uniform4fv(u.u_rect, rect);
          gl.bindVertexArray(this.vao);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          cur = f.tex; pi++;
        }
        gl.activeTexture(gl.TEXTURE0);
      }
      // composite
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.W, this.H);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.compP.p);
      const u = this.compP.u;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur);
      gl.uniform1i(u.u_tex, 0);
      gl.uniform2f(u.u_res, this.W, this.H);
      gl.uniform2f(u.u_center, this.W / 2 + L.x * this.W, this.H / 2 + L.y * this.H);
      gl.uniform2f(u.u_size, L.fitW * L.s, L.fitH * L.s);
      gl.uniform1f(u.u_rot, L.rot || 0);
      gl.uniform1f(u.u_alpha, Math.max(0, Math.min(1, L.alpha)));
      gl.uniform1f(u.u_bright, Math.max(0, Math.min(1, L.bright)));
      gl.uniform1f(u.u_white, Math.max(0, Math.min(1, L.white || 0)));
      const mc = L.mask ? SC.core.maskCodes(L.mask.kind, L.mask.dir) : { kind: 0, dir: 0 };
      gl.uniform1i(u.u_maskKind, mc.kind);
      gl.uniform1i(u.u_maskDir, mc.dir);
      gl.uniform1i(u.u_maskMode, L.mask && L.mask.mode === 'reveal' ? 1 : 2);
      gl.uniform1f(u.u_maskK, L.mask ? L.mask.k : 0);
      gl.uniform1f(u.u_glitch, L.glitch || 0);
      gl.uniform1f(u.u_blur, L.blur || 0);
      gl.uniform1i(u.u_blurV, L.blurV ? 1 : 0);
      gl.uniform1f(u.u_seed, (this.frame % 89) * 1.71);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  SC.GLRenderer = GLRenderer;
})();
