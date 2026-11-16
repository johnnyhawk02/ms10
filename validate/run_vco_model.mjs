// Run the JS VCO on the ngspice cases (spice/out/vco/spice_vco.json); writes validate/out/vco_model.json
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { MS10VCO } from '../dsp/ms10-vco-core.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const S = JSON.parse(fs.readFileSync(path.join(here, '..', 'spice', 'out', 'vco', 'spice_vco.json')));
const fsr = 48000, out = [];
for (const c of S) {
  const m = new MS10VCO(fsr); m.set(c.kbd, c.foot, c.ic1);
  const n = Math.round(fsr * Math.max(1.0, 40 / (c.freq || 100)));
  const xs = new Float64Array(n), ss = new Float64Array(n), resets = [];
  for (let i = 0; i < n; i++) { xs[i] = m.tick(); ss[i] = m.saw(); if (m.reset >= 0) resets.push(i - 1 + m.reset); }
  const per = (resets[resets.length - 1] - resets[1]) / (resets.length - 2) / fsr;
  let xmin = Infinity, xmax = -Infinity, smin = Infinity, smax = -Infinity;
  for (let i = Math.ceil(resets[1]) + 1; i < n; i++) { xmin = Math.min(xmin, xs[i]); xmax = Math.max(xmax, xs[i]); smin = Math.min(smin, ss[i]); smax = Math.max(smax, ss[i]); }
  const r = { name: c.name, freq: 1 / per, xLow: m.xLow, xHigh: m.xHigh, xmin, xmax, smin, smax };
  if (c.wave) {  // 3 periods starting at the first downward mid-level crossing after reset 1
    const mid = 0.5 * (m.xLow + m.xHigh), i0 = Math.ceil(resets[1]);
    let k = i0; while (!(xs[k] > mid && xs[k + 1] <= mid)) k++;
    const t0 = (k + (xs[k] - mid) / (xs[k] - xs[k + 1])) / fsr;
    const np = Math.ceil(3 / r.freq * fsr);
    r.wave = { t: Array.from({ length: np }, (_, j) => (k + 1 + j) / fsr - t0), x: Array.from(xs.slice(k + 1, k + 1 + np)), s: Array.from(ss.slice(k + 1, k + 1 + np)),
               resets: resets.filter((q) => q > k).map((q) => (q + 1) / fsr - t0) };
  }
  out.push(r);
}
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
fs.writeFileSync(path.join(here, 'out', 'vco_model.json'), JSON.stringify(out));
for (const r of out) console.log(r.name, r.freq.toFixed(3), r.xmin.toFixed(4), r.xmax.toFixed(4), r.smin.toFixed(4), r.smax.toFixed(4));
