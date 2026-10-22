# Search Atlas — product and delivery proposal

**Status:** Draft for approval · **Date:** 22 October 2026 · **Portfolio:** SWE Grad Portfolio, project 01

This is a specification, not an implementation report. No application code, tests, measured benchmarks, repository publication or deployment has been produced. Any concept artwork is illustrative. All performance numbers below are proposed acceptance targets, not achieved results.

## 1. Product thesis

Search Atlas is an interactive instrument for constructing, observing and comparing search problems. Its distinguishing feature is the connection between an expressive spatial view and an exact, inspectable algorithm trace: every frontier change, parent decision and final route can be examined and replayed.

The first encounter should communicate craft immediately. A recruiter should be able to run a supplied scenario, compare two algorithms and discover the engineering explanation in about 90 seconds. A student should be able to explain why a route was selected. An engineer should be able to reproduce the scenario and verify the claims.

**Primary experience:** construct → run → inspect → compare → reproduce.

**Portfolio contribution:** algorithms and data structures, deterministic systems, worker concurrency, graphics performance, accessible interaction design, property-based verification and honest measurement. Keep future portfolio projects focused on other strengths rather than repeating this visualisation architecture.

### Product principles

- The grid is the main content. Controls serve the experiment and remain subordinate.
- A visible state must correspond to an actual recorded algorithm state.
- Explain what an algorithm optimises; avoid a blanket “best algorithm” ranking.
- Separate computational measurements from presentation timing.
- Make common experiments immediate and advanced inspection discoverable.
- Build project-specific code, design and documentation from scratch. Established dependencies and theoretical references are permitted; starter applications and pathfinding packages are not.

### Success evidence

| Goal | Evidence required before completion |
|---|---|
| Correct search | Independent reference checks, generated cases, documented guarantees and edge cases |
| Convincing interaction | Real browser demonstrations of editing, playback, rewind and comparison |
| Clear learning value | An inspectable weighted-detour example and a greedy-search counterexample |
| Reproducibility | Export/import preserves the experiment; seed and version are recorded |
| Premium presentation | Reviewed desktop, tablet and phone layouts, consistent motion and legible states |
| Recruiter-ready delivery | README, architecture decisions, actual screenshots, measured benchmark report, reproducible build |

No analytics service, account system or backend is required to demonstrate these goals.

## 2. Users and principal journeys

| User | Journey | Successful outcome |
|---|---|---|
| Recruiter | Open the lab → run the default problem → compare A* and Dijkstra → open explanation | Understand the visual and technical strengths without setup |
| Learner | Paint a costly shortcut → run BFS and Dijkstra → inspect the routes | Distinguish fewest moves from lowest cost |
| Technical reviewer | Change movement and heuristic → step and rewind → export scenario | Verify decisions, constraints and repeatability |
| Explorer on a phone | Open a preset → edit a few cells → replay → inspect comparison results | Complete the core task with touch and readable controls |

The app opens directly into the laboratory, with a small original scenario and a visible Run action. There is no introductory marketing page or compulsory tutorial. A short, dismissible hint explains drawing, endpoint placement and stepping. The initial scenario is unsolved until the user runs it; reduced-motion preferences are respected from first render.

## 3. Functional requirements and acceptance contracts

### F01 — Scenario and grid editor

