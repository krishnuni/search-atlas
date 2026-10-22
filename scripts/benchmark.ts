import { cpus, platform, release } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fingerprint, maze, preset } from "../src/domain/scenario";
import { solve, type Settings } from "../src/engine/search";
const settings: Settings[] = [
  { algorithm: "astar", heuristic: "manhattan" },
  { algorithm: "dijkstra", heuristic: "zero" },
  { algorithm: "bfs", heuristic: "zero" },
  { algorithm: "greedy", heuristic: "manhattan" },
];
const rows: object[] = [];
for (const size of [32, 64, 128]) {
  const fixtures = [
    preset("Open field", size, size),
    preset("Weighted passage", size, size),
    preset("Disconnected", size, size),
    maze(size, size, 741),
  ];
  for (const scenario of fixtures) {
    for (const config of settings)
      for (let i = 0; i < 10; i++) solve(scenario, config);
    const samples: number[][] = settings.map(() => []);
    for (let repetition = 0; repetition < 30; repetition++)
      for (let k = 0; k < settings.length; k++) {
        const index = (k + repetition) % settings.length,
          start = performance.now();
        solve(scenario, settings[index]);
        samples[index].push(performance.now() - start);
      }
    settings.forEach((config, i) => {
      const sorted = [...samples[i]].sort((a, b) => a - b),
        result = solve(scenario, config);
      rows.push({
        size,
        scenario: scenario.name,
        scenarioHash: fingerprint(scenario),
        algorithm: config.algorithm,
        heuristic: config.heuristic,
        samplesMs: samples[i],
        medianMs: (sorted[14] + sorted[15]) / 2,
        q1Ms: sorted[7],
        q3Ms: sorted[22],
        outcome: result.outcome,
        moves: result.path.length ? result.path.length - 1 : null,
        cost: Number.isFinite(result.cost) ? result.cost : null,
        expanded: result.expanded,
        peakFrontier: result.peakFrontier,
        bufferBytes: result.bufferBytes,
      });
    });
  }
}
const report = {
  generatedAt: new Date().toISOString(),
  engine: "1.0.0",
  environment: {
    runtime: process.version,
    platform: platform(),
    osRelease: release(),
    cpu: cpus()[0].model,
    logicalCpus: cpus().length,
  },
  methodology:
    "Node.js production engine code via tsx; single process, serial counterbalanced runs; 10 warmups and 30 measured solves per case; allocation/search/reconstruction included; no trace, worker startup, rendering or transport. Node results are not browser benchmarks.",
  rows,
};
mkdirSync("docs/benchmarks", { recursive: true });
writeFileSync("docs/benchmarks/engine.json", JSON.stringify(report, null, 2));
const columns = [
  "size",
  "scenario",
  "scenarioHash",
  "algorithm",
  "medianMs",
  "q1Ms",
  "q3Ms",
  "outcome",
  "moves",
  "cost",
  "expanded",
  "peakFrontier",
  "bufferBytes",
];
writeFileSync(
  "docs/benchmarks/engine.csv",
  [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((key) =>
          JSON.stringify((row as Record<string, unknown>)[key] ?? ""),
        )
        .join(","),
    ),
  ].join("\n"),
);
console.log(
  `Recorded ${rows.length} algorithm/case combinations, each with 30 measured samples, in docs/benchmarks/engine.json and engine.csv.`,
);
