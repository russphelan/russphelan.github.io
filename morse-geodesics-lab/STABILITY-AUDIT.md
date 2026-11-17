# Stability and performance pass — 2026-11-15

This pass tested the existing application and made bounded bug fixes and
performance improvements. The existing controls, numerical definitions,
geometry, and demonstration flows are preserved.

## Validation

- Initial full suite: **230 passed**, no failures.
- Final full suite: **245 passed**, no failures, approximately 12.3 seconds
  with Node v24.22.1 on the development machine.
- Command: `node --test morse-geodesics-lab/*.test.cjs`.
- Local browser walkthrough: default grid-only introduction; reveal/index and
  geodesic selection; overview/solo viewing; traversal and camera reset;
  presentation reveal; connected-sum scrub, cancel, finish, and third summand;
  restoration of grid-only layers; search cancellation and switching surfaces
  during a search; hidden pushes before/at/after a focus; pane resizing and reset;
  repeated Hessian mode switches and endpoint navigation; graph fitting;
  two-sphere explanation, contraction, reset, and closure.
- The 390-pixel layout had no horizontal overflow. Temporary viewport overrides
  were reset after checking.
- No application warnings or errors were recorded during the walkthrough.

## Fixed findings

| Finding | Fix and regression coverage |
| --- | --- |
| A queued graph-slider zoom could run after **Fit selected** or **Compare all**, undoing that click. | Explicit scale changes cancel pending slider work. A deterministic timer regression covers the race. |
| The graph could retain the scale of a short-segment curve after that curve was removed, making the current bookmark curves appear flat. | The shared extent resets when the extra current-segment curve changes or disappears. Regressions cover replacement/removal and explicit fit resets, while retaining stable scales within the same displayed curve family. The short-segment-to-After sequence was reproduced and verified in the browser. |
| Continuous hidden pushes accumulated numerical results without a limit. | Energy, length, and surface-metric result caches retain at most 512 recent entries each. Evicted values recompute identically; current/repeated values remain cached. |
| Camera and resize drags could be moved or ended by another pointer, or remain active after an interruption. | The main camera, hidden camera, sphere diagram, and resize grips retain pointer ownership and end gestures on cancellation, lost capture, missed release, or loss of window/page activity. View closure and relevant layout changes also end affected gestures. |
| Every push or mode switch rebuilt the unchanged original-segment GPU tube. | That reference tube is reused for the same curve and endpoint. Finite deformation geometry still refreshes on every update. Endpoint/curve changes, closing, context restoration, and full cleanup invalidate the appropriate buffers. |
| The search worker sent the entire curve collection again when it finished, after already sending each curve separately. | The completion message now carries only completion. Tests cover once-only geometry delivery, cancellation, replacement, and stale errors. |
| The sphere explanation regenerated its static reference grids on every animation frame. | Their immutable coordinates are built lazily and reused. Camera projection and the dynamic contraction remain unchanged. |

## Measured performance

These are targeted development-machine measurements, not whole-browser frame-rate
or memory guarantees.

- **Numerical cache retention:** after 30,000 distinct hidden-push radii and
  garbage collection, retained heap growth fell from approximately **14.69 MiB
  to 0.34 MiB**. The numerical evaluations themselves are unchanged.
- **Repeated 3D mode updates:** eight selections now need **9 geometry uploads
  instead of 16**: one reference tube plus eight fresh finite tubes. Regression
  checks confirm that the two modes remain distinct and returning to a mode
  restores its geometry.
- **Sphere explanation:** JavaScript-only work over 200 animated frames fell
  from approximately **0.935 to 0.280 ms/frame**. Canvas painting is excluded.
  A comparative run produced **45,400 identical drawing commands** across camera,
  latitude, and contraction cases.

## Connected-sum startup follow-up

The initial audit's roughly two-second first-use delay has been reduced without
changing mesh resolution or animation geometry:

- Numeric coordinate maps and direct typed-array reads avoid repeated vertex
  allocation/string conversion during welding and animation-piece construction.
- The next default mesh and plan warm in a worker after the current view paints.
  Transferable buffers avoid copying geometry back to the drawing thread; only
  the original lightweight animation functions are reattached there.
- Preparing/fading in reuses the existing surface/grid GPU buffers. This avoids
  another torus grid rebuild measured at **219–251 ms**, plus its **14.64 MiB**
  allocation and upload.