- Rectangular grids; initial default 40 × 24 cells. MVP editor range: 8–128 cells per dimension. Final target: up to 256 × 256, subject to measured rendering and trace budgets. The engine must also accept tiny valid fixtures, including a single cell.
- Walls, traversable terrain with integer weight 1–9, one start and one goal. Weight presets 1, 3, 6 and 9; a labelled field permits intermediate values.
- Tools: inspect, wall, terrain, erase, place start, place goal and pan. Dragging endpoints is a convenience; select-and-place is always available.
- Pointer strokes interpolate crossed cells so fast drawing has no holes. One stroke is one undoable edit; undo/redo also applies to clear, generation, resize and endpoint changes.
- Walls cannot overwrite endpoints. Placing an endpoint on a wall clears that wall with visible feedback. Endpoint markers preserve underlying terrain. Erase resets a non-endpoint cell to open terrain of weight 1; placing a wall also resets its terrain weight to 1.
- Start and goal may coincide; show a combined marker and a valid zero-cost result.
- Resizing is explicit, never caused by the viewport. Preview any cropped content and allow cancellation; preserve in-bounds cells. Reposition out-of-bounds endpoints visibly after confirmation. The operation is undoable.
- Undo history has a proposed budget of 100 commands or 8 MiB, whichever is reached first; disclose when older edits expire. Playback history is a separate concept.

**Acceptance:** drawing, tapping and keyboard cell editing yield the same model; undo restores complete edits, including terrain and endpoints. Zoom and pan never change coordinates or cell data.

### F02 — Movement and terrain

- Four-direction movement is the default. Eight-direction movement is an explicit option.
- Cardinal distance is 1; diagonal distance is √2. A diagonal is legal only when both adjacent cardinal cells are traversable. No corner cutting or wrapping at boundaries.
- Traversal cost is movement distance multiplied by the **destination cell's weight**. The start is free; entering the goal incurs its terrain cost. Reversing a route can change its cost because costs are destination based.
- Reject missing/out-of-range coordinates, negative or zero weights, non-finite numbers and malformed dimensions before a run.

**Acceptance:** the rendered route and the independent path-cost calculation agree for every test; the movement rules are visible in the experiment settings.

### F03 — Four original algorithms

| Algorithm | Selection rule | Promise shown to the user |
|---|---|---|
| A* | Lowest accumulated cost + heuristic | Lowest cost with the supported consistent heuristics and movement rules |
| Dijkstra | Lowest accumulated cost | Lowest cost for all supported terrain |
| Breadth-first search | FIFO discovery order | Fewest moves; lowest cost only when every legal edge has equal cost |
| Greedy best-first | Lowest heuristic | A reachable route on this finite grid with duplicate detection; no shortest/cheapest guarantee |

BFS remains available on weighted and diagonal scenarios, because the difference is educational. Display “Fewest moves · ignores terrain and diagonal costs when choosing” where relevant; compute its returned route's true cost. Never silently normalise the terrain to make a comparison appear fair.

All algorithms use a fixed neighbour order and documented tie-breaks. Stop when the goal is selected from the frontier, not when it is first encountered. Distinguish found, unreachable, cancelled, invalid input, resource limit and worker failure.

### F04 — Heuristics with constraints

For A*, offer Manhattan, Euclidean and zero with four-direction movement; octile, Euclidean and zero with eight-direction movement. Manhattan is unavailable with √2 diagonals because it can overestimate. Octile is hidden for four-direction movement as a relevance choice, although it is still a valid lower bound there.

Scale distances by the minimum traversable terrain weight. A* has no arbitrary heuristic multiplier in this release. Greedy uses the same meaningful distance choices, without an optimality promise; zero is omitted for greedy because it provides no goal guidance. BFS and Dijkstra show heuristic as “Not used”.

Changing movement updates an incompatible heuristic to the recommended valid default and explains the change inline. Imported incompatible configurations produce an actionable validation error; they are never silently changed.

**Acceptance:** every available A* heuristic is checked for both admissibility and consistency against independently computed distances. The UI cannot submit an invalid movement/heuristic combination.

### F05 — Procedural environments

- MVP: one original implementation of a seeded depth-first backtracking maze generator, plus curated original scenarios.
- Generator settings contain a seed and version. Generate on a logical passage lattice; explicitly document handling of even outer dimensions. Connect endpoints deterministically to passages and validate connectivity before marking a generated maze ready.
- Repeating seed, dimensions and generator version produces identical cells. Maze generation is undoable and preserves a recoverable previous scenario.
- A “perfect maze” claim applies only to the unmodified passage graph before any endpoint connector adjustments; the app need not make that claim at all.
- User edits can intentionally disconnect any environment. The solver handles that as a normal outcome.

