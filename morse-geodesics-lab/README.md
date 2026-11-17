# Geodesics · hidden dimensions

A standalone numerical experiment with geodesics on visible surfaces inside simply
connected four-manifolds. It has no build step, external libraries, fonts, or network
dependencies. The existing website app is unchanged.

The [2026-11-15 stability audit](STABILITY-AUDIT.md) records the regression pass,
bounded performance fixes, browser coverage, and remaining first-use preparation
cost.

The [live-mode performance pass](PERFORMANCE-MODES.md) records current-push
verification, longer-segment drawing costs, before/after timings, and the
reproducible drawing profiler.
The [deeper surface-mode pass](SURFACE-PERFORMANCE.md) separates numerical work,
timer scheduling, and actual first-frame drawing, with exact-result checks.

## Run

Open `morse-geodesics-lab/index.html` directly in a browser, or serve it from the
repository root:

```sh
python3 -m http.server 4174 --directory morse-geodesics-lab
```

Open <http://localhost:4174>. The page loads the local geometry, solver, computed
catalogue, and app scripts.

## Geometry and the chosen metric

The one-, two-, and three-summand views use genus-one, genus-two, and genus-three
surfaces inside `#^k(S² × S²)`, for `k = 1, 2, 3`. These surfaces arise by taking
equator × equator in each summand and connecting the tori through the connected-sum
necks. They are nullhomologous. Their oriented normal bundles have Euler number zero
and are trivial.

Each body is an exact round torus with major radius `1.35` and tube radius `0.45`.
Centers lie at `x = 0, 4, 8`, as applicable. Each neighboring pair now uses the
**compact, height-bounded collar** selected in the neck comparison workbench.
Its rounded stadium-like throat is 2.10 wide and 0.90 high. It never rises above
the original torus height `|z| ≤ 0.45`; the bound follows analytically from the
construction, rather than clipping the surface. The middle torus has independent
attachment collars on opposite sides.

`compact-collar.js` supplies the exact smooth radial profile and analytic jets.
Each collar begins at axial distance `0.94` from a torus center and reaches the
constant throat at `1.89`, leaving the center spacing at `4`. A bounded source
warp blends exact torus sections into a smooth circle-plus-ellipse section at the
same polar angle. Both ingredients obey the height bound, so their convex blend
does too. Flat C∞ cutoffs make the attachment agree smoothly with the original
round torus. The principal-curvature peak found in the prototype audit was about
`2.473`, versus `9.399` for the old compact smooth union. This is a sampled
curvature estimate; the height bound is analytic.

`surface.js` uses an analytic implicit defining function for this same geometry.
Values, gradients, and Hessians are consistent, with no finite differences in the
solver. The displayed triangulation approximates the defining surface;
trajectories are integrated on the smooth geometry, not on the triangles.
The single torus remains unchanged. Connected models use their own geometry
version, invalidating paths and search caches from the old neck. The connected-sum
animation cuts on the exact attachment sections and reveals the final collar;
the optional neighborhood diagram remains a normalized topological illustration.

The visible surface has the metric `h` induced by its embedding in three-dimensional
space. In a sufficiently small normal tube choose

```text
g = dy₁² + dy₂² + cos²(√c |y|) h,    c = 0.36.
```

The zero section is totally geodesic, so every computed surface geodesic is also a
geodesic of this ambient metric. This tube metric extends smoothly to the full
four-manifold. It is a chosen metric; the picture does not claim to show every
geodesic in the manifold.

## Numerical curves and index

The experiment searches for geodesics between fixed endpoints on the surface. It
integrates the surface geodesic equations and refines candidate endpoint matches.
Accepted trajectories are checked for endpoint error and against a smaller
integration step. Search depth and a finite set of initial guesses limit the
collection that can be found. The result is not an exhaustive enumeration or a
rigorous numerical existence certificate.

The two- and three-summand views include freshly recomputed catalogues for the
compact collar: **70 / 95** trajectories for the two endpoint presets with two
summands, and **48 / 52** with three (265 connected-sum paths in total). The
standard and extended finite seed banks were completed, supplemented by fresh
shooting from previous seed parameters. Every stored path is re-solved on the new
metric and passes endpoint, whole-path refinement, Jacobi, and index checks.
Selecting a curve independently prepares and rechecks its Jacobi fields.

The reproducible accuracy audit uses an independent, unprojected adaptive
Dormand–Prince integrator, curvature from the determinant of the second fundamental
form, and an independent Prüfer phase for the scalar-field root count. The round
torus equators provide analytic checks. These numerical checks are not formal
interval certificates.

Explore ships the two shortest verified paths for every surface/endpoint pair in
a compact startup bank. Exact tuple packing of repeated Jacobi property names
keeps this bank under one megabyte, with no rounding or loss of sample data.
A failed large request or unavailable worker cannot leave exploration empty.
The full catalogue loads only for the current surface/endpoints. Both unchanged
one-summand banks retain their original 36 full-precision paths. The combined
catalogue is not downloaded or parsed at startup.

Regenerate the connected catalogues with `recompute-catalogues.cjs`, then run
`prepare-catalogues.cjs` to emit the six lazy JSON files, classic-script wrappers,
and startup bank. `generate-presentation.cjs` and `generate-showcases.cjs`
independently solve and recheck the curated examples. Presentation retains fixed
endpoints, index cutoff 24, and 4 / 8 / 12 examples with four new excursions per
added summand. Geometry versions are stored per stage because the standalone
torus remains unchanged.

Nearby shooting angles alone no longer identify duplicate paths: long sensitive
geodesics can diverge substantially despite very close initial directions. A
compact set of 17 arclength-based position samples distinguishes such paths during
merging and background search without cloning their full trajectory arrays.

For `file:` URLs the full catalogue loads as a classic script instead of a JSON
fetch, which browsers normally block for local files. Background search uses a
self-contained Blob worker containing the exact surface, solver, and search
protocol sources; it needs no local-file imports inside the worker. HTTP launches
keep the external worker and JSON catalogue, with script loading as a fallback.
The file worker source is reproducible with
`node morse-geodesics-lab/prepare-solver-worker.cjs`; regenerate it whenever its
canonical numerical sources change. Tests require exact source and result equality.

The large catalogue has a 15-second request deadline for slower connections;
bundled and restored paths remain usable while it loads. Manual search remains
available during that download. Automatic enrichment waits for the full result
to avoid repeating known shots. A transient worker failure is remembered only
for the current attempt, while an explicit Stop remains saved between visits.
Legacy records previously paused by a worker failure recover automatically,
including partially populated collections. Explicit user Stops remain marked and
respected; all precomputed paths still load while numerical searching is stopped.

After the view paints and next-summand geometry preparation finishes, Explore
automatically runs an Extended search with rotated starting guesses, adding up to
36 distinct validated paths beyond its starter collection. It uses the unchanged
shooting, integration, refinement, and acceptance tolerances. Six-attempt worker
batches pause immediately on interaction and wait 750 ms after the last input;
a held pointer remains paused even when stationary. Searches also wait through
traversal playback, an active length study, hidden pages, and connected-sum
preparation/animation. Catalogue UI updates are batched, preserving the selected
path, its Jacobi cache, camera, traversal, and reveal cutoff. Presentation and
Jacobi examples retain their separate, deterministic catalogues and reveal logic.

