# OpenCircuit DC Sweep Engine

A dependency-free modified-nodal-analysis engine for DC operating points and one-, two-, or three-dimensional parameter sweeps.

## Capabilities

- DC operating-point voltages, branch currents, component powers, and power-balance reporting.
- Resistors, independent voltage/current sources, capacitors, inductors, and switches.
- Correct DC limits: capacitors are open and inductors are ideal shorts.
- Sweep voltage, current, resistance, and switch resistance.
- Explicit-value, fixed-step, or fixed-point-count axes.
- Up to three nested axes with configurable work limits.
- Partial-pivoting linear solver and actionable singular-circuit errors.
- Result-column extraction for plotting and export.

## Installation

```bash
npm install github:opencircuitlabs/dc-sweep-engine
```

## Operating point

```js
import { solveOperatingPoint } from '@opencircuitlabs/dc-sweep-engine';

const result = solveOperatingPoint(circuit);
console.log(result.nodeVoltages.out);
console.log(result.componentPowers.R1);
```

## Parameter sweep

```js
import { column, sweepDC } from '@opencircuitlabs/dc-sweep-engine';

const result = sweepDC(circuit, {
  sweeps: [
    { target: 'V1.voltage', start: 0, stop: 12, step: 0.5 },
    { target: 'R2.resistance', values: [1000, 2200, 4700] }
  ],
  maxPoints: 10000
});

const outputVoltages = column(result, 'nodeVoltages.out');
```

Sweep ordering is deterministic: the final axis changes fastest. Every output point includes the exact settings used for that operating point.

## Scope

This engine handles linear DC circuits. Nonlinear diode, BJT, and MOSFET operating points require the separate `nonlinear-solver` and `semiconductor-models` projects. Keeping the linear kernel independently tested makes those later solvers easier to validate.

## Development

```bash
npm test
npm run example
```

## License

MIT © 2026 OpenCircuitLabs
