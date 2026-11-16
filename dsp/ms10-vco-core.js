// Korg MS-10 VCO - component-level DSP model. Mirrors spice/ms10_vco.lib.
//
//   Iin  = Vkbd / Rscale                     IC4 holds TR4-left's collector at virtual ground; Rscale = 100k x n
//                                            (footage 4' 100k, 8' 200k, 16' 400k, 32' 800k). Keyboard CV is Hz/V.
//   Vbl  = Vic1 * R8 / (R8 + R10)            IC1 output (pitch knob, MG, EG, EXT FM summer) into TR4-left base
//   Iout = Iin * exp(-Vbl / VT) * early      TR4 matched pair; early = Early-effect ratio (TR4-right sits on the
//                                            F1 K30A cascode source, TR4-left at 0 V)
//   C1 dX/dt = -Iout                         C1 6200p from +15 V to X: X ramps down
//   X <= Xlow  ->  X = Xhigh                 TR1/TR2 latch + TR3/R73/R75 reference resets X in ~0.3 us
//   saw  = F3 K30A(GR) source follower of X into R77 10k (JFET square law, solved per sample)
//
// Xlow(I) and Xhigh(I) are the latch's trip and release levels. They move by a few mV with current;
// the curves below were extracted from the ngspice sweep (8' keyboard sweep only) and checked on other cases.

const K_B = 1.380649e-23, Q_E = 1.602176634e-19;

export const VCO_DEFAULTS = {
  C1: 6200e-12, R8: 100, R10: 5110, R12: 33000, R77: 10000, V18: 18, unitR: 100e3,
  VAF: 150, IS: 1e-14,
  F1: { VTO: -0.6, BETA: 1.4e-3 }, F3: { VTO: -1.5, BETA: 1.8e-3, LAMBDA: 2e-3 },
  xLowInf: 7.4911, xLowK: 3.5e-8,      // Xlow  = xLowInf + xLowK / Iout
  xHigh0: 13.5893, xHighK: 20,         // Xhigh = xHigh0 - xHighK * Iout
  tempC: 27,
};
export const FOOTAGE = { "4'": 1, "8'": 2, "16'": 4, "32'": 8 };

export class MS10VCO {
  constructor(sampleRate, opts = {}) {
    this.p = { ...VCO_DEFAULTS, ...opts };
    this.VT = K_B * (this.p.tempC + 273.15) / Q_E;
    this.dt = 1 / sampleRate;
    this.x = this.p.xHigh0; this.vs = 12; this.blep = 0;
    this.kbd = 1; this.foot = 2; this.ic1 = 0;
    this._update();
  }
  setKbd(v) { this.kbd = v; this._update(); }
  setFootage(f) { this.foot = typeof f === 'string' ? FOOTAGE[f] : f; this._update(); }
  setIC1(v) { this.ic1 = v; this._update(); }
  set(kbd, foot, ic1) { this.kbd = kbd; this.foot = typeof foot === 'string' ? FOOTAGE[foot] : foot; this.ic1 = ic1; this._update(); }

  _update() {
    const P = this.p, VT = this.VT;
    const iin = Math.max(this.kbd, 0) / (P.unitR * this.foot);
    const vbl = this.ic1 * P.R8 / (P.R8 + P.R10);
    let iout = iin * Math.exp(-vbl / VT);
    if (iin > 0) {
      // Early effect: emitters at Vbl - VbeL; left collector at 0 V, right collector at F1's source (-Vgs)
      const ve = vbl - VT * Math.log(iin / P.IS);
      const vcr = -(P.F1.VTO + Math.sqrt(iout / P.F1.BETA));
      iout *= (1 + (vcr - ve) / P.VAF) / (1 + (0 - ve) / P.VAF);
    }
    this.iout = iout;
    this.rate = iout / P.C1;                                  // volts per second, falling
    this.xLow = iout > 0 ? P.xLowInf + P.xLowK / iout : P.xLowInf;
    this.xHigh = P.xHigh0 - P.xHighK * iout;
  }

  // F3 source follower: Vs/R77 = BETA (X - Vs - VTO)^2 (1 + LAMBDA (V18 - Vs))
  _follower(x) {
    const P = this.p, f = P.F3; let vs = this.vs;
    for (let i = 0; i < 6; i++) {
      const vov = x - vs - f.VTO, cl = 1 + f.LAMBDA * (P.V18 - vs);
      const g = f.BETA * vov * vov * cl - vs / P.R77;
      const dg = -2 * f.BETA * vov * cl - f.BETA * vov * vov * f.LAMBDA - 1 / P.R77;
      const d = g / dg; vs -= d; if (Math.abs(d) < 1e-9) break;
    }
    this.vs = vs; return vs;
  }

  // Advance one sample. Returns X (ramp node). this.reset holds the fractional reset position (or -1).
  tick() {
    const drop = this.rate * this.dt;
    let x = this.x - drop;
    this.reset = -1;
    if (x <= this.xLow && drop > 0) {
      const frac = (this.x - this.xLow) / drop;              // when in this sample X hit the trip level
      x = this.xHigh - (1 - frac) * drop;
      this.reset = frac;
      if (x <= this.xLow) x = this.xHigh;                     // above ~half the sample rate: clamp
    }
    this.x = x;
    return x;
  }
  // Naive (point-sampled) saw at F3's source.
  saw() { return this._follower(this.x); }
}

