import type { Frame, SearchResult, Step } from "../engine/search";
export interface PackedTrace {
  frames: Float64Array;
  offsets: Uint32Array;
  patches: Float64Array;
  pathCells: Int32Array;
}
const phases = ["exploring", "reconstructing", "found", "unreachable"] as const;
function writeFrame(out: Float64Array, at: number, f: Frame) {
  out.set(
    [
      f.current,
      f.expanded,
      f.discovered,
      f.frontier,
      phases.indexOf(f.phase),
      f.pathCount,
    ],
    at,
  );
}
function readFrame(src: Float64Array, at: number): Frame {
  return {
    current: src[at],
    expanded: src[at + 1],
    discovered: src[at + 2],
    frontier: src[at + 3],
    phase: phases[src[at + 4]],
    pathCount: src[at + 5],
  };
}
export function pack(steps: Step[]): PackedTrace {
  const count = steps.reduce((sum, s) => sum + s.patches.length, 0);
  const trace: PackedTrace = {
    frames: new Float64Array(steps.length * 12),
    offsets: new Uint32Array(steps.length + 1),
    patches: new Float64Array(count * 9),
    pathCells: new Int32Array(steps.length).fill(-1),
  };
  let p = 0;
  steps.forEach((step, i) => {
    writeFrame(trace.frames, i * 12, step.before);
    writeFrame(trace.frames, i * 12 + 6, step.after);
    trace.offsets[i] = p;
    trace.pathCells[i] = step.pathCell ?? -1;
    for (const patch of step.patches) {
      const { before: a, after: b } = patch;
      trace.patches.set(
        [
          patch.id,
          a.status,
          a.parent,
          a.cost,
          a.depth,
          b.status,
          b.parent,
          b.cost,
          b.depth,
        ],
        p * 9,
      );
      p++;
    }
  });
  trace.offsets[steps.length] = p;
  return trace;
}
export function traceBytes(t: PackedTrace) {
  return (
    t.frames.byteLength +
    t.offsets.byteLength +
    t.patches.byteLength +
    t.pathCells.byteLength
  );
}
export interface Projection {
  status: Uint8Array;
  parents: Int32Array;
  costs: Float64Array;
  depths: Int32Array;
  path: number[];
  frame: Frame;
}
function empty(n: number): Projection {
  return {
    status: new Uint8Array(n),
    parents: new Int32Array(n).fill(-1),
    costs: new Float64Array(n).fill(Infinity),
    depths: new Int32Array(n),
    path: [],
    frame: {
      current: -1,
      expanded: 0,
      discovered: 0,
      frontier: 0,
      phase: "exploring",
      pathCount: 0,
    },
  };
}
function clone(p: Projection): Projection {
  return {
    status: p.status.slice(),
    parents: p.parents.slice(),
    costs: p.costs.slice(),
    depths: p.depths.slice(),
    path: [...p.path],
    frame: { ...p.frame },
  };
}
export class History {
  position = 0;
  readonly length: number;
  view: Projection;
  private checkpoints = new Map<number, Projection>();
  private interval: number;
  constructor(
    public trace: PackedTrace,
    private n: number,
  ) {
    this.length = trace.pathCells.length;
    this.view = empty(n);
    // Keep checkpoint payload below 8 MiB; spacing grows with grid and trace size.
    this.interval = Math.max(
      256,
      Math.ceil((this.length * (n * 25 + 128)) / (7 * 1024 * 1024)),
    );
    this.checkpoints.set(0, clone(this.view));
  }
  get checkpointBytes() {
    let bytes = 0;
    for (const p of this.checkpoints.values())
      bytes +=
        p.status.byteLength +
        p.parents.byteLength +
        p.costs.byteLength +
        p.depths.byteLength +
        p.path.length * 8;
    return bytes;
  }
  seek(target: number) {
    target = Math.max(0, Math.min(this.length, Math.floor(target)));
    if (Math.abs(target - this.position) > this.interval) {
      let best = 0;
      for (const key of this.checkpoints.keys())
        if (key <= target && key > best) best = key;
      if (Math.abs(target - best) < Math.abs(target - this.position)) {
        this.position = best;
        this.view = clone(this.checkpoints.get(best)!);
      }
    }
    while (this.position < target) {
      this.apply(this.position++, true);
      if (
        this.position % this.interval === 0 &&
        !this.checkpoints.has(this.position) &&
        this.checkpointBytes + this.n * 25 + 128 < 8 * 1024 * 1024
      )
        this.checkpoints.set(this.position, clone(this.view));
    }
    while (this.position > target) this.apply(--this.position, false);
  }
  private apply(i: number, forward: boolean) {
    const t = this.trace,
      from = t.offsets[i],
      to = t.offsets[i + 1];
    for (
      let p = forward ? from : to - 1;
      forward ? p < to : p >= from;
      p += forward ? 1 : -1
    ) {
      const at = p * 9,
        id = t.patches[at],
        v = at + (forward ? 5 : 1);
      this.view.status[id] = t.patches[v];
      this.view.parents[id] = t.patches[v + 1];
      this.view.costs[id] = t.patches[v + 2];
      this.view.depths[id] = t.patches[v + 3];
    }
    if (t.pathCells[i] >= 0) {
      if (forward) this.view.path.push(t.pathCells[i]);
      else this.view.path.pop();
    }
    this.view.frame = readFrame(t.frames, i * 12 + (forward ? 6 : 0));
  }
}
export interface Run {
  settings: import("../engine/search").Settings;
  result: Omit<SearchResult, "steps">;
  trace: PackedTrace;
  ms: number;
  fingerprint: string;
}
