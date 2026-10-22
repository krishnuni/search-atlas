import type { Scenario } from "../domain/scenario";
import { IndexedHeap } from "./heap";
export type Algorithm = "astar" | "dijkstra" | "bfs" | "greedy";
export type Heuristic = "manhattan" | "octile" | "euclidean" | "zero";
export interface Settings {
  algorithm: Algorithm;
  heuristic: Heuristic;
}
export const algorithms: Record<
  Algorithm,
  { name: string; short: string; description: string }
> = {
  astar: {
    name: "A* search",
    short: "A*",
    description: "Balances the cost so far with a lower bound on what remains.",
  },
  dijkstra: {
    name: "Dijkstra",
    short: "Dijkstra",
    description:
      "Expands the cheapest known route. Guarantees the lowest path cost.",
  },
  bfs: {
    name: "Breadth-first",
    short: "BFS",
    description:
      "Explores by depth. Finds the fewest moves, without optimizing terrain cost.",
  },
  greedy: {
    name: "Greedy best-first",
    short: "Greedy",
    description:
      "Follows the estimated distance to the goal. A route, without an optimality guarantee.",
  },
};
export function allowed(movement: 4 | 8, algorithm: Algorithm): Heuristic[] {
  return algorithm === "bfs" || algorithm === "dijkstra"
    ? ["zero"]
    : [
        ...(movement === 4 ? ["manhattan" as const] : ["octile" as const]),
        "euclidean",
        ...(algorithm === "astar" ? ["zero" as const] : []),
      ];
}
export function estimate(
  id: number,
  s: Scenario,
  h: Heuristic,
  min = 1,
): number {
  const dx = Math.abs((id % s.width) - (s.goal % s.width)),
    dy = Math.abs(Math.floor(id / s.width) - Math.floor(s.goal / s.width));
  return (
    min *
    (h === "zero"
      ? 0
      : h === "manhattan"
        ? dx + dy
        : h === "euclidean"
          ? Math.hypot(dx, dy)
          : Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy))
  );
}
const directions = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];
export function neighbours(id: number, s: Scenario): Array<[number, number]> {
  const x = id % s.width,
    y = Math.floor(id / s.width),
    out: Array<[number, number]> = [];
  for (let d = 0; d < s.movement; d++) {
    const [dx, dy] = directions[d],
      a = x + dx,
      b = y + dy;
    if (a < 0 || a >= s.width || b < 0 || b >= s.height) continue;
    const v = b * s.width + a;
    if (
      s.walls[v] ||
      (d >= 4 && (s.walls[y * s.width + a] || s.walls[b * s.width + x]))
    )
      continue;
    out.push([v, (d >= 4 ? Math.SQRT2 : 1) * s.weights[v]]);
  }
  return out;
}
export type Phase = "exploring" | "reconstructing" | "found" | "unreachable";
export interface NodeValue {
  status: number;
  parent: number;
  cost: number;
  depth: number;
}
export interface Patch {
  id: number;
  before: NodeValue;
  after: NodeValue;
}
export interface Frame {
  current: number;
  expanded: number;
  discovered: number;
  frontier: number;
  phase: Phase;
  pathCount: number;
}
export interface Step {
  before: Frame;
  after: Frame;
  patches: Patch[];
  pathCell?: number;
}
export interface SearchResult {
  outcome: "found" | "unreachable";
  path: number[];
  cost: number;
  distance: number;
  expanded: number;
  discovered: number;
  peakFrontier: number;
  bufferBytes: number;
  steps: Step[];
  traceBytes: number;
}
export class ResourceLimit extends Error {
  constructor() {
    super("This trace exceeds the 32 MiB replay budget. Try a smaller grid.");
  }
}
export function solve(
  s: Scenario,
  settings: Settings,
  record = false,
): SearchResult {
  if (!allowed(s.movement, settings.algorithm).includes(settings.heuristic))
    throw new Error(
      "Heuristic is incompatible with the movement or algorithm.",
    );
  const { algorithm } = settings;
  const n = s.width * s.height,
    costs = new Float64Array(n).fill(Infinity),
    parents = new Int32Array(n).fill(-1),
    status = new Uint8Array(n),
    depths = new Int32Array(n),
    order = new Int32Array(algorithm === "bfs" ? 0 : n).fill(-1),
    queue = new Int32Array(algorithm === "bfs" ? n : 0),
    hs = new Float64Array(
      algorithm === "astar" || algorithm === "greedy" ? n : 0,
    );
  let min = 9;
  for (let i = 0; i < n; i++)
    if (!s.walls[i]) min = Math.min(min, s.weights[i]);
  for (let i = 0; i < hs.length; i++)
    hs[i] = estimate(i, s, settings.heuristic, min);
  const priority = (id: number) =>
    algorithm === "greedy"
      ? hs[id]
      : costs[id] + (algorithm === "astar" ? hs[id] : 0);
  const heap = new IndexedHeap(algorithm === "bfs" ? 0 : n, (a, b) =>
    priority(a) !== priority(b)
      ? priority(a) < priority(b)
      : algorithm === "astar" && hs[a] !== hs[b]
        ? hs[a] < hs[b]
        : order[a] < order[b],
  );
  let head = 0,
    tail = 0,
    sequence = 0,
    peakFrontier = 1,
    bytes = 0;
  const steps: Step[] = [];
  let frame: Frame = {
    current: -1,
    expanded: 0,
    discovered: 0,
    frontier: 0,
    phase: "exploring",
    pathCount: 0,
  };
  const value = (id: number): NodeValue => ({
    status: status[id],
    parent: parents[id],
    cost: costs[id],
    depth: depths[id],
  });
  let patches: Patch[] = [];
  const change = (id: number, fn: () => void) => {
    if (record) {
      const before = value(id);
      fn();
      patches.push({ id, before, after: value(id) });
    } else fn();
  };
  const commit = (before: Frame, pathCell?: number) => {
    if (record) {
      bytes += 128 + patches.length * 128;
      if (bytes > 24 * 1024 * 1024) throw new ResourceLimit();
      steps.push({
        before,
        after: { ...frame },
        patches,
        ...(pathCell === undefined ? {} : { pathCell }),
      });
      patches = [];
    }
  };
  const enqueue = (id: number) => {
    if (algorithm === "bfs") queue[tail++] = id;
    else heap.update(id);
  };
  const size = () => (algorithm === "bfs" ? tail - head : heap.size);
  let before = { ...frame };
  change(s.start, () => {
    costs[s.start] = 0;
    status[s.start] = 1;
    order[s.start] = sequence++;
  });
  enqueue(s.start);
  frame.discovered = frame.frontier = 1;
  commit(before);
  let found = false;
  while (size()) {
    before = { ...frame };
    const u = algorithm === "bfs" ? queue[head++] : heap.pop();
    frame.current = u;
    change(u, () => {
      status[u] = 2;
    });
    if (u === s.goal) {
      found = true;
      frame.phase = "reconstructing";
      frame.frontier = size();
      commit(before);
      break;
    }
    frame.expanded++;
    for (const [v, edge] of neighbours(u, s)) {
      const next = costs[u] + edge,
        first = status[v] === 0;
      if (
        algorithm === "bfs" || algorithm === "greedy"
          ? !first
          : next >= costs[v]
      )
        continue;
      change(v, () => {
        costs[v] = next;
        parents[v] = u;
        depths[v] = depths[u] + 1;
        status[v] = 1;
        if (first) order[v] = sequence++;
      });
      if (first) frame.discovered++;
      enqueue(v);
    }
    frame.frontier = size();
    peakFrontier = Math.max(peakFrontier, size());
    commit(before);
  }
  const path: number[] = [];
  if (found) {
    let u = s.goal;
    while (u !== -1) {
      if (path.length > n) throw new Error("Invalid parent chain");
      path.push(u);
      before = { ...frame };
      frame.pathCount++;
      commit(before, u);
      u = parents[u];
    }
    path.reverse();
  }
  before = { ...frame };
  frame.phase = found ? "found" : "unreachable";
  commit(before);
  let distance = 0;
  for (let i = 1; i < path.length; i++)
    distance +=
      Math.abs((path[i] % s.width) - (path[i - 1] % s.width)) &&
      Math.abs(
        Math.floor(path[i] / s.width) - Math.floor(path[i - 1] / s.width),
      )
        ? Math.SQRT2
        : 1;
  return {
    outcome: found ? "found" : "unreachable",
    path,
    cost: found ? costs[s.goal] : Infinity,
    distance,
    expanded: frame.expanded,
    discovered: frame.discovered,
    peakFrontier,
    bufferBytes:
      costs.byteLength +
      parents.byteLength +
      status.byteLength +
      depths.byteLength +
      order.byteLength +
      queue.byteLength +
      hs.byteLength +
      heap.bytes,
    steps,
    traceBytes: bytes,
  };
}
