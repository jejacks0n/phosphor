<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';

// A CRT's glow behind About's header: the theme's accent colors (--accent, --accent-hot) flowing in waves over the dialog's
// surface (--surface-0), through an aperture grille and scanlines, with a hum bar rolling up and a little curvature. It
// draws only while it's shown (About's tab; it goes with the tab), holds one frame with reduced motion, follows a theme
// changed while it's up, and is nothing where there's no WebGL2.
const VERTEX = `#version 300 es
layout(location = 0) in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_dpr;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_bg;
out vec4 fragColor;

vec2 curveUV(vec2 uv, float k) {
  vec2 c = uv * 2.0 - 1.0;
  c *= 1.0 + k * dot(c, c);
  return c * 0.5 + 0.5;
}

void main() {
  vec2 uv = curveUV(gl_FragCoord.xy / u_resolution, 0.044);
  // Sync shimmer: each row nudged sideways, which ripples the sides' edges. WOBBLE is how far (1 was the shader as given).
  const float WOBBLE = 0.35;
  uv.x += (sin(uv.y * 26.0 - u_time * 3.1) * 0.0026 + sin(uv.y * 88.0 + u_time * 7.2) * 0.0008) * WOBBLE;

  float wave1 = sin(uv.x * 5.8 + u_time * 0.58 + sin(uv.y * 4.4 - u_time * 0.38));
  float wave2 = cos(uv.y * 7.2 - u_time * 0.48 + cos(uv.x * 4.8 + u_time * 0.34));
  float field = 0.5 + 0.25 * wave1 + 0.25 * wave2;
  field += smoothstep(0.28, 0.0, abs(fract(uv.y - u_time * 0.12) - 0.5)) * 0.26; // the hum bar

  // The aperture grille, a stripe of each color every three device pixels.
  float sub = mod(gl_FragCoord.x, 3.0);
  float s0 = smoothstep(1.25, 0.0, abs(sub - 0.5));
  float s1 = smoothstep(1.25, 0.0, abs(sub - 1.5));
  float s2 = smoothstep(1.25, 0.0, abs(sub - 2.5));
  vec3 grille = u_primary * s0 + mix(u_primary, u_secondary, 0.5) * 1.15 * s1 + u_secondary * s2;
  vec3 phosphor = mix(mix(u_primary, u_secondary, smoothstep(0.15, 0.85, wave2 * 0.5 + 0.5)), grille, 0.52);

  // Scanlines a line every 3 CSS pixels, deep enough to see the surface between them, light theme or dark.
  float line = 0.5 + 0.5 * cos(gl_FragCoord.y / u_dpr * 6.2832 / 3.0);
  float scan = mix(0.18, 1.0, line * line);

  // The sides fade into the surface where the curve bends away; the bottom is the canvas's mask.
  float sides = smoothstep(0.0, 0.025, uv.x) * smoothstep(0.0, 0.025, 1.0 - uv.x);
  fragColor = vec4(mix(u_bg, phosphor, clamp(field * 0.65, 0.0, 1.0) * scan * sides), 1.0);
}`;

const canvas = ref(null), failed = ref(false);
const still = useMediaQuery('(prefers-reduced-motion: reduce)');
let gl = null, frame = 0, uniforms = {}, colors = null, observers = [];

// A theme color as WebGL takes it: whatever the token holds (a plugin theme's too), as the browser resolves it.
function colorOf(token) {
  const probe = document.createElement('i');
  probe.style.color = `var(${token})`;
  document.body.append(probe);
  const [r, g, b] = getComputedStyle(probe).color.match(/[\d.]+/g).map(Number);
  probe.remove();
  return [r / 255, g / 255, b / 255];
}
const readColors = () => { colors = { primary: colorOf('--accent'), secondary: colorOf('--accent-hot'), bg: colorOf('--surface-0') }; };

function draw(time) {
  gl.uniform1f(uniforms.time, time);
  gl.uniform3fv(uniforms.primary, colors.primary);
  gl.uniform3fv(uniforms.secondary, colors.secondary);
  gl.uniform3fv(uniforms.bg, colors.bg);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

const start = performance.now();
const now = () => (still.value ? 4 : 4 + (performance.now() - start) / 1000);
function tick() {
  draw(now());
  frame = still.value ? 0 : requestAnimationFrame(tick);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), { width, height } = canvas.value.getBoundingClientRect();
  canvas.value.width = Math.max(1, Math.round(width * dpr));
  canvas.value.height = Math.max(1, Math.round(height * dpr));
  gl.viewport(0, 0, canvas.value.width, canvas.value.height);
  gl.uniform2f(uniforms.resolution, canvas.value.width, canvas.value.height);
  gl.uniform1f(uniforms.dpr, dpr);
  draw(now());
}

function build() {
  gl = canvas.value.getContext('webgl2');
  if (!gl) return false;
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  for (const name of ['resolution', 'time', 'dpr', 'primary', 'secondary', 'bg']) uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
  return true;
}

onMounted(() => {
  if (!build()) {
    failed.value = true;
    return;
  }
  readColors();
  const sized = new ResizeObserver(resize), themed = new MutationObserver(() => { readColors(); draw(now()); });
  sized.observe(canvas.value);
  themed.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  observers = [sized, themed];
  resize();
  tick();
});
watch(still, () => { // reduced motion turned on or off while it's up
  cancelAnimationFrame(frame);
  if (gl && !failed.value) tick();
});
onUnmounted(() => {
  cancelAnimationFrame(frame);
  observers.forEach((observer) => observer.disconnect());
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
});
</script>

<template>
  <canvas v-if="!failed" ref="canvas" class="crt-glow" aria-hidden="true"></canvas>
</template>

<style scoped>
canvas.crt-glow {
  position: absolute;
  z-index: -1;
  inset: calc(-1 * var(--glow-reach)) calc(-1 * var(--glow-reach)) -24px;
  width: calc(100% + 2 * var(--glow-reach));
  height: calc(100% + var(--glow-reach) + 24px);
  pointer-events: none;
  mask-image: linear-gradient(to bottom, #000 72%, transparent);
}
</style>
