/**
 * WebGL-based image processing for high-performance filters.
 */

const VERTEX_SHADER = `
    attribute vec2 position;
    attribute vec2 texCoord;
    varying vec2 vTexCoord;
    uniform bool uFlipY;
    void main() {
        gl_Position = vec4(position, 0, 1);
        vTexCoord = vec2(texCoord.x, uFlipY ? 1.0 - texCoord.y : texCoord.y);
    }
`;

const FRAGMENT_SHADER = `
    precision highp float;
    uniform sampler2D uImage;
    uniform vec2 uResolution;
    varying vec2 vTexCoord;

    // Parameters
    uniform float uHue;
    uniform float uBrightness;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uInvert;
    uniform float uSharpen;
    uniform float uFlatten; // Kuwahara radius
    uniform float uEdges;   // Sobel intensity
    uniform vec3 uEdgeColor;
    uniform float uEdgeThickness;

    // Filters
    uniform bool uApplyFilters;

    // Quantization
    uniform sampler2D uPalette;
    uniform float uPaletteSize;
    uniform bool uUsePalette;

    // --- Color Utilities ---

    vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
    }

    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    // --- Filters ---

    vec3 applyCSSFilters(vec3 color) {
        // Brightness
        color *= uBrightness;

        // Contrast
        color = (color - 0.5) * uContrast + 0.5;

        // Saturation
        vec3 hsv = rgb2hsv(color);
        hsv.y *= uSaturation;
        
        // Hue
        hsv.x = fract(hsv.x + uHue / 360.0);
        color = hsv2rgb(hsv);

        // Invert
        color = mix(color, 1.0 - color, uInvert);

        return clamp(color, 0.0, 1.0);
    }

    void main() {
        vec2 texel = 1.0 / uResolution;
        vec3 color = texture2D(uImage, vTexCoord).rgb;

        // Kuwahara (Flatten)
        if (uFlatten > 0.5) {
            float radius = floor(uFlatten);
            vec3 m0 = vec3(0.0), m1 = vec3(0.0), m2 = vec3(0.0), m3 = vec3(0.0);
            vec3 s0 = vec3(0.0), s1 = vec3(0.0), s2 = vec3(0.0), s3 = vec3(0.0);
            
            for (int j = -10; j <= 10; ++j) {
                float fj = float(j);
                if (abs(fj) > radius) continue;
                for (int i = -10; i <= 10; ++i) {
                    float fi = float(i);
                    if (abs(fi) > radius) continue;
                    
                    vec3 c = texture2D(uImage, vTexCoord + vec2(fi, fj) * texel).rgb;
                    
                    if (fj <= 0.0) {
                        if (fi <= 0.0) { m0 += c; s0 += c * c; }
                        if (fi >= 0.0) { m1 += c; s1 += c * c; }
                    }
                    if (fj >= 0.0) {
                        if (fi <= 0.0) { m2 += c; s2 += c * c; }
                        if (fi >= 0.0) { m3 += c; s3 += c * c; }
                    }
                }
            }

            float n = float((int(radius) + 1) * (int(radius) + 1));
            float minVar = 1e10;

            m0 /= n; 
            vec3 v0vec = abs(s0 / n - m0 * m0);
            float v0 = v0vec.r + v0vec.g + v0vec.b;
            if (v0 < minVar) { minVar = v0; color = m0; }

            m1 /= n; 
            vec3 v1vec = abs(s1 / n - m1 * m1);
            float v1 = v1vec.r + v1vec.g + v1vec.b;
            if (v1 < minVar) { minVar = v1; color = m1; }

            m2 /= n; 
            vec3 v2vec = abs(s2 / n - m2 * m2);
            float v2 = v2vec.r + v2vec.g + v2vec.b;
            if (v2 < minVar) { minVar = v2; color = m2; }

            m3 /= n; 
            vec3 v3vec = abs(s3 / n - m3 * m3);
            float v3 = v3vec.r + v3vec.g + v3vec.b;
            if (v3 < minVar) { minVar = v3; color = m3; }
        }

        // Sobel (Edges)
        if (uEdges > 0.0) {
            vec3 lum = vec3(0.299, 0.587, 0.114);
            float edge = 0.0;
            float thickness = uEdgeThickness;

            for (int ty = -2; ty <= 2; ty++) {
                float fty = float(ty);
                for (int tx = -2; tx <= 2; tx++) {
                    float ftx = float(tx);
                    
                    // Smooth thickness by using a distance weight
                    float dToCenter = length(vec2(ftx, fty));
                    float weight = clamp(thickness - dToCenter, 0.0, 1.0);
                    if (weight <= 0.0) continue;
                    
                    vec2 offset = vec2(ftx, fty) * texel;
                    float t00 = dot(texture2D(uImage, vTexCoord + offset + vec2(-1.0, -1.0) * texel).rgb, lum);
                    float t10 = dot(texture2D(uImage, vTexCoord + offset + vec2( 0.0, -1.0) * texel).rgb, lum);
                    float t20 = dot(texture2D(uImage, vTexCoord + offset + vec2( 1.0, -1.0) * texel).rgb, lum);
                    float t01 = dot(texture2D(uImage, vTexCoord + offset + vec2(-1.0,  0.0) * texel).rgb, lum);
                    float t21 = dot(texture2D(uImage, vTexCoord + offset + vec2( 1.0,  0.0) * texel).rgb, lum);
                    float t02 = dot(texture2D(uImage, vTexCoord + offset + vec2(-1.0,  1.0) * texel).rgb, lum);
                    float t12 = dot(texture2D(uImage, vTexCoord + offset + vec2( 0.0,  1.0) * texel).rgb, lum);
                    float t22 = dot(texture2D(uImage, vTexCoord + offset + vec2( 1.0,  1.0) * texel).rgb, lum);

                    float dx = t00 + 2.0*t01 + t02 - (t20 + 2.0*t21 + t22);
                    float dy = t00 + 2.0*t10 + t20 - (t02 + 2.0*t12 + t22);
                    edge = max(edge, sqrt(dx*dx + dy*dy) * weight);
                }
            }

            float edgeFactor = clamp(edge * uEdges * 0.5, 0.0, 1.0);
            color = mix(color, uEdgeColor, edgeFactor);
        }

        // Sharpen
        if (uSharpen > 0.0) {
            vec3 neighborSum = 
                texture2D(uImage, vTexCoord + vec2(0.0,  texel.y)).rgb +
                texture2D(uImage, vTexCoord + vec2(0.0, -texel.y)).rgb +
                texture2D(uImage, vTexCoord + vec2( texel.x, 0.0)).rgb +
                texture2D(uImage, vTexCoord + vec2(-texel.x, 0.0)).rgb;
            color = color * (1.0 + 4.0 * uSharpen) - neighborSum * uSharpen;
        }

        // CSS-equivalent adjustments
        if (uApplyFilters) {
            color = applyCSSFilters(color);
        }

        // GPU Quantization
        if (uUsePalette && uPaletteSize > 0.0) {
            float minDist = 1e10;
            vec3 bestColor = color;
            for (int i = 0; i < 256; i++) {
                if (float(i) >= uPaletteSize) break;
                vec3 pColor = texture2D(uPalette, vec2((float(i) + 0.5) / uPaletteSize, 0.5)).rgb;
                float d = distance(color, pColor);
                if (d < minDist) {
                    minDist = d;
                    bestColor = pColor;
                }
            }
            color = bestColor;
        }

        gl_FragColor = vec4(color, 1.0);
    }
`;

