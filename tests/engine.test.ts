import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  blank,
  fingerprint,
  maze,
  parseScenario,
  preset,
  validate,
  type Scenario,
} from "../src/domain/scenario";
import {
  allowed,
  estimate,
  neighbours,
  solve,
  type Algorithm,
  type Heuristic,
} from "../src/engine/search";
import { IndexedHeap } from "../src/engine/heap";
import { History, pack, traceBytes } from "../src/playback/history";
function tiny(w: number, h: number): Scenario {
  const s = blank(w, h);
  s.start = 0;
  s.goal = w * h - 1;
  return s;
}
// Deliberately independent Bellman-Ford oracle: enumerate edges from coordinates,
// with no production neighbour or cost helpers.
function oracle(s: Scenario, target = s.goal) {
  const n = s.width * s.height,
    d = Array(n).fill(Infinity);
  d[target] = 0;
  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (let y = 0; y < s.height; y++)
      for (let x = 0; x < s.width; x++) {
        const u = y * s.width + x;
        if (s.walls[u]) continue;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || (s.movement === 4 && dx && dy)) continue;
            const a = x + dx,
              b = y + dy;
            if (a < 0 || a >= s.width || b < 0 || b >= s.height) continue;
            const v = b * s.width + a;
            if (
              s.walls[v] ||
              (dx &&
                dy &&
                (s.walls[y * s.width + a] || s.walls[b * s.width + x]))
            )
              continue;
            const candidate = d[v] + s.weights[v] * (dx && dy ? Math.SQRT2 : 1);
            if (candidate < d[u]) {
              d[u] = candidate;
              changed = true;
            }
          }
      }
    if (!changed) break;
  }
  return d;
}
function checkPath(s: Scenario, path: number[], cost: number) {
  expect(path[0]).toBe(s.start);
  expect(path.at(-1)).toBe(s.goal);
  let sum = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1],
      b = path[i],
      dx = Math.abs((a % s.width) - (b % s.width)),
      dy = Math.abs(Math.floor(a / s.width) - Math.floor(b / s.width));
    expect(s.walls[b]).toBe(0);
    expect(dx <= 1 && dy <= 1 && dx + dy > 0).toBe(true);
    expect(s.movement === 8 || dx + dy === 1).toBe(true);
    sum += s.weights[b] * (dx && dy ? Math.SQRT2 : 1);
  }
  expect(sum).toBeCloseTo(cost, 9);
}
describe("search correctness", () => {
  it("handles coincident endpoints, disconnected goals and destination costs", () => {
    const one = tiny(1, 1);
    const result = solve(one, { algorithm: "astar", heuristic: "manhattan" });
    expect(result.path).toEqual([0]);
    expect(result.cost).toBe(0);
    expect(result.expanded).toBe(0);
    const s = tiny(3, 1);
    s.weights = [9, 3, 6];
    expect(solve(s, { algorithm: "dijkstra", heuristic: "zero" }).cost).toBe(9);
    s.walls[1] = 1;
    expect(solve(s, { algorithm: "bfs", heuristic: "zero" }).outcome).toBe(
      "unreachable",
    );
  });
  it("forbids corner cuts and uses sqrt(2) diagonal lengths", () => {
    const s = tiny(2, 2);
    s.movement = 8;
    expect(
      solve(s, { algorithm: "astar", heuristic: "octile" }).cost,
    ).toBeCloseTo(Math.SQRT2);
    s.walls[1] = s.walls[2] = 1;
    expect(neighbours(0, s)).toEqual([]);
    expect(solve(s, { algorithm: "dijkstra", heuristic: "zero" }).outcome).toBe(
      "unreachable",
    );
  });
  it("demonstrates BFS and greedy suboptimality on weighted terrain", () => {
    const s = preset("Weighted passage", 20, 12);
    const optimal = solve(s, { algorithm: "dijkstra", heuristic: "zero" });
    for (const [algorithm, heuristic] of [
      ["bfs", "zero"],
      ["greedy", "manhattan"],
    ] as [Algorithm, Heuristic][]) {
      const r = solve(s, { algorithm, heuristic });
      expect(r.cost).toBeGreaterThan(optimal.cost);
      checkPath(s, r.path, r.cost);
    }
  });
  it("agrees with an independent oracle on 1000 seeded grids; heuristics are admissible and consistent", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const w = 2 + ((seed >>> 0) % 5),
          h = 2 + ((seed >>> 8) % 5);
        const s = tiny(w, h);
        s.movement = seed & 1 ? 4 : 8;
        let r = seed >>> 0;
        const rng = () => {
          r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
          return r;
        };
        for (let i = 0; i < w * h; i++) {
          s.weights[i] = (rng() % 9) + 1;
          s.walls[i] = rng() % 5 === 0 ? 1 : 0;
        }
        s.walls[s.start] = s.walls[s.goal] = 0;
        const exact = oracle(s),
          min = Math.min(...s.weights.filter((_, i) => !s.walls[i]));
        for (const heuristic of allowed(s.movement, "astar")) {
          const result = solve(s, { algorithm: "astar", heuristic });
          if (Number.isFinite(exact[0])) {
            expect(result.cost).toBeCloseTo(exact[0], 8);
            checkPath(s, result.path, result.cost);
          } else expect(result.outcome).toBe("unreachable");
          for (let u = 0; u < w * h; u++)
            if (!s.walls[u]) {
              const hu = estimate(u, s, heuristic, min);
              expect(hu).toBeLessThanOrEqual(exact[u] + 1e-9);
              for (const [v, edge] of neighbours(u, s))
                expect(hu).toBeLessThanOrEqual(
                  edge + estimate(v, s, heuristic, min) + 1e-9,
                );
            }
        }
        expect(
          solve(s, { algorithm: "dijkstra", heuristic: "zero" }).cost,
        ).toBeCloseTo(exact[0], 8);
        for (const algorithm of ["bfs", "greedy"] as Algorithm[]) {
          const result = solve(s, {
            algorithm,
            heuristic:
              algorithm === "bfs"
                ? "zero"
                : s.movement === 4
                  ? "manhattan"
                  : "octile",
          });
          expect(result.outcome === "found").toBe(Number.isFinite(exact[0]));
          if (result.path.length) checkPath(s, result.path, result.cost);
        }
      }),
      { numRuns: 1000, seed: 20261022 },
    );
  }, 30000);
  it("zero A* matches Dijkstra and BFS matches uniform cardinal cost", () => {
    const s = preset("The crossing");
    const d = solve(s, { algorithm: "dijkstra", heuristic: "zero" });
    expect(solve(s, { algorithm: "astar", heuristic: "zero" }).path).toEqual(
      d.path,
    );
    s.weights.fill(1);
    expect(solve(s, { algorithm: "bfs", heuristic: "zero" }).cost).toBe(
      solve(s, { algorithm: "dijkstra", heuristic: "zero" }).cost,
    );
  });
  it("rejects incompatible heuristics and completes maximum grid", () => {
    const s = tiny(128, 128);
    s.movement = 8;
    expect(() =>
      solve(s, { algorithm: "astar", heuristic: "manhattan" }),
    ).toThrow();
    expect(
      solve(s, { algorithm: "astar", heuristic: "octile" }).path.length,
    ).toBe(128);
  });
});
describe("indexed heap", () => {
  it("maintains membership and decrease-key invariants through randomized operations", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(
            fc.integer({ min: 0, max: 99 }),
            fc.integer({ min: 0, max: 1000 }),
          ),
          { maxLength: 500 },
        ),
        (ops) => {
          const costs = new Float64Array(100).fill(Infinity),
            expected = new Set<number>();
          const heap = new IndexedHeap(100, (a, b) =>
            costs[a] === costs[b] ? a < b : costs[a] < costs[b],
          );
          for (const [id, cost] of ops) {
            costs[id] = Math.min(costs[id], cost);
            heap.update(id);
            expected.add(id);
            expect(heap.size).toBe(expected.size);
            for (let i = 0; i < heap.size; i++)
              expect(heap.positions[heap.cells[i]]).toBe(i);
          }
          const sorted = [...expected].sort(
            (a, b) => costs[a] - costs[b] || a - b,
          );
          expect(sorted.map(() => heap.pop())).toEqual(sorted);
          expect(() => heap.pop()).toThrow();
        },
      ),
    );
  });
});
describe("trace and persistence", () => {
  it("rewinds exact values and random seeks match fresh sequential replay", () => {
    const s = preset("Weighted passage");
    const settings = {
        algorithm: "dijkstra" as const,
        heuristic: "zero" as const,
      },
      traced = solve(s, settings, true),
      plain = solve(s, settings);
    expect(traced.cost).toBe(plain.cost);
    expect(traced.path).toEqual(plain.path);
    const trace = pack(traced.steps),
      history = new History(trace, s.width * s.height);
    expect(traceBytes(trace)).toBeGreaterThan(0);
    history.seek(history.length);
    expect([...history.view.path].reverse()).toEqual(traced.path);
    history.seek(0);
    expect([...history.view.status].every((x) => x === 0)).toBe(true);
    expect([...history.view.costs].every((x) => x === Infinity)).toBe(true);
    expect(history.view.frame.expanded).toBe(0);
    for (const target of [300, 20, history.length, 500, 0, 90]) {
      history.seek(target);
      const fresh = new History(trace, s.width * s.height);
      fresh.seek(target);
      expect(history.view).toEqual(fresh.view);
    }
  });
  it("preserves deterministic scenarios and rejects malformed imports", () => {
    for (const [w, h] of [
      [40, 24],
      [41, 25],
      [8, 8],
    ]) {
      const a = maze(w, h, 741);
      expect(a).toEqual(maze(w, h, 741));
      expect(solve(a, { algorithm: "bfs", heuristic: "zero" }).outcome).toBe(
        "found",
      );
      expect(fingerprint(parseScenario(JSON.stringify(a)))).toBe(
        fingerprint(a),
      );
    }
    const s = tiny(2, 2);
    expect(() => validate({ ...s, weights: [1, NaN, 0, -1] })).toThrow();
    expect(() => parseScenario("{")).toThrow("valid JSON");
    expect(() => parseScenario(" ".repeat(1024 * 1024 + 1))).toThrow("1 MiB");
    expect(() => validate({ ...s, start: 99 })).toThrow();
  });
});