Validated full-precision paths and completed starting-guess cursors are saved
asynchronously in browser-local IndexedDB between interactions. Returning visits
restore the collection and resume only the remaining automatic budget; Stop stays
paused until another search is requested. Cache keys include exact endpoints,
surface geometry, solver version, and the curvature classification. Stale or
malformed records are ignored. Denied, blocked, or full storage falls back to a
bounded session cache; browsers without workers keep the starters and allow an
explicit manual search with the existing numerical fallback. No automatic search
is put on the rendering thread. Saving and picker refreshes wait for interaction
and animation to finish; leaving the page checkpoints accepted results.

"Search for more geodesics" continues unfinished starting-guess grids or opens
a fresh round, retaining separate cursors for Standard and Extended depths. A
trajectory cap or interrupted batch is not reported as full grid completion.
All searches remain finite and do not enumerate every ambient geodesic. No
former Cassini trajectories are reused.
The app opens with the surface grid alone and no geodesics revealed. Explore's
index slider starts at zero, its blank introduction position; raising it reveals
all found paths up to the displayed index, including index-zero paths. The blank
view reports how many geodesics are ready, distinguishing hidden paths from a
collection that is still loading. Returning
to zero clears them again. Presentation and Jacobi examples retain their common
index cutoff. The solid surface is initially off, with a 55% opacity preset when
enabled. The opacity control reveals rear trajectories
through a tinted surface while keeping front trajectories bright; 100% restores
an opaque surface. This is a display setting and does not change the surface metric,
computed paths, or Morse indices.

"Add a summand" animates the connected sum from one to two or from two to three
summands. Gold marks genuine curved discs on the existing surface and the incoming
torus. The discs lift away, the punctured torus moves into alignment, and annular
collars grow from both boundary loops until they meet. The first neck remains
unchanged when adding the third summand. The final joining annulus is cut from the
same smooth surface used by the numerical solver.
Gold rings follow the open collar boundaries during gluing; their points are
computed from cross-sections of that same surface.

Pause or scrub the construction to inspect any stage; Finish now commits the new
surface, and Cancel restores the source surface. Geodesics and numerical controls
pause during surgery. The target geometry's catalogue appears only after gluing is
complete. With reduced motion enabled, the construction starts paused for manual
inspection. Direct summand choices still switch immediately without animation.

The next connected-sum plan warms in a background worker after the current view
paints. Both the target mesh and animation pieces use the same full resolutions,
projection, normals, cut boundaries, and animation functions. Numeric-coordinate
caches avoid repeated vertex allocations, and the initial fade reuses the already
displayed surface/grid buffers. Default meshes, transferred geometry, and sampled
animation/collar outputs are checked for exact equality. If Add is clicked before
warming finishes, preparation stays off the drawing thread; Cancel and Finish now
retain their existing behavior. Browsers without workers prepare on demand using
the same optimized geometry code.

Connected-sum preparation also uses a self-contained Blob worker for direct
`file:` launches. It prepares and transfers the target grid as well as the surface
and cut pieces. Static GPU buffers and boundary tubes are uploaded before the
animation clock starts; the completed surface/grid buffers pass directly into
the ordinary view instead of being rebuilt at the last frame. Regenerate the
file-worker source after geometry/preparation changes with
`node morse-geodesics-lab/prepare-surgery-worker.cjs`.

During construction the shell becomes opaque smoothly, then restores the chosen
opacity and grid settings. Fading discs and the incoming torus composite over
already painted geometry, avoiding holes caused by nearly invisible depth writes.
The gold boundary loops retain the same 64-point sampling throughout gluing, and
the Canvas fallback clips collar polygons at the same moving planes as WebGL.
The camera eases out of a prior close-up/pan while retaining its orbit direction;
Cancel restores the original camera. These are display changes: the smooth
surface, mesh resolution, surgery pieces, and geodesic/Jacobi computations are
unchanged.

The cuts are at local `x = ±1.02`, between the torus height function's critical
values `R−r = 0.90` and `R+r = 1.80`. Thus each removed patch is a disc and each cut
has one boundary loop. These loops are ovals in space, and topological circles. The
animation shows the two-dimensional surface surgery representing the corresponding
four-dimensional connected sum.

### Optional explanation: inside the four-dimensional neck

Choose **Inside the neck**, beside Add, before or during construction. The
companion pane follows the existing construction slider while the main surface
stays visible. The same construction controls move into a full-width row beneath
both views; closing the explanation returns those controls and the previous pane
layout without changing progress, pause state, camera, or stored view sizes.

The neck explanation receives 45% of the shared width on desktop by default. Its
overview and close-up grow with the available viewport height, while a compact
construction bar keeps progress and playback controls visible beneath both views.
Wider canvases use larger labels and featured markers. Saved custom view heights
still apply; the remaining explanations stay reachable by scrolling inside the
companion pane.

Drag the divider between the torus and the neck explanation to change their
relative widths. Each right-hand animation has its own **Resize height** footer.
The two heights share the available panel space: enlarging one can reduce the
other to its useful minimum, while the construction slider stays outside the
resized area. These handles work during construction and retain their settings
when the explanation is closed and reopened. Focus a handle and use arrow keys
for keyboard resizing; Shift makes larger adjustments and Home restores that
dimension. **Reset neck view sizes** restores all three automatic sizes without
changing the saved sizes of the separate hidden-Jacobi view.

The upper overview shows the gold joining annulus inside blue and violet
surrounding material. Matching colored landmarks and strands line up across the
opening, and neighborhoods grow from both ends as the actual construction joins.
Three representative blue/purple strand pairs use separated normal offsets and
stronger colors so they remain distinguishable in a short overview. The complete
surrounding point populations remain available in both views.
Teal sections mark the inspected joining fronts or scanner position. The matching
rings on the main torus use actual surface sections, with a shared marker
identifying the selected point.

With **Follow join** enabled, the larger lower pane shows a close-up of both
three-dimensional joining neighborhoods. Equally emphasized normal-disc samples
are distributed all around the gold circle, with matching interior landmarks,
radial spokes and continuous longitudinal strands. Corresponding samples align
and identify simultaneously throughout the **D² × S¹ neighborhood**; the numbered
discs are cross-sections used to show that matching, rather than the gluing locus.
One green point on the gold surface circle matches the selected surface point
in the main torus and upper view throughout construction and scanning. The six
coral numbered reference markers lie off the surface, on the rims of the normal
discs. A compact key distinguishes these roles; filled and outlined coral markers
still identify the existing and incoming neighborhoods.

The optional **Link the views** button follows blue **A** and purple **B**, two
fixed interior landmarks, through both right-hand representations. Filled and
outlined copies match at the actual joining fronts, then identify into one pair.
A magnification callout connects the inspected upper section to its enlarged
lower neighborhood. As joining progresses, 24 additional landmarks brighten
around the whole loop, including interiors and boundaries in both hidden
directions. Their coordinates remain fixed off the surface; only the drawings
approach and identify. A note explains that the upper projection compresses one
hidden direction. Manual scanning and optional symmetry keep the same landmark
identities. The explanation defaults on, can be switched off, retains its choice through construction,
and uses the construction slider's deterministic timeline with no extra clock.

