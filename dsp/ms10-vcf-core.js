// Korg MS-10 VCF (IC16 KORG35 + external parts) - component-level DSP model.
// Mirrors spice/korg35_vcf.lib. Real external values from the service manual; KORG35 internals assumed
// (two BJT diff-pair transconductors, unity output buffer, matched-pair expo converter).
//
// States: q1 = voltage on C12 (V1 - Vf), v2 = voltage on C13 (= pin 7 output), vc = voltage on C15.
//   Vp   = Vin * atten                               (R57 12k into R59 47R || R56 4k7)
//   I1   = alpha*Iabc*tanh((Vp - V1)/2VT),  V1 = q1 + Vf        -> C12:  dq1/dt = I1/C12
//   I2   = alpha*Iabc*tanh((V1 - v2)/2VT)                         -> C13:  dv2/dt = I2/C13
//   Vs   = peak amp IC7 output: Vs = v2 + x,  x/R64 + 2 Is sinh(x/(N VT)) = (v2 - vC16)/R63   (D10, D11)
//   feedback network (VR13 split Ra/Rb with R62 across Ra, R61 || C15, R60) solved by KCL with C12's current I1:
//     Vf = Rp * (Vs/Rt - vc*(1/Rt + 1/Rb) + I1),   1/Rp = 1/Rt + 1/Rb + 1/R60,  Rt = Ra || R62
//     C15 dvc/dt = Vf/R60 - vc/R61 - I1
//   I1 and Vf depend on each other, solved with Newton per evaluation.
//   Iabc = Iref * 2^cv.
//   C16 (in IC7's gain leg) and C19 (output coupling) are states too; transistor base currents
//   (Ic/BF) loading the C12/C13 nodes are included, since they set the DC offset at mV signal levels.
// RK4 at `oversample` x host rate (ETDRK4 exponential integrator, needed for the stiff C15 node); input upsampled with a Catmull-Rom cubic (1 sample latency).

const K_B = 1.380649e-23, Q_E = 1.602176634e-19;

export const DEFAULTS = {
  R57: 12000, R56: 4700, R59: 47, C12: 3.3e-9, C13: 1e-9,
  R64: 270000, R63: 4700, C16: 10e-6, C19: 33e-6, R62: 2200, VR13: 10000, R61: 5600, C15: 1e-9, R60: 220,
  BF: 200, IS_diode: 2.52e-9, N_diode: 1.752, tempC: 27, fn0: 500, oversample: 4,
};