Suggested curated experiments: open field, narrow gate, weighted shortcut, misleading goal direction and disconnected goal. Each has a brief question to investigate, not predetermined performance claims.

### F06 — Trace and playback

- Show frontier, expanded cells, current cell, parent reconstruction and the final route as distinct states.
- Run prepares a complete bounded trace in a worker, then plays it. A preparing state is cancellable. Streaming computation is not necessary for the MVP and can be added only if preparation latency warrants it.
- Pause/resume, previous step, next step, return to beginning, scrubber and playback speed are required.
- One search step means one accepted frontier removal plus that cell's neighbour processing. Goal selection is terminal; reconstruction then reveals one parent link per step. There is a visible phase label.
- A speed range of 1–2,000 logical steps/second is the proposed control range. Fast playback may apply several steps per frame, but the history retains every step. Exact one-step inspection is always available while paused.
- Rewind restores scores, parents, frontier membership, counters and visible state. It is replay of recorded history, not a new search.
- Changing scenario or algorithm settings invalidates its trace and measured results. The first edit stops playback and returns to editing with a concise explanation. No stale route remains over changed terrain.
- Cancel stops preparation; Reset playback returns to the beginning; Clear search removes results; Clear environment is a separate undoable action.

**Acceptance:** stepping forward, backward and forward again reproduces the exact same state. Playback speed, viewport size and reduced-motion settings do not alter results.

### F07 — Comparison laboratory

- Two panes, any pair of the four algorithms, with identical immutable scenario data and movement rules. Algorithms and applicable heuristics are independently selectable.
- One shared editor; editing from either pane updates the same environment and clears both runs. Linked camera position, scale and hovered coordinates are the default.
- Shared transport advances one logical search step per active pane. A completed pane holds its final state. The UI labels this “Synchronized steps”; it does not imply equal computational work or real-time speed.
- The result table shows objective, path moves, path cost, expanded nodes, peak frontier and measured search duration for each pane. Do not declare a universal winner.
- Benchmark executions are serial and unanimated to avoid the two solvers competing for CPU. Visual traces may be replayed together after preparation.
- On small screens the same comparison becomes a pane selector plus a persistent comparative results table. Do not compress both canvases into unreadable thumbnails.

**Acceptance:** scenario hashes match; a test proves that each pane receives its own mutable working buffers. A weighted example can show BFS with fewer moves but higher cost without mislabelling either result.

### F08 — Metrics and inspection

| Metric | Exact meaning |
|---|---|
| Path length | Number of moves/edges, displayed with the unit “moves” |
| Geometric distance | Optional inspector value: sum of cardinal and diagonal distances |
| Path cost | Sum of destination-weighted edge costs; not rounded inside the solver |
| Nodes expanded | Number of selected non-goal cells whose successors are examined; terminal goal is excluded |
| Nodes discovered | Distinct cells first admitted to the frontier, including start |
| Peak frontier | Maximum simultaneous unique frontier entries |
| Search time | Worker elapsed duration of the untraced solve, including initial search-state setup and final path reconstruction; excludes transfer, trace recording, animation and display |
| Algorithm buffers | High-water allocated byte lengths of algorithm-owned typed-array buffers; not total memory consumption |
| Replay storage | Actual retained trace/checkpoint buffer bytes, shown separately |

At start = goal: zero moves, zero cost, zero expanded cells, one discovered cell. For unreachable, path length/cost are “No route”, not zero. Cancelled or incomplete runs have no successful result. Before a measurement, display an em dash or “Not measured”.

During replay, logical counters follow the playback cursor. Timing and allocation measurements belong to the whole run and remain explicitly labelled as such. A cell inspector shows coordinates, terrain, state, parent and the score meaningful to that algorithm: g/h/f for A*, distance for Dijkstra, depth for BFS and h plus route-so-far cost for greedy.