The exploded spacing separates the two copies for clarity, and their normal
discs retain their extent. Distributed guide paths show continuation through the
join, and the pane transitions smoothly into the scanner at the end of
construction. Every movement follows construction progress, so pausing and
reverse scrubbing reproduce the same state.

The scanner shows a populated three-dimensional neighborhood of the surface
circle. An opened wedge exposes its interior and a normal disc with two independent
off-surface coordinates. This is explicitly one normal cross-section, meeting the
gold circle at a point. It is distinct from the disc removed within each torus at
the start of construction. The five section buttons show which positions along the
neck have joined. The **Scan position** range or an available section button
switches directly to manual inspection; **Follow join** returns to the construction
close-up. **Existing** and **New summand** choose the emphasized joining edge.
An unfinished gap cannot be scanned: positions
inside it resolve to the nearest joined edge, including when scrubbing construction
backward. The whole matching neck remains inspectable after completion. A new
construction returns to following its joining edge; cancelling or changing to an
unrelated surface clears stale neck context. Scanning does not advance or pause
construction, and the component has no independent animation clock.

The precise relationship is `S¹ × I ⊂ S³ × I`: one surface circle lies in each
three-dimensional cross-section of the four-dimensional neck. The colored material
represents `S¹ × D² × I`, a neighborhood of the annulus, rather than the entire
`S³ × I` neck. The overview projects away one combination of the hidden coordinates;
the lower scanner shows the full local `S¹ × D²` neighborhood in stereographic
coordinates on `S³` with one point omitted. Its landmarks are coordinate guides,
not Jacobi fields or computed geodesics, and its illustrative sizes do not depict
the metric used for numerical calculations.

**How to read this neighborhood** contains the dimensional explanation and an
optional **Show the symmetry** control, which selects the manual scanner.
Resuming **Follow join** closes this inspection. Reversing both off-surface coordinates,
`(u,v) ↦ (−u,−v)`, turns the surrounding population while the gold surface stays
fixed. Choosing a compatible invariant ambient metric makes the fixed surface
totally geodesic. These explanatory coordinates do not alter the surface geometry,
Jacobi fields, or numerical search.

To recompute the bundled catalogues with Node.js, from the repository root run:

```sh
node morse-geodesics-lab/recompute-catalogues.cjs
```

This regenerates `catalogue-data.js` using the current surface equations and solver.
The browser app does not require Node.js. Run the geometry and solver checks with:

```sh
node --test morse-geodesics-lab/surface.test.cjs morse-geodesics-lab/solver.test.cjs morse-geodesics-lab/surgery.test.cjs
```

Surface Jacobi fields supply a numerical intrinsic Morse index. The two hidden
normal directions have Jacobi equation `V'' + c V = 0` in arc length. For a curve of
length `L`, away from conjugate endpoint lengths, its full ambient index is

```text
index = surface index + 2 floor(L √c / π).
```

If `L √c / π` is a positive integer `q`, the normal index is `2(q − 1)` and the normal
nullity is two. Such endpoint cases must not be treated as nondegenerate critical
points. Intrinsic conjugate endpoints and numerically near-degenerate cases likewise
require care. This experiment's reported indices are numerical rather than a
certified Morse complex.

The main cutoff filters already found curves by their ambient Morse index. Traversal
time is a separate control that moves a point along a selected trajectory. Index,
length, and energy are different quantities.

## Relation to Theorem B

For copies of S² × S², the theorem has `d = 2` and `r = 2`. Its first bound gives

```text
dim H_N(ΩX; Q) ≥ 2k [2(k−1)]^(N−1),    N ≥ 1, k ≥ 2.

Two summands:   2^(N + 1).
Three summands: 6 · 4^(N − 1).
```

Under the fixed-endpoint Morse nondegeneracy assumptions, this forces at least that
many index-`N` critical geodesics in the whole path space. The visible surface gives
only a selected subset of those trajectories; its found count need not reach the
theorem's lower bound. No canonical correspondence between a Betti basis and the
displayed curves is asserted. The one-summand view does not apply the connected-sum
bound, which assumes at least two summands.

An index-`N` critical geodesic contributes an `N`-cell when its critical energy is
crossed. That cell can create or kill homology, so critical-point counts are lower
bounded by Betti numbers rather than equal to them. The index cutoff is not an
energy-sublevel filtration.

## Watching Jacobi focusing

The selected geodesic has a surface Jacobi ribbon, conjugate-point badges,
three synchronized field graphs, and an optional hidden-neighborhood cutaway.
A surface zero pinches the ribbon and contributes one to the index. A simultaneous
zero of the two independent hidden fields refocuses the cutaway and contributes
two. Coincident surface and hidden roots carry multiplicity three. Badge buttons
on the curve, travel bar, and contribution row pause at the corresponding arclength.
The running count includes an event only after it has been passed; events at the
fixed destination are nullity rather than index. Traversal slows just before an
interior event and stops at the destination, where the count equals the full index.

The intrinsic field satisfies `j'' + K(γ(s)) j = 0`, `j(0)=0`, `j'(0)=1`.
Both hidden fields have scalar factor `sin(√c s)/√c` in two independent parallel
normal directions. The optional cutaway straightens the geodesic and shows these
two off-surface fields separating and refocusing. The fields use the chosen ambient
tube metric, not the round product metric on S² × S². Long unstable fields can make
earlier separations look very small at a fixed whole-path scale; the event badges
remain available to inspect their zeros.

The surface ribbon follows the actual field’s surface direction and uses a small
retraction into the visible surface. Its edges illustrate magnified infinitesimal
separation rather than exact finite neighboring geodesics. The ribbon controls
choose how its width represents field magnitude. The main index slider continues
to filter the catalogue; it does not change a selected geodesic or its Jacobi
equation. The optional length study below traversal compares finite pushes before,
at, and after a focus.

## Optional fixed-endpoint length study

Expand **Push the path · length study** beneath traversal. Choose a +2 hidden
focus or +1 surface pinch and compare **Before**, **At focus**, and **After**.
The study uses `γ|[0,T]`, from `x` to the traveler `p=γ(T)`. Manual traversal
chooses a new segment and retains the push within its permitted range. The three bookmark buttons preserve
its physical coefficients while moving `p`, following the same evolving mode.
Each individual push fixes its chosen endpoints exactly. The original tail to
`y` is dimmed; the facts report segment length and index, counting only events
strictly before `p`. The green surface Jacobi ribbon stays visible as focusing
context along the original geodesic during the finite-curve comparison. The coral
(mode 1) or gold (mode 2) surface push is a separate finite deformation; purple
continues to identify hidden direction 2. The Jacobi-fields checkbox controls
the ribbon in both ordinary viewing and the push study.

For hidden mode `n`, with `r = sqrt(A²+B²)` and `ω=nπ/T`, the finite curve is

