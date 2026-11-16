const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const root = process.argv[2];
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); 
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(200, {'content-type':'text/html'}); return r.end('<html></html>'); }
  r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f)); }).listen(8123);
(async () => { const b = await chromium.launch(); const p = await b.newPage(); p.on('console', m => console.log('console:', m.text()));
  await p.goto('http://localhost:8123/index.html');
  const res = await p.evaluate(async () => { const ctx = new OfflineAudioContext(1, 48000, 48000);
    await ctx.audioWorklet.addModule('dsp/ms10-vcf-processor.js');
    const n = new AudioWorkletNode(ctx, 'ms10-vcf'); n.parameters.get('peak').value = 0.75;
    const o = new OscillatorNode(ctx, { type: 'sawtooth', frequency: 110 }); o.connect(n).connect(ctx.destination); o.start();
    const t0 = performance.now(); const buf = await ctx.startRendering(); const d = buf.getChannelData(0);
    let mx = 0, nan = 0; for (const v of d) { if (!isFinite(v)) nan++; mx = Math.max(mx, Math.abs(v)); }
    return { mx, nan, ms: performance.now() - t0 }; });
  console.log(JSON.stringify(res)); await b.close(); srv.close(); })();
