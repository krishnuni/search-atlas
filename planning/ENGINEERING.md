# Search Atlas — engineering and verification specification

**Draft for approval · 22 October 2026.** All structures, limits and performance budgets are proposed. No implementation or benchmark result is implied.

## 1. Stack evaluation

| Layer | Decision | Tradeoff |
|---|---|---|
| React + strict TypeScript | Accept | Good semantic controls and typed domain boundaries; avoid one React element per rendered cell |
| Vite | Accept, static client build | Straightforward module workers and static hosting; type checking is a separate build check |
| PixiJS | Accept behind a renderer adapter; use WebGL | Batched 2D drawing and controlled effects; lifecycle, hit testing and accessibility require deliberate work |
| Web Workers | One dedicated worker, serial jobs | Keeps computation off the main thread and comparisons controlled; introduces transfer/cancellation contracts |
| Vitest | Accept for engine, model and controller tests | Fast deterministic checks; cannot replace real browser verification |
| Playwright | Add for browser journeys | Exercises workers, canvas coordinates, downloads and responsive behaviour |
| Testing Library + fast-check | Add for UI semantics and generated properties | Meaningful behavioural and adversarial checks without reproducing the implementation |
| State and CSS | Small authored store/reducers, CSS custom properties/modules | Enough for this scope; avoid extra framework dependencies until needed |
| Motion | Pixi ticker/requestAnimationFrame and CSS transitions | No animation framework initially required |

Pixi's stable 8.x guide recommends WebGL for production and marks WebGPU experimental. Its stable and development documentation differ on CanvasRenderer availability; do not assume a portable automatic Canvas 2D fallback. Provide recovery/export when GPU rendering cannot initialise. Recheck the selected release before installation. [PixiJS renderer guide](https://pixijs.com/8.x/guides/components/renderers)