```text
q_A,B(s) = (γ(s), A sin(ωs), B sin(ωs)).
λ_n = (nπ/T)² − c.
L(A,B) = ∫ sqrt(r²ω² cos²(ωs) + cos²(√c r sin(ωs))) ds.
```

The length is computed in the actual tube metric, independently of either
drawing. The controls select **Hidden direction 1** (blue) or **Hidden direction 2**
(purple) and one nonnegative **Push size** slider. Only `(A,B)=(r,0)` or `(0,r)`
is exposed. Switching direction preserves physical size and measured length;
the symmetric metric gives both directions the same eigenvalue and length response.
The hidden graph's horizontal axis runs from `r=0` (no push) to the maximum size.
Surface deformations retain a signed horizontal axis: negative and positive
coefficients move left and right and can have different finite lengths.
The vertical axis remains the percentage length change; below the original line
means shorter in both displays.
The main torus shows the finite hidden push as a **schematic projection**.
The default **Follow surface** uses axes `(n+b)/sqrt(2)` and `(n-b)/sqrt(2)`,
where n is the visible surface normal and b is its sideways tangent. These
turn with the torus through the improved collar. The optional **Stable
illustration** instead uses two fixed, independent 3D axes chosen once at x,
balanced for visibility in the default camera. Both represent the hidden
coordinates schematically and use the same physical length calculation.
The displayed gain is labeled; surface-following axes use the existing curvature
limit, while fixed axes use their short-segment/high-mode slope limit. Zeros,
relative lobe sizes, and pinned endpoints are preserved.

Surface Hessian pushes now request **3× display magnification**, matching the
initial hidden push scale. The enlarged drawing reprojects
`gamma(s) + g*A*f(s)*b(s)` onto the same smooth surface. Both comparison modes use
one shared gain, checked for both signs at their common permitted maximum push.
This gain is independent of the current slider value, so a small push stays
small and the view does not breathe near zero. The adaptive renderer resolves
the enlarged curve and recomputes its normals. Scene labels distinguish the
magnified drawing from the physical push: eigenvalues, slider units, and length
graphs continue to use `A` and the original verified numerical profiles.

A pale original footprint, a translucent band, and bright displacement arrows
show the push. Surface pushes use coral for mode 1 and gold for mode 2, with the labeled display magnification. The arrows
point from the original to the finite pushed curve, separately from the mint
Jacobi ribbon. The band and arrows disappear at zero push; occluded hidden lobes
remain faintly visible through a solid surface. The camera does not refit as push
size changes, preventing jumps near zero. Real surface-mode localization is
preserved rather than magnifying each part of a mode independently.

Optional **Display scale & directions** requests a main drawing scale (initially
3x, range 1-6x). The main caption reports applied/requested scales when limited.
**Hidden view** opens the separate cutaway beside the torus, with its own labeled
transverse magnification (initially 30x); it is not required to see the push.
Its transverse scale remains independent of segment length and proportional to
physical displacement. The local metric is used within `|y| < 0.20`; permitted
physical push is at most `0.12`. Eigenvalues, modes, physical ranges, and metric
lengths are unchanged by all drawing scale and projection controls.

`deformation-sampling.js` adaptively evaluates the actual finite surface or
schematic hidden curve, refining tight bends by chord error and turning angle.
Mode-aware seeds retain alternating lobes. Its vertices reach the selected
deformation mesh without the catalogue renderer's uniform point reduction.
`deformation-tube.js` transports perpendicular tube frames with minimal rotation;
surface clearance is a separate centerline offset, and hidden pushes have no
extra normal offset. Exact drawing baselines use bounded caches for the two most
recently displayed profiles. All of this remains separate from numerical mode
solving and energy/length quadrature.

During a push study the cutaway frames the active `x → p(T)` segment across the
window, with the original tail reduced to a faint continuation arrow. Its default
study angle separates the two hidden axes;
camera adjustments made by the audience are preserved. Transverse sizing uses
one fixed physical reference as amplitude changes. Increasing magnification can
take a push outside the frame, which is explicitly labelled rather than silently
fitting it away. The selected finite hidden push also shows a translucent band
and transverse arrows, while the separate Jacobi strands remain faint context.
Closing the study restores the ordinary whole-path cutaway.

For surface event ordinal `k`, `downhill.js` computes the corresponding Dirichlet
mode of `−f″ − K(γ(s))f = λf` on nested meshes, using Sturm bisection and inverse
iteration. Its first lobe is oriented positively as `T` changes. A signed push
produces `project(γ(s) + A f(s)e(s))`, with `e` the unit sideways direction.
The surface deformation curve stays on the smooth surface, and integrating its actual speed
computes length in the induced metric. Both signs are sides of one direction;
these finite curves generally are not geodesics.

**Compare surface modes 1 & 2** replaces the focus study with an optional
comparison on the same `γ|[0,T]`. Both actual Hessian coefficient functions are
drawn on one position axis, and both measured length curves share one signed
push axis and comparison scale. Mode buttons change only the deformation pattern
shown on the torus: the endpoint, baseline length, and physical push coefficient
stay fixed. Coefficients are peak normalized (`max |f| = 1`), so the common slider
compares the same maximum infinitesimal sideways displacement. Eigenvalue signs
describe second-order behavior; the finite lengths are measured separately.

**Past second +1** explicitly moves the common endpoint just past the second
surface focus, stopping before the next event or destination. On the first
showcase path this exposes two negative surface eigenvalues, while mode 2 has
one interior sign change and mode 1 has none. Traversal can choose a different
common segment; changing it resets the push. **Return to focus study** restores
the Before / At / After controls without moving that endpoint. The green ribbon
continues to show the Jacobi field. The selectable push patterns solve the
Hessian eigenvalue equation and are Jacobi fields only at eigenvalue zero.

All stages allow finite pushes after projection and convergence checks, whether
the mode is positive, negative, or neutral. Before the chosen focus, sufficiently
small pushes increase length; after it they decrease length. Neutrality at focus
is only a second-order statement. Hidden finite length begins with a sixth-order
rise, `T c³ r⁶ / 72`; surface finite length can have asymmetric higher-order
changes of either sign. Unresolved changes are labelled rather than forced to
zero. Earlier negative modes may already exist at later events. Along a unit-speed
geodesic the second variation of length in these normal directions is the same
index form used for energy, so the conjugate-point interpretation is preserved.

The display uses true arc length `∫|velocity| ds`, not energy or a square-root
conversion from energy. Its original length is `L₀=T`; plotted percentages are
`(L−T)/T`. Surface differences pair deformed and original speed measurements on
nested grids, while hidden differences use a rationalized square-root integrand
to avoid cancellation. Estimated uncertainties are convergence diagnostics,
not rigorous error enclosures. Twelve increasing radii, both surface signs,
and projection probes check the permitted range; this is not an interval proof
for all intermediate amplitudes. The energy API is retained for mathematical
regression checks, including a sphere example where length is unchanged while
energy rises because parameter speed varies.

