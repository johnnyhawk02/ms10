// AudioWorkletProcessor: MS-10 VCO (saw) -> VCF. Load with addModule('dsp/ms10-voice-processor.js'), node name 'ms10-voice'.
// The VCO's sawtooth reset is band-limited with a polyBLEP (one sample of latency).
// Not modelled yet: the waveform shaper / PW comparator (IC6). The saw reaches the VCF as on the schematic:
// C23 coupling cap, R78 4k7 / R79 6k8 divider, SW-2's R80 43k, then R57 12k into R59 47R (|| R56 4k7).
// Output is IC7's output after C19, the signal the MS-10 passes on to the VCA.
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
      { name: 'level', defaultValue: 1, minValue: 0, maxValue: 4, automationRate: 'k-rate' },     // 1 = the real saw level
      { name: 'outputScale', defaultValue: 2, minValue: 0, maxValue: 50, automationRate: 'k-rate' },
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
    // Thevenin of the R78/R79 divider (gain 6.8/11.5, 2.78k) in series with R80 43k, folded into the
    // VCF model's R57 input: scale = (R57 + Rsh) / (Rth + R80 + R57 + Rsh).
    const rsh = 1 / (1 / 47 + 1 / 4700), rth = 4700 * 6800 / 11500;
    const lvl = P.level[0] * (6.8 / 11.5) * (12000 + rsh) / (rth + 43000 + 12000 + rsh), os = P.outputScale[0];
    for (let i = 0; i < out.length; i++) {
      let cur = vco.tick(), prev = this.prevX;
      if (vco.reset >= 0) {                       // upward step of J at (1 - d) into this sample interval
        const d = 1 - vco.reset, J = vco.xHigh - vco.xLow;
        prev += J * d * d / 2; cur -= J * (1 - d) * (1 - d) / 2;
      }
      this.prevX = cur;
      const saw = vco._follower(prev);
      this.dc += this.dcA * (saw - this.dc);
      vcf.tick(lvl * (saw - this.dc));
      out[i] = os * vcf.ic7;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('ms10-voice', MS10VoiceProcessor);