Representative Node cold mesh-plus-plan measurements changed from **1.84 to
0.90 seconds** for the second summand, and **2.62 to 1.24 seconds** for the third.
Background warming normally finishes that work before the Add click. Hydration
measured about **0.06–0.10 ms** and a cached preparation request under **0.022 ms**;
these exclude rendering and browser input overhead. A warmed first Add became
ready in about **0.29 seconds** in the browser automation check, including that
overhead. An immediate click before warming completes can still wait for the
worker, while the page remains responsive.

Default target meshes and all animation mesh/boundary positions and normals
matched the saved original hashes byte-for-byte. Worker transfers, animation
samples, and moving collar sections also matched direct preparation exactly.
The existing animation duration, fades, and numerical precision are retained.

The follow-up full suite passed **260 tests**. Tests cover legacy welding
equivalence, worker failure/fallback, shared jobs, cancellation/stale results,
Finish while pending, source-buffer ownership, and both default construction
stages. Browser checks covered first Add, scrubbing, cancelling while preparing,
retrying, finishing, and restoration of the grid-only view, with no warnings or
errors recorded.

## Automatic search and persistence follow-up

Explore now lazily loads its surface/endpoint starter collection and automatically
adds up to 36 distinct accepted paths using an Extended search. The current
surface is the only configuration searched. Numerical integration, shooting,
refinement, tolerances, and conjugate-point calculations are unchanged.

Search runs in six-attempt worker batches, with a gap between batches. Pointer
holds, input, scrolling, and keyboard interaction terminate active work and
resume its last completed starting guess after a 750 ms quiet period. Traversal,
the active length study, hidden pages, connected-sum preparation, and the complete
construction animation block numerical searching. Geometry warming owns its
priority hold with a generation token so stale completions and direct switches
to the final surface cannot release or strand another hold. Saving and batched
picker updates also wait through these interactions and animations.

The browser stores full-precision curves and coverage in bounded IndexedDB
records, keyed by exact endpoints, geometry, solver version, and classification
curvature. Malformed samples, inconsistent cursors, and stale versions are
rejected. Storage denial, blocked or stalled transactions, and quota errors retain
session results. Worker failures never put automatic computation on the drawing
thread; explicit manual search retains its numerical fallback. Stop is remembered,
and an interrupted final acceptance cannot exceed the automatic path budget.

The original 10,026,240-byte eager catalogue is replaced at runtime by one lazy
configuration file (1.77–4.21 MB). Existing connected-sum samples remain exactly
equal; new torus starter files use the current verified solver. Catalogue fetch
and body loading have a bounded deadline, with retries after failure.

The final full suite passed **311 tests**, including exact numerical equality of
whole and resumed searches, storage round trips/failures, stale worker and restore
callbacks, interaction holds, unchanged selection/traversal/camera/cutoff,
presentation isolation, and both connected-sum stages. Browser checks observed
automatic collections of **72 / 73 / 61** paths for the default one-/two-/three-
summand endpoints, reload restoration, immediate worker suspension on slider
input, stable selected traversal during arrivals, grid-only restoration after a
complete connected-sum animation, and the unchanged four-path first presentation
stage. These are observed finite-search counts, not completeness claims. No
application warnings or errors were recorded.

## Startup recovery follow-up

The startup failure paths were reproduced together with an empty browser cache:
the full catalogue request failed and the browser rejected Worker construction.
Previously that combination produced no paths and persisted the failure as
`pausedByUser`, so a later visit could stay paused without showing the old error.

- A 787,449-byte startup bank now supplies two full-precision, validated paths
  for each exploration configuration independently of JSON fetching, workers,
  or browser storage. Large catalogue loading continues separately; its deadline
  is 15 seconds rather than 2.5 seconds. The picker and manual search remain
  usable during that download.
- Transient worker failures no longer become persistent Stop requests. Explicit
  Stop is marked as a user choice; empty legacy failure records recover on the
  next visit. Retrying retains the last completed numerical seed.
- The intentionally blank index-zero view now reports the number of ready paths
  and explains how to reveal them. The initial cutoff is still zero.

All **323 tests passed**. Browser verification used a fresh local HTTP origin
with catalogue responses deliberately failing and workers blocked by CSP: two
verified paths remained available and appeared when the cutoff was raised. After
restoring the server responses and worker permission, reloading automatically
resumed full catalogue loading and numerical enrichment. Presentation and the
numerical acceptance tolerances are unchanged.

## Direct local-file launch repair

The reported address was a `file:` URL. That launch can load classic script tags
while rejecting both JSON fetches and external workers. The two-path emergency
bank therefore did not restore the full catalogue. In addition, the previous
legacy-pause migration handled only empty records, leaving a four-path record
mistakenly stopped after an earlier worker failure.