**Fit selected** reveals the active curve’s shape; **Compare all** uses a common
percentage scale for Before/At/After. At focus the initial automatic setting fits
that curve independently, because its length changes can be tens of thousands of
times smaller than nearby stages. The caption and axis ticks identify the active
scale. Vertical zoom provides 1×–1,000× magnification, and Radius range / Signed
range zoom inspects
up to 100× closer to zero. Zoom evaluates 33 actual length samples in the displayed
range, never extrapolating past the checked physical cap. Out-of-range curves are
clipped and identified; shapes below numerical resolution show their uncertainty.
Each segment is compared with its own original length, rather than comparing
absolute lengths between different endpoint problems.

The panel starts closed. Opening pauses traversal and path reveal; closing
restores the full-path ribbon and facts. Profiles and reference curves are lazy,
debounced, and cached by both geodesic and metric-model identity; ordinary
playback solves no eigenproblem. Optional Before/At/After reference profiles use
idle-priority tasks (short timer yields where idle callbacks are unavailable),
so the selected mode is prepared first and input can run between comparisons.
The two Jacobi
examples support surface and hidden pushes at all three highlighted stages.

When a selected segment settles for 180 ms, a shared preparation pool warms its
first two surface Hessian modes, even with the optional panel closed. Both the
focus selector and two-mode comparison consume these same verified profiles.
Selecting an unfinished mode promotes its current job rather than restarting
it. The pool retains at most eight completed profiles, keyed by geodesic, metric
model, exact established endpoint, and mode; it never substitutes a nearby
segment or interpolates an eigenfunction.

Preparation uses the same solver as synchronous `prepare()`, advanced through
resumable checkpoints of at most 64 geometric samples. Background work uses
small 4 ms task budgets; requested modes use 8 ms budgets. Supported browsers
schedule these at background/user-visible priority, with cancellable timer
fallbacks. Cheap arithmetic checkpoints can now fill those same budgets instead
of stopping after only 64 checkpoints; a 2,048-checkpoint safety ceiling also
guarantees a yield if a clock does not advance. This avoids mostly empty tasks
and the delay imposed by clamped fallback timers. Background work pauses during held gestures, playback, staged path reveal,
connected sums, geometry preparation, and page hiding. While only a traversal
slider is held, requested modes for its current exact segment can continue in
4 ms slices; other gestures still pause all work. Obsolete segments are
cancelled. For an active surface or hidden push, the pool first verifies the retained
physical amplitude using the same eigenfunction, nested length/energy quadrature,
error thresholds, and 360 projection probes. That exact push can be displayed
before all 24 amplitude-range checks finish. Its profile explicitly marks the
range as pending; the push control stays disabled and no unchecked length curve
is drawn. The original full-range checks continue in the background, then enable
the control at the verified cap. A smaller cap clamps an interior push rather
than rescaling it. An explicitly selected surface-slider endpoint (±100%)
instead follows each segment's verified maximum. Its thumb stays at that endpoint
through preparation and zero-cap segments; its numerical readout always reports
the actual physical push. Returning to a larger range restores its full maximum
rather than retaining a previous segment's smaller cap. No numerical mesh,
tolerance, or coefficient changes.
`downhill-current.test.cjs` checks current-only verification and equivalence to
the complete profile; `downhill-steps.test.cjs` checks bit-identical
results after interruptions; preparation and app integration tests cover shared
jobs, priority, cancellation, bounded storage, and local-file compatibility.

Surface traversal retains an interior signed physical push or an explicitly
selected maximum, along with the selected mode, including in the two-mode
comparison. Hidden traversal retains its radius and
selected axis; switching axes at a verified radius shares the same radial metric
check. Both traversal sliders use the same queue. Rapid inputs keep only the latest waiting
endpoint while the current exact calculation finishes. The path, endpoint,
variation field, facts, and length measurement commit together; the slider thumb
can track the requested position while the percentage reports the displayed
position. No nearby eigenfunction or interpolated deformation is substituted.
Once the current push is visible, its remaining range checks take precedence
over speculative surface-mode warmups, while still yielding in background tasks
and pausing throughout a held traversal.

Hidden energy and length quadrature share the exact wave/velocity/warping values
on their original coarse and fine grids. Each sum retains its original arithmetic
and accumulation order. Current-push metric caches are separate from the full
scan's historical rounded-amplitude caches, so an adjacent floating-point push
cannot change which value the full scan computes first. Hidden numerical work
scales with mode rank; the longer-segment rendering cost instead comes from the
additional stations needed to resolve the actual path and deformation.

Returning to a verified mode on the same fixed segment bypasses the preparation
debounce and its blank frame. The main view retains at most four exact surface
drawings (including their variation bands and arrows), keyed by the profile,
model, physical push, and common comparison scale. Switching still replaces the
GPU buffers, preventing a previous mode from sticking on screen. Closing the
study releases the drawings. Quadrature reuses the original segment's unchanged
baseline velocities and speeds; the mesh, arithmetic, projection checks,
coefficients, and drawing tolerances are unchanged.
Adaptive drawing also avoids projecting a physical push that it immediately
discards: baseline sampling supplies the same exact stations, and the existing
display mapper evaluates the magnified deformation. The accepted vertices,
variation arrows, projection diagnostics, and curve tolerances are unchanged.

The coarse/fine quadrature pair also reuses a coarse Newton projection at a fine
node only when all three projection inputs match with `Object.is`, including
signed zero. This skips duplicate retractions while retaining both complete
quadratures and all verification checks; its temporary storage covers only one
grid pair.
Newton retraction also uses the identical first-order gradient directly, instead
of constructing an unused Hessian of the implicit surface, and retains each
accepted scalar value for its next iteration. The normal, full jet, curvature,
iteration limits, damping, and convergence tests remain unchanged.

Surface preparation reuses curvature values only at identical floating-point
stations of the original nested meshes. A bounded per-basis geometry cache also
shares exact baseline samples across quadrature meshes and display evaluation.
Sturm bisection skips the rest of a recurrence once its negative-pivot count has
already reached the requested rank; that cannot change the bound decision. All
64 bisection iterations, inverse iterations, meshes, and error checks remain.
The reference tube samples the selected profile's exact zero-push evaluator,
warming its existing display cache before the deformation uses the same stations.
Reference and deformation retain their separate original adaptive decisions.

`downhill.test.cjs` checks true tube/surface length, analytic spectra, the
length/energy distinction, exact endpoints, both showcase paths, and invalid
inputs. Controls tests cover mode ordinals, physical coefficients, reference
ownership, safe sampling callbacks, and stale job cancellation. Graph tests cover
fitting, honest uncertainty, zoom, clipping, and true sampling near zero.

## Resizable observation panes

The torus and hidden view are docked panes with full-width **Drag to resize height**
bars along their lower edges. Drag a bar to choose that pane’s height independently; drag
the divider between the two panes to change their widths. Traversal stays below
the taller pane. Arrow keys resize focused grips, Shift increases the step, and
Home or **Reset view sizes** (the ↔ camera-toolbar button) restores the current
mode’s responsive defaults. Sizes survive mode, study, and docking changes within
the session. Narrow-window fitting preserves the requested divider ratio for
when the wider layout returns. The full-width hidden view has its own stored canvas height. The bars
reserve footer space so the canvas and readouts cannot cover them, and stay
anchored to the pointer if the page scrolls during a drag.

