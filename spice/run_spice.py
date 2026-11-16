"""Generate MS-10 VCF test benches, run ngspice, write results to spice/out/*.dat.
Usage: python3 spice/run_spice.py
"""
import json, math, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out"); os.makedirs(OUT, exist_ok=True)
P = json.load(open(os.path.join(HERE, "params.json")))
k, q = 1.380649e-23, 1.602176634e-19
VT = k * (P["tempC"] + 273.15) / q
alpha = P["BF"] / (P["BF"] + 1)
# Iref so that cv = 0 gives a natural (self-oscillation) frequency fn0 = g / (2 pi sqrt(C12 C13)), g = alpha*I/(2VT)
IREF = 2 * math.pi * P["fn0"] * math.sqrt(P["C12"] * P["C13"]) * 2 * VT / alpha

def vc_for(cv):  # 1 V/oct at the expo base
    return cv * VT * math.log(2)

def bench(name, body, analysis):
    net = f"""* {name}
.include {os.path.join(HERE, 'korg35_vcf.lib')}
.options reltol=1e-5 abstol=1e-14 vntol=1e-8 method=gear
Vcc vcc 0 15
{body}
.control
{analysis}
.endc
.end
"""
    path = os.path.join(OUT, name + ".cir")
    open(path, "w").write(net)
    r = subprocess.run(["ngspice", "-b", path], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout[-2000:], r.stderr[-2000:]); sys.exit(1)

def vcf_line(cv, peak):
    return (f"Vvc vc 0 DC {vc_for(cv):.9g}\n"
            f"X vin out vc vcc ms10vcf iref={IREF:.9g} peak={peak}")

AC_CASES = [(cv, pk) for cv in (-2, 0, 2) for pk in (0, 0.6, 0.93)]
def run_ac():
    for cv, rf in AC_CASES:
        name = f"ac_cv{cv}_peak{rf}"
        body = "Vin vin 0 DC 0 AC 1\n" + vcf_line(cv, rf)
        dat = os.path.join(OUT, name + ".dat")
        bench(name, body, f"ac dec 40 20 40k\nwrdata {dat} vdb(out)")

def pwl_file(name, x):
    fs = P["fs"]; path = os.path.join(OUT, name + "_in.txt")
    with open(path, "w") as f:
        for i, v in enumerate(x): f.write(f"{i/fs:.10e} {v:.10e}\n")
    np.save(os.path.join(OUT, name + "_in.npy"), x)
    return path

def tran_inputs():
    fs = P["fs"]; t = lambda dur: np.arange(int(dur*fs)) / fs
    tt = t(0.03)
    sq = np.where(np.sin(2*np.pi*110*tt) >= 0, 2.5, -2.5); sq[0] = 0.0
    t2 = t(0.06); kick = np.zeros_like(t2); kick[1:5] = 2.0
    t3 = t(0.03); sine = 5.0*np.sin(2*np.pi*220*t3)
    t4 = t(0.03); saw = 5.0*((t4*82.4) % 1.0) - 2.5; saw[0] = 0
    # (name, input volts at R57, cv, peak)
    return [("tran_square_res", sq, 1, 0.9),
            ("tran_selfosc", kick, 0, 1.0),
            ("tran_sine_drive", sine, 1.5, 0.5),
            ("tran_saw_lowpeak", saw, 0.5, 0.2)]

def run_tran():
    fs = P["fs"]
    for name, x, cv, rf in tran_inputs():
        f = pwl_file(name, x)
        body = (f"Ain %v([vin]) insrc\n"
                f".model insrc filesource (file=\"{f}\" amploffset=[0] amplscale=[1] "
                f"timeoffset=0 timescale=1 timerelative=false amplstep=false)\n" + vcf_line(cv, rf))
        dur = len(x) / fs
        dat = os.path.join(OUT, name + ".dat")
        bench(name, body,
              f"tran {1/fs/8:.6e} {dur - 1/fs:.6e} 0 {1/fs/16:.6e}\n"
              f"linearize v(out)\nwrdata {dat} v(out)")

if __name__ == "__main__":
    json.dump({"VT": VT, "alpha": alpha, "Iref": IREF,
               "ac_cases": AC_CASES,
               "tran_cases": [(n, cv, rf) for n, _, cv, rf in tran_inputs()]},
              open(os.path.join(OUT, "derived.json"), "w"), indent=1)
    run_ac(); run_tran()
    print("VT", VT, "Iref", IREF)
