// AudioWorkletProcessor: MS-10 VCO (saw) -> VCF. Load with addModule('dsp/ms10-voice-processor.js'), node name 'ms10-voice'.
// The VCO's sawtooth reset is band-limited with a polyBLEP (one sample of latency).
// Not modelled yet: the waveform shaper / PW comparator (IC6) and SW-2; the saw goes to the VCF via the
// C23 coupling cap and the R78/R79 divider, then R57.
import { MS10VCO } from './ms10-vco-core.js';
import { MS10VCF } from './ms10-vcf-core.js';

class MS10VoiceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'kbd', defaultValue: 1, minValue: 0, maxValue: 10, automationRate: 'k-rate' },      // keyboard CV, Hz/V
      { name: 'footage', defaultValue: 2, minValue: 1, maxValue: 8, automationRate: 'k-rate' },   // 1=4' 2=8' 4=16' 8=32'
      { name: 'ic1', defaultValue: 0, minValue: -5, maxValue: 5, automationRate: 'k-rate' },      // expo summer output, V
      { name: 'cutoff', defaultValue: 500, minValue: 20, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'peak', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'level', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'k-rate' },     // scales the saw into R57
      { name: 'outputScale', defaultValue: 40, minValue: 0, maxValue: 1000, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.vco = new MS10VCO(sampleRate); this.vcf = new MS10VCF(sampleRate);
    this.prevX = this.vco.x; this.dc = 11.3; this.dcA = 1 - Math.exp(-2 * Math.PI * 1.4 / sampleRate); // C23 into R78+R79
  }
  process(inputs, outputs, P) {
    const out = outputs[0][0]; if (!out) return true;
    const vco = this.vco, vcf = this.vcf;
    vco.set(P.kbd[0], P.footage[0], P.ic1[0]);
    vcf.setCV(Math.log2(P.cutoff[0] / 500));
    vcf.setPeak(P.peak[0]);
    const lvl = P.level[0] * 6.8 / 11.5, os = P.outputScale[0];
    for (let i = 0; i < out.length; i++) {
      let cur = vco.tick(), prev = this.prevX;
      if (vco.reset >= 0) {                       // upward step of J at (1 - d) into this sample interval
        const d = 1 - vco.reset, J = vco.xHigh - vco.xLow;
        prev += J * d * d / 2; cur -= J * (1 - d) * (1 - d) / 2;
      }
      this.prevX = cur;
      const saw = vco._follower(prev);
      this.dc += this.dcA * (saw - this.dc);
      out[i] = os * vcf.tick(lvl * (saw - this.dc));
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('ms10-voice', MS10VoiceProcessor);