export class MS10VCF {
  constructor(sampleRate, opts = {}) {
    const p = { ...DEFAULTS, ...opts };
    this.p = p;
    this.h = 1 / (sampleRate * p.oversample);
    this.VT = K_B * (p.tempC + 273.15) / Q_E;
    this.alpha = p.BF / (p.BF + 1);
    this.Iref = 2 * Math.PI * p.fn0 * Math.sqrt(p.C12 * p.C13) * 2 * this.VT / this.alpha;
    const rsh = 1 / (1 / p.R59 + 1 / p.R56);
    this.atten = rsh / (p.R57 + rsh);
    this.k = 1 / (2 * this.VT);
    this.nvt = p.N_diode * this.VT;
    this.os = p.oversample;
    this.q1 = 0; this.v2 = 0; this.vc = 0; this.c16 = 0; this.c19 = 0; this.x = 0; this.i1 = 0;
    this.lastIn = 0; this.xm1 = 0; this.xm2 = 0;
    this._k = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
    this._buildTable();
    this.peak = NaN; this.setCV(0); this.setPeak(0.5);
  }
  setCV(cv) { this.G = this.alpha * this.Iref * Math.pow(2, cv); this.Gb = 0.5 * this.G / this.p.BF; }
  setPeak(p01) {
    p01 = Math.min(Math.max(p01, 0), 1);
    if (p01 === this.peak) return;
    this.peak = p01;
    const P = this.p, Ra = (1 - p01) * P.VR13 + 0.01, Rb = p01 * P.VR13 + 0.01;
    this.gt = 1 / Ra + 1 / P.R62; this.gb = 1 / Rb;    // R62 sits from C19 to the wiper, across the top section
    this.Rp = 1 / (this.gt + this.gb + 1 / P.R60);
    // C15 is stiff (tau down to ~0.2 us): dvc/dt = -lam*vc + B, integrated with an exponential
    // integrator (vc relaxes exactly toward B/lam), the other states with RK4.
    const lam = this.lam = (this.Rp * (this.gt + this.gb) / P.R60 + 1 / P.R61) / P.C15;
    this.E = Math.exp(-lam * this.h); this.E2 = Math.exp(-0.5 * lam * this.h);
    this.phi = (1 - this.E) / lam; this.phi2 = (1 - this.E2) / lam;
    // ETDRK4 (Cox & Matthews) weights for the stiff component, L = -lam (h*lam is always > 15 here)
    const h = this.h, L = -lam, hL = h * L, eh = this.E, c = 1 / (h * h * L * L * L);
    this.f1 = c * (-4 - hL + eh * (4 - 3 * hL + hL * hL));
    this.f2 = c * (2 + hL + eh * (-2 + hL));
    this.f3 = c * (-4 - 3 * hL - hL * hL + eh * (4 - hL));
  }
  reset() { this.q1 = 0; this.v2 = 0; this.vc = 0; this.c16 = 0; this.c19 = 0; this.i1 = 0; this.lastIn = 0; this.xm1 = 0; this.xm2 = 0; }

  // Peak amp diode curve: x/R64 + 2 Is sinh(x/nVt) = v/R63, tabulated over +/-1 V of amp input.
  _xNewton(v) {
    const P = this.p, is2 = 2 * P.IS_diode, nvt = this.nvt, iT = v / P.R63;
    let x = this.x;
    for (let it = 0; it < 60; it++) {
      const u = Math.min(Math.max(x / nvt, -60), 60), e = Math.exp(u), ei = 1 / e;
      const f = x / P.R64 + is2 * 0.5 * (e - ei) - iT, df = 1 / P.R64 + is2 * 0.5 * (e + ei) / nvt;
      const dx = f / df; x -= dx;
      if (Math.abs(dx) < 1e-13) break;
    }
    this.x = x; return x;
  }
  _buildTable() {
    const N = 8192, V = 1; this.tN = N; this.tV = V; this.tS = N / (2 * V);
    const t = this.tab = new Float64Array(N + 1);
    this.x = 0; for (let i = N / 2; i <= N; i++) t[i] = this._xNewton(-V + i / this.tS);
    this.x = 0; for (let i = N / 2; i >= 0; i--) t[i] = this._xNewton(-V + i / this.tS);
  }
  _ampX(v) {
    let u = (v + this.tV) * this.tS;
    if (u <= 0) u = 0; else if (u >= this.tN) u = this.tN - 1e-9;
    const i = u | 0, f = u - i, t = this.tab;
    return t[i] + f * (t[i + 1] - t[i]);
  }

  _deriv(vp, q1, v2, vc, c16, c19, out) {
    const P = this.p, Rp = this.Rp, G = this.G, Gb = this.Gb, k = this.k;
    const Vs = v2 + this._ampX(v2 - c16) - c19;          // amp output seen through C19
    const F0 = Rp * (Vs * this.gt - vc * (this.gt + this.gb));
    // solve I = G tanh(k (vp - q1 - F0 - Rp I))
    let I = this.i1, th1 = 0;
    for (let it = 0; it < 3; it++) {
      th1 = Math.tanh(k * (vp - q1 - F0 - Rp * I));
      const f = I - G * th1, df = 1 + G * (1 - th1 * th1) * k * Rp;
      I -= f / df;
    }
    this.i1 = I;
    const Vf = F0 + Rp * I, v1 = q1 + Vf, th2 = Math.tanh(k * (v1 - v2));
    // base currents drawn from the C12/C13 nodes by the transconductor inputs on V1 and V2
    const ib1 = Gb * (1 - th1) + Gb * (1 + th2), ib2 = Gb * (1 - th2);
    const iC12 = I - ib1;
    out[0] = iC12 / P.C12;
    out[1] = (G * th2 - ib2) / P.C13;
    out[2] = (Vf / P.R60 - vc / P.R61 - I) / P.C15 + this.lam * vc; // forcing B (vc terms cancel)
    out[3] = (v2 - c16) / (P.R63 * P.C16);
    out[4] = (Vs - Vf - vc) * this.gt / P.C19;
  }

