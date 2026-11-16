# Korg MS-10 component model

A component-level model of the Korg MS-10 as a JavaScript AudioWorklet. Each block is taken from the
service-manual schematic, simulated in ngspice, and the DSP model is validated against that simulation.

Live page: https://johnnyhawk02.github.io/ms10/

## Blocks
| Block | Status |
|---|---|
| VCF (IC16 KORG35) | Real external values from the manual; JS model validated against ngspice |
| VCO | next |
| VCA, EG, MG (LFO) | planned |

## VCF
From the circuit diagram (manual p.4): input attenuator R57 12k / R59 47R (with R56 4k7 to the EXT level amp),
C12 3.3n (floating, to the peak-feedback node), C13 1n (to ground), peak amp IC7 1/2 4558 with R64 270k,
R63 4k7 + C16 10u, limiting diodes D10/D11 1S1588, then C19 33u, R62 2k2, VR13 10kB PEAK pot,
R61 5k6 || C15 1n into the feedback node with R60 220R to ground.

**Assumed (not in the manual):** the inside of the KORG35 hybrid. It is modelled as two BJT
differential-pair transconductors forming a Sallen-Key low-pass, a matched-pair exponential converter,
and a unity buffer on pin 7. With these caps the loop self-oscillates at K = 1 + C13/C12 = 1.30, which the
real feedback network reaches at about 97% of the PEAK pot, matching the panel behaviour.
The cutoff is calibrated to the adjustment procedure (7-4: cutoff knob at 5 oscillates at 500 Hz).
The IC5 cutoff CV summer is not modelled yet; the worklet takes cutoff in Hz plus a V/oct CV.

Validation summary (`validate/out/report.md`):
- Resonant peak frequency matches ngspice exactly in all 9 cases; peak level within 0.15 dB.
- Pass band within about 0.5 dB, up to 1 dB deep into the stop band (40 dB down).
- Transients (square at high peak, hard-driven sine, saw): 0.04% to 0.2% RMS error.
- Self-oscillation: 513.4 Hz / 2.10 mV in ngspice vs 517.6 Hz / 2.09 mV in JS.

## Layout
- `spice/korg35_vcf.lib` - netlist; `spice/params.json` - values; `spice/run_spice.py` - test benches
- `dsp/ms10-vcf-core.js` - DSP model (RK4, 4x oversampled, exponential integrator for the stiff C15 node)
- `dsp/ms10-vcf-processor.js` - AudioWorkletProcessor `ms10-vcf`
- `index.html` - the web page (GitHub Pages)
- `validate/` - runs the JS model on the same stimuli and compares

## Run
```
sudo apt install ngspice && pip install numpy matplotlib
npm run validate                      # ngspice -> JS model -> compare, writes validate/out/
node validate/worklet_smoke.cjs .     # renders audio through the real AudioWorklet in headless Chromium
```