### F09 — Reproducibility and persistence

- MVP uses versioned JSON import/export, including complete materialised terrain, endpoints, movement, algorithm settings and generator provenance. Export does not rely on a seed alone.
- Add a canonical scenario hash; export the engine/rules version for reproducible results. Exact trace order is guaranteed only for the recorded engine version and settings. Timings are never promised to reproduce exactly.
- Import is local, validated and transactional. Unknown schema versions, oversized files, invalid dimensions or incompatible settings leave the current scenario intact with a useful error. Proposed file limit: 1 MiB, with separate decoded cell-count limits.
- Final release adds local draft restoration and compact URL-fragment sharing if the encoded scenario is within a conservative 8,000-character product limit. Larger maps use JSON export. There is no URL shortener or server storage.
- Local storage failure is non-fatal; explain that saving locally is unavailable and keep export working. No private data or telemetry is required.

**Acceptance:** export → import preserves all relevant data and deterministic results. A failed import never partially replaces the working environment.

## 4. Scoped MVP and release boundary

The MVP ends at milestone 4 and is a usable private laboratory. Milestones 5–6 turn it into the flagship portfolio release. All requested core workflows belong to the MVP; polish does not substitute for missing algorithms or rewind.

| Capability | MVP, milestone 4 | Portfolio release, milestone 6 |
|---|---|---|
| Algorithms and constraints | All four; 4/8 directions; weights; gated heuristics | Fully documented guarantees and reviewed edge cases |
| Editing | Draw, erase, endpoint placement, undo/redo, zoom/pan | Refined gestures, error recovery and validated larger limits |
| Generation | One seeded maze and original presets | Curated explanatory scenarios; no extra generator required |
| Playback | Exact history, pause/resume, step, rewind, speed | Refined transitions, seek responsiveness, resource controls |
| Comparison | Two panes, shared scenario and steps, result table | Polished linked inspection and phone comparison |
| Reproducibility | Versioned JSON import/export | Local recovery and small-scenario share links |
| Accessibility | Keyboard editing, focus, semantic controls, reduced motion | Manual assistive-technology review and documented conformance limits |
| Measurement | Defined counters and untraced duration | Controlled benchmark report with raw data and limitations |
| Delivery | Locally runnable original application and tests | Documentation, actual captures, CI configuration and static deployment bundle |

**Outside this release:** user accounts, cloud projects, collaboration, backend services, hex/navmesh graphs, 3D scenes, custom heuristic code, weighted A*, bidirectional or incremental search, reinforcement learning, video export, plug-in APIs and a large lesson system. These additions would weaken focus before the core laboratory is complete.

## 5. Difficult decisions and recommendations

| Decision | Recommendation | Why / cost |
|---|---|---|
| React cells versus GPU rendering | React for controls; PixiJS WebGL for the grid | Keeps per-frame grid updates outside React; adds an explicit renderer lifecycle |
| Full snapshots versus reversible history | Typed delta records plus periodic bounded checkpoints | Exact rewind without a full grid copy per step; replay correctness needs dedicated tests |
| Compute-and-play together versus recorded runs | Prepare bounded traces, then replay; benchmark an untraced run separately | Simple deterministic playback and interpretable timing; long preparations need honest feedback |
| Heap duplicates versus decrease-key | Original indexed binary min-heap | One frontier entry per cell, bounded storage; index bookkeeping must be thoroughly tested |
| BFS with weighted terrain | Allow it with a clear objective label | Reveals a real algorithmic difference without changing the shared problem |
| Heuristic flexibility versus correctness | Restrict the UI to validated consistent choices | Preserves defensible A* guarantees; custom/weighted heuristics are deferred |
| Canvas accessibility | DOM controls and a synchronised accessible grid interaction mode | Canvas pixels alone cannot expose editable cells and search decisions |
| “Memory used” metric | Report owned buffer bytes and peak frontier, with exclusions | Exact browser-process or per-algorithm heap attribution is not portable |
| Fair timing versus live races | Serial measurements; synchronized replay afterwards | Avoids presenting animation duration or resource contention as algorithm speed |
| Full mobile parity versus two tiny canvases | One readable canvas at a time with both result columns retained | Keeps comparison useful on a phone |

