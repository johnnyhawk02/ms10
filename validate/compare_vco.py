"""Compare the JS VCO (validate/out/vco_model.json) with ngspice (spice/out/vco). Writes vco_report.md and vco.png."""
import json, os
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__)); SP = os.path.join(H, "..", "spice", "out", "vco"); OUT = os.path.join(H, "out")
S = {r["name"]: r for r in json.load(open(os.path.join(SP, "spice_vco.json")))}
M = {r["name"]: r for r in json.load(open(os.path.join(OUT, "vco_model.json")))}
L = ["# MS-10 VCO: JS model vs ngspice\n",
     "Keyboard CV is Hz/V into the footage resistor chain; IC1 is the expo (pitch/mod) summer output (about 1.07 oct per volt, higher pitch for negative volts).",
     "Xlow/Xhigh curves were fitted on the 8' keyboard sweep (first six rows); every other row is an independent check.\n",
     "| case | ngspice Hz | JS Hz | error (cents) | ramp low/high error (mV) | saw low/high error (mV) |", "|---|---|---|---|---|---|"]
for n, s in S.items():
    m = M[n]
    if s.get("freq") is None: L.append(f"| {n} | {s.get('note')} | {m['freq']:.2f} | - | - | - |"); continue
    c = 1200 * np.log2(m["freq"] / s["freq"])
    flag = " (see note)" if abs(c) > 20 else ""
    L.append(f"| {n} | {s['freq']:.3f} | {m['freq']:.3f} | {c:+.2f}{flag} | {1e3*(m['xmin']-s['xmin']):+.1f} / {1e3*(m['xmax']-s['xmax']):+.1f} | {1e3*(m['smin']-s['smin']):+.1f} / {1e3*(m['smax']-s['smax']):+.1f} |")
L.append("\nNote: at about 100 uA of core current (top of the expo range) the TR1/TR2 latch in the stand-in transistor models is close to its holding current; ngspice then either latches up or resets late depending on the starting state. The JS model has no latch-up, so that case disagrees. Real 2SA564/2SC1685 parts will set their own limit.\n")
waves = [n for n in S if S[n].get("wave")]
fig, axs = plt.subplots(len(waves), 1, figsize=(9, 2.6 * len(waves)))
L += ["## Waveforms (3 periods, aligned at a downward mid-level crossing)\n", "| case | RMS error of saw output (mV), samples within 4 of a reset excluded |", "|---|---|"]
for a, n in zip(axs, waves):
    w = np.load(os.path.join(SP, S[n]["wave"])); mw = M[n]["wave"]
    t = np.array(mw["t"]); y = np.array(mw["s"]); ref = np.interp(t, w[:, 0], w[:, 2])
    keep = (t <= w[-1, 0]) & np.all(np.abs(t[:, None] - np.array(mw["resets"])[None, :]) > 4 / 48000, axis=1) if mw["resets"] else t <= w[-1, 0]
    e = np.sqrt(np.mean((y[keep] - ref[keep]) ** 2))
    L.append(f"| {n} | {1e3*e:.2f} |")
    a.plot(w[:, 0] * 1e3, w[:, 2], lw=1.2, label="ngspice (F3 source)"); a.plot(t * 1e3, y, ".", ms=2.5, label="JS, 48 kHz samples")
    a.set_xlim(0, t[-1] * 1e3); a.set_title(n, fontsize=9); a.set_xlabel("ms"); a.set_ylabel("V"); a.grid(alpha=.3); a.legend(fontsize=7)
fig.tight_layout(); fig.savefig(os.path.join(OUT, "vco.png"), dpi=110)
open(os.path.join(OUT, "vco_report.md"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
