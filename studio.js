// The potter's studio. A wheel under a single warm spotlight in a dark workshop lined with shelves of pottery.
// Every product is a lathe profile (outer wall, rounded lip, inner wall) plus a craft finish painted on canvas
// with matching relief and roughness, so the hero, the craft chapters and the shop photographs share one model.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const touch = matchMedia('(hover: none)').matches;
// quality tier from the GPU: 0 = film (depth of field, MSAA, 2k shadows), 1 = balanced, 2 = light (older laptops, unknown GPUs)
function gpuTier() {
  const q = new URLSearchParams(location.search).get('q'); if (q !== null && q !== '') return Math.max(0, Math.min(2, +q));
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return 2;
    const ext = gl.getExtension('WEBGL_debug_renderer_info'), r = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    let t = 2;
    if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(r)) t = 2;
    else if (/Apple M\d|RTX|GTX 1[6-9]\d\d|GTX 10[6-8]0|RX [5-7]\d\d\d|Radeon Pro|Arc A\d/i.test(r)) t = 0;
    else if (/Apple GPU|Iris\(R\) Xe|Iris Xe|Adreno \(TM\) [6-9]\d\d|Mali-G7\d|Mali-G[6-9]1\d|Radeon/i.test(r)) t = 1;
    if ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4) t = Math.max(t, 1);
    if (touch) t = Math.max(t, 1);
    return t;
  } catch (e) { return 1; }
}
export const START_TIER = gpuTier();
let TIER = START_TIER;
const lowEnd = TIER >= 1;
const V2 = THREE.Vector2;

// ---------- shapes ----------
export const SHAPES = {
  lump: { H: 1.0, closed: true, c: [[0.74, 0], [0.82, 0.28], [0.72, 0.66], [0.38, 1]] },
  vase: { H: 2.3, c: [[0.42, 0], [0.72, 0.17], [0.8, 0.35], [0.6, 0.6], [0.33, 0.78], [0.29, 0.9], [0.42, 1]] },
  surahi: { H: 2.6, c: [[0.46, 0], [0.8, 0.15], [0.84, 0.31], [0.55, 0.5], [0.21, 0.64], [0.16, 0.86], [0.27, 1]] },
  bowl: { H: 0.85, c: [[0.42, 0], [0.84, 0.28], [1.13, 0.68], [1.25, 1]] },
  urli: { H: 0.62, c: [[0.5, 0], [1.1, 0.34], [1.44, 0.8], [1.52, 1]] },
  planter: { H: 1.35, c: [[0.6, 0], [0.78, 0.45], [0.93, 0.86], [1.03, 1]] },
  urn: { H: 2.0, c: [[0.5, 0], [0.4, 0.09], [0.86, 0.37], [0.92, 0.6], [0.57, 0.84], [0.63, 1]] },
  diya: { H: 0.42, c: [[0.32, 0], [0.8, 0.45], [1.05, 1]] },
  kulhad: { H: 0.95, c: [[0.36, 0], [0.46, 0.5], [0.56, 1]] },
  lantern: { H: 2.3, closed: true, c: [[0.45, 0], [0.3, 0.08], [0.72, 0.3], [0.74, 0.62], [0.4, 0.84], [0.1, 1]] },
  candle: { H: 1.7, c: [[0.62, 0], [0.27, 0.1], [0.17, 0.45], [0.24, 0.8], [0.5, 0.92], [0.52, 1]] },
  roll: { H: 2.2, closed: true, c: [[0.55, 0], [0.57, 0.5], [0.55, 1]] },
};
const NO = 64, NL = 10, WALL = 0.065, FLOOR = 0.07;
// outer wall from the foot to the lip; then a rounded lip and the inner wall back down to the floor
function sample(key) {
  const s = SHAPES[key] || SHAPES.vase, curve = new THREE.SplineCurve(s.c.map(([r, t]) => new V2(r, t * s.H)));
  const raw = curve.getSpacedPoints(NO - 3), r0 = raw[0].x;
  const outer = [new V2(0.0001, 0), new V2(r0 * 0.92, 0)].concat(raw.map((p, i) => i === 0 ? new V2(r0, 0.035) : p));
  const L = outer[outer.length - 1], inner = [L.clone()];
  if (s.closed) {
    for (let k = 1; k <= NL; k++) { const t = k / NL; inner.push(new V2(L.x * (1 - t) + 0.0001, L.y + Math.sin(t * Math.PI / 2) * Math.min(0.08, L.x * 0.25))); }
    const top = inner[inner.length - 1]; for (let k = 0; k < NO; k++) inner.push(top.clone());
  } else {
    for (let k = 1; k <= NL; k++) { const a = k / NL * Math.PI; inner.push(new V2(L.x - WALL / 2 + Math.cos(a) * WALL / 2, L.y + Math.sin(a) * WALL * 0.45)); }
    for (let i = NO - 1; i >= 1; i--) {
      const p = outer[i], a = outer[Math.max(0, i - 1)], b = outer[Math.min(NO - 1, i + 1)], t = new V2(b.x - a.x, b.y - a.y).normalize();
      inner.push(new V2(Math.max(0.0001, p.x - t.y * WALL), Math.max(FLOOR, p.y + t.x * WALL)));
    }
    inner.push(new V2(0.0001, FLOOR));
  }
  return { outer, inner, H: s.H, R: Math.max(...s.c.map((p) => p[0])), base: r0 };
}

// ---------- canvas helpers ----------
function rng(seed) { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
function mk(w = 1024, h = 512) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function speckle(g, w, h, a, rgb, seed, n = 1) { const R = rng(seed); for (let i = 0; i < w * h / 30 * n; i++) { g.fillStyle = `rgba(${rgb},${a * R()})`; const s = R() < 0.92 ? 1.5 : 3; g.fillRect(R() * w, R() * h, s, s); } }
function throwRings(g, w, h, rgb, a, seed) { const R = rng(seed); for (let y = 0; y < h; y += 2 + R() * 5) { g.strokeStyle = `rgba(${rgb},${a * R()})`; g.lineWidth = 0.6 + R() * 2.4; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.01 + y) * 1.2); g.stroke(); } }
// brush stroke petals: tapered, slightly translucent, never perfectly repeated
function petal(g, x, y, len, wid, ang, col, R) { g.save(); g.translate(x, y); g.rotate(ang + (R() - 0.5) * 0.18); g.fillStyle = col; g.globalAlpha = 0.86 + R() * 0.14; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.45, -wid * (0.9 + R() * 0.3), len, 0); g.quadraticCurveTo(len * 0.45, wid * (0.9 + R() * 0.3), 0, 0); g.fill(); g.restore(); g.globalAlpha = 1; }
function bloom(g, x, y, r, n, col, mid, R) { for (let i = 0; i < n; i++) petal(g, x, y, r, r * 0.34, i / n * Math.PI * 2, col, R); g.fillStyle = mid; g.beginPath(); g.arc(x, y, r * 0.2, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.arc(x - r * 0.06, y - r * 0.06, r * 0.08, 0, 7); g.fill(); }
function stem(g, x0, y0, len, col, R) { g.strokeStyle = col; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + len * 0.3, y0 - 34, x0 + len * 0.7, y0 + 30, x0 + len, y0); g.stroke(); for (let k = 1; k < 5; k++) { const t = k / 5; petal(g, x0 + len * t, y0 + Math.sin(t * Math.PI * 2) * 14, 26, 9, (k % 2 ? -1 : 1) * 0.9, col, R); } }
function band(g, w, y, h, col) { g.fillStyle = col; g.fillRect(0, y, w, h); }