- All six full exploration catalogues now have lazily loaded script wrappers.
  Local-file launches bypass JSON fetch entirely; HTTP launches retain JSON with
  script fallback. Every coordinate, Jacobi sample, and diagnostic equals the
  original JSON data, including all 36 torus starter trajectories.
- File launches use a classic Blob worker containing the unchanged canonical
  geometry, numerical solver, and search-message protocol. It performs no
  dependency imports, and its Blob URL is released on termination or failure.
  Automatic mathematics stays off the UI thread. HTTP worker behavior is retained.
- Unmarked legacy pause records recover regardless of whether they contain zero
  or four or more paths. Explicit marked user Stops remain effective. Completed
  seed cursors, validated samples, and remaining discovery budgets are preserved.

All **338 tests passed**. File-mode integration tests start from a real validated
four-path cache, forbid fetch, load the actual script catalogue, restore all 36
starter paths, and resume the exact saved seed in a Blob worker. Real worker-thread
tests compare torus and connected-sum curves, Jacobi samples, diagnostics, and
resumption metadata exactly against the canonical solver.

Browser QA uses an HTTP test origin forcing both file-mode branches because the
browser automation tool does not allow `file:` navigation. The test rejects JSON
responses and external workers, seeds the old four-path record, and exercises the
real script catalogue and Blob worker. This tests the loading/search behavior
without changing browser security settings or application numerical tolerances.
The completed browser run displayed **72 found / 72 visible** torus geodesics at
the maximum index cutoff, with no application warnings or errors recorded.

## Connected-sum visual consistency pass

Several display and preparation issues made construction depend on launch timing:

- Nearly invisible discs/incoming parts participated in the shared depth pass,
  hiding already visible geometry behind them. Stable geometry now paints first,
  then fading parts composite back to front in separate depth/color passes.
  Construction opacity ramps to an opaque shell and returns smoothly to the
  original opacity, avoiding a discontinuity when a part finishes fading.
- Gold discs and rings appeared abruptly at the first construction frame. Their
  highlights now ease in. Boundary loops use the same 64-point collar sections
  before and during gluing, avoiding a mid-animation tessellation change.
- Canvas fallback used triangle centroids to expose the neck. Exact polygon
  clipping now follows the same advancing gap planes as WebGL.
- Direct local-file preparation previously fell back to synchronous main-thread
  work. A self-contained Blob worker now prepares identical pieces and target
  wire geometry for both connected-sum stages.
- The final grid and some static buffers were built during playback and rebuilt
  on completion. Static resources now prepare before the clock starts, and the
  target surface/grid buffers transfer into the ordinary view at completion.
- A prior zoom/pan could leave the construction off screen. Framing eases from
  that view into a centered fit while preserving the chosen orbit direction.
  Cancel restores the original view.

All **357 tests passed**. New tests include pixel compositing, opacity/handoff
continuity, exact fallback clipping, consistent ring buffers, cached/cold startup,
GPU ownership and zero-allocation final fades, and smooth camera framing. Both
file-worker construction stages retain exact vertices, normals, boundary samples,
and animation descriptors. CPU-only preload measured about **9–10 ms** with cached
wire data, excluding GPU-driver work and worker-side grid preparation.

Browser inspection covered both stages, cutting/alignment/gluing, reverse
scrubbing, playback through the final fade, immediate successive construction,
cancel/retry, and a cached launch from a close-up. The final grid-only settings
restored correctly. Launching during active geodesic traversal also returned to
the same initial fade, with search and traversal paused. The original view and
selection restored on Cancel. No application warnings or errors were recorded.

## Optional ambient-neck explanation

The new **Inside the neck** companion is opt-in and follows the current
connected-sum phase and construction slider. It links the actual surface section
to a projected ambient cross-section through a matching gold circle and teal
point. The introductory four-ball/disc slice, the two off-surface directions,
annulus traces, and the manual symmetry reversal explain the inclusion
`S¹ × I ⊂ S³ × I` without representing a tubular neighborhood as the entire neck.
The coordinate view explicitly distinguishes an ordinary three-dimensional slice
of the removed ball from the later stereographic `S³` chart.

The component has no independent animation clock. Closing it stops drawing and
restores the previous layout. The existing construction controls move as the same
DOM nodes into a shared row while open, preserving the torus view and slider,
construction progress, pause state, camera, index cutoff, and saved pane sizes.
Preparation and hidden pages do not sample unavailable sections. Completion
retains only the matching target neck; Cancel, closing, and unrelated surface
changes clear inactive overlays and release their GPU resources.

Sections are cached with bounded fixed keys per plan, shared with boundary-ring
rendering, and moving coordinates replace prior entries. The main marker
interpolates the actual sampled ring and follows the incoming surface's
translation before alignment. All explanatory scripts load directly under
`file:` without network dependencies, and the numerical construction is unchanged.

