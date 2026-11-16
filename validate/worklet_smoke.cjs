// Renders 1 s of each AudioWorklet in headless Chromium and checks for NaN / silence. Usage: node validate/worklet_smoke.cjs .
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = path.resolve(process.argv[2] || '.');
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<html></html>'); }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f)); }).listen(8123);
(async () => { const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('http://localhost:8123/index.html');
  const res = await p.evaluate(async () => {
    const stats = (d) => { let mx = 0, nan = 0; for (const v of d) { if (!isFinite(v)) nan++; mx = Math.max(mx, Math.abs(v)); } return { mx, nan }; };
    const r = {};
    { const ctx = new OfflineAudioContext(1, 48000, 48000); await ctx.audioWorklet.addModule('dsp/ms10-vcf-processor.js');
      const n = new AudioWorkletNode(ctx, 'ms10-vcf'); n.parameters.get('peak').value = 0.75;
      const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 110 }); o.connect(n).connect(ctx.destination); o.start();
      const t0 = performance.now(); r.vcf = stats((await ctx.startRendering()).getChannelData(0)); r.vcf.ms = performance.now() - t0; }
    { const ctx = new OfflineAudioContext(1, 48000, 48000); await ctx.audioWorklet.addModule('dsp/ms10-voice-processor.js');
      const n = new AudioWorkletNode(ctx, 'ms10-voice', { numberOfInputs: 0 }); n.parameters.get('peak').value = 0.8; n.connect(ctx.destination);
      const t0 = performance.now(); r.voice = stats((await ctx.startRendering()).getChannelData(0)); r.voice.ms = performance.now() - t0; }
    return r; });
  console.log(JSON.stringify(res)); await b.close(); srv.close();
  if (res.vcf.nan || res.voice.nan || res.vcf.mx < 1e-3 || res.voice.mx < 1e-3) process.exit(1); })();
