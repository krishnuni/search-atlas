# Verification record — 22 October 2026

This record describes checks actually executed on the local production build. It is not a claim that every device/browser has been certified.

## Correctness and build

- Strict TypeScript checking and Vite 7.3.7 production build: passed.
- Vitest 4.1.12: 10 test groups across engine and editor suites passed.
- Within those groups: 1,000 seeded generated tiny grids, all supported A\* heuristics checked against independently implemented Bellman–Ford; weighted costs, diagonal constraints and heuristic consistency/admissibility checked.
- Deterministic heap behaviour, mazes, JSON round trips, traced/untraced results and exact rewind/seek checked.
- Measured coverage for domain/engine/playback: 95.23% lines, 91.12% branches overall. Engine branch coverage: 98.18%; playback: 79.31%. Coverage is a review aid, not a correctness proof.
- Dependency audit after patching development tools: zero reported advisories in the installed dependency graph at verification time.

## Browser workflows

Chrome 155.0.8059.85 on Windows 10.0.26200; Node 24.19.0; AMD Ryzen 7 5800X host.

Nine browser test groups passed against the production preview, including:

- Worker solve, terminal route, rewind and individual steps.
- BFS/Dijkstra weighted comparison on the same environment.
- Cell editing, undo/redo and heuristic applicability after movement changes.
- JSON export/reimport and failed-import transactionality.
- 390px phone layout, 320px boundary and reduced-motion emulation.
- Keyboard editing and pan/fit interaction.
- Help dialog focus/escape behaviour.
- Automated axe WCAG A/AA checks for desktop, help dialog and phone states: no detected violations.
- A two-pane 128 × 128 playback and seek profile.

The tests captured the actual screenshots in `docs/screenshots`. The generated planning concept is not used as application evidence.

## Performance sample

Production preview, 1440 × 1000 viewport, two 128 × 128 open-grid panes, BFS and Dijkstra, playback at 2,000 steps/second:

| Observation                                 |  Result |
| ------------------------------------------- | ------: |
| Preparation interaction                     |  161 ms |
| p50 frame interval                          | 13.9 ms |
| p95 frame interval                          | 15.1 ms |
| Maximum observed frame interval             | 17.2 ms |
| Rewind interaction                          |   50 ms |
| Observed long tasks during sampled playback |       0 |

This is one 3.5-second automated headless Chrome sample on the available host. Interaction times include browser-test transport latency. It meets the proposed desktop p95 frame and rewind targets for this case. Raw intervals and limitations are in `benchmarks/browser-profile.json`; this is not a broad device benchmark.

The separate Node engine benchmark contains 48 combinations × 30 measured solves after 10 warm-ups, with serial counterbalanced ordering. For a 128² open-field case, medians were approximately 0.32 ms A\*, 4.35 ms Dijkstra, 2.07 ms BFS and 0.32 ms greedy. This fixture favours directed heuristics; those numbers are not universal rankings and are not browser timings. Inspect the full raw JSON/CSV before drawing conclusions.

## Limits and explicit follow-up work

- Physical phone, Safari/iOS, Firefox and a real screen-reader session were not available for this verification pass. Phone sizing/reduced motion were emulated in Chrome. No full WCAG conformance claim is made.
- The release limit is 128², rather than the proposed optional 256² extension.
- A cell navigator provides the accessible editing equivalent; the canvas is a keyboard group, not a virtualised ARIA grid.
- The renderer uses one isolated Pixi/WebGL application per pane with shared camera state. The measured two-pane case is smooth; a single-context renderer remains an optional optimisation.
- Search state transitions are immediate and deliberate. Decorative propagation effects are omitted.
- The trace recorder uses temporary objects before packing transferable arrays. Reported payload bytes exclude those temporary allocations and JS object overhead. No total-heap or GPU-memory claim is made.
- Resource-limit failures preserve the environment and ask for a smaller scenario; a separate summary-only run is not implemented.
- CI is configured in `.github/workflows/verify.yml`; local results above do not imply a successful remote CI run.

Publication/deployment were authorised by the user after the planning package was approved. The initial code retains copyright; no open-source grant has been selected.