// ---------- finishes ----------
// paint(g, w, h, variant) draws colour; relief (-1..1) says how painted marks sit on the surface (raised paint, incised lines)
const FIN = {
  wet: { paint(g, w, h) { g.fillStyle = '#8b5a3b'; g.fillRect(0, 0, w, h); throwRings(g, w, h, '60,35,20', 0.45, 2); throwRings(g, w, h, '190,140,105', 0.25, 5); speckle(g, w, h, 0.25, '50,30,18', 4); }, relief: 0.6, rough: 0.32, coat: 0.55, inner: '#7c4f33' },
  blue: {
    paint(g, w, h, v) {
      const R = rng(v * 7 + 3), cob = '#1d3a94', cob2 = '#2b4fb8', tq = '#1f9aa3';
      g.fillStyle = '#f2efe7'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.05, '90,110,170', v);
      band(g, w, 0, 30, cob); band(g, w, 36, 5, tq); band(g, w, h - 40, 40, cob); band(g, w, h - 50, 5, tq);
      for (let x = 0; x < w; x += 22) { g.fillStyle = cob2; g.beginPath(); g.arc(x + 11, 58, 4, 0, 7); g.fill(); }
      const n = 4 + (v % 3);
      for (let i = 0; i < n; i++) { const x = (i + 0.5) / n * w; stem(g, x - w / n / 2, h * 0.54 + 46, w / n, tq, R); bloom(g, x, h * 0.5, 66, 8, cob, tq, R); bloom(g, x, h * 0.5, 30, 8, cob2, '#f2efe7', R); bloom(g, x + w / n / 2, h * 0.27, 24, 6, cob, '#f2efe7', R); bloom(g, x + w / n / 2, h * 0.76, 22, 6, tq, cob, R); }
    }, relief: 0.35, rough: 0.12, coat: 1, coatRough: 0.05, inner: '#efece4', crackle: true,
  },
  terracotta: {
    paint(g, w, h, v) {
      g.fillStyle = v % 2 ? '#b0532c' : '#a85230'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.22, '70,30,12', v, 1.4); throwRings(g, w, h, '120,50,20', 0.3, v);
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,190,140,.10)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(40,10,0,.18)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(238,224,200,.92)'; g.lineWidth = 5; g.lineJoin = 'round'; for (let i = 0; i < 22; i++) { const x = i / 22 * w; g.beginPath(); g.moveTo(x, h * 0.42); g.lineTo(x + w / 44, h * 0.33); g.lineTo(x + w / 22, h * 0.42); g.stroke(); }
      g.fillStyle = 'rgba(238,224,200,.9)'; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(i / 60 * w + 8, h * 0.58, 4, 0, 7); g.fill(); }
      g.strokeStyle = '#5e2810'; g.lineWidth = 2.5; [0.2, 0.235, 0.7, 0.735].forEach((t) => { g.beginPath(); g.moveTo(0, h * t); g.lineTo(w, h * t); g.stroke(); });
    }, relief: -0.5, rough: 0.78, coat: 0, sheen: 0.4, inner: '#8e4424',
  },
  dhokra: {
    paint(g, w, h, v) {
      g.fillStyle = '#a77a2c'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.4, '60,38,8', v, 1.2);
      for (let row = 0; row < 7; row++) { const y = (row + 0.5) / 7 * h; for (let i = 0; i < 14; i++) { const x = (i + (row % 2) * 0.5) / 14 * w; g.beginPath(); for (let a = 0; a < 15; a += 0.2) { const r = a * 1.85; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.strokeStyle = '#3e2806'; g.lineWidth = 4.2; g.stroke(); g.strokeStyle = '#e9c66a'; g.lineWidth = 1.6; g.stroke(); } }
      for (let x = 0; x < w; x += 9) { g.fillStyle = '#3e2806'; g.fillRect(x, 0, 3, 18); g.fillRect(x, h - 18, 3, 18); }
    }, relief: 0.9, rough: 0.34, metal: 1, inner: '#8a6324', aniso: 0.35,
  },
  black: {
    paint(g, w, h, v) {
      const R = rng(v + 11), s = '#d5d8dc'; g.fillStyle = '#0d0b0b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.05, '220,220,230', v);
      g.strokeStyle = s; g.lineWidth = 2.2; g.lineCap = 'round';
      for (let i = 0; i < 6; i++) { const x = (i + 0.5) / 6 * w; g.beginPath(); g.moveTo(x - 82, h * 0.5); g.bezierCurveTo(x - 40, h * 0.3, x + 40, h * 0.7, x + 82, h * 0.5); g.stroke(); for (let k = 0; k < 5; k++) { g.save(); g.translate(x - 70 + k * 35, h * 0.5 + (k % 2 ? -24 : 24)); g.rotate(k % 2 ? 0.7 : -0.7); g.beginPath(); g.ellipse(0, 0, 14, 5.5, 0, 0, 7); g.stroke(); g.restore(); } g.lineWidth = 1.6; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; g.beginPath(); g.ellipse(x + Math.cos(a) * 12, h * 0.5 + Math.sin(a) * 12, 10, 4, a, 0, 7); g.stroke(); } g.lineWidth = 2.2; }
      g.lineWidth = 1.6; [0.15, 0.175, 0.825, 0.85].forEach((t) => { g.beginPath(); g.moveTo(0, h * t); g.lineTo(w, h * t); g.stroke(); });
      for (let i = 0; i < 40; i++) { g.fillStyle = s; g.beginPath(); g.arc(R() * w, h * 0.16 + 6, 1.6, 0, 7); g.fill(); }
    }, relief: -0.45, rough: 0.16, coat: 1, coatRough: 0.06, inner: '#0d0b0b',
  },
  lacquer: {
    paint(g, w, h, v) {
      const pal = [['#b71c1c', '#f2b705', '#1e7b34', '#173f8f'], ['#c43d12', '#f9c22e', '#00796b', '#5b1a8a'], ['#d32f2f', '#ffca28', '#2e7d32', '#d32f2f']][v % 3];
      let y = 0, i = 0; while (y < h) { const t = 28 + ((i * 37) % 54); g.fillStyle = pal[i % pal.length]; g.fillRect(0, y, w, t); g.fillStyle = '#140d0a'; g.fillRect(0, y + t - 3, w, 3); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, y + 2, w, 2); y += t; i++; }
    }, relief: 0.15, rough: 0.12, coat: 1, coatRough: 0.03, inner: '#8f1a14',
  },
  marble: {
    paint(g, w, h, v) {
      const R = rng(v + 9); g.fillStyle = '#efece6'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 34; i++) { g.strokeStyle = `rgba(110,110,120,${0.05 + R() * 0.16})`; g.lineWidth = 0.5 + R() * 2.2; g.beginPath(); let x = R() * w, y = R() * h; g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += (R() - 0.3) * 110; y += (R() - 0.5) * 55; g.lineTo(x, y); } g.stroke(); }
      for (let i = 0; i < 6; i++) { const x = (i + 0.5) / 6 * w, y = h * 0.5; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.78; petal(g, x + Math.cos(a) * 18, y + Math.sin(a) * 18, 44, 13, a, '#2c6e49', R); } bloom(g, x, y, 34, 6, '#a3332a', '#2a4fa0', R); }
      [0.11, 0.89].forEach((t) => { for (let i = 0; i < 48; i++) { g.save(); g.translate(i / 48 * w + 10, h * t); g.rotate(Math.PI / 4); g.fillStyle = '#284b9a'; g.fillRect(-5, -5, 10, 10); g.restore(); } });
    }, relief: -0.15, rough: 0.2, coat: 0.7, coatRough: 0.12, inner: '#ebe8e1',
  },
  bagru: { paint(g, w, h, v) { const R = rng(v + 4); g.fillStyle = '#e6d8bd'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.12, '120,90,60', v); for (let r = 0; r < 8; r++) for (let c = 0; c < 16; c++) { const x = (c + (r % 2) * 0.5) / 16 * w, y = (r + 0.5) / 8 * h; bloom(g, x, y, 18, 5, r % 2 ? '#8b2a20' : '#2a2420', '#e6d8bd', R); } band(g, w, 0, 14, '#2a2420'); band(g, w, h - 14, 14, '#2a2420'); }, relief: 0.1, rough: 0.95, sheen: 1, inner: '#d9c9ab', fabric: true },
  ikat: { paint(g, w, h, v) { const cols = [['#26386f', '#a8322a', '#ecdfc6'], ['#561c37', '#c9982f', '#ecdfc6']][v % 2]; g.fillStyle = cols[2]; g.fillRect(0, 0, w, h); for (let r = 0; r < 6; r++) for (let c = 0; c < 12; c++) { const x = c / 12 * w, y = r / 6 * h, s = w / 12; g.fillStyle = cols[(r + c) % 2]; g.beginPath(); g.moveTo(x, y + s * 0.35); g.lineTo(x + s / 2, y); g.lineTo(x + s, y + s * 0.35); g.lineTo(x + s / 2, y + s * 0.7); g.closePath(); g.fill(); } for (let i = 0; i < 4000; i++) { g.fillStyle = 'rgba(236,223,198,.35)'; g.fillRect(Math.random() * w, Math.random() * h, 7, 1); } }, relief: 0.1, rough: 0.95, sheen: 1, inner: '#d9c9ab', fabric: true },
  kantha: { paint(g, w, h, v) { const R = rng(v + 6); g.fillStyle = ['#741c39', '#1c4a56', '#74461c'][v % 3]; g.fillRect(0, 0, w, h); const th = ['#f2c75b', '#f1e3cc', '#e46a58', '#79c8cf']; g.lineCap = 'round'; for (let y = 10; y < h; y += 15) { g.strokeStyle = th[(y / 15 | 0) % th.length]; g.lineWidth = 1.5; g.setLineDash([7, 6]); g.lineDashOffset = (y * 3) % 13; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } g.setLineDash([]); for (let i = 0; i < 5; i++) bloom(g, (i + 0.5) / 5 * w, h / 2, 46, 8, th[i % 4], '#f1e3cc', R); }, relief: 0.3, rough: 0.92, sheen: 1, inner: '#5d1630', fabric: true },
  dabu: { paint(g, w, h, v) { const R = rng(v + 8); g.fillStyle = '#1b284f'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.2, '200,210,240', v); for (let r = 0; r < 7; r++) for (let c = 0; c < 14; c++) { const x = (c + (r % 2) * 0.5) / 14 * w, y = (r + 0.5) / 7 * h; bloom(g, x, y, 22, 6, 'rgba(222,230,244,.82)', '#1b284f', R); } }, relief: -0.1, rough: 0.95, sheen: 1, inner: '#1b284f', fabric: true },
};