Opening the optional push study gives both panes more default height and aligns
the observation console in the viewport once. The shared traversal stays directly
beneath them, and existing custom heights remain in force. Moving a push does not
reposition the page. Short manually sized hidden panes scroll their explanations
above the resize bar.

Narrow screens stack the panes, retaining independent height grips. Construction
locks resizing to preserve the animation’s fixed canvas rectangle. Layout changes
leave the camera state, geodesic data, and shared traversal untouched.
`view-resize.test.cjs` covers pointer capture, keyboard control, bounds, independent
sizes, docking persistence, responsive defaults, reset, and construction locking.

`solver.js` refines intrinsic zero times on its integration grid before display
sampling and retains their positions, tangents, and derivatives in new shots.
`jacobi.js` verifies the selected initial-value problem on nested grids, then
`jacobi-sampling.js` compresses the fine output with error checks on both the field
and its derivative. Cubic extrema are checked to prevent invented interpolation
zeros. Surface positions use Hermite interpolation and retraction; tangents come
from the same interpolant's derivative, projected to the tangent plane. The app
caches this data without modifying the bundled catalogue. The recovered weighted
count must agree with the recorded ambient index.

Run the additional mathematical checks with:

```sh
node --test morse-geodesics-lab/jacobi.test.cjs
```

## Shared observation console

The enlarged surface view occupies most of the observation console. Explore and
the growth presentation have a full-height geodesic picker with its index filter
in a narrow adjacent column. Jacobi examples use a full-width surface, with the
picker in a compact shelf below traversal. A single travel slider sits directly
beneath the view. Summand buttons and layer switches share a
slim toolbar; endpoint, search, and theorem details are collapsed below the main
view. The responsive layout keeps traversal accessible, and selecting a path on
a narrow screen returns to the observation view. Jacobi field graphs and the
fuller conjugate-point explanation remain in an expandable section. For the +2
explanation, enable **Cutaway beside torus** to compare the surface ribbon with the
two hidden fields using the same traversal slider.
In that side-by-side layout the picker also becomes a shelf beneath traversal,
leaving both visualizations large.

Each of the three graphs has its own vertical zoom slider (0.1× to 1,000,000×).
Zoom remains linear in field magnitude and leaves arclength, signs, and zeros
unchanged. Large peaks are clipped to their own graph row. The displayed ±
references give the actual field-unit scale; **Fit all fields** resets all three
to their full-path scales. Zoom settings persist when selecting another path.

## Presentation mode

Choose **Presentation** in the toolbar to show a curated collection of **4 → 8 →
12 computed geodesics** as summands are added. Both endpoints stay at the same
points in the original torus, outside every attachment patch. All stages use
the same ambient Morse-index cutoff, **24**. Search and endpoint/index edits
remain available in **Explore**; returning there restores the previous surface,
endpoints, catalogue, selection, traversal position, cutoff, view mode, and camera.

Each stage starts with the earlier verified paths and traces four additional
paths one at a time. The new paths are two reflected pairs of distinct off-plane
geodesics that visit the added body and return to the fixed destination. Earlier
paths avoid later surgery patches and are independently rechecked on each surface.
The presentation shows selected examples, not an exhaustive count or a numerical
realization of the theorem's ambient lower bound.

**Pause reveal**, **Replay stage**, and **Show all** control the reveal; **Add**
starts the connected-sum animation after the stage is fully revealed. Selecting a
path pauses the reveal for ordinary Jacobi inspection. Returning to full-color
view and resuming continues it. Reduced-motion users start with the reveal paused;
hidden tabs also pause rather than skipping ahead. The common cutoff survives
construction, cancellation, and direct summand switches.

`presentation-data.js` is separate from the exploration catalogue. Reproduce it:

```sh
node morse-geodesics-lab/generate-presentation.cjs
```

The generator re-solves the selected shots and checks their endpoints, full ambient
indices, refined Jacobi fields, route visits, and distinctness before writing data.
Its optional `--discover` flag replays the finite launch-angle/length search used
to find the route basins. The 24 stage records have checked endpoint errors below
`7.4e-6`, with nested-grid conjugate-time discrepancies below `4.2e-8`; these are
numerical convergence checks, not rigorous error bounds.

## Selected Jacobi examples

Choose **Jacobi examples** in the mode selector for two two-summand paths chosen
by their actual whole-path-normalized field profiles. Both use the presentation's
fixed endpoints and index cutoff 24. This separate collection leaves the growth
presentation's 4 → 8 → 12 paths intact. **Back to presentation / Explore** restores
the previous collection, selection, traversal, camera, ribbon settings, and reveal
position (paused).

| Example | Chosen +2 hidden focus | Chosen +1 surface pinch | Total index |
| --- | --- | --- | --- |
| Clear first pinch | s ≈ 5.236 | s ≈ 6.009 | 6 |
| Return from the second torus | s ≈ 15.708 | s ≈ 18.648 | 10 |

The first stays in the original torus. The second crosses the neck, visits the
second body, and returns with a broad ribbon lobe near its last surface zero.
Each button restores a camera facing its chosen events, shows that path alone,
and uses field-magnitude ribbon scaling (half-width .22, power .5). There is one
fixed scale along the whole path; no per-lobe normalization or artificial width
floor is introduced. The ordinary ribbon controls remain available.

**Start excerpt** begins shortly before the chosen +2; half-speed playback pauses
at +2 and then +1. **Show +2 focus** and **Show +1 pinch** seek to the actual refined
events. The second excerpt begins after seven earlier index contributions, which
the cue line states. These buttons refer to event multiplicities, not total index.

Reproduce the data with `node morse-geodesics-lab/generate-showcases.cjs`.
Tests recheck the endpoints, full Jacobi index, exact bookmarked events, and
nonzero ribbon widths around the chosen pinch and at the chosen hidden focus.

## Optional ambient-space explanation

**Where is the rest of the space?** opens below the observation console and is
collapsed initially. Its own canvas shows a miniature torus and two spheres:
one point on each equator corresponds to a torus point. Longitude sliders explore
the two surface coordinates; optional latitude sliders move either point off its
equator while remaining in S² × S². Hollow markers and dashed loops on the torus
are explicitly references when the actual point or loop has left it.

For a selected geodesic in the one-summand view, **Follow selected geodesic** links
the two equator markers to the existing traveler and traversal slider. Manual
coordinate edits turn following off. In the connected-sum views the panel explains
one summand, with an explicit warning that the joins have no global sphere-pair
chart; following is unavailable there.

**Shrink a loop** contracts either torus generator through latitude circles to
the north pole in its sphere, keeping the other sphere coordinate fixed. Play,
pause, replay, and a manual contraction slider are independent of geodesic
traversal. Closing the panel, hiding the page, or starting connected-sum surgery
pauses this animation. Nothing auto-plays; reduced-motion users can scrub or
explicitly choose Play. The contraction illustrates topology, not geodesic flow
in the chosen metric, an energy-decreasing deformation, or a 3D embedding of the
full manifold.

`ambient-explorer.test.cjs` checks product coordinates, torus round-trips,
independent latitude freedoms, exact contraction to a pole for both generators,
and bounded animation advance.

## Optional hidden-neighborhood cutaway