export default class WebGLProcessor {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.gl = this.canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!this.gl) throw new Error('WebGL not supported');

    this.program = this.#createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.#initBuffers();

    this.texture = null;
    this.paletteTexture = null;
    this.lastImage = null;
  }

  #createProgram(vsSource, fsSource) {
    const gl = this.gl;
    const vs = this.#createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.#createShader(gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program));
    }
    return program;
  }

  #createShader(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(info);
    }
    return shader;
  }

  #initBuffers() {
    const gl = this.gl;
    const program = this.program;

    const positions = new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]);
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const texCoords = new Float32Array([
      0, 0, 1, 0, 0, 1,
      0, 1, 1, 0, 1, 1,
    ]);
    const texBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);

    const texLoc = gl.getAttribLocation(program, 'texCoord');
    gl.enableVertexAttribArray(texLoc);
    gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
  }

  process(image, params, targetWidth, targetHeight, returnPixels = false) {
    const gl = this.gl;
    const program = this.program;

    const w = targetWidth || image.width;
    const h = targetHeight || image.height;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    // Main Image Texture
    if (this.lastImage !== image) {
      if (this.texture) gl.deleteTexture(this.texture);
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      this.lastImage = image;
    }

    // Palette Texture
    if (this.paletteTexture) gl.deleteTexture(this.paletteTexture);
    this.paletteTexture = null;
    let paletteSize = 0;

    if (params.palette && params.palette.length > 0) {
      paletteSize = params.palette.length;
      const data = new Uint8Array(paletteSize * 4);
      for (let i = 0; i < paletteSize; i++) {
        data[i * 4] = params.palette[i].r;
        data[i * 4 + 1] = params.palette[i].g;
        data[i * 4 + 2] = params.palette[i].b;
        data[i * 4 + 3] = 255;
      }
      this.paletteTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, paletteSize, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    }

    gl.useProgram(program);

    const setUniform = (name, val) => {
      const loc = gl.getUniformLocation(program, name);
      if (typeof loc === 'undefined' || loc === null) return;
      if (typeof val === 'number') gl.uniform1f(loc, val);
      else if (typeof val === 'boolean') gl.uniform1i(loc, val ? 1 : 0);
      else if (Array.isArray(val)) {
        if (val.length === 2) gl.uniform2fv(loc, val);
        if (val.length === 3) gl.uniform3fv(loc, val);
      }
    };

    // Multi-pass setup
    const fb = gl.createFramebuffer();
    const tempTextures = [
      gl.createTexture(),
      gl.createTexture(),
    ];

    tempTextures.forEach(tex => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    });

    const passes = params.passes || 1;
    let currentSrc = this.texture;

    // Intermediate passes (NO FLIP)
    setUniform('uFlipY', false);

    for (let i = 0; i < passes; i++) {
      const destTex = tempTextures[i % 2];
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, destTex, 0);
      gl.viewport(0, 0, w, h);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentSrc);
      gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);

      if (this.paletteTexture) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
        gl.uniform1i(gl.getUniformLocation(program, 'uPalette'), 1);
      }

      setUniform('uResolution', [w, h]);
      setUniform('uHue', params.hue ?? 0);
      setUniform('uBrightness', (params.brightness ?? 100) / 100);
      setUniform('uContrast', (params.contrast ?? 100) / 100);
      setUniform('uSaturation', (params.saturation ?? 100) / 100);
      setUniform('uInvert', (params.invert ?? 0) / 100);
      setUniform('uSharpen', (params.sharpen ?? 0) / 100);
      setUniform('uFlatten', params.flatten ?? 0);
      setUniform('uEdges', params.edges ?? 0);
      setUniform('uEdgeColor', params.edgeColor ?? [0, 0, 0]);
      setUniform('uEdgeThickness', params.edgeThickness ?? 1);
      setUniform('uPaletteSize', paletteSize);
      setUniform('uUsePalette', paletteSize > 0);
      setUniform('uApplyFilters', i === passes - 1);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      currentSrc = destTex;
    }

    // Final pass to main canvas (FLIP HERE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentSrc);
    gl.uniform1i(gl.getUniformLocation(program, 'uImage'), 0);

    setUniform('uFlipY', true);
    // Ensure no extra processing on final blit
    setUniform('uHue', 0);
    setUniform('uBrightness', 1);
    setUniform('uContrast', 1);
    setUniform('uSaturation', 1);
    setUniform('uInvert', 0);
    setUniform('uSharpen', 0);
    setUniform('uFlatten', 0);
    setUniform('uEdges', 0);
    setUniform('uUsePalette', false);
    setUniform('uApplyFilters', false);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (returnPixels) {
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

      // Clean up multi-pass resources
      gl.deleteFramebuffer(fb);
      tempTextures.forEach(tex => gl.deleteTexture(tex));

      return pixels;
    }

    // Clean up multi-pass resources
    gl.deleteFramebuffer(fb);
    tempTextures.forEach(tex => gl.deleteTexture(tex));

    return null;
  }

  destroy() {
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.paletteTexture) this.gl.deleteTexture(this.paletteTexture);
    this.lastImage = null;
  }
}
