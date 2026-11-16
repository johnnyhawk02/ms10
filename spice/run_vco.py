"""MS-10 VCO test benches: sweep KBD CV, footage and IC1 (expo) voltage; measure period, ramp limits,
reset time; save a few waveforms. Writes spice/out/vco/*.  Usage: python3 spice/run_vco.py"""
import json, os, subprocess
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, "out", "vco"); os.makedirs(OUT, exist_ok=True)
FOOT = {"4'": 100e3, "8'": 200e3, "16'": 400e3, "32'": 800e3}
CASES = ([("8'", k, 0.0) for k in (0.25, 0.5, 1, 2, 4, 8)] +
         [(f, 1.0, 0.0) for f in ("4'", "16'", "32'")] +
         [("8'", 1.0, v) for v in (-4.0, -2.0, -1.0, 1.0, 2.0)] +
         [("4'", 8.0, -0.5)])
WAVES = {("8'", 1.0, 0.0), ("4'", 8.0, -0.5), ("8'", 1.0, 2.0)}

def run(foot, kbd, ic1):
    i_est = kbd / FOOT[foot] * np.exp(-ic1 * 100 / 5210 / 0.02586)
    per = 6200e-12 * 6.1 / i_est
    tstop = max(12 * per + 2e-3, 10e-3); dmax = min(per / 4000, 1e-6)
    name = f"vco_{foot.strip(chr(39))}ft_k{kbd}_e{ic1}"
    dat = os.path.join(OUT, name + ".dat")
    net = f"""* {name}
.include {os.path.join(HERE, 'ms10_vco.lib')}
.options reltol=1e-5 method=gear
Vcc vcc 0 15
Vee vee 0 -15
V18 v18 0 18
Vk kbd 0 {kbd}
Vi ic1 0 {ic1}
X kbd ic1 x saw vcc vee v18 ms10vco rscale={FOOT[foot]}
.control
tran {dmax:.4e} {tstop:.4e} 0 {dmax:.4e}
wrdata {dat} v(x) v(saw)
.endc
.end
"""
    p = os.path.join(OUT, name + ".cir"); open(p, "w").write(net)
    subprocess.run(["ngspice", "-b", p], capture_output=True, check=True)
    d = np.loadtxt(dat); t, x, s = d[:, 0], d[:, 1], d[:, 3]
    # reset events: steep rises. Period from successive downward crossings of the mid level.
    mid = 0.5 * (x[t > 2e-3].min() + x[t > 2e-3].max())
    c = np.where((x[:-1] > mid) & (x[1:] <= mid))[0]
    tc = t[c] + (x[c] - mid) * (t[c + 1] - t[c]) / (x[c] - x[c + 1])
    tc = tc[tc > 2e-3]
    if len(tc) < 3:
        os.remove(dat); return dict(name=name, foot=foot, kbd=kbd, ic1=ic1, freq=None, note="no oscillation in ngspice")
    per = np.mean(np.diff(tc))
    m = t > tc[0]
    rec = dict(name=name, foot=foot, kbd=kbd, ic1=ic1, freq=1 / per, xmin=float(x[m].min()), xmax=float(x[m].max()),
               smin=float(s[m].min()), smax=float(s[m].max()))
    # reset duration: time X spends rising between 10% and 90% of the swing
    lo, hi = rec["xmin"] + 0.1 * (rec["xmax"] - rec["xmin"]), rec["xmin"] + 0.9 * (rec["xmax"] - rec["xmin"])
    r = np.where((x[:-1] < lo) & (x[1:] >= lo) & m[:-1])[0]
    if len(r):
        i0 = r[-1]; j = i0 + np.argmax(x[i0:] >= hi); rec["t_reset_10_90"] = float(t[j] - t[i0])
    if (foot, kbd, ic1) in WAVES:
        w = (t >= tc[1]) & (t <= tc[1] + 3 * per)
        np.save(os.path.join(OUT, name + "_wave.npy"), np.c_[t[w] - tc[1], x[w], s[w]])
        rec["wave"] = name + "_wave.npy"
    os.remove(dat)
    return rec

if __name__ == "__main__":
    res = [run(*c) for c in CASES]
    json.dump(res, open(os.path.join(OUT, "spice_vco.json"), "w"), indent=1)
    for r in res: print(r["name"], r["freq"], r.get("xmin"), r.get("xmax"), r.get("t_reset_10_90"))
