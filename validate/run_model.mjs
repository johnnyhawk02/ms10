// Run the JS model on the same stimuli as spice/run_spice.py; writes validate/out/*.json
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { MS10VCF } from '../dsp/ms10-vcf-core.js';
const here = path.dirname(fileURLToPath(import.meta.url));
const sp = path.join(here, '..', 'spice', 'out');
const P = JSON.parse(fs.readFileSync(path.join(here, '..', 'spice', 'params.json')));
const D = JSON.parse(fs.readFileSync(path.join(sp, 'derived.json')));
const fs_ = P.fs; const out = path.join(here, 'out'); fs.mkdirSync(out, { recursive: true });

// Small-signal frequency response: 50 mV sine (5 mV near self-oscillation, where the peak amp's diodes
// would otherwise start to conduct), from the DC operating point, settle then correlate.
function acResponse(cv, pk, freqs) {
  const m0 = new MS10VCF(fs_); m0.setCV(cv); m0.setPeak(pk); m0.settle(); const st = m0.getState();
  return freqs.map((f) => {
    const m = new MS10VCF(fs_); m.setCV(cv); m.setPeak(pk); m.setState(st);
    const A = pk > 0.3 ? 0.005 : 0.05, settle = Math.ceil(0.15 * fs_), cyc = Math.max(8, Math.round(f * 0.05));
    const meas = Math.round(cyc * fs_ / f);
    let re = 0, im = 0;
    for (let i = 0; i < settle + meas; i++) {
      const y = m.tick(A * Math.sin(2 * Math.PI * f * i / fs_));
      if (i >= settle) { const ph = 2 * Math.PI * f * i / fs_; re += y * Math.sin(ph); im += y * Math.cos(ph); }
    }
    return 20 * Math.log10(2 * Math.hypot(re, im) / meas / A);
  });
}
const freqs = []; for (let i = 0; i <= 120; i++) freqs.push(20 * Math.pow(1000, i / 120)); // 20 Hz .. 20 kHz, 40/decade like the .ac run
const res = { fs: fs_, ac: {}, tran: {} };
for (const [cv, pk] of D.ac_cases) res.ac[`ac_cv${cv}_peak${pk}`] = { freqs, db: acResponse(cv, pk, freqs) };
for (const [name, cv, pk] of D.tran_cases) {
  const txt = fs.readFileSync(path.join(sp, name + '_in.txt'), 'utf8').trim().split('\n');
  const x = txt.map((l) => parseFloat(l.split(' ')[1]));
  const m = new MS10VCF(fs_); m.setCV(cv); m.setPeak(pk); m.settle();
  const t0 = performance.now(); const ic7 = [];
  const y = x.concat([x[x.length-1]]).map((v) => { const r = m.tick(v); ic7.push(m.ic7); return r; }).slice(1); ic7.shift(); // drop 1-sample latency
  const dt = performance.now() - t0;
  res.tran[name] = { y, ic7, msPerSecondAudio: dt / (x.length / fs_) };
}
fs.writeFileSync(path.join(out, 'model.json'), JSON.stringify(res));
console.log('ok');
