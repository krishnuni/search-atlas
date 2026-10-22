# Architecture and decisions

## Boundaries

`domain/scenario.ts` validates and materialises environments, generates original presets/seeded mazes and canonical scenario fingerprints. `editor/commands.ts` applies pure paint commands; React groups pointer samples into transactions. `engine` owns topology, heuristic evaluation, the indexed heap, algorithm state and recording. `worker` serialises jobs and separates untraced measurements from recorded runs. `playback` packs deltas and restores exact display projections. `rendering` owns Pixi resources, transforms and pointer/keyboard interaction. `App` coordinates product state and semantic controls.

## ADR 01 — Graph semantics

Use finite regular grids, positive integer terrain, destination-entry costs and fixed corner rules. This makes weighted problems explicit and heuristics provable. Cell-entry costs create directed cost asymmetry even though movement is possible in both directions. The independent test oracle preserves original edge costs while computing distances to the goal.

## ADR 02 — Indexed heap

An original indexed binary heap gives one frontier entry per cell. Scores and discovery sequence live outside the heap; decrease-key updates the index map while bubbling upward. Equal priorities retain documented order. This avoids stale duplicate entries and makes peak frontier meaningful. BFS uses a fixed FIFO and marks cells on enqueue.

## ADR 03 — Playback is a projection

The worker computes a bounded trace before playing. Pause/resume operates on the presentation clock. A reverse step restores recorded old values; seek restores a checkpoint and replays subsequent changes. No search is rerun to infer the past. Reconstruction is a separate phase, one parent link per step. The terminal solution remains immutable.

Packed traces use Float64 arrays for frame and node values, Uint32 offsets and Int32 reconstruction cells. Infinity remains representable in memory. Trace payload and checkpoint numeric payload are distinct from total memory. A conservative construction guard prevents oversized traces; it is not a claim to measure the JavaScript heap.

## ADR 04 — Compute and timing

Use one module worker with serial comparison jobs. Each request/result carries a run identifier; changing a problem invalidates previous requests. Terminating the worker is the cancellation primitive because synchronous loops cannot process cancellation messages until they yield. Structured cloning gives each worker its own scenario; result buffers are transferred back.

Each normal run computes an untraced sample and a recorded solve using the same core engine; route, cost and expanded count must agree. Timings exclude trace recording and all rendering. Paired playback is synchronized by logical step, not execution duration. There is no animation-speed leaderboard.

## ADR 05 — Renderer pragmatism

React renders controls, never a DOM node for every visible grid cell. PixiJS WebGL draws shared-texture cells, route geometry and markers. It renders when display state changes, with dirty-state checks and device-pixel ratio capped at 2. Each viewport has an independent Pixi lifecycle, sharing camera state and scenario data. Two contexts are bounded and measured; consolidating them is optional if profiling later warrants it.

The current version renders a direct state transition without decorative propagation pulses. This preserves reduced-motion behaviour and exact state readability. Every route segment comes from the returned path.

## ADR 06 — Reproducibility

JSON includes materialised cells, schema version, endpoints, movement, optional generator seed/version and both algorithm settings. Imports validate before replacing the working environment. The FNV-1a scenario fingerprint is a deterministic identifier, not a security checksum. Links use a compact cell alphabet and URL-safe base64; decoded data is validated and length bounded. Draft storage failures are recoverable.

Mazes use seeded depth-first backtracking over odd lattice coordinates. Even outer dimensions leave a boundary strip. Start is (1,1); goal is the last interior odd passage coordinate. Grids smaller than 3 in either dimension fall back to a connected open environment. Maze generation resets weights and is one undoable edit.

## ADR 07 — Accessible equivalent interaction

The canvas is paired with a labelled HTML cell navigator, text inspector, semantic result table and route-coordinate list. The stage is a keyboard interaction group; it does not pretend that a bare canvas is an ARIA grid. Settings/help dialogs trap and restore focus. Motion preferences remove nonessential transitions. A comprehensive screen-reader audit remains a separately disclosed verification limitation.

## Resource bounds and failure modes

The editor supports 8–128 cells per dimension; validated imports may contain 1–128. Edit history retains up to 100 transactions under a numeric-payload budget. A recorded pane has a conservative 24 MiB construction guard and bounded checkpoint payload. Recording errors preserve the scenario and offer a smaller experiment. Unsupported renderer, worker failure, invalid import, clipboard failure and storage failure each have a readable recovery path.

Planned 256² support and a summary-only solve are deferred: they are not advertised as implemented. The released 128² laboratory retains full replay for tested supported fixtures.