The whole-path pose now fits the pane's projected width and height, including
space for coordinate guides and endpoint labels. Enlarging the hidden pane,
including vertically, enlarges the global field display immediately. The fit
uses one fixed whole-path envelope, so holding or moving either traversal slider
does not make it breathe with the cursor. Camera orientation and signed field
ratios are preserved; the coordinate illustration uses separate screen scales.
Manual magnification is applied after this base fit. The same smooth transition
blends into the existing local fixed-endpoint framing on release; physical Jacobi
values, finite pushes, and measured lengths do not change.

**Reveal the hidden neighborhood** opens a straightened coordinate view along
the selected geodesic. Its three displayed coordinates are distance along the
path and the two directions normal to the visible surface. The sideways surface
direction is omitted, so the surface meets this cutaway only in its centerline.
The surface ribbon shows the omitted sideways field on the torus itself. The
cutaway is a local/pullback illustration along the path, including when the
geodesic visits the same surface point more than once; it does not claim to embed
a global tube in ordinary 3D space.

Both hidden fields use the same exact coefficient `h(s) = sin(√c s)/√c` for
the chosen ambient metric (`c = 0.36`). Orange and purple generator curves keep
their signed values in a fixed parallel normal frame; their opposite launches
and faint combinations add no independent index directions. A magnified moving
cross-section follows traversal and collapses at hidden conjugate events.
One fixed display scale along the whole path preserves the field's growth,
contraction, and zeros; magnification affects only the illustration.

**Cutaway beside torus** in the main toolbar places the cutaway beside the
surface, with one shared traversal slider directly beneath both. A compact path
selector stays beside traversal, and the full geodesic picker remains accessible.
On narrow screens the two views stack above the same slider.
**Full width** restores the cutaway's longer explanation and duplicate linked
controls below the console. The same component is moved between layouts, keeping
its camera and magnification. Closing the docked cutaway restores the main layout.

The cutaway's position and playback controls operate the existing traversal
state. Hidden-event buttons seek to the same exact arclengths as the main badges.
An interior hidden event contributes two only after it is passed; a hidden event
at the destination contributes nullity two instead. Surface-only events do not
pinch the hidden fields. Closing the view stops its drawing without stopping
traversal in the main view, and reopening shows the current position.

During a length study, holding either traversal slider shows the whole path,
including pauses while the mouse button remains down. A short 0.12-second zoom
out makes brief clicks visible. Focus transfers from buttons or other controls
do not end the hold; only genuine window blur counts as leaving the window.
Releasing restores the
local pinned segment through a 0.8-second eased zoom and camera turn. The same
Jacobi strands and endpoints move continuously while annotations crossfade;
regrabbing reverses from the currently displayed pose. Numerical preparation
does not restart the transition or change this framing;
keyboard traversal stays local. Release outside the slider, cancellation, or
leaving the page also ends the hold. Reduced-motion preferences use an immediate
framing change, and closing or hiding the cutaway stops its animation loop.

The plotted strands are magnified first-order Jacobi separations, not exact
finite neighboring geodesics. The geodesic solver, event locations, and index
counts are shared with the existing display and are not recomputed by this view.

Summands use compact 1/2/3 buttons. The “Selected only” view hides other
trajectories without discarding the catalogue or changing Jacobi data. The Paths
menu restores the collection in either full-color overview or inspection mode.

The ribbon defaults to field magnitude, with a smaller maximum half-width of
0.16 and moderate dynamic-range compression. Expand **Ribbon scale** below the
travel control to adjust size (0.04–0.30) and compression (0–80%). For one fixed
whole-path maximum `M = max |j|`, its signed half-width is:

```text
width = W sign(j) (|j| / M)^p,     p = 1 − compression/100.
```

The **Proportional** shortcut selects field magnitude with zero compression
(`p=1`), preserving actual magnitude ratios along the path and between successive
lobes. Larger compression boosts small separations while retaining growth and
contraction. The default is 50%, `p=0.5`. There is no per-lobe rescaling or minimum
width floor. Very small nonzero fields may fall below visibility in a faithful
scale; they are not conjugate points. The selected gold centerline retains its
emphasis with the ribbon shown. The UI displays the current
formula and whole-path reference amplitude. Changing display settings keeps the
numerical preparation cached and rebuilds only the ribbon mesh and GPU buffers.

**Focusing aid** retains the optional local phase illustration:

```text
width = W sign(j) [ |j| / hypot(j, 0.30 j′) ]^p.
```

The factor multiplying `j′` is a display length in surface units. This mode
emphasizes pinches while suppressing amplitude growth, and is labelled accordingly.
Both modes preserve computed zeros, signs, and directions; neither is a finite
neighboring geodesic. Extra samples show refined pinches, and hidden events never
create a surface pinch. The cutaway and graphs retain their actual fields with
display scales that stay fixed along the whole path. The front ribbon redraws after the surface using depth testing;
rear strips retain surface tint.

`jacobi-ribbon-mesh.js` fixes dark patches caused by broad flat facets cutting
through the curved surface. Its shared transverse grid includes the centerline;
edge and face probes trigger refinement across or along the strip as needed.
Vertices are retracted onto the smooth surface then lifted by 0.012. A 0.007
probe-clearance target leaves room for the displayed surface triangulation too.
Exact zero rows remain collapsed. The Canvas fallback uses the small cells as
well. Budgets bound mesh refinement; tessellation never alters the Jacobi data.

`jacobi-ribbon.test.cjs` checks exact proportional ratios, controlled compression,
analytic exponential growth, rescaling, and focusing-aid visibility.
`jacobi-ribbon-mesh.test.cjs` reproduces the former buried center strip and checks
facet clearance on the torus and necks at wide settings. `ribbon-render.test.cjs`
checks front/rear visibility and depth restoration, including 100% surface opacity.
The earlier round-chain-v1 all-150 display audit distinguished expected small amplitude widths from
focusing-aid visibility, and checks for extra interpolated roots and Float32
collapse. Add `--mesh` to audit default and extreme focusing meshes too.

## Numerical accuracy audit

The compact-collar adoption audit checked all **265** newly stored connected-sum
paths against the independent unprojected integrator. All intrinsic indices,
Jacobi root counts, and independent Prüfer counts agreed; no path failed
verification. The stored position and Jacobi samples reproduced exactly.

| Current compact-collar audit | Largest observed difference |
| --- | ---: |
| Sampled position | `9.10e-8` surface units |
| Local joint Jacobi state, relative | `7.56e-8` |
| Intrinsic conjugate time | `4.14e-9` arclength units |

These are observed differences, not certified error bounds. Tightening the
reference tolerance from `1e-14` to `2e-15` on the most sensitive field case changed
position by `1.77e-8` and the local joint state by `1.47e-8` relative. The audit
allows up to 200,000 steps for its additional halving of the already refined
stored grid; the application's ordinary acceptance budget is unchanged.

`integrateVerified` starts with the existing RK4 grid and doubles it until the
observed nested-grid differences meet all three targets:

| Quantity | Comparison target |
| --- | --- |
| Geodesic position | `5e-7` surface units |
| Joint `(j,j′)` state, relative to its local pair norm | `2e-6` |
| Intrinsic conjugate time | `2e-7` arclength units |