Vite supports module workers, but transpiling TypeScript does not type-check it; production checks must include TypeScript validation. [Vite features](https://vite.dev/guide/features)

Vitest fits the Vite build and test setup. Playwright supplies actual Chromium, Firefox and WebKit browser coverage; emulation is useful but is not a substitute for a real phone or Safari validation. [Vitest guide](https://vitest.dev/guide/), [Playwright introduction](https://playwright.dev/docs/intro)

Alternative assessment: DOM/SVG grids are easy to inspect but create unnecessary update overhead at the proposed scale. Direct Canvas 2D could handle a simpler laboratory with less dependency weight, but would require more custom batching/effect work. PixiJS is a reasonable starting point, not an unmeasured speed claim. WebGPU, WebAssembly, OffscreenCanvas and custom shaders are deferred until a profile establishes a need.

Hand-author application/configuration files after approval; no starter application template. Pin compatible stable dependencies, the runtime version and a lockfile at milestone 2. Record licenses and exact versions then; avoid committing now to an unverified future release combination.

## 2. Modules and components

| Module | Owns | Must not own |
|---|---|---|
| Scenario domain | Dimensions, typed terrain/walls, endpoints, movement, schema validation | Rendering, playback clock |
| Editor controller | Input intent, stroke transactions, undo/redo, scenario revision | Algorithm working arrays |
| Search engine | Topology, heap/FIFO, scores, parents, algorithm steps | React, Pixi, wall-clock animation |
| Trace recorder | Compact reversible events, counters, phase transitions | UI components |
| Worker bridge | Requests, immutable copies, job IDs, cancellation, errors | Product-level state interpretation |
| Playback controller | Cursor, phase, speed, inverse steps, seek/checkpoints | Re-running the algorithm to rewind |
| Renderer adapter | Viewports, layers, transforms, dirty cells, effects | Graph correctness or algorithm timing |
| Metrics runner | Counter definitions, timing samples, buffer accounting | Frame pacing |
| Persistence | Schema versioning, canonical export, local draft, share encoding | Unvalidated direct model mutation |
| React interface | Semantic controls, navigation, inspector and result tables | High-frequency per-cell state updates |

Proposed source areas: `domain`, `algorithms`, `generation`, `worker`, `trace`, `playback`, `editor`, `rendering`, `metrics`, `persistence`, `ui` and `styles`. Tests sit beside pure modules, with dedicated fixtures, browser tests and benchmark data. These are planned boundaries, not directories that have already been implemented.

Principal UI components: AppShell, ModeNavigation, ScenarioActions, AlgorithmSettings, MovementSettings, EditorToolbar, GridViewport, CellInspector, CellNavigator, PlaybackTransport, MetricsStrip, ComparisonResults, ScenarioDialog, ImportDialog, ShortcutHelp and StatusMessage. Avoid creating a generic design-system framework before these concrete needs are understood.

### Data flow

1. Input becomes an editor command and changes the versioned scenario.
2. Run freezes a validated snapshot and associates scenario revision, scenario hash and run ID.
3. The bridge sends an owned copy to the worker. The editor retains its own usable buffers.
4. The worker computes a trace and an untraced measurement through the same engine; outputs must agree.
5. Playback projects the retained trace into display arrays and logical counters.
6. Pixi reads the display projection; React subscribes to stable configuration and throttled summaries.
7. Edit, import or settings changes invalidate affected runs. Responses from stale IDs are ignored.

One source of truth exists for the scenario; each algorithm has independent mutable search buffers. A comparison shares one scenario revision and uses distinct run fingerprints. Scenario identity does not include the camera; a run fingerprint does include algorithm, heuristic, tie policy and engine version.

Model compute status and playback status separately. Computation may be idle, preparing, ready, cancelled or failed. Playback may be stopped, playing, paused or finished. The solver outcome is found/unreachable/resource-limited/etc. Keeping these independent prevents “paused” from ambiguously describing a worker computation.

## 3. Graph and algorithm contracts

Cell IDs are row-major integers. Neighbours are computed from coordinates; no adjacency lists are stored for the regular grid. Fixed order: north, east, south, west, northeast, southeast, southwest, northwest, filtered by movement and obstacle rules.

For edge u → v: cost is distance(u,v) × terrain(v). All supported weights are positive integers. Cardinal distance is 1; diagonal distance is √2. Both adjacent cardinal cells must be open for a diagonal. An immutable scenario keeps these costs fixed during a run.

Use Float64 for accumulated cost and heuristic values, integer arrays for cell IDs/parents, compact status arrays and a FIFO with head/tail indices for BFS. Never remove the first element of a general array on every BFS step.

The indexed binary min-heap stores at most one entry per frontier cell and a cell-to-heap-position map. Insertion, extraction and decrease-key are O(log V). The fixed-degree grid has E = O(V); BFS is O(V + E), and Dijkstra/A* under the exposed consistent heuristics have O((V + E) log V) worst-case processing with O(V) working state. Trace storage is additional and explicitly bounded.

Tie rules:

- A*: order by f, then h, then first-discovery sequence.
- Dijkstra: order by g, then first-discovery sequence.
- Greedy: order by h, then first-discovery sequence.
- BFS: FIFO discovery order.

Retain sequence values through decrease-key. Update A*/Dijkstra parents only on strictly better cost. Compare exact stored priority values in the heap; approximate equality can break a transitive ordering. Use numerical tolerances only for test assertions and display formatting.

BFS marks on enqueue and assigns a parent once. Greedy also uses duplicate detection and deterministic first-discovery parents; it prioritises h only and need not improve a parent's cost. A* supports reopening if a strictly better route to a closed node appears, although none should be needed for supported consistent heuristics in exact arithmetic. Tests include an internal inconsistent-heuristic case to exercise this defensive path; arbitrary heuristics are not exposed in the UI.

Goal tests occur on selection from the frontier. The engine emits a separate goal-selection event and reconstruction phase. Nodes expanded counts successor examinations, excluding terminal goal selection; any actual re-expansion counts again. Start = goal has an explicit zero-expansion result.

### Heuristics and guarantees

Let dx and dy be absolute coordinate differences and w_min the minimum traversable weight:

- Manhattan: w_min × (dx + dy).
- Euclidean: w_min × √(dx² + dy²).
- Octile: w_min × [max(dx,dy) + (√2 − 1) × min(dx,dy)].
- Zero: 0, reducing A* to uniform-cost selection under the corresponding tie rule.

The exposed heuristics are nonnegative, zero at the goal and consistent for their allowed moves. Removing edges through obstacles or forbidding corner cuts does not invalidate these lower bounds. Admissibility means never overestimating remaining optimal cost; consistency requires h(u) ≤ cost(u,v) + h(v) for every legal directed edge.

With the specified graph, cost relaxation, consistent heuristic and goal-on-selection termination, A* returns a least-cost route. Admissibility alone is not a sufficient statement about every closed-set implementation; reopening policy matters. These principles are covered in [Berkeley's informed-search material](https://inst.eecs.berkeley.edu/~cs188/textbook/search/informed.html) and [graph-search notes](https://berkeleyai.github.io/cs188-website/assets/notes/n1.pdf).

BFS guarantees minimum edge count and also guarantees minimum cost when all allowed edge costs are equal; otherwise it has no general cost guarantee. Equal cell weights alone do not ensure equal edge costs when √2 diagonals are enabled. Dijkstra is valid for nonnegative costs; this product deliberately supports the narrower positive-cost model. See [Cornell shortest-paths notes](https://www.cs.cornell.edu/courses/cs2110/2026sp/lectures/lec23/). Greedy on this finite duplicate-detected graph terminates and is reachability-complete but may be suboptimal. Do not generalise that completeness statement to arbitrary infinite search spaces.

## 4. Worker, trace and replay design

Use one module worker and serial jobs for both single and paired runs. Initial design: complete bounded traces before playback. For a long run, show Preparing and allow cancellation. Terminate and recreate a busy worker on cancellation; a synchronous search loop cannot receive a cancellation message until it yields. Preserve the editor model and invalidate the old request immediately.

Transfer only buffers created for the worker or result, never the editor's sole scenario buffer. Transferring detaches the sender's ArrayBuffer. Include the buffers in the payload as well as the transfer list. [Transferable objects](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects)

Trace records contain changed cell IDs, old/new status, parent and score values, current-cell changes, counter deltas and phase transitions. Group all effects of one selected cell into an atomic step. Failed relaxations need not each become stored events unless necessary for the displayed explanation. Optional candidate details can be derived from the selected cell and current state while paused.

The display reducer is invertible. A previous-step action applies inverse deltas; seeking restores a preceding checkpoint and replays forward. Checkpoints capture display state, not an entire worker/heap runtime. Rewinding does not branch or resume the solver from history; resuming simply plays the retained future trace.

Begin checkpoint spacing at 256 steps, then increase it as necessary to stay within the checkpoint budget. Proposed combined ceiling: 64 MiB for retained trace and checkpoints across both panes, with a 32 MiB reservation per pane. Count allocated capacity, not just used records. Release replaced traces and worker buffers, and account for transfer/construction peaks separately.

No silent truncation or eviction of the start of an accepted trace. If recording exceeds budget, return a resource-limit outcome, retain the scenario and offer a smaller grid or a separate summary-only solve. A summary-only result is explicitly non-replayable. Core supported fixtures must complete with full rewind at the released size limit.

The same step engine runs with and without a recorder. No visual delay, DOM access or Pixi state enters either path. Trace-on/off tests require equal outcome, route, cost and logical counters; runtime and recording-storage values are intentionally excluded from equality.

## 5. Renderer strategy and resilience

Use one Pixi application with one or two clipped viewports. Keep layers separate: base/terrain, walls, exploration, route, endpoints, focus/selection and transient effects. Start with shared textures and batched sprites/graphics; profile before introducing custom meshes.

Use arithmetic coordinate hit testing through the camera transform, not one event handler per cell. Update dirty cells and throttle React metrics while playing; manual stepping updates summaries immediately. Render on demand when idle. Bound effect count; cap device-pixel ratio provisionally at 2 and test crispness at different zoom levels.

Release GPU resources on unmount/reinitialisation, resize predictably and handle graphics context loss. If rendering cannot initialise, keep semantic controls, the cell navigator, result text and scenario export available with an explicit message. A full custom Canvas fallback is outside scope. Pixi's [performance guidance](https://pixijs.com/8.x/guides/concepts/performance-tips) supports profiling and batching; performance outcomes still require measurement on this application.

## 6. Testing strategy

| Layer | Required evidence |
|---|---|
| Fixed engine cases | Start=goal, adjacent endpoints, corridor, multiple equal-cost routes, enclosed start/goal, disconnected regions, weighted detour, max supported size |
| Topology/cost | Bounds, every diagonal corner case, destination cost, start excluded, nonuniform goal terrain, reverse-route asymmetry |
| Independent oracle | Original simple Bellman–Ford over tiny explicitly enumerated graphs; use separately written neighbour enumeration and path validation |
| Differential checks | A* and Dijkstra reachability/cost match the oracle; zero-heuristic A* matches Dijkstra under matching tie policy; BFS agrees on unit-cost cardinal grids |
| Generated properties | Legal returned steps, no walls, finite terminating parent chain, independently recomputed cost, no missed reachable goal, deterministic output |
| Heuristic checks | Nonnegative, goal zero, edge consistency, admissibility against exact shortest distances on generated grids |
| Heap/FIFO | Randomised operation sequences against a simple sorted reference, index-map invariant, duplicate rejection, repeated decrease-key, tie stability, empty/one-element, queue boundary cases |
| Trace/playback | Full replay result, all steps reversed to initial state, random seek equivalence, counters/scores/parents restored, phase boundaries, different playback speeds |
| Worker integration | Production worker asset loads; cancellation; rapid reruns; stale messages; failure handling; buffer ownership; independent comparison state |
| Editor/persistence | Interpolated strokes, transaction undo/redo, endpoint protection, resize crop recovery, schema validation, invalid-file transactionality, export round trip |
| Generator | Seed stability, generator version, even/odd dimensions, valid endpoints and connectivity under its documented contract |
| Browser/UI | Full pointer, keyboard and touch flows; comparisons; downloads/import; DPR/resize; reduced motion; focus restoration; text/route alternatives |

For admissibility checks on destination-weighted graphs, preserve each original directed edge's cost when traversing the reversed graph. Recomputing “destination cost” on reversed edges would create the wrong oracle. Prefer a deliberately slow, independent oracle over comparing two implementations that share all helpers.

Initial generated correctness target: at least 1,000 seeded tiny scenarios across weights and movement policies, with failing seeds retained and reduced to regression fixtures. Add focused hand-verifiable fixtures with expected costs. Route shape may differ among equally optimal paths; assert cost and validity unless a test specifically verifies deterministic tie-breaking.

Useful metamorphic checks: raising terrain weights or adding walls cannot lower the optimal cost when the compared problem remains reachable; uniform weight scaling preserves optimal route cost ratios; playback changes do not affect computation. Do not assert that A* always expands fewer nodes or that greedy is always faster.

Include a known greedy counterexample and a weighted case where BFS chooses fewer moves at greater cost. These prove that the UI explanations are supported by real cases.

Run strict type checks, lint, unit/property tests, production build and selected browser journeys as ordinary checks. Configure CI for those checks after implementation. Use coverage as a review aid (proposed ≥90% branch coverage for core engine/history modules), never as a substitute for behavioural evidence. Cross-browser tests should check semantics and workflow; screenshot comparisons use controlled settings and tolerate rendering differences where appropriate.

## 7. Benchmark methodology

The UI's normal run time is a single noisy sample, labelled accordingly. Publishable benchmark claims come from a separate controlled protocol:

1. Commit original scenario fixtures with seeds, hashes, dimensions, obstacle density, terrain distribution, start/goal and movement settings. Include open field, maze, weighted detour, dense obstacles and unreachable cases.
2. Use representative sizes 32², 64² and 128²; include 256² only if it becomes a supported release limit. Keep tiny oracle cases separate from performance cases.
3. Use the production build, one worker, trace disabled and no animated playback during sampling. Run algorithms serially in seeded counterbalanced order.
4. Perform 10 warm-up solves per algorithm/case, then at least 30 measured samples. If measurement granularity dominates a sample, batch repeated complete solves and report the per-solve average with batching disclosed.
5. Measure inside the worker with its monotonic clock. Include initial working-state setup, search and final path construction. Exclude fixture decoding/transfer, worker startup, trace recording, rendering and animation. Do not subtract guessed overheads.
6. Report median, interquartile range and sample count, with raw JSON/CSV. Record CPU/device, OS, browser/version, runtime/build identifier, engine version, power mode where known, fixture hash and methodology.
7. Treat timer resolution, warm-up/JIT, garbage collection and background activity as limitations. Retain samples unless a documented exclusion rule applies. Do not report more precision than the timer supports or universal speedup claims.

Compute durations within one worker context; clock origins across contexts are not interchangeable. Browser clocks may expose reduced precision. [High Resolution Time specification](https://www.w3.org/TR/hr-time-3/)

Memory reports count allocated algorithm-owned typed-buffer bytes, including heap capacity and index maps, and separately retained trace/checkpoint bytes. Exclude and disclose JS object/runtime overhead, scenario copies unless separately counted, browser process memory and GPU storage. Do not use deprecated `performance.memory` as a portable total-memory metric. [MDN memory limitations](https://developer.mozilla.org/en-US/docs/Web/API/Performance/memory)

Rendering experiments are separate: frame intervals, input-to-visible-update latency, seek latency, preparation latency, peak retained buffers, and repeated run/edit/reset cycles. No current measurements exist.

## 8. Proposed performance and compatibility gates

| Target | Test context |
|---|---|
| Desktop p95 frame interval ≤25 ms, aiming near 60 fps | Two 128 × 128 panes, normal playback, documented reference laptop/browser |
| Input-to-visible brush feedback p95 <50 ms | Desktop standard scenario while not preparing a new run |
| Seek response p95 <100 ms | Supported history budget on reference desktop |
| No recurring app-caused main-thread task >50 ms during ordinary playback | Production browser profile; report exceptions rather than hiding them |
| Preparing a 128 × 128 paired trace ordinarily <1 s | Representative fixtures; if missed, profile and improve preparation feedback/strategy |
| Phone playback remains usable, target ≥30 fps | Documented real phone at a practical 64 × 64 scenario; emulation alone is insufficient |
| Bounded storage across 50 run/edit/reset cycles | No retained old traces, accumulating workers or unbounded GPU resources |

These are targets, not promises about all devices. Name actual available reference devices before collecting baseline results in milestones 3–5. If hardware is unavailable, label that check unverified and use explicit emulation evidence instead. Do not mark a real-device check passed from an emulator.

Verify current stable Chrome/Edge and Firefox, plus Playwright WebKit; verify Safari/iOS on real hardware if available. Record exact versions used at release. A supported browser must offer the required worker and renderer capabilities. A failed capability check produces usable recovery UI.

## 9. Delivery and evidence manifest

The release preparation includes a clean dedicated repository, original README, architecture decision records, algorithm guarantees, meaningful tests, CI configuration, setup/build instructions, lockfile, license/dependency notices and static distribution assets.

Create an evidence manifest that ties screenshots, recordings and benchmark files to the tested build and scenario hashes. The README must distinguish implemented features, known limitations and future ideas. Include a short walkthrough of constructing a weighted scenario, comparing BFS/Dijkstra and rewinding a decision.

Validate the production bundle under a local static server, including worker URLs and a hosting subpath if targeting GitHub Pages. Prepare deployment instructions for a static host; no public repository creation, push or deployment occurs without explicit user approval.

