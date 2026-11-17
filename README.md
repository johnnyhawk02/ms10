# Korg MS-10 component model

A component-level model of the Korg MS-10 as a JavaScript AudioWorklet. Each block is taken from the
service-manual schematic, simulated in ngspice, and the DSP model is validated against that simulation.

Live page: https://johnnyhawk02.github.io/ms10/

## Blocks
| Block | Status |
|---|---|
| VCF (IC16 KORG35) | Real external values from the manual; JS model validated against ngspice |
| VCO core (expo, ramp, reset, buffer) | From the manual; JS model within 3 cents of ngspice from 30 Hz to 3 kHz |
| VCO wave shaper (pulse/PW, IC6, SW-2) | next |
| VCA, EG, MG (LFO) | planned |

## VCF
From the circuit diagram (manual p.4): input attenuator R57 12k / R59 47R (with R56 4k7 to the EXT level amp),
C12 3.3n (floating, to the peak-feedback node), C13 1n (to ground), peak amp IC7 1/2 4558 with R64 270k,
R63 4k7 + C16 10u, limiting diodes D10/D11 1S1588, then C19 33u into the VR13 10kB PEAK pot with R62 2k2 from
C19 to the wiper (across the pot's top section), then R61 5k6 || C15 1n into the feedback node with R60 220R to ground.
IC7's output (after C19) is also what goes on to the VCA, so the web page listens there.

**Assumed (not in the manual):** the inside of the KORG35 hybrid. It is modelled as two BJT
differential-pair transconductors forming a Sallen-Key low-pass, a matched-pair exponential converter,
and a unity buffer on pin 7. With these caps the loop self-oscillates at K = 1 + C13/C12 = 1.30, which the
real feedback network reaches at about 39% of the PEAK pot rotation. Above that the filter self-oscillates and
IC7's diodes set the level.
The cutoff is calibrated to the adjustment procedure (7-4: cutoff knob at 5 oscillates at 500 Hz).
The IC5 cutoff CV summer is not modelled yet; the worklet takes cutoff in Hz plus a V/oct CV.

Validation summary (`validate/out/report.md`):
- Resonant peak frequency matches ngspice in all 9 cases; peak level within 0.35 dB.
- Pass band within about 0.7 dB.
- Transients at real signal levels (square near the onset of oscillation, driven sine, saw): 0.1% to 0.9% RMS error.
- Self-oscillation at peak 0.7: 508.5 Hz / 4.53 mV in ngspice vs 510.1 Hz / 4.52 mV in JS.

## VCO
From the circuit diagram: the keyboard CV is **Hz/V**. It drives a 100k x8 (0.1%) resistor chain; SW-1 picks the
footage tap (4' 100k, 8' 200k, 16' 400k, 32' 800k) into IC4 TL081's virtual ground, so the reference current is
linear in the CV. TR4 (C1583 matched pair) applies the exponential pitch/modulation from IC1 via R10 5.11k / R8 100R
(about 1.07 octaves per volt). TR4's output current runs through the F1 K30A cascode and R12 33k and discharges
C1 6200p from +15 V. The TR1 2SA564A / TR2 2SC1685 latch, referenced by TR3 to the R73/R75 427R divider, resets
the ramp at about 7.5 V back to 13.6 V in about 0.3 us. F3 K30A source follower buffers the saw.

Result: 132.8 Hz per volt at 8'. JS vs ngspice pitch error is +0.5 to +2.7 cents over 30 Hz to 3 kHz, ramp
levels within 3 mV (`validate/out/vco_report.md`). The latch's trip and release levels move by a few mV with
current; that curve is extracted from the ngspice sweep. Device models for the Japanese transistors and JFETs are
generic stand-ins. Near 100 uA of core current the stand-in latch is close to its holding current and ngspice can
latch up; the JS model does not.

The web page plays the VCO saw (polyBLEP band-limited) through the VCF (`dsp/ms10-voice-processor.js`).

## Layout
- `spice/korg35_vcf.lib` - netlist; `spice/params.json` - values; `spice/run_spice.py` - test benches
- `dsp/ms10-vcf-core.js` - DSP model (4x oversampled ETDRK4; the exponential part handles the stiff C15 node)
- `dsp/ms10-vcf-processor.js` - AudioWorkletProcessor `ms10-vcf`
- `spice/ms10_vco.lib`, `spice/run_vco.py` - VCO netlist and sweep; `dsp/ms10-vco-core.js` - VCO model
- `dsp/ms10-voice-processor.js` - AudioWorkletProcessor `ms10-voice` (VCO saw into VCF)
- `index.html` - the web page (GitHub Pages)
- `validate/` - runs the JS model on the same stimuli and compares

## Run
```
sudo apt install ngspice && pip install numpy matplotlib
npm run validate      # ngspice -> JS model -> compare for VCF and VCO, writes validate/out/
npm run smoke         # renders audio through both AudioWorklets in headless Chromium
```
