# Live Hessian-mode performance · 2026-11-17

The subsequent [deeper surface-mode pass](SURFACE-PERFORMANCE.md) measures and
reduces fallback scheduling and complete first-frame reference/deformation work.

Both surface and hidden studies verify the retained physical push before checking
the rest of the slider range. Rapid traversal queues only the latest waiting
endpoint; it never substitutes a nearby eigenfunction. The main and cutaway
traversal sliders use the same exact-endpoint queue.

The hidden study keeps its selected axis and radius. Its radial tube metric lets
an already verified radius switch axes without another length calculation. The
size control and full length graph wait for complete range verification. Those
checks run before speculative warmups, yield in background tasks, and pause while
the traversal slider is held.

## Why longer segments cost more

Hidden eigenfunctions are analytic. Their numerical integration resolution depends
on mode rank, not segment length. The visible curve still needs more adaptive
stations as the segment wraps farther around the surface. At T=12 the tested
drawings use about 1,020–1,043 accepted points; at T=30 they use about 2,835–2,872.
The same curve tolerances, seed stations, projection checks, and vertices remain.

The drawing pass reuses exact normals supplied by the mathematical profile only
when that profile belongs to the same model. Synthetic profiles or another model
retain their normal evaluations. Profiles from one exact basis share bounded CPU
drawings and magnification checks across current-only/full-range publication;
different modes, endpoints, models, pushes, or display scales cannot share them.

## Measured drawing cost

Native Node CPU measurements on this machine, median of three repetitions per
mode/axis. T=12 uses the two-summand return example; T=30 uses the longest
three-summand presentation path. All use physical push 0.12. Ranges cover modes
1–2, and both axes for hidden modes. These numbers exclude mathematical
preparation, tube upload, WebGL paint, and browser scheduling; they are not frame
rate promises.

| Segment / mode | New-endpoint drawing before | After | Drawing again after range checks, before | After |
| --- | ---: | ---: | ---: | ---: |
| T=12 · hidden | 38.3–44.5 ms | 41.2–44.6 ms | 22.9–29.6 ms | 0.30–0.39 ms |
| T=12 · surface | 61.2–61.4 ms | 56.4–57.6 ms | 45.8–49.9 ms | 0.06–0.07 ms |
| T=30 · hidden | 114.2–118.6 ms | 102.2–109.9 ms | 76.2–82.9 ms | 0.28–0.34 ms |
| T=30 · surface | 139.3–148.8 ms | 135.2–153.6 ms | 110.2–118.1 ms | 0.06–0.07 ms |

At T=30, hidden drawings reduce normal evaluations from 45,051–45,600 to
28,100–28,466. Surface drawings reduce them from 42,843 to 27,867. The later
full-range publication reuses the exact drawing rather than rebuilding it.
Cold timings overlap and vary between runs; the robust improvement is removing
that duplicate drawing pass, rather than a uniform speedup at every new endpoint.

Run the current drawing profile from the repository root:

```sh
node morse-geodesics-lab/profile-deformations.cjs --runs 3
```

`--baseline-dir` optionally takes a directory containing previous `app.js`,
`hidden-push-display.js`, and `surface-push-display.js` sources. Both sides use the
same current mathematical code and data. Output includes timings, geometric call
counts, adaptive evaluations, tube vertices, and variation-field mesh sizes.

## Numerical verification

Hidden energy and length share exact quadrature intermediates while keeping each
sum's original arithmetic order, meshes, and error checks. At T=120, full hidden
preparation measured 0.59–0.68 ms before and 0.21 ms after for modes 1–2; verifying
only the current push measured about 0.04 ms. Mode 8 measured 2.79 ms before,
0.77 ms after, and 0.16 ms for its current push.

An independent comparison of 50 full profiles made 1,008 strict comparisons
against the previous mathematical implementation, with bit-identical results.
Current-push caches are isolated from the historical full-scan caches so adjacent
floating-point coefficients cannot affect the full scan's original rounding.
Regression tests also compare exact displayed points, normals, field meshes,
lengths, cancellation, both axes, and current-only/full-range ownership.