  // One host-rate sample in (volts at R57), KORG35 pin 7 volts out (this.ic7 = IC7 output after C19).
  tick(vin) {
    const os = this.os, h = this.h, a = this.atten;
    const pm1 = this.xm2, p0 = this.xm1, p1 = this.lastIn, p2 = vin;
    const c1 = 0.5 * (p1 - pm1), c2 = pm1 - 2.5 * p0 + 2 * p1 - 0.5 * p2, c3 = 0.5 * (p2 - pm1) + 1.5 * (p0 - p1);
    const u = (t) => a * (p0 + t * (c1 + t * (c2 + t * c3)));
    // ETDRK4: classic exponential RK4 for the stiff C15 state; the other states use its L = 0 limit.
    const [k1, k2, k3, k4] = this._k, E = this.E, E2 = this.E2, ph2 = this.phi2, hh = 0.5 * h;
    const f1 = this.f1, f2 = this.f2, f3 = this.f3;
    let q1 = this.q1, v2 = this.v2, vc = this.vc, c16 = this.c16, c19 = this.c19;
    for (let i = 0; i < os; i++) {
      const ua = u(i / os), um = u((i + 0.5) / os), ub = u((i + 1) / os);
      this._deriv(ua, q1, v2, vc, c16, c19, k1);
      const aq = q1 + hh * k1[0], av = v2 + hh * k1[1], ac = E2 * vc + ph2 * k1[2], a6 = c16 + hh * k1[3], a9 = c19 + hh * k1[4];
      this._deriv(um, aq, av, ac, a6, a9, k2);
      this._deriv(um, q1 + hh * k2[0], v2 + hh * k2[1], E2 * vc + ph2 * k2[2], c16 + hh * k2[3], c19 + hh * k2[4], k3);
      this._deriv(ub, aq + hh * (2 * k3[0] - k1[0]), av + hh * (2 * k3[1] - k1[1]), E2 * ac + ph2 * (2 * k3[2] - k1[2]),
                  a6 + hh * (2 * k3[3] - k1[3]), a9 + hh * (2 * k3[4] - k1[4]), k4);
      q1 += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      v2 += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      vc = E * vc + f1 * k1[2] + 2 * f2 * (k2[2] + k3[2]) + f3 * k4[2];
      c16 += h / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
      c19 += h / 6 * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]);
    }
    this.q1 = q1; this.v2 = v2; this.vc = vc; this.c16 = c16; this.c19 = c19;
    // IC7 output after C19: this is what the MS-10 sends on to the VCA (R88 -> TR9) and to the PEAK pot.
    this.ic7 = v2 + this._ampX(v2 - c16) - c19;
    this.xm2 = p0; this.xm1 = p1; this.lastIn = vin;
    return v2;
  }

  getState() { return [this.q1, this.v2, this.vc, this.c16, this.c19, this.i1]; }
  setState(st) { [this.q1, this.v2, this.vc, this.c16, this.c19, this.i1] = st; }
  // Run with zero input until the coupling caps reach the DC operating point (like SPICE's .op).
  settle(seconds = 3) { const n = Math.round(seconds / (this.h * this.os)); for (let i = 0; i < n; i++) this.tick(0); }

  process(input, output, n = input.length) {
    for (let i = 0; i < n; i++) output[i] = this.tick(input[i]);
  }
}
