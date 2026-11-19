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
  uniform float u_f; uniform vec2 u_px; uniform float u_seed; uniform float u_lutN;
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + u_seed) * 43758.5453); }
  void main(){
    vec4 s = texture(u_tex, v_uv);
    vec3 c = s.rgb;
    if (u_op == 1) { c = clamp(u_m * c, 0.0, 1.0); }                                   // matrix
    else if (u_op == 2) { c = clamp((c - 0.5) * u_c + 0.5 + u_b, 0.0, 1.0); }          // curve
    else if (u_op == 3) { c = clamp(u_a + (u_d - u_a) * c, 0.0, 1.0); }                // duotone
    else if (u_op == 4) {                                                             // vignette
      vec2 d = (v_uv - 0.5) / u_px; float dmax = length(0.5 / u_px);
      float dn = length(d) / dmax; float k = cos(u_f * dn); k = dn > 1.0 ? 0.0 : (k*k)*(k*k);
      c *= k;
    }
    else if (u_op == 5) { c = clamp(c + (vec3(rnd(v_uv*731.0), rnd(v_uv*517.0+3.1), rnd(v_uv*913.0+7.7)) - 0.5) * 2.0 * u_f / 255.0, 0.0, 1.0); } // grain
    else if (u_op == 6) { if (v_uv.y < u_f || v_uv.y > 1.0 - u_f) c = vec3(0.0); }     // bars
    else if (u_op == 7) {                                                             // sharpen (unsharp 13x13)
      vec3 acc = vec3(0.0); float n = 0.0;
      for (int y = -3; y <= 3; y++) for (int x = -3; x <= 3; x++) { acc += texture(u_tex, v_uv + vec2(float(x), float(y)) * 2.0 * u_px).rgb; n += 1.0; }
      c = clamp(c + u_f * (c - acc / n), 0.0, 1.0);
    }
    else if (u_op == 8) { vec3 q = c * (u_lutN - 1.0) / u_lutN + 0.5 / u_lutN; c = texture(u_lut, q).rgb; } // 3D LUT
    o = vec4(c, s.a);
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
  uniform sampler2D u_tex; uniform float u_alpha; uniform float u_bright;
  uniform float u_wipe; uniform int u_wipeMode; uniform float u_glitch; uniform float u_blur; uniform float u_seed;
  float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + u_seed) * 43758.5453); }
  void main(){
    vec4 s;
    if (u_blur > 0.0) {
      vec4 acc = vec4(0.0);
      for (int i = -12; i <= 12; i++) acc += texture(u_tex, v_uv + vec2(float(i) / 24.0 * 0.03, 0.0));
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
    if (u_wipeMode == 1 && v_uv.x >= u_wipe) a = 0.0;
    if (u_wipeMode == 2 && v_uv.x < u_wipe) a = 0.0;
    o = vec4(s.rgb * u_bright * a, a);
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
      this.srcTex = new Map();   // key → texture
      this.fbos = [];            // ping-pong targets
      this.luts = new Map();     // file → {tex, n}
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
    /** register a parsed .cube LUT */
    setLut(file, text) {
      if (this.luts.has(file)) return;
      const lines = String(text).split(/\r?\n/);
      let n = 0; const vals = [];
      for (const l of lines) {
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

    /**
     * Draw one layer.
     * src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement
     * L: { key, fitW, fitH, ops, alpha, bright, s, x, y, rot, wipe, glitch, blur, dirty }
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
      // effect passes
      if (L.ops && L.ops.length) {
        gl.disable(gl.BLEND);
        gl.useProgram(this.opP.p);
        const u = this.opP.u;
        let pi = 0;
        for (const op of L.ops) {
          const code = { matrix: 1, curve: 2, duotone: 3, vignette: 4, grain: 5, bars: 6, sharpen: 7, lut: 8 }[op.op];
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
          if (code === 1) {
            const m = op.m; // row-major → column-major
            gl.uniformMatrix3fv(u.u_m, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
          }
          if (code === 2) { gl.uniform3fv(u.u_c, op.c); gl.uniform3fv(u.u_b, op.b); }
          if (code === 3) { gl.uniform3fv(u.u_a, op.a); gl.uniform3fv(u.u_d, op.b); }
          gl.uniform1f(u.u_f, code === 4 ? op.a : code === 5 ? op.n : code === 6 ? op.h : code === 7 ? op.amount : 0);
          gl.uniform2f(u.u_px, 1 / fw, 1 / fh);
          gl.uniform1f(u.u_seed, (this.frame % 97) * 1.37);
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
      gl.uniform1f(u.u_wipe, L.wipe ? L.wipe.k : 0);
      gl.uniform1i(u.u_wipeMode, L.wipe ? (L.wipe.mode === 'reveal' ? 1 : 2) : 0);
      gl.uniform1f(u.u_glitch, L.glitch || 0);
      gl.uniform1f(u.u_blur, L.blur || 0);
      gl.uniform1f(u.u_seed, (this.frame % 89) * 1.71);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }

  SC.GLRenderer = GLRenderer;
})();
