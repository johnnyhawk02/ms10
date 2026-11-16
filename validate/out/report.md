# MS-10 VCF: JS model vs ngspice

## Small-signal frequency response (50 mV at R57, 5 mV for peak 0.93; gain includes the 1/259 input attenuator)

| case (error only where response is within 40 dB of its max) | max abs dB error 20 Hz-10 kHz | max abs dB error 10-20 kHz | peak freq spice / model (Hz) | peak dB spice / model |
|---|---|---|---|---|
| ac_cv-2_peak0 | 0.580 | nan | 20 / 20 | -48.65 / -48.65 |
| ac_cv-2_peak0.6 | 0.546 | nan | 80 / 80 | -47.83 / -47.83 |
| ac_cv-2_peak0.93 | 0.933 | nan | 126 / 126 | -35.42 / -35.47 |
| ac_cv0_peak0 | 0.452 | nan | 20 / 20 | -48.29 / -48.29 |
| ac_cv0_peak0.6 | 0.487 | nan | 317 / 317 | -47.67 / -47.69 |
| ac_cv0_peak0.93 | 0.647 | nan | 502 / 502 | -35.17 / -35.28 |
| ac_cv2_peak0 | 0.270 | 1.93 | 20 / 20 | -48.26 / -48.26 |
| ac_cv2_peak0.6 | 0.152 | 1.77 | 1191 / 1191 | -47.74 / -47.78 |
| ac_cv2_peak0.93 | 1.023 | 0.17 | 2119 / 2119 | -35.67 / -35.82 |

## Transient (48 kHz, 4x oversampled RK4)

| case | RMS error (V at pin 7) | RMS of spice output (V) | relative | JS cost (ms per s of audio, 1 voice) |
|---|---|---|---|---|
| tran_square_res | 1.646e-05 | 0.009405 | 0.18% | 206.0 |
| tran_selfosc | 0.002144 | 0.001529 | 140.17% | 193.1 |
| tran_sine_drive | 5.335e-06 | 0.01321 | 0.04% | 176.0 |
| tran_saw_lowpeak | 5.449e-06 | 0.005233 | 0.10% | 183.8 |

Self-oscillation (second half of run): ngspice 513.4 Hz, 2.103 mV peak; JS 517.6 Hz, 2.092 mV peak. Sample-by-sample RMS error is large here only because a small frequency difference accumulates phase.
