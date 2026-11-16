"""Compare JS model (validate/out/model.json) with ngspice (spice/out). Writes plots + report.md."""
import json, os
import numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
H = os.path.dirname(os.path.abspath(__file__)); SP = os.path.join(H, "..", "spice", "out"); OUT = os.path.join(H, "out")
M = json.load(open(os.path.join(OUT, "model.json"))); fs = M["fs"]
lines = ["# MS-10 VCF: JS model vs ngspice\n", "## Small-signal frequency response (50 mV at R57, 5 mV for peak 0.93; gain includes the 1/259 input attenuator)\n",
         "| case (error only where response is within 40 dB of its max) | max abs dB error 20 Hz-10 kHz | max abs dB error 10-20 kHz | peak freq spice / model (Hz) | peak dB spice / model |", "|---|---|---|---|---|"]
fig, ax = plt.subplots(figsize=(9, 5))
for i, (name, d) in enumerate(M["ac"].items()):
    s = np.loadtxt(os.path.join(SP, name + ".dat")); f = np.array(d["freqs"]); m = np.array(d["db"])
    si = np.interp(np.log(f), np.log(s[:, 0]), s[:, 1])
    ok = si > si.max() - 40   # compare where the response is within 40 dB of its maximum (numerical floor below)
    lo = (f <= 10001) & ok; hi = (f > 10001) & ok
    e1 = np.max(np.abs(si[lo] - m[lo])); e2 = np.max(np.abs(si[hi] - m[hi])) if hi.any() else float('nan')
    lines.append(f"| {name} | {e1:.3f} | {e2:.2f} | {f[np.argmax(si)]:.0f} / {f[np.argmax(m)]:.0f} | {si.max():.2f} / {m.max():.2f} |")
    c = f"C{i}"; ax.semilogx(s[:, 0], s[:, 1], c, lw=1, label=name); ax.semilogx(f, m, c + "o", ms=3)
ax.set_ylim(-110, -25); ax.set_xlabel("Hz"); ax.set_ylabel("dB"); ax.grid(alpha=.3)
ax.set_title("lines: ngspice   dots: JS model"); ax.legend(fontsize=6, ncol=3); fig.tight_layout()
fig.savefig(os.path.join(OUT, "ac.png"), dpi=120)
lines += ["\n## Transient (48 kHz, 4x oversampled RK4)\n", "| case | RMS error (V at pin 7) | RMS of spice output (V) | relative | JS cost (ms per s of audio, 1 voice) |", "|---|---|---|---|---|"]
names = list(M["tran"]); fig, axs = plt.subplots(len(names), 1, figsize=(9, 2.6 * len(names)))
for a, name in zip(axs, names):
    s = np.loadtxt(os.path.join(SP, name + ".dat")); y = np.array(M["tran"][name]["y"])
    t = np.arange(len(y)) / fs; si = np.interp(t, s[:, 0], s[:, 1]); n = min(len(y), np.searchsorted(t, s[-1, 0]))
    e = np.sqrt(np.mean((si[:n] - y[:n]) ** 2)); r = np.sqrt(np.mean(si[:n] ** 2))
    lines.append(f"| {name} | {e:.4g} | {r:.4g} | {e/r*100:.2f}% | {M['tran'][name]['msPerSecondAudio']:.1f} |")
    if "selfosc" in name:
        def fa(t, y):
            y = y[len(y)//2:]; t = t[len(t)//2:]; z = np.where((y[:-1] < 0) & (y[1:] >= 0))[0]
            tz = t[z] - y[z] * (t[z+1] - t[z]) / (y[z+1] - y[z]); return 1/np.mean(np.diff(tz)), (y.max() - y.min())/2
        fs1, as1 = fa(t[:n], si[:n]); fj, aj = fa(t[:n], y[:n])
        osc = f"Self-oscillation (second half of run): ngspice {fs1:.1f} Hz, {as1*1e3:.3f} mV peak; JS {fj:.1f} Hz, {aj*1e3:.3f} mV peak. Sample-by-sample RMS error is large here only because a small frequency difference accumulates phase."

    a.plot(t[:n] * 1e3, si[:n], lw=1.2, label="ngspice"); a.plot(t[:n] * 1e3, y[:n], "--", lw=1, label="JS")
    a.set_title(name, fontsize=9); a.set_xlabel("ms"); a.legend(fontsize=7); a.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(OUT, "tran.png"), dpi=110)
lines.append("\n" + osc)
open(os.path.join(OUT, "report.md"), "w").write("\n".join(lines) + "\n"); print("\n".join(lines))