function roughnessMap(seed) {
  const [c, g] = mk(512, 256); g.fillStyle = '#e0e0e0'; g.fillRect(0, 0, 512, 256); const R = rng(seed);
  for (let i = 0; i < 260; i++) { const x = R() * 512, y = R() * 256, r = 8 + R() * 40, gr = g.createRadialGradient(x, y, 0, x, y, r), v = R() < 0.5 ? 255 : 150; gr.addColorStop(0, `rgba(${v},${v},${v},.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  speckle(g, 512, 256, 0.25, '255,255,255', seed + 1, 2);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}
const texCache = new Map();
function finishTextures(finish, variant) {
  const key = finish + ':' + variant; if (texCache.has(key)) return texCache.get(key);
  const f = FIN[finish] || FIN.wet, [c, g] = mk(); f.paint(g, c.width, c.height, variant);
  if (f.crackle) { const R = rng(variant + 70); g.strokeStyle = 'rgba(90,80,60,.07)'; g.lineWidth = 0.7; for (let i = 0; i < 260; i++) { let x = R() * c.width, y = R() * c.height; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); } }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.anisotropy = 8;
  const out = { map, rough: roughnessMap(variant + 3) };
  texCache.set(key, out); return out;
}
// the glaze climbs the piece from the foot: below uSweep the finish, above it wet clay
function withSweep(m) {
  m.userData.sweep = { value: 99 }; m.userData.clay = { value: new THREE.Color('#7e5034') };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSweep = m.userData.sweep; sh.uniforms.uClay = m.userData.clay;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vLY;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLY = position.y;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vLY; uniform float uSweep; uniform vec3 uClay;')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat gm = 1.0 - smoothstep(uSweep - 0.06, uSweep + 0.06, vLY);\ndiffuseColor.rgb = mix(uClay, diffuseColor.rgb, gm);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.3, roughnessFactor, gm);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= gm;');
  };
  m.customProgramCacheKey = () => 'sweep';
  return m;
}
function makeMaterials(finish, variant) {
  const f = FIN[finish] || FIN.wet, t = finishTextures(finish, variant);
  const outer = withSweep(new THREE.MeshPhysicalMaterial({
    map: t.map, bumpMap: t.map, bumpScale: -(f.relief || 0) * 2.4, roughness: f.rough, roughnessMap: t.rough, metalness: f.metal || 0,
    clearcoat: TIER < 2 ? (f.coat || 0) : 0, clearcoatRoughness: f.coatRough ?? 0.1, sheen: TIER < 2 ? (f.sheen || 0) : 0, sheenRoughness: 0.6, sheenColor: new THREE.Color(f.fabric ? '#fff3e0' : '#ffd9b8'),
    anisotropy: TIER === 0 ? (f.aniso || 0) : 0, envMapIntensity: f.metal ? 1.3 : 1, side: THREE.FrontSide,
  }));
  let capMap = null;
  if (f.fabric) {   // the cap is the first ~14% of the inner profile's v range (bottom of the canvas): paint wound layers there
    capMap = canvasTex(512, 512, (g, w, h) => { const src = t.map.image; g.drawImage(src, 0, 0, w, h); const capH = h * 0.16; for (let y = 0; y < capH; y += 3) { g.fillStyle = (y / 3 | 0) % 2 ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.08)'; g.fillRect(0, h - capH + y, w, 1.6); } });
    capMap.wrapS = THREE.RepeatWrapping;
  }
  const inner = withSweep(new THREE.MeshPhysicalMaterial({ map: capMap, color: f.fabric ? '#ffffff' : f.inner, roughness: Math.min(0.9, f.rough + 0.08), roughnessMap: t.rough, metalness: f.metal || 0, clearcoat: TIER < 2 ? (f.coat || 0) * 0.8 : 0, clearcoatRoughness: 0.12, side: THREE.DoubleSide, envMapIntensity: f.metal ? 1.1 : 0.8 }));
  return { outer, inner };
}

// ---------- environments ----------
function studioEnvironment(renderer, mood) {
  const s = new THREE.Scene(), pm = new THREE.PMREMGenerator(renderer);
  s.add(new THREE.Mesh(new THREE.BoxGeometry(24, 12, 24), new THREE.MeshBasicMaterial({ color: mood === 'light' ? '#8a7d6c' : '#140d09', side: THREE.BackSide })));
  const panel = (w, h, col, k, pos) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 1, 0); s.add(m); };
  panel(5, 3.5, '#fff0dc', 7, [3.5, 7, 4]);       // key softbox
  panel(1.2, 7, '#ffdcb8', 2.4, [-7, 3, 2]);      // warm strip
  panel(1.2, 7, '#c9dcff', 2.0, [5, 3, -6]);      // cool rim strip
  panel(12, 1.4, '#ffcf9c', 0.7, [0, -0.6, 8]);   // floor bounce
  const tex = pm.fromScene(s, 0.03).texture; pm.dispose(); return tex;
}
function canvasTex(w, h, draw, srgb = true) { const [c, g] = mk(w, h); draw(g, w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
function contactShadowTex() { return canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.35, 'rgba(0,0,0,.45)'); gr.addColorStop(0.7, 'rgba(0,0,0,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }); }

// ---------- camera shots: az/el in degrees round the piece, d = distance x fit, ly = look height x piece height, ox = screen shift ----------
// each chapter's light: key colour, rim colour
const MOODS = { hero: ['#ffdcb0', '#a9bfff'], 'craft:blue': ['#eef2ff', '#7fa2ff'], 'craft:dhokra': ['#ffc078', '#ff9d5c'], 'craft:terracotta': ['#ffb88c', '#ffd2a8'], 'craft:lacquer': ['#fff5e8', '#ffd6f0'], 'craft:black': ['#d4dcff', '#8fa8ff'], 'craft:textile': ['#ffe2c4', '#ffc9a8'], parade: ['#ffd9b0', '#b9c8ff'] };
const DEF = { az: 0, el: 8, d: 1, fov: 28, roll: 0, ly: 0.46 };
const INTRO = { az: -50, el: 3, d: 0.4, fov: 22, roll: -3, ly: 0.32, ox: 0, oy: 0 };
const SHOTS = {
  hero: [{ az: -20, el: 5, d: 1.08, ly: 0.48 }, { az: 14, el: 12, d: 0.86, ly: 0.52 }],
  'craft:blue': [{ az: 10, el: 64, d: 1.0, fov: 30, ly: 0.8 }, { az: 48, el: 22, d: 0.82, ly: 0.56 }],
  'craft:dhokra': [{ az: 72, el: -4, d: 0.8, fov: 38, roll: -5, ly: 0.62 }, { az: 18, el: 3, d: 0.9, fov: 32, roll: 0, ly: 0.52 }],
  'craft:terracotta': [{ az: -70, el: 9, d: 0.55, fov: 18, ly: 0.58 }, { az: -12, el: 15, d: 0.66, fov: 21, ly: 0.5 }],
  'craft:lacquer': [{ az: -130, el: 20, d: 0.95, roll: 9, ly: 0.5 }, { az: 15, el: 10, d: 0.9, roll: -6, ly: 0.5 }],
  'craft:black': [{ az: 172, el: 5, d: 1.05, ly: 0.5 }, { az: 38, el: 11, d: 0.86, ly: 0.5 }],
  'craft:textile': [{ az: 35, el: 56, d: 1.05, ly: 0.7 }, { az: -25, el: 26, d: 0.9, ly: 0.52 }],
  parade: [{ az: 0, el: 7, d: 1.35, fov: 34 }, { az: 0, el: 7, d: 1.35, fov: 34 }],
};

// ---------- the live studio ----------
export function createStudio(canvasEl) {
  const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: false, powerPreference: 'high-performance' });
  let DPR = Math.min(devicePixelRatio || 1, [1.5, 1.25, 1][TIER]); renderer.setPixelRatio(DPR);
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = TIER < 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; renderer.shadowMap.autoUpdate = false;
  let shadowFrames = 30;   // a spinning round pot casts the same shadow: refresh it only while the piece changes
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d0806'); scene.fog = new THREE.FogExp2('#0d0806', 0.045);
  scene.environment = studioEnvironment(renderer, 'dark');
  const camera = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 80);

  // floor: polished concrete
  const floorMap = canvasTex(1024, 1024, (g, w, h) => { g.fillStyle = '#2a211b'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.25, '10,8,6', 5, 2); speckle(g, w, h, 0.08, '200,170,140', 6, 1); for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke(); } });
  floorMap.wrapS = floorMap.wrapT = THREE.RepeatWrapping; floorMap.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.62, metalness: 0, envMapIntensity: 0.6 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.75; floor.receiveShadow = true; scene.add(floor);

  // the back wall of shelves, lit by warm bulbs; the lens throws it out of focus
  const back = new THREE.Group(); scene.add(back);
  const wallMap = canvasTex(1024, 512, (g, w, h) => { g.fillStyle = '#3a2a20'; g.fillRect(0, 0, w, h); speckle(g, w, h, 0.25, '15,10,6', 9, 2); speckle(g, w, h, 0.1, '200,160,120', 10, 1); });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.95 })); wall.position.set(0, 4, -9); wall.receiveShadow = true; back.add(wall);
  const shelfMat = new THREE.MeshStandardMaterial({ color: '#4a3020', roughness: 0.6 });
  const shelfPieces = [], shelfGeo = {}, shelfMats = {};
  const shelfMaterial = (fin) => shelfMats[fin] || (shelfMats[fin] = new THREE.MeshStandardMaterial({ map: finishTextures(fin, 1).map, roughness: (FIN[fin] || FIN.wet).rough, metalness: (FIN[fin] || FIN.wet).metal || 0, envMapIntensity: 0.9 }));
  const SH_FIN = ['terracotta', 'blue', 'black', 'dhokra', 'terracotta', 'lacquer', 'marble', 'terracotta', 'blue'], SH_SHAPE = ['vase', 'urn', 'kulhad', 'bowl', 'surahi', 'planter', 'candle', 'diya', 'lantern'];
  [0.2, 1.85, 3.5].forEach((y, row) => {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(22, 0.12, 1.2), shelfMat); sh.position.set(0, y, -8.4); back.add(sh);
    if (TIER === 2 && row === 2) return;
    for (let i = 0; i < 13; i += TIER === 2 ? 2 : 1) {
      const shape = SH_SHAPE[(i * 5 + row * 3) % SH_SHAPE.length], fin = SH_FIN[(i * 7 + row) % SH_FIN.length], sc = 0.42 + ((i * 13 + row * 7) % 5) * 0.05;
      const s = sample(shape); shelfGeo[shape] = shelfGeo[shape] || new THREE.LatheGeometry(s.outer, 40);
      const m = new THREE.Mesh(shelfGeo[shape], shelfMaterial(fin)); m.scale.setScalar(sc); m.position.set(-10 + i * 1.65 + (row % 2) * 0.6, y + 0.06, -8.4); m.rotation.y = i; back.add(m); shelfPieces.push(m);
    }
  });
  const bulbs = [];
  [[-5.5, 5.4, -6.2], [0.6, 5.9, -7.2], [6.2, 5.2, -6]].forEach(([x, y, z], i) => {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 6, 6), new THREE.MeshBasicMaterial({ color: '#0a0705' })); cord.position.set(x, y + 3.1, z); back.add(cord);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb46a').multiplyScalar(9) })); bulb.position.set(x, y, z); back.add(bulb);
    bulbs.push(bulb);
  });

  if (TIER < 2) { const backFill = new THREE.PointLight('#ffae66', 9, 16, 1.4); backFill.position.set(0, 4.6, -6.2); back.add(backFill); }

  // the rig: wheel, piece, key light and its beam
  const rig = new THREE.Group(); scene.add(rig);
  scene.add(new THREE.HemisphereLight('#ffe2c4', '#1a100a', 0.18));
  const key = new THREE.SpotLight('#ffdcb0', 85, 0, 0.36, 0.85, 1.2); key.position.set(2.2, 8.2, 3.4); key.castShadow = true;
  const SHADOW = [2048, 1024, 512][TIER]; key.shadow.mapSize.set(SHADOW, SHADOW); key.shadow.bias = -0.00025; key.shadow.normalBias = 0.02; key.shadow.radius = 6; key.shadow.camera.near = 2; key.shadow.camera.far = 16;
  rig.add(key); rig.add(key.target); key.target.position.set(0, 0.6, 0);
  const rim = new THREE.SpotLight('#a9bfff', 30, 0, 0.5, 0.9, 1.2); rim.position.set(-3.5, 4.5, -4.5); rig.add(rim); rig.add(rim.target); rim.target.position.set(0, 1, 0);
  const kick = new THREE.PointLight('#ff9a5a', 4, 7, 1.5); kick.position.set(-3, 1.2, 2.5); rig.add(kick);

  // volumetric beam, dust inside it
  const beamLen = key.position.distanceTo(new THREE.Vector3(0, -0.2, 0));
  const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uK: { value: 0 } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vW; void main(){ vH = uv.y; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vH; varying vec3 vW; uniform float uTime; uniform float uK;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9,78.2,37.7)))*43758.5); }
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float along = smoothstep(0., .25, vH) * smoothstep(1., .55, vH);
        float drift = .82 + .18*sin(vW.y*2.1 + uTime*.6) * sin(vW.x*1.7 - uTime*.4);
        gl_FragColor = vec4(vec3(1., .82, .6) * edge * along * drift * .085 * uK, 1.); }` });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 2.9, beamLen, 64, 1, true), beamMat);
  beam.position.copy(key.position).lerp(new THREE.Vector3(0, -0.2, 0), 0.5); beam.lookAt(0, -0.2, 0); beam.rotateX(Math.PI / 2); rig.add(beam);
  const D = [600, 300, 140][TIER], dPos = new Float32Array(D * 3), dPh = new Float32Array(D);
  for (let i = 0; i < D; i++) { const t = Math.random(), r = Math.sqrt(Math.random()) * 2.6 * t, a = Math.random() * 7; const p = key.position.clone().lerp(new THREE.Vector3(0, -0.2, 0), t); dPos.set([p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r], i * 3); dPh[i] = Math.random() * 7; }
  const dGeo = new THREE.BufferGeometry(); dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3)); dGeo.setAttribute('aPh', new THREE.BufferAttribute(dPh, 1));
  const dust = new THREE.Points(dGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uPx: { value: DPR }, uK: { value: 0 } },
    vertexShader: `attribute float aPh; uniform float uTime; uniform float uPx; varying float vA; void main(){ vec3 p = position; p.y += mod(uTime*.05 + aPh, 1.)*.6 - .3; p.x += sin(uTime*.3 + aPh)*.15; vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv; vA = .5 + .5*sin(uTime*1.4 + aPh*3.); gl_PointSize = (1.2 + 2.4*fract(aPh*7.)) * uPx * (6. / -mv.z); }`,
    fragmentShader: `uniform float uK; varying float vA; void main(){ float d = length(gl_PointCoord-.5); gl_FragColor = vec4(vec3(1., .86, .66) * smoothstep(.5, 0., d) * vA * .9 * uK, 1.); }` }));
  rig.add(dust);

  // the wheel: splash pan, wheel head, body; a sponge and a rib tool left on the pan
  const panMap = canvasTex(1024, 256, (g, w, h) => { g.fillStyle = '#cfc6ba'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${120 + Math.random() * 40},${70 + Math.random() * 30},${45},${Math.random() * 0.35})`; const x = Math.random() * w, y = Math.random() * h, r = Math.random() * 6; g.beginPath(); g.ellipse(x, y, r, r * (1 + Math.random() * 3), 0, 0, 7); g.fill(); } for (let i = 0; i < 70; i++) { const x = Math.random() * w; g.strokeStyle = 'rgba(120,70,45,.35)'; g.lineWidth = 2 + Math.random() * 4; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 10, Math.random() * h); g.stroke(); } });
  panMap.wrapS = THREE.RepeatWrapping;
  const pan = new THREE.Mesh(new THREE.LatheGeometry([new V2(0.45, -0.42), new V2(1.95, -0.42), new V2(2.08, -0.38), new V2(2.12, -0.05), new V2(2.2, 0.08), new V2(2.26, 0.08), new V2(2.2, -0.08), new V2(2.18, -0.45), new V2(0.45, -0.48)], 160), (TIER === 0 ? new THREE.MeshPhysicalMaterial({ map: panMap, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ map: panMap, roughness: 0.4, side: THREE.DoubleSide })));
  pan.castShadow = pan.receiveShadow = true; rig.add(pan);
  const headMap = canvasTex(1024, 1024, (g, w, h) => { g.fillStyle = '#9a9894'; g.fillRect(0, 0, w, h); for (let r = 2; r < 512; r += 1.5) { g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`; g.lineWidth = 1; g.beginPath(); g.arc(512, 512, r, 0, 7); g.stroke(); } for (let i = 0; i < 70; i++) { const a = Math.random() * 7, r = 120 + Math.random() * 380; g.fillStyle = `rgba(${110 + Math.random() * 30},${70},${46},${0.25 + Math.random() * 0.45})`; g.beginPath(); g.ellipse(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 10 + Math.random() * 60, 4 + Math.random() * 10, a + Math.PI / 2, 0, 7); g.fill(); } });
  const headRough = canvasTex(1024, 1024, (g, w, h) => { g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { const a = Math.random() * 7, r = 120 + Math.random() * 380; g.fillStyle = 'rgba(30,30,30,.6)'; g.beginPath(); g.ellipse(512 + Math.cos(a) * r, 512 + Math.sin(a) * r, 10 + Math.random() * 60, 4 + Math.random() * 10, a + Math.PI / 2, 0, 7); g.fill(); } }, false);
  const headTop = new THREE.Mesh(new THREE.CircleGeometry(1.5, 128), (TIER === 0 ? new THREE.MeshPhysicalMaterial({ map: headMap, roughness: 1, roughnessMap: headRough, metalness: 0.85, clearcoat: 0.3, clearcoatRoughness: 0.2 }) : new THREE.MeshStandardMaterial({ map: headMap, roughness: 1, roughnessMap: headRough, metalness: 0.85 })));
  headTop.rotation.x = -Math.PI / 2; headTop.receiveShadow = true;
  const headRim = new THREE.Mesh(new THREE.LatheGeometry([new V2(1.5, 0), new V2(1.54, -0.02), new V2(1.555, -0.12), new V2(1.5, -0.16), new V2(0.3, -0.18)], 160), new THREE.MeshStandardMaterial({ color: '#8d8b87', metalness: 0.9, roughness: 0.32 }));
  headRim.castShadow = true;
  const head = new THREE.Group(); head.add(headTop, headRim); rig.add(head);
  const body = new THREE.Mesh(new THREE.LatheGeometry([new V2(0.5, -0.5), new V2(1.35, -0.55), new V2(1.45, -0.8), new V2(1.45, -1.55), new V2(1.5, -1.75)], 96), new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.55, metalness: 0.5 }));
  body.castShadow = body.receiveShadow = true; rig.add(body);
  const sponge = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), new THREE.MeshStandardMaterial({ color: '#c9a35c', roughness: 1, bumpMap: canvasTex(128, 128, (g, w, h) => speckle(g, w, h, 1, '0,0,0', 2, 6), false), bumpScale: 2 }));
  sponge.scale.set(1.3, 0.55, 0.9); sponge.position.set(1.78, -0.32, 0.6); sponge.castShadow = true; rig.add(sponge);
  const ribShape = new THREE.Shape(); ribShape.moveTo(-0.28, 0); ribShape.quadraticCurveTo(0, 0.22, 0.28, 0); ribShape.quadraticCurveTo(0, 0.08, -0.28, 0);
  const rib = new THREE.Mesh(new THREE.ExtrudeGeometry(ribShape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }), new THREE.MeshStandardMaterial({ color: '#8c5a33', roughness: 0.5 }));
  rib.rotation.x = -Math.PI / 2; rib.rotation.z = 0.8; rib.position.set(-1.7, -0.4, 0.9); rib.castShadow = true; rig.add(rib);

  // the piece: outer wall and inner wall; a soft contact shadow under it
  let from = sample('lump'), to = from, cur = from, morphT = 1, sweepT = 1;
  let mats = makeMaterials('wet', 1), nextMats = null, target = null;
  const SEG = [180, 128, 96][TIER], SEG_MORPH = [96, 72, 56][TIER];
  const outerMesh = new THREE.Mesh(new THREE.LatheGeometry(cur.outer, SEG), mats.outer), innerMesh = new THREE.Mesh(new THREE.LatheGeometry(cur.inner, SEG), mats.inner);
  outerMesh.castShadow = innerMesh.castShadow = true; outerMesh.receiveShadow = innerMesh.receiveShadow = true;
  const piece = new THREE.Group(); piece.add(outerMesh, innerMesh); rig.add(piece);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactShadowTex(), transparent: true, depthWrite: false, opacity: 0.7 }));
  contact.rotation.x = -Math.PI / 2; contact.position.y = 0.004; rig.add(contact);
  mats.outer.userData.sweep.value = 99; mats.inner.userData.sweep.value = 99;

  // the parade: nine pieces on a ring in front of the lens, swept past edge to edge by scroll
  scene.add(camera);
  const parade = new THREE.Group(); camera.add(parade); parade.visible = false;
  const paradeLight = new THREE.DirectionalLight('#ffe2c0', 0); paradeLight.position.set(2, 3, 2); camera.add(paradeLight); camera.add(paradeLight.target); paradeLight.target.position.set(0, -1, -6);
  const PARADE = [['surahi', 'blue', 1], ['lantern', 'dhokra', 1], ['urn', 'terracotta', 1], ['vase', 'black', 1], ['urn', 'marble', 1], ['lantern', 'lacquer', 1], ['vase', 'blue', 1], ['candle', 'dhokra', 1], ['roll', 'kantha', 1], ['surahi', 'black', 1]];
  const paradePieces = PARADE.map(([shape, fin, v], i) => { const s = sample(shape), m = makeMaterials(fin, v), g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.LatheGeometry(s.outer, SEG_MORPH), m.outer), new THREE.Mesh(new THREE.LatheGeometry(s.inner, SEG_MORPH), m.inner)); g.userData.H = s.H; parade.add(g); return g; });
  let dipK = 0, dipGoal = 0; const moodColor = new THREE.Color('#ffdcb0'), moodRim = new THREE.Color('#a9bfff');
  let paradeK = 0, paradeP = 0, paradeGoal = 0, shot = 'hero', shotP = 0; const cam = { ...DEF, ...INTRO };

  // slip droplets flung off while throwing
  const P = 500, pPos = new Float32Array(P * 3), pVel = new Float32Array(P * 3), pLife = new Float32Array(P);
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('aLife', new THREE.BufferAttribute(pLife, 1));
  const drops = new THREE.Points(pGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uPx: { value: DPR } },
    vertexShader: `attribute float aLife; varying float vL; uniform float uPx; void main(){ vL = aLife; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = (1.5 + 3.5*aLife) * uPx * (7. / -mv.z); }`,
    fragmentShader: `varying float vL; void main(){ vec2 c = gl_PointCoord-.5; float d = length(c); if (d > .5 || vL <= 0.) discard; float spec = smoothstep(.22, .0, length(c - vec2(-.12,-.12))); gl_FragColor = vec4(mix(vec3(.42,.26,.16), vec3(1.,.9,.8), spec*.8), smoothstep(.5,.3,d) * min(1., vL*2.)); }` }));
  drops.frustumCulled = false; rig.add(drops);
  let pNext = 0;
  const radiusAt = (s, y) => { for (let i = 1; i < s.outer.length; i++) if (s.outer[i].y >= y) return s.outer[i].x; return s.outer[s.outer.length - 1].x; };
  function emit(n) { for (let k = 0; k < n; k++) { const i = pNext++ % P, a = Math.random() * Math.PI * 2, y = Math.random() * cur.H, r = radiusAt(cur, y) + 0.02; pPos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3); const sp = 1.8 + Math.random() * 2.4; pVel.set([-Math.sin(a) * sp + Math.cos(a) * 0.6, 0.8 + Math.random() * 1.5, Math.cos(a) * sp + Math.sin(a) * 0.6], i * 3); pLife[i] = 1; } }

  // post: multisampled HDR target, depth of field, a little bloom, then grain, vignette and grade
  const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: TIER === 0 ? 4 : 0 });
  const composer = new EffectComposer(renderer, rt); composer.setPixelRatio(DPR);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 8, aperture: 0.0016, maxblur: 0.009 }); bokeh.enabled = TIER === 0; composer.addPass(bokeh);
  const bloomPass = new UnrealBloomPass(new V2(innerWidth, innerHeight), 0.26, 0.55, 0.95); bloomPass.enabled = TIER < 2; composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const film = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uFade; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime*7.)*43758.5453); }
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
        c = pow(c, vec3(1.04, 1.0, .97));                                   // a warm print grade
        c = mix(c, c*c*(3.-2.*c), .18);                                    // gentle S-curve
        float v = smoothstep(1.1, .25, length((vUv-.5)*vec2(1.25, 1.)));    // vignette
        c *= mix(.55, 1., v);
        c += (h(vUv*vec2(1920.,1080.)) - .5) * .035;                        // grain
        gl_FragColor = vec4(c * uFade, 1.); }` });
  composer.addPass(film);
  const shade = document.createElement('div'); shade.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;background:#000;opacity:0'; canvasEl.after(shade);

  function applyTier(t) {
    TIER = t; DPR = Math.min(devicePixelRatio || 1, [1.5, 1.25, 1][t]);
    renderer.setPixelRatio(DPR); composer.setPixelRatio(DPR);
    bokeh.enabled = t === 0; bloomPass.enabled = t < 2;
    [composer.renderTarget1, composer.renderTarget2].forEach((r) => { if (r.samples) { r.samples = 0; r.dispose(); } });
    const n = [2048, 1024, 512][t]; key.shadow.mapSize.set(n, n); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    shadowFrames = 3;
    if (t === 2) { renderer.shadowMap.type = THREE.PCFShadowMap; dust.visible = false; shelfPieces.forEach((m, i) => { m.visible = i % 2 === 0; }); }
    composer.setSize(innerWidth, innerHeight);
  }
  let perfSince = 0, perfSum = 0, perfN = 0;

  // ---------- behaviour ----------
  let showing = null, side = 0, sideX = 2.2, rigX = 0, spinV = 0, dragging = false, lastX = 0, active = true, introStart = -1, readyCb = null, readyFired = false, firstCb = null;
  const look = new THREE.Vector3(0, 1, 0), camPos = new THREE.Vector3(0.6, 0.9, 2.4), lookGoal = new THREE.Vector3(), camGoal = new THREE.Vector3();
  let mx = 0, my = 0;
  addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; } if (dragging) { spinV += (e.clientX - lastX) * 0.003; lastX = e.clientX; } }, { passive: true });
  addEventListener('pointerup', () => { dragging = false; });

  function show(item, opts = {}) {
    const k = item.shape + '|' + item.finish + '|' + (item.variant || 1); if (showing === k) return; showing = k;
    from = cur; to = sample(item.shape); morphT = 0; sweepT = -1; target = item;
    nextMats = makeMaterials(item.finish, item.variant || 1); nextMats.outer.userData.sweep.value = -1; nextMats.inner.userData.sweep.value = -1;
    mats.outer.userData.sweep.value = -1; mats.inner.userData.sweep.value = -1;   // back to wet clay before re-throwing
    emit(opts.quiet ? 20 : 140);
  }
  function rebuild(s, seg = SEG_MORPH) { outerMesh.geometry.dispose(); innerMesh.geometry.dispose(); outerMesh.geometry = new THREE.LatheGeometry(s.outer, seg); innerMesh.geometry = new THREE.LatheGeometry(s.inner, seg); }
  const mixPts = (a, b, e, H) => a.map((p, i) => { const q = b[i], y = Math.max(p.y, q.y) / H, t = Math.min(1, Math.max(0, e * 1.45 - y * 0.45)), k = t * t * (3 - 2 * t); return new V2(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k); });

  function resize() { camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 38 : 28; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); }
  addEventListener('resize', resize); resize();

  let last = performance.now(), time = 0;
  function frame() {
    requestAnimationFrame(frame);
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (!active) return;
    if (introStart < 0) { introStart = now; firstCb && firstCb(); }
    const it = (now - introStart) / 1000;
    // watch the frame rate once things have settled; step down a tier if this machine is struggling
    if (it > 4 && TIER < 2 && !document.hidden) { if (!perfSince) perfSince = now; perfSum += dt; perfN++; if (now - perfSince > 2500) { if (perfSum / perfN > 0.024) { applyTier(TIER + 1); } perfSince = now; perfSum = 0; perfN = 0; } }
    // opening: dark, then the lamp flickers on, then the beam and dust settle in
    const lampOn = it < 0.6 ? 0 : it < 0.75 ? 0.6 : it < 0.85 ? 0.1 : it < 1.0 ? 0.9 : Math.min(1, 0.9 + (it - 1) * 0.3);
    key.intensity = 58 * lampOn; beamMat.uniforms.uK.value = lampOn; dust.material.uniforms.uK.value = lampOn;
    bulbs.forEach((b, i) => { b.material.color.setScalar(0).add(new THREE.Color('#ffb46a').multiplyScalar(9 * Math.min(1, Math.max(0, (it - 1.6 - i * 0.25) * 2)))); });
    const morphDip = morphT < 1 ? Math.sin(Math.PI * morphT) * 0.32 : 0; dipK += (Math.max(dipGoal, morphDip) - dipK) * Math.min(1, dt * 4);
    film.uniforms.uFade.value = Math.min(1, it / 0.5) * (1 - dipK); film.uniforms.uTime.value = time;
    key.color.lerp(moodColor, Math.min(1, dt * 1.4)); rim.color.lerp(moodRim, Math.min(1, dt * 1.4));
    if (!readyFired && it > 2.2) { readyFired = true; readyCb && readyCb(); }

    // re-throw: shape rises from the foot, then the glaze climbs from the foot
    if (morphT < 1) {
      morphT = Math.min(1, morphT + dt / 1.9); const e = morphT < 0.5 ? 4 * morphT ** 3 : 1 - Math.pow(-2 * morphT + 2, 3) / 2, H = Math.max(from.H, to.H);
      cur = { outer: mixPts(from.outer, to.outer, e, H), inner: mixPts(from.inner, to.inner, e, H), H: from.H + (to.H - from.H) * e, R: to.R, base: from.base + (to.base - from.base) * e };
      rebuild(cur); if (morphT < 0.75 && Math.random() < 0.7) emit(2);
      if (morphT === 1) { cur = to; rebuild(cur, SEG); mats.outer.dispose(); mats.inner.dispose(); mats = nextMats; nextMats = null; outerMesh.material = mats.outer; innerMesh.material = mats.inner; sweepT = 0; }
    } else if (sweepT >= 0 && sweepT < 1) {
      sweepT = Math.min(1, sweepT + dt / 1.1); const y = -0.1 + sweepT * (cur.H + 0.3);
      mats.outer.userData.sweep.value = y; mats.inner.userData.sweep.value = y;
      if (sweepT === 1) { mats.outer.userData.sweep.value = 99; mats.inner.userData.sweep.value = 99; }
    }
    contact.scale.setScalar(Math.max(0.6, cur.base) * 2.9);
    if (morphT < 1 || (sweepT >= 0 && sweepT < 1)) shadowFrames = 2; if (shadowFrames > 0) { renderer.shadowMap.needsUpdate = true; shadowFrames--; }

    spinV *= Math.pow(0.05, dt);
    const throwing = morphT < 1, turn = ((throwing ? 4.2 : 0.42) + spinV * 60) * dt;
    piece.rotation.y += turn; head.rotation.y += turn;
    for (let i = 0; i < P; i++) { if (pLife[i] <= 0) continue; pVel[i * 3 + 1] -= 9.8 * dt; pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt; if (pPos[i * 3 + 1] < -0.4) { pPos[i * 3 + 1] = -0.4; pVel[i * 3] = pVel[i * 3 + 2] = pVel[i * 3 + 1] = 0; } pLife[i] -= dt * 0.45; }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aLife.needsUpdate = true;
    beamMat.uniforms.uTime.value = time; dust.material.uniforms.uTime.value = time;

    // framing: hero is centred; craft chapters push the wheel beside the copy; phones keep it above the copy
    // ---------- the shot list: every chapter has its own camera move, scrubbed by scroll ----------
    const narrow = camera.aspect < 0.8;
    const S = SHOTS[shot] || SHOTS.hero, A = S[0], B = S[1], kk = shotP * shotP * (3 - 2 * shotP), goal = {};
    for (const p of ['az', 'el', 'd', 'fov', 'roll', 'ly']) { const a = A[p] ?? DEF[p], b = B[p] ?? DEF[p]; goal[p] = a + (b - a) * kk; }
    goal.ox = narrow ? 0 : side * (S.ox ?? 0.17); goal.oy = narrow ? (shot === 'hero' ? -0.27 : -0.2) : 0;
    const intro = Math.min(1, Math.max(0, (it - 0.5) / 3.6)), ie = 1 - Math.pow(1 - intro, 3);
    if (ie < 1) for (const p in INTRO) goal[p] = INTRO[p] + (goal[p] - INTRO[p]) * ie;
    const damp = ie < 1 ? 1 : Math.min(1, dt * 1.6);
    for (const p in goal) { let d = goal[p] - cam[p]; if (p === 'az') d = ((d + 540) % 360) - 180; cam[p] += d * damp; }
    // parade: the wheel steps back; the ring of pieces sweeps past the lens
    paradeK += (paradeGoal - paradeK) * Math.min(1, dt * 3); parade.visible = paradeK > 0.01; piece.visible = contact.visible = drops.visible = paradeK < 0.5;
    paradeLight.intensity = 2.6 * paradeK;
    if (parade.visible) paradePieces.forEach((g, i) => {
      const a = i / paradePieces.length * Math.PI * 2 - paradeP * Math.PI * 2.4 + 0.3, Rr = narrow ? 2.6 : 3.3;
      g.position.set(Math.sin(a) * Rr * (narrow ? 1.1 : 1.7), -g.userData.H * 0.5 - 0.1 + Math.cos(a * 2) * 0.1, -7.6 + Math.cos(a) * Rr);
      g.rotation.y = time * 0.35 + i; g.scale.setScalar(paradeK * (narrow ? 0.85 : 1.15));
    });
    rig.position.x = 0;
    const H = cur.H, R = Math.max(cur.R, 0.7), fit = Math.max(H * 0.5 + 0.3, R * 1.05 + 0.2);
    const fov = cam.fov * (narrow ? 1.3 : 1); if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const dist = fit / Math.tan(fov * Math.PI / 360) * cam.d * (narrow ? (shot === 'hero' ? 1.75 : 1.4) : 1);
    const az = (cam.az + mx * 7 + Math.sin(time * 0.7) * 0.5 + Math.sin(time * 1.9) * 0.2) * Math.PI / 180;
    const el = (cam.el - my * 5 + Math.sin(time * 0.5 + 1) * 0.35) * Math.PI / 180;
    look.set(0, H * cam.ly, 0);
    camera.position.set(look.x + Math.sin(az) * Math.cos(el) * dist, look.y + Math.sin(el) * dist, look.z + Math.cos(az) * Math.cos(el) * dist);
    camera.position.y = Math.max(camera.position.y, 0.25);
    camera.lookAt(look); camera.rotateZ(cam.roll * Math.PI / 180);
    camera.setViewOffset(innerWidth, innerHeight, -cam.ox * innerWidth, cam.oy * innerHeight, innerWidth, innerHeight);
    if (bokeh.enabled) { const f = camera.position.distanceTo(look); bokeh.uniforms.focus.value = f + (4.4 - f) * paradeK; bokeh.uniforms.aperture.value = (narrow ? 0.0009 : 0.0016) * (1 + paradeK * 0.6) * (cam.fov < 24 ? 1.5 : 1); }
    if (TIER === 2) { renderer.render(scene, camera); const o = (1 - film.uniforms.uFade.value).toFixed(3); if (shade.style.opacity !== o) shade.style.opacity = o; }
    else { if (shade.style.opacity !== '0') shade.style.opacity = '0'; composer.render(); }
  }
  {
    const warm = new THREE.Group(); scene.add(warm);
    Object.keys(FIN).forEach((f, i) => { const m = makeMaterials(f, 1), g = new THREE.SphereGeometry(0.1, 8, 6); const a = new THREE.Mesh(g, m.outer), b = new THREE.Mesh(g, m.inner); a.position.set(i * 0.01, -50, 0); b.position.copy(a.position); warm.add(a, b); [m.outer.map, m.outer.normalMap, m.outer.roughnessMap].forEach((t) => t && renderer.initTexture(t)); });
    camera.position.set(0, 2, 8); camera.lookAt(0, 1, 0); renderer.compile(scene, camera);
    composer.render(); scene.remove(warm);
  }
  requestAnimationFrame(frame);

  return {
    show, setSide(s) { side = s; }, setActive(a) { active = a; }, beginDrag(x) { dragging = true; lastX = x; },
    setShot(s, p = 0) { shot = s; shotP = Math.min(1, Math.max(0, p)); const m = MOODS[s] || MOODS.hero; moodColor.set(m[0]); moodRim.set(m[1]); },
    setDip(k) { dipGoal = Math.min(0.85, Math.max(0, k)); }, setParade(p, on) { paradeP = p; paradeGoal = on ? 1 : 0; },
    onReady(cb) { readyCb = cb; if (readyFired) cb(); },
    onFirstFrame(cb) { firstCb = cb; if (introStart >= 0) cb(); },
    get tier() { return TIER; },
  };
}

// ---------- product photographs: a seamless linen sweep, a softbox, the same models ----------
export async function photograph(items, size = 560) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const r = new THREE.WebGLRenderer({ canvas: c, antialias: true, preserveDrawingBuffer: true });
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e7dccb'); scene.environment = studioEnvironment(r, 'light');
  // cyclorama: floor curving up into the back wall, no horizon
  const prof = []; for (let k = 0; k <= 40; k++) { const t = k / 40; if (t < 0.45) prof.push([6 - t / 0.45 * 7, 0]); else if (t < 0.8) { const a = (t - 0.45) / 0.35 * Math.PI / 2; prof.push([-1 - Math.sin(a) * 3, 3 - Math.cos(a) * 3]); } else prof.push([-4, 3 + (t - 0.8) / 0.2 * 9]); }
  const pos = [], idx = []; prof.forEach(([z, y], k) => { pos.push(-20, y, z, 20, y, z); if (k) { const a = (k - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeVertexNormals();
  const cyc = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: '#efe5d6', roughness: 1, side: THREE.DoubleSide })); cyc.receiveShadow = true; scene.add(cyc);
  scene.add(new THREE.HemisphereLight('#fff6ea', '#bfae98', 0.9));
  const key = new THREE.SpotLight('#fff1de', 55, 0, 0.5, 0.95, 1); key.position.set(3, 7, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 10; key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; scene.add(key); scene.add(key.target); key.target.position.set(0, 0.6, 0);
  const fill = new THREE.DirectionalLight('#ffe3c4', 0.6); fill.position.set(-5, 3, 3); scene.add(fill);
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: contactShadowTex(), transparent: true, depthWrite: false, opacity: 0.5 })); contact.rotation.x = -Math.PI / 2; contact.position.y = 0.003; scene.add(contact);
  const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 60), out = {};
  for (const it of items) {
    const s = sample(it.shape), m = makeMaterials(it.finish, it.variant || 1), g = new THREE.Group();
    const o = new THREE.Mesh(new THREE.LatheGeometry(s.outer, 200), m.outer), n = new THREE.Mesh(new THREE.LatheGeometry(s.inner, 200), m.inner); o.castShadow = n.castShadow = true; g.add(o, n); g.rotation.y = (it.variant || 1) * 0.9 + 0.4; scene.add(g);
    contact.scale.setScalar(s.base * 2.9);
    const fit = Math.max(s.H * 0.62 + 0.3, s.R * 1.18 + 0.25), d = fit / Math.tan(13 * Math.PI / 180);
    cam.position.set(d * 0.2, s.H * 0.5 + d * 0.3, d); cam.lookAt(0, s.H * 0.43, 0);
    r.render(scene, cam); out[it.id] = c.toDataURL('image/webp', 0.84);
    scene.remove(g); o.geometry.dispose(); n.geometry.dispose(); m.outer.dispose(); m.inner.dispose();
    await new Promise((res) => setTimeout(res, 0));
  }
  r.dispose(); r.forceContextLoss();
  return out;
}