The full suite passed **379 tests**. Added mathematical tests cover the unit
three-sphere coordinates, fixed circle, two independent normal directions,
stereographic projection, and paired-point reversal. Component tests cover
construction-linked rendering, optional controls, inactive lifecycles, and
coordinate captions. App integration tests cover the single shared slider,
context-before-marker synchronization, original control ownership, preserved
layout state, bounded section caching, actual-ring interpolation, stale context,
and once-only GPU cleanup.

Browser checks confirmed that the main torus, companion pane, and construction
slider remain visible together on desktop and at 390px width, with no horizontal
overflow. Opening and closing preserved a paused slider at 720. Both construction
stages, old/new rim linkage, reverse scrubbing, Cancel, completed playback from one
to two summands, and Finish now from two to three summands behaved consistently.
Completion restored the grid-only view. No browser warnings or errors were
recorded.

## Populated neighborhood and scanner follow-up

The optional neck explanation now replaces the circle-only diagram with a
surrounding-neighborhood overview and a larger three-dimensional scanner. Gold
marks the joining annulus; stable blue and violet landmarks and strands show the
surrounding neighborhoods matching and joining around it. The scanner's cutaway
reveals the two independent off-surface coordinates. The overview's omitted
coordinate and the distinction between the local `S¹ × D² × I` neighborhood and
the full `S³ × I` neck are explicit. These landmarks are explanatory coordinate
guides, not Jacobi fields or computed trajectories.

The app supplies the actual plan's eased join progress before reading scanner
selection. Manual positions map to float-rounded sections of the actual torus;
unbuilt gaps resolve to joined edges even during reverse scrubbing. Incoming
translation follows the resolved collar, including a manual position opposite
the preferred follow edge. A new construction resets manual scan ownership.
The teal main-view ring distinguishes the inspected section from the gold
construction boundaries. The main torus and existing shared construction
controls retain their optional side-by-side layout.

Mathematical coverage checks deterministic material identities, genuine `S³`
coordinates, local projection and scanner limits. Component coverage checks
construction-linked population, scan availability, manual/follow controls,
construction reset and inactive cleanup. App integration coverage checks actual
join context, interior and completed-neck scanning, reverse gap safety,
cross-collar translation, exact section coordinates and bounded reuse across
hundreds of manual scan positions. There is still no independent animation clock.
The section cache adds one reusable scanner slot to the two boundary and five
fixed trace slots; moving coordinates replace their old entries. Numerical
surface, geodesic and Jacobi computations remain unchanged.

The full suite passed **390 tests**. Browser verification covered both construction
stages, manual scans on either collar, following either joining edge, reverse
scrubbing into an unfinished gap, paused close/reopen at 780, new-construction
reset, cancellation, and playback through completion back to the grid-only view.
At 390px width there was no horizontal overflow, and the torus, populated overview,
3D scanner, scan range and shared construction slider remained visible together.
Compact canvas captions avoid overlap, the main marker labels the 3D scan, and
construction-button hover colors retain readable contrast. No browser warnings
or errors were recorded. Browser QA used the local HTTP preview; classic-script
module tests preserve compatibility with direct local-file loading.

## Active joining close-up

With Follow join enabled, the lower pane now shows both populated joining
neighborhoods. Stable gold, blue and violet patches A/B/C align, correspondence
guides shorten, and the two copies identify into one neighborhood. Their normal
coordinates and radii stay fixed; exploded-view translations explain matching,
followed by a uniform camera magnification into the ordinary scanner. Coordinate
guide paths demonstrate continuation at the meeting. The actual plan's join
progress gates the identification and handoff, independently of pause state or
wall-clock time. Reverse scrubbing reproduces the same state exactly.

Manual section inspection immediately selects the scanner; Follow join resumes
the close-up at the current construction position. Optional symmetry inspection
also selects the manual scanner. Resuming Follow or selecting a joining edge
closes symmetry, and a new construction clears it, preventing a retained rotation
from jumping at the scanner handoff. The main torus highlights both actual front
sections while paired, including incoming translation, and deduplicates them at
meeting. One fixed counterpart GPU slot is released on manual or completed
scanning; section/cache keys remain bounded. Numerical surface, geodesic and
Jacobi calculations are unchanged.

