# Height-bounded neck comparison

Open `index.html` in this folder, or `/prototypes/neck-collars/` on the lab's local
server. This isolated workbench changes no production geometry, geodesic
catalogue, mathematical solver, or main-app animation.

The compact candidate has now been selected for the main app. This historical
comparison retains an archived copy of the former round-chain-v1 surface.

All three selectable candidates obey **|z| ≤ 0.45**, the unchanged round tori's
half-height. This is an analytic constraint on the complete collar, not a sampled
rejection or clipping operation. The left panel retains the previous geometry as
an archived reference; its smooth union has a small pre-existing overshoot
(maximum sampled |z| ≈ 0.4615).

## Recommended shape and aesthetic compromises

The recommendation is a broad, smoothly rounded stadium-like throat, with a
longer straight middle section. It widens horizontally without bulging upward.
It combines nearly the lowest peak curvature found with the strongest field
visibility among the audited finalists near that minimum.

| Choice | Throat width × height | Torus center spacing | Largest curvature found | Worst applied gain at requested 3× |
| --- | ---: | ---: | ---: | ---: |
| Current reference | Approximately 0.80 × 0.80 | 4.00 | 9.399 | 0.494× |
| Broad, recommended | 2.10 × 0.90 | 5.50 | 2.473 | 2.724× |
| Compact | 2.10 × 0.90 | 4.00 | 2.473 | 2.042× |
| Narrower, visible waist | 1.20 × 0.90 | 5.00 | 2.795 | 1.956× |

The compact choice has the same shoulder geometry and peak curvature as the
recommendation. Bringing the shoulders closer changes how the arclength-based
field envelope encounters them, so oblique probes lose more display scale. The
narrower choice has a more distinct waist but higher curvature and stronger
limiting. All three remain forward at raw 3× in every audited probe. The smallest
forward velocity components are respectively +0.654, +0.519, and +0.394; the
current reference reaches −1.334, indicating a local drawing reversal.

The recommendation lowers the largest curvature found by about 73.7%. The
unchanged torus bodies already reach 1/0.45 ≈ 2.222, so no change to the neck alone
can lower the whole surface's maximum below that value.

## What “optimal” means here

The primary objective is minimax absolute principal curvature, which controls
normal rotation independently of the camera. The secondary objective is the
field-display scale retained by the safety limiter, assessed on meridian and
quarter-turn probes in both illustration directions. We avoid an arbitrarily
long neck by limiting center spacing to 5.5 and throat half-width to 1.2. The
smooth cap parameter is at least 0.015; letting it tend to zero would approach a
stadium with increasingly abrupt curvature transitions.

The numerical search evaluated 2,340 coarse profiles, two local grids of 640 and
540 profiles, and 345 coordinate-search evaluations, including repeats. The
strict numerical minimax winner had peak 2.473001; the simpler recommended shape
has peak 2.473046, only 0.0018% higher, with better field scale in the finalist
probes. We treat differences below 0.01% as practically tied for selecting the
display recommendation. This is a **best-found solution in a specified family**,
not a proof of a global optimum over all possible surfaces.

The final workbench audit uses more oblique starting angles than the search's
shortlist audit. The gain values above come from this broader final audit.

## Geometry and the height guarantee

The middle section is the Minkowski sum of a circle and a thin ellipse. Write
`h = halfHeight`, `b = capSoftness`, `c = h-b`, and `a = halfWidth-c`. Its support
function is

    H(phi) = c + sqrt(a² cos²(phi) + b² sin²(phi)).

Its height is exactly `c+b = h` and its width is exactly `c+a = halfWidth` on each
side. Unlike a flattened ellipse, it retains rounded sides without excessive
side-tip curvature. A monotone normal-angle inversion supplies its polar radius
and analytic first and second angular derivatives.

The source is an exact torus radial section, reparameterized by a bounded smooth
warp that freezes before the torus chart ends. A flat C∞ cutoff blends source
and target radii at the **same polar angle**. Since both source and target have
|z| ≤ 0.45, every convex combination does too. The outside torus bodies are
unchanged. All spatial, mixed, and weight derivatives are included analytically;
no mesh smoothing modifies the computed geometry.

| Choice | Seam x | Collar end x | Source advance | Half-width | Half-height | Cap parameter | Warp smoothing |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Broad | 0.94 | 1.89 | 0.36 | 1.05 | 0.45 | 0.015 | 0.04 |
| Compact | 0.94 | 1.89 | 0.36 | 1.05 | 0.45 | 0.015 | 0.04 |
| Narrower | 1.00 | 2.20 | 0.48 | 0.60 | 0.45 | 0.015 | 0.04 |

The geometry height limit does not constrain the off-surface field illustration.
Gold guides show the original torus heights; a colored pushed path may extend
beyond them.

## Field and animation comparison

Both panels use the same physical units, synchronized camera, and curvature
colors. Compare straight or quarter-turn routes, both hidden illustration axes,
amplitude, drawing gain, and safety limiting. “Whole pair” exposes the spacing
tradeoff; “Reset close-up” returns to the shoulders.

The common test coefficient is `f(s) = sin(pi s / L)` at amplitude 0.12, using each
probe's own arclength. These are **geometry probes, not newly computed geodesics,
Jacobi fields, or Hessian modes**. The moving-frame derivatives include the
probe's actual acceleration; no geodesic-only shortcut is used. The workbench
reports no four-dimensional deformed-path lengths or new conjugate points.

Optional **Preview collar assembly** reveals the actual final annulus from both
attachments. The gold rings sample the exact final surface; at completion they
become one ring. Scrubbing is deterministic, and field drawing pauses during the
preview. This does not replace the full main-app connected-sum animation.

## Reproducibility and adoption

`audit.cjs` checks candidates on 320×192 and 640×384 grids with local peak
refinement. Dense 160×192 scans resolve source-warp and collar transition windows
and their reflected counterparts. Curvature maxima are sampled estimates, not
certified global bounds; the height certificate is separate and analytic.

The final field audit uses 1,600 intervals for 36 probes per geometry: six
starting angles, both illustration directions, and straight / ±quarter-turn
routes. It also compares doubled probe resolution. Source hashes identify the
geometry, smoothing, diagnostics, and audit used to create the displayed data.

    node audit.cjs
    node --test *.test.cjs
    node search-height.cjs --bounded
    node search-height.cjs --audit-finalists

`results.json` and classic-script `results.js` are the current displayed audit.
`search-height-bounded-results.json` retains the bounded search and finalist
audits; `search-height.cjs` reproduces the coarse search and fixed finalist
audits. The historical local optimization passes are recorded as metadata,
rather than replayed by this script. Older circular searches are retained only
for historical comparison; their over-height shapes are not selectable.

Tests independently check torus radius jets against the prior fourth-order
implementation, analytic stadium derivatives, the height certificate and dense
height samples, regularity, C∞ transition windows, reflection, exact assembly
sections, frame derivatives, pinned endpoints, signed fields, and the closed
genus-two Gauss–Bonnet budget ∫K dA = −4π. Curvature integration resolves every
narrow warp window separately.

Adoption still requires a production surface evaluator, validation of the
extended metric, fresh geodesic/Jacobi/Hessian computations and catalogues, and
rebuilt construction animations. No candidate has been adopted automatically.
