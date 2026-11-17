# Deeper surface-mode performance · 2026-11-17

This pass preserves exact modes, finite curves, lengths, and displayed geometry.
The main avoidable costs were timer scheduling, repeated baseline evaluations,
and duplicate curvature samples. The remaining deformed Newton projections still
scale with the segment length.

## Scheduling

The old scheduler stopped after 64 iterator checkpoints even when their arithmetic
used much less than the 4 ms slice. Surface bisection has thousands of tiny
checkpoints. Repeated fallback timers could therefore spend much longer waiting
than calculating. Slices now use the same time budget, with a 2,048-checkpoint
guard for nonadvancing clocks. Requested work still yields in 4 ms slices during
a traversal hold; background work still pauses throughout the hold.

Controlled Node measurements, median of three runs per mode, with a simulated
4 ms minimum timer delay and traversal held:

| Segment | Exact current-push preparation before | After | Timer callbacks before → after |
| --- | ---: | ---: | ---: |
| T=6 · modes 1–2 | 196–214 ms | 64–71 ms | 31–33 → 7–8 |
| T=12 · modes 1–2 | 409–415 ms | 90 ms | 64 → 10 |
| T=30 · modes 1–2 | 916–958 ms | 161–168 ms | 149–154 → 18–19 |

This isolates timer fallback behavior; it is not a browser frame-rate promise.
Each row is one exact mode, excludes the later drawing, and includes the unchanged
current-push checks. Timing varies by machine and browser. Measured longest work
slices after the change were 4.3–4.8 ms, including completion of the last bounded
checkpoint. Unit tests verify the same time limits, gesture interruption,
cancellation, and finite guard when the clock stalls.

```sh
node morse-geodesics-lab/profile-mode-preparation.cjs --runs 3 --timer-floor 4
```

The profiler also accepts `--baseline-service` and `--baseline-math` source paths
to isolate scheduler changes or compare the whole preparation path. It reports
direct basis/current CPU time, scheduled elapsed time, callback count, and slice
lengths separately.

## Exact numerical reuse

Curvature values are shared only when nested meshes ask for the identical actual
floating-point station. Baseline samples, normals, and transverse frames are also
shared inside one prepared basis, with a 16,384-record bound. No nearby endpoint,
other curve, model, or eigenmode is substituted. Amplitude-result caches remain
bounded to 512 entries.

Sturm bisection asks whether the negative-pivot count has reached the requested
rank. Once it has, computing the remaining pivots cannot change that decision.
The remaining recurrence is skipped, while retaining every original bisection
iteration and bound update. Finite-difference derivatives and paired metric sums
also avoid temporary arrays while keeping each coordinate's arithmetic order.

Independent direct-drain profiling found current verification at T=30 reduced
from about 60 ms to 46–48 ms. The projection mesh, quadrature rules, 64 bisection
iterations, inverse iterations, error estimates, and acceptance tests are intact.

## First-frame drawing

The original reference path and its pushed path used to project many of the same
geodesic stations independently. The reference now uses the owned mathematical
profile's exact zero-push samples. That warms its existing bounded display cache
before drawing the deformation. Each adaptive sampler retains its original
knots, tolerances, and refinement decisions. Pending or synthetic profiles use the
previous direct geodesic evaluator.

Native CPU medians of three runs, including both reference/deformation tubes and
the variation arrows/band, excluding numerical preparation, lengths, and WebGL
upload/paint:

| Segment / mode | Before | After |
| --- | ---: | ---: |
| T=12 · mode 1 | 94.8 ms | 72.8 ms |
| T=12 · mode 2 | 99.1 ms | 62.8 ms |
| T=30 · mode 1 | 222.7 ms | 169.6 ms |
| T=30 · mode 2 | 237.4 ms | 184.1 ms |

Projection calls fall by about 32%. This measures the actual `downhillBuffers`
first-frame path, rather than an isolated drawing that misses reference reuse.

```sh
node morse-geodesics-lab/profile-deformations.cjs --type surface --endpoints 12,30 --runs 3
```

The output includes `firstFrame.totalMs`, both tube sizes, arrow/band sizes, and
projection counts. `--baseline-dir` compares earlier drawing sources using the
same current mathematical data/code and the same JavaScript realm.

## Verification

An independent old/new mathematical comparison covered 22 profiles with 16,622
strict comparisons, including real two-/three-summand segments and variable
curvature at ranks 1, 2, 17, and 128. Coefficients, eigenvalue metadata, finite
curves, lengths, energies, errors, and full profiles were bit-identical. Another
28 deliberately unsafe current pushes were rejected identically.

Rendering regressions compare every actual reference/deformation/arrow/band
buffer value and sampling diagnostic at T=12 and T=30 for both surface modes.
They also verify bounded ownership and more than 20% fewer baseline projections.
No timing threshold is used as a correctness test.

## Browser check

A temporary copy of the previous math, scheduler, and reference-rendering code
provided a browser comparison. With the same two-summand return path, mode 2 in
the two-mode study, and physical push 0.12, traversing to T=11.138 took 353 ms
before and 250 ms after to publish the exact displayed frame. Three distinct
new endpoints after the change measured 250, 250, and 241 ms. These timings
include browser scheduling and locator-driven input/wait overhead; one paired
example is evidence of an improvement, not a universal timing claim. The
temporary comparison copy was removed after testing.

All 605 regression tests pass. Browser checks additionally covered stationary
slider holds, the single-mode study, mode 2 selection, and a reduced-range
round trip that must keep the push slider at maximum. No console errors or
warnings were recorded.
