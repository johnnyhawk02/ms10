# MS-10 VCF: JS model vs ngspice

## Small-signal frequency response (50 mV at R57, 5 mV for peak 0.35; gain includes the 1/259 input attenuator)

| case (error only where response is within 40 dB of its max) | max abs dB error 20 Hz-10 kHz | max abs dB error 10-20 kHz | peak freq spice / model (Hz) | peak dB spice / model |
|---|---|---|---|---|
| ac_cv-2_peak0 | 0.580 | nan | 20 / 20 | -48.65 / -48.65 |
| ac_cv-2_peak0.2 | 0.196 | nan | 119 / 119 | -43.30 / -43.33 |
| ac_cv-2_peak0.35 | 0.687 | nan | 134 / 134 | -32.55 / -32.54 |
| ac_cv0_peak0 | 0.447 | nan | 20 / 20 | -48.29 / -48.29 |
| ac_cv0_peak0.2 | 0.187 | nan | 474 / 474 | -43.14 / -43.18 |
| ac_cv0_peak0.35 | 0.572 | nan | 502 / 502 | -32.01 / -32.14 |
| ac_cv2_peak0 | 0.289 | 2.00 | 20 / 20 | -48.26 / -48.26 |
| ac_cv2_peak0.2 | 0.244 | 1.06 | 1888 / 1888 | -43.48 / -43.62 |
| ac_cv2_peak0.35 | 0.623 | nan | 2119 / 2119 | -32.44 / -32.78 |

## Transient (48 kHz, 4x oversampled RK4)

| case | RMS error at pin 7 (V) | RMS of spice pin 7 (V) | relative | relative error at IC7 output (what the VCA hears) | JS cost (ms per s of audio, 1 voice) |
|---|---|---|---|---|---|
| tran_square_res | 1.464e-05 | 0.001677 | 0.87% | 0.82% | 182.9 |
| tran_selfosc | 0.004927 | 0.003148 | 156.53% | 157.24% | 166.9 |
| tran_sine_drive | 5.008e-06 | 0.004103 | 0.12% | 0.13% | 166.9 |
| tran_saw_lowpeak | 5.86e-06 | 0.001037 | 0.57% | 0.26% | 179.6 |

Self-oscillation (second half of run): ngspice 508.5 Hz, 4.528 mV peak; JS 510.1 Hz, 4.523 mV peak. Sample-by-sample RMS error is large here only because a small frequency difference accumulates phase.