All **400 tests passed**. Added coverage checks timeline continuity, real-join
gating, unchanged normal-disc extent, paired populations and named counterparts,
exact reverse drawing, manual/follow behavior, symmetry reset, merged-front
deduplication, Canvas fallback, and counterpart GPU cleanup. Browser inspection
confirmed alignment, paired joining, the one-neighborhood handoff, return to the
scanner, reverse scrubbing, manual inspection and paused close/reopen at 740.
The torus and shared construction slider remained visible beside the explanation
at desktop and 390px widths, with no horizontal overflow. Browser checks used the
local HTTP preview; classic-script loading remains compatible with local files.

## Larger neck-animation presentation

The optional neck layout now allocates about 57% of desktop width to the companion
and scales both canvases with available viewport height. At 1280 × 720 the overview
measured 695 × 151px and the joining/scanner canvas 695 × 254px, versus the previous
roughly 434 × 110px and 434 × 170px. Wide-canvas titles, labels and featured markers
also grow. Compact header/control spacing and a shorter shared construction bar
keep the torus and progress slider visible. Explicit user view heights are retained,
and supporting explanations remain available through the companion's scrollbar.

All **37 related component, integration and resizing checks passed**. Browser layout
checks at 1280 × 720, 1440 × 900 and 390 × 844 confirmed both animations and the
shared construction controls fit without horizontal overflow. At the narrow size
the construction bar ended at about 822px. Animation geometry, timing, numerical
sampling and all geodesic/Jacobi calculations are unchanged.

## Draggable neck layout

A separate layout-only controller now provides the torus/neck width divider and
independent overview and joining/scanner height grips. It remains enabled during
construction, supports pointer capture and keyboard resizing, and keeps requested
preferences separate from responsive effective limits. Enlarging one animation
can borrow space from the other down to its usable minimum. Header, footer-grip,
caption and scan-control heights determine the shared canvas budget; explanatory
prose and mathematical details remain scrollable below it. Root-relative bounds
avoid scroll feedback, and unchanged observer/context measurements request no
new redraw. Closing, hiding, pointer cancellation and loss of capture terminate
drags cleanly.

The outer neck row is bounded by the actual document-relative header position,
visible construction-bar height, grid gap and viewport. Oversized or very short
saved main-view heights are fitted temporarily without modifying the original
size. Panel-width container queries stack controls when the divider makes the
neck narrow, regardless of window width. Dedicated variables and reset controls
leave the existing hidden-Jacobi view's sizes untouched. Classic scripts preserve
direct local-file loading.

All **416 tests passed**. New controller and integration coverage includes budget
borrowing and minima, responsive preference retention, keyboard resets, pointer
ownership and cleanup, header/control changes, scroll invariance, zero-observer
fallback, no feedback redraws, and construction-state preservation. Browser tests
used actual divider and both height drags, keyboard resizing at desktop and
390px split limits, reset, and close/reopen during a paused construction at 710.
The original saved 658px torus height was restored on close. In Presentation mode
the construction bar stayed within the viewport: approximately 708px on a 720px
screen and 832px on an 844px screen. No horizontal overflow or browser warnings
or errors were recorded. Numerical computations and animation timing are unchanged.

## Matching throughout the whole neighborhood

The joining close-up now shows six equally emphasized normal-disc samples around
each full loop, including near and far sectors. Each sample contains interior and
boundary landmarks and radial spokes. Complete longitudinal lattice curves and
four interior threads connect the slices into one three-dimensional neighborhood.
Twelve sparse correspondences sample interior and boundary points at every shown
azimuth, and all sections identify simultaneously. The joining view no longer
retains the isolated inspection disc, scanner wedge, or single A/B/C patch. The
overview uses the same distributed correspondences and an outline scan ring.

The helper supplies immutable genuine S³ coordinates and stable matching IDs.
Projected samples are prepared once; the existing construction coordinate drives
translations, identification and the scanner handoff. Distributed overlays fade
as the explicitly labeled single normal-disc inspection appears. Scanner axes use
u/v, distinct from numbered slice IDs. Captions and optional notes distinguish
normal slices from the discs removed within the tori, and the local D² × S¹
neighborhood from the full S³ boundary. Numerical geometry and Jacobi calculations
are unchanged.

All **421 tests passed**. New coverage checks full angular coverage, normal-disc
interiors and boundaries, immutable matching coordinates, equal slice emphasis,
continuous closed lattice curves, simultaneous whole-grid identification, reverse
scrubbing, independence from inspection angle, and continuous single-slice handoff.
Browser checks confirmed distributed joining, manual scanner/Follow switching,
the completed-grid transition and reverse scrubbing. The torus, resize controls
and construction slider remained visible at desktop and 390px widths without
horizontal overflow; the bar ended at approximately 701/812px on 720/844px screens.
No browser warnings or errors were recorded.