The proposed stack remains React, strict TypeScript, Vite, PixiJS, module Web Workers and Vitest. Add Playwright for actual browser workflows, Testing Library for control semantics and fast-check for generated engine properties. Use authored CSS tokens and ordinary DOM controls; a component framework, state framework and animation framework are not initially necessary. See [engineering specification](ENGINEERING.md) for source-backed evaluation and contracts.

## 6. Milestone plan and exit gates

Progress is based on evidence, not a calendar estimate. At each gate, provide a runnable local demonstration where applicable, the checks actually executed, unresolved limitations and updated documentation. Ordinary verified milestone work can continue under approval of this plan; any material change to scope or guarantees must be surfaced.

| Milestone | Work | Exit evidence |
|---|---|---|
| **1 — Specification and design** | Approve this PRD, visual rules, screen concepts, graph semantics, architecture and acceptance targets | User approval; requirements and key tradeoffs recorded |
| **2 — Engine and correctness** | Hand-author project setup; scenario model; indexed heap/FIFO; algorithms; heuristics; seeded generator; pure step engine; trace format and independent oracle | Unit/property suites pass; no-path/weighted/diagonal cases verified; trace-on/off equivalence; benchmark protocol ready |
| **3 — Editor and renderer** | React shell, Pixi lifecycle, layers, coordinate transforms, editing commands, worker bridge, accessible cell mode, JSON import/export | Actual browser editing demo; stroke/undo/resize tests; worker cancellation and invalid-import checks; first rendering measurements |
| **4 — Playback and comparison** | Reversible trace reducer, seek/checkpoints, inspector, transport, paired runs and result table | All MVP journeys work; replay round-trips match; comparisons share exact input; metrics follow documented definitions |
| **5 — Performance and accessibility** | Profile larger maps; tune batching and memory; motion refinement; touch/reflow; screen-reader review; cross-browser verification; draft recovery | Recorded performance on named hardware; reviewed phone/tablet/desktop views; accessibility findings fixed or explicitly documented |
| **6 — Portfolio finish and demo preparation** | Final polish; README; architecture/algorithm notes; genuine screenshots and demo capture; controlled benchmark report; dependency/CI/build review | Clean production build served locally; fresh-setup verification; evidence manifest; deployment-ready static files; release limitations stated |

Milestones 2–4 form the dependency spine. At milestone 2, trace design must be proven before an elaborate UI is built around it. At milestone 3, confirm WebGL behaviour and the accessible grid interaction before polishing every control. Performance regression work belongs after real profiling, not speculative custom shaders.

## 7. Definition of done and approval

The final application is complete only when all required workflows work in the actual software, all algorithm correctness gates pass, visual/accessibility reviews are recorded, performance claims have measured evidence, documentation matches behaviour, and the production bundle works from a local static server.

The final repository should contain original source, tests, architecture decisions, algorithm guarantees, scenario fixtures, benchmark runner/raw results, CI configuration, license/dependency notices and authentic media. An open-source license choice must be confirmed before public release. Configure a clean dedicated local repository after implementation is authorised; leave synced project material untouched.

Approval requested: **approve this product scope, visual direction, architecture and verified milestone sequence for local implementation.** Public GitHub creation/push and public deployment remain separate actions requiring explicit approval, as requested.

Companion documents:

- [Visual design specification and key-screen concepts](VISUAL-DESIGN.md)
- [Component architecture, algorithm contracts, tests and benchmarks](ENGINEERING.md)

