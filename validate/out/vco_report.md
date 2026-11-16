# MS-10 VCO: JS model vs ngspice

Keyboard CV is Hz/V into the footage resistor chain; IC1 is the expo (pitch/mod) summer output (about 1.07 oct per volt, higher pitch for negative volts).
Xlow/Xhigh curves were fitted on the 8' keyboard sweep (first six rows); every other row is an independent check.

| case | ngspice Hz | JS Hz | error (cents) | ramp low/high error (mV) | saw low/high error (mV) |
|---|---|---|---|---|---|
| vco_8ft_k0.25_e0.0 | 33.313 | 33.339 | +1.33 | +1.9 / -0.1 | +1.8 / -0.1 |
| vco_8ft_k0.5_e0.0 | 66.492 | 66.520 | +0.73 | -0.3 / -0.1 | -0.2 / -0.1 |
| vco_8ft_k1_e0.0 | 132.813 | 132.873 | +0.79 | -0.1 / -0.1 | -0.1 / -0.1 |
| vco_8ft_k2_e0.0 | 265.413 | 265.555 | +0.92 | +0.2 / -0.1 | +0.2 / -0.1 |
| vco_8ft_k4_e0.0 | 530.519 | 530.852 | +1.09 | +0.6 / +0.1 | +0.6 / +0.1 |
| vco_8ft_k8_e0.0 | 1060.501 | 1061.273 | +1.26 | +0.6 / -0.0 | +0.6 / -0.0 |
| vco_4ft_k1.0_e0.0 | 265.412 | 265.555 | +0.93 | +0.2 / -0.1 | +0.2 / -0.1 |
| vco_16ft_k1.0_e0.0 | 66.492 | 66.520 | +0.72 | -0.3 / -0.1 | -0.2 / -0.1 |
| vco_32ft_k1.0_e0.0 | 33.314 | 33.339 | +1.30 | +1.9 / -0.1 | +1.8 / -0.1 |
| vco_8ft_k1.0_e-4.0 | 2480.847 | 2580.097 | +67.91 (see note) | +0.5 / -0.1 | +0.5 / -0.1 |
| vco_8ft_k1.0_e-2.0 | 584.744 | 585.397 | +1.93 | +0.5 / -0.0 | +0.5 / -0.0 |
| vco_8ft_k1.0_e-1.0 | 278.655 | 278.861 | +1.28 | +0.2 / -0.0 | +0.2 / -0.0 |
| vco_8ft_k1.0_e1.0 | 63.334 | 63.351 | +0.45 | -0.2 / -0.1 | -0.2 / -0.1 |
| vco_8ft_k1.0_e2.0 | 30.228 | 30.245 | +1.00 | +2.9 / -0.3 | +2.8 / -0.3 |
| vco_4ft_k8.0_e-0.5 | 3069.444 | 3074.141 | +2.65 | +0.3 / -0.1 | +0.3 / -0.1 |

Note: at about 100 uA of core current (top of the expo range) the TR1/TR2 latch in the stand-in transistor models is close to its holding current; ngspice then either latches up or resets late depending on the starting state. The JS model has no latch-up, so that case disagrees. Real 2SA564/2SC1685 parts will set their own limit.

## Waveforms (3 periods, aligned at a downward mid-level crossing)

| case | RMS error of saw output (mV), samples within 4 of a reset excluded |
|---|---|
| vco_8ft_k1_e0.0 | 4.91 |
| vco_8ft_k1.0_e2.0 | 4.94 |
| vco_4ft_k8.0_e-0.5 | 14.65 |
