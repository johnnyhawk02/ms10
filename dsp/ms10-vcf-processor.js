// AudioWorkletProcessor wrapping the MS-10 VCF model.
// Load with: await ctx.audioWorklet.addModule('dsp/ms10-vcf-processor.js')
// inputScale: volts at R57 for a full-scale (1.0) input sample. The MS-10 VCO reaches R57 through R80 43k or
//   R81 330k, which is equivalent to a few hundred millivolts here.
// outputScale: gain from IC7's output (after C19, the signal sent to the VCA) back to audio full scale.
// cutoff: self-oscillation frequency in Hz (500 Hz = cutoff knob at 5 per the adjustment procedure).
import { MS10VCF } from './ms10-vcf-core.js';

class MS10VCFProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'cutoff', defaultValue: 500, minValue: 20, maxValue: 20000, automationRate: 'k-rate' },
      { name: 'cv', defaultValue: 0, minValue: -10, maxValue: 10, automationRate: 'a-rate' }, // added V/oct
      { name: 'peak', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'inputScale', defaultValue: 0.4, minValue: 0, maxValue: 20, automationRate: 'k-rate' },
      { name: 'outputScale', defaultValue: 2, minValue: 0, maxValue: 50, automationRate: 'k-rate' },
    ];
  }
  constructor(options) {
    super();
    this.ch = [];
    this.opts = (options && options.processorOptions) || {};
  }
  process(inputs, outputs, params) {
    const input = inputs[0], output = outputs[0];
    const n = output[0] ? output[0].length : 128;
    const baseCV = Math.log2(params.cutoff[0] / 500);
    const cvA = params.cv, cvRate = cvA.length > 1;
    const inS = params.inputScale[0], outS = params.outputScale[0];
    for (let c = 0; c < output.length; c++) {
      const f = this.ch[c] || (this.ch[c] = new MS10VCF(sampleRate, this.opts));
      f.setPeak(params.peak[0]);
      const inp = input[c] || input[0];
      const out = output[c];
      for (let i = 0; i < n; i++) {
        if (cvRate || i === 0) f.setCV(baseCV + cvA[cvRate ? i : 0]);
        f.tick(inp ? inS * inp[i] : 0);
        out[i] = outS * f.ic7;
      }
    }
    return true;
  }
}
registerProcessor('ms10-vcf', MS10VCFProcessor);