Root counts and indices must also agree. Sensitive IVPs can use up to 100,000
steps; exhaustion is reported instead of silently accepting the last result.
Additional precision is spent on the paths that require it. The following
historical measurements describe the former round-chain-v1 surface and its
150-path catalogue; they do not describe the newly adopted compact collar.

Measured maximum discrepancies against the independent integrator were:

| Quantity | Original stored grid (about 0.0025) | Selectively refined grid |
| --- | --- | --- |
| Sampled position | `3.58e-6` | `5.96e-8` |
| Local joint Jacobi state, relative | `2.07e-5` | `2.83e-7` |
| Intrinsic conjugate time | `7.45e-7` | `2.23e-8` |

All 150 intrinsic indices and root counts agreed. These are observed differences,
not certified error bounds. The independent reference shares the analytic surface
jet, and double precision limits its accuracy too: tightening its tolerance from
`1e-14` to `2e-15` on the most sensitive curve changed position by `5.67e-8`, the
joint field state by `3.27e-7` relative, and roots by `9.75e-9`. Comparisons near
that uncertainty should not be interpreted as exact errors.

Surface, speed, and tangency diagnostics now measure the raw step **before**
projection and normalization. The former post-correction speed error largely
measured the normalization itself. The solver reuses analytic derivative jets
for these diagnostics and avoids duplicate normal dot products. The endpoint
warning band remains a warning; it no longer erases strict interior intrinsic
zeros from the index.

Display interpolation has a separate accuracy budget: `1e-7` in position and
`1e-6` in the local joint field state when compared with fine-grid samples.
Earlier uniform thinning produced joint-state interpolation discrepancies up to
about `0.002` on the longest path. Adaptive Hermite knots add detail in difficult
collars and remove redundant samples elsewhere. In that earlier 150-path audit,
160,170 of 1,339,586 fine-grid states were retained (about 12%). Fine states are
temporary; compressed samples and GPU ribbon buffers are cached for playback.
These grid comparisons and cubic root checks are numerical checks, not interval
arithmetic certificates.

Reproduce the audits without changing the catalogue:

```sh
node morse-geodesics-lab/accuracy-audit.cjs --json /tmp/jacobi-accuracy.json
node morse-geodesics-lab/ribbon-accuracy-audit.cjs
node morse-geodesics-lab/ribbon-accuracy-audit.cjs --mesh
node --test morse-geodesics-lab/*.test.cjs
```

`accuracy-audit.test.cjs` retains the analytic checks and an independent comparison
for a sensitive long path. `jacobi-sampling.test.cjs` checks interpolation accuracy,
false-zero prevention, tangent consistency, and the longest catalogue path.

## Connected sums from a grid-only view

Connected-sum playback now includes display stages around the geometry animation:
fade from the original layer settings to a filled surface, perform the cut/align/
glue animation, then fade back to the original surface/grid settings on the target.
Grid-only views recover grid-only mode; filled-and-gridded views recover both.
The camera orientation and zoom are preserved, while bounds interpolate only
with the geometric construction parameter. The canvas rectangle stays fixed;
construction controls float over it rather than moving or widening the view.

Preparation holds the exact original geometry and layer appearance. Scrubbing
can return to either fade, pausing freezes the display phase, and Finish now
passes through the final layer restoration (or completes immediately with
reduced motion). Cancellation restores the original camera, layer settings,
selection, and travel position. The Canvas fallback now renders surface grids too.
Cancelling a later addition also retains the scanner for a previously completed
neck on the restored surface.
Grid-only fades use the ordinary wire depth settings and composite fill afterward,
avoiding the earlier first-frame brightness/visibility jump.

`surgery-motion.test.cjs` checks fade endpoints, continuity, layer combinations,
preparation and pause, bounded advancement, reversible scrubbing, and Finish now.
`surgery-render.test.cjs` checks exact wire-only depth state, compositing order,
and restoration of WebGL state. Run all lab checks with:

```sh
node --test morse-geodesics-lab/*.test.cjs
```

## Catalogue overview and theorem count

The Paths menu has three explicit views. “All paths · full color” clears the
visual selection and draws every curve admitted by the index cutoff in its full
index color, with no gold override, dimming, travel dot, or selected ribbon.
Choosing a geodesic enters “Highlight selected”; “Selected only” isolates it.
The selected path stays bright above its ribbon. Dim context paths cannot hide
it with opaque depth, while the torus surface retains its normal occlusion.
Returning to an inspection view remembers the most recently inspected curve on
the current surface. Overview leaves traversal disabled until a curve is selected.

The picker displays Theorem B's cumulative whole-manifold guarantee for indices
at most the current cutoff, and the exact-index bound beneath it. For k ≥ 2 this
is `1 + Σ[n=1..N] 2k[2(k−1)]^(n−1)`; at N=8 the two-summand totals are 1,021 up
to index 8 and 512 at index 8, while the three-summand values are 131,071 and
98,304. These guarantees use the same fixed-endpoint Morse nondegeneracy assumptions
as the original theorem explanation; they do not count the finite visible-surface
catalogue. One summand has no connected-sum theorem count.

The picker remains accessible beside the enlarged surface view, with a shared
travel slider below. `theorem.test.cjs` verifies exact BigInt degree/cumulative
counts; `view-modes.test.cjs` checks the overview, inspection, and solo
selection/rendering policies.

## Unrestricted orbit and mouse-centered zoom

The surface camera now turns through full revolutions, including both poles and
upside-down views. An analytic camera basis stays orthonormal at the poles.
Dragging and arrow keys rotate; Home or Reset view clears both rotation and the
zoom target offset. The hidden-neighborhood cutaway has its own independent
rotation.

Wheel zoom follows the pointer without needing to focus the canvas first. The
eye moves along the cursor ray, with a compensating pan confined to the screen
plane. Points under the cursor keep their screen pixels without accumulating a
hidden axial offset in the orbit target. Inward zoom raypicks the visible implicit
surface to stop at the near clipping plane; hits before that plane cannot become
anchors. Outward movement does not depend on a surface hit. This also lets an eye
on or inside the surface escape instead of anchoring to itself.

The outward limit fits all bounding-box corners from the **current** orbit target
and orientation. It can exceed the original nominal zoom maximum after panning or
turning: that scalar alone did not describe how close the eye was to the torus.
An outward input can stop at its limit only when the whole bounding box already
fits comfortably. Zoom buttons and keyboard plus/minus remain centered. During
connected-sum construction, zoom uses the interpolated bounds and target plane
rather than picking unmoved source geometry. Camera offsets survive construction
and restore on cancellation.

`camera.test.cjs` checks full-orbit pole continuity, upside-down views, actual
round-torus and connected-sum body/neck hits, reversible cursor anchoring, zoom
limits, empty-space fallback, and immutable camera state. Regression cases include
the recorded cursor-zoom/orbit trap at nominal maximum zoom, recovery with both
wheel and minus-button operations, all summands at displaced targets and multiple
orientations, an eye on the surface, and inward near-plane protection followed by
outward recovery. Repeated pointer changes must not accumulate axial target drift.
