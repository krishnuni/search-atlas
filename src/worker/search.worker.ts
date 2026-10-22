/// <reference lib="webworker" />
import { fingerprint, validate, type Scenario } from "../domain/scenario";
import { solve, type Settings } from "../engine/search";
import { pack, traceBytes, type Run } from "../playback/history";
export interface Request {
  id: number;
  scenario: Scenario;
  settings: Settings[];
}
export type Response =
  | { id: number; runs: Run[] }
  | { id: number; error: string };
self.onmessage = (event: MessageEvent<Request>) => {
  const { id, settings } = event.data;
  try {
    const scenario = validate(event.data.scenario),
      runs: Run[] = [];
    for (const config of settings) {
      const start = performance.now();
      const measured = solve(scenario, config);
      const ms = performance.now() - start;
      const traced = solve(scenario, config, true);
      if (
        traced.cost !== measured.cost ||
        traced.expanded !== measured.expanded ||
        traced.path.join() !== measured.path.join()
      )
        throw new Error("Trace verification failed.");
      const trace = pack(traced.steps),
        { steps: _, ...result } = traced;
      result.traceBytes = traceBytes(trace);
      runs.push({
        settings: config,
        result,
        trace,
        ms,
        fingerprint: fingerprint(scenario),
      });
    }
    const transfer = runs.flatMap((r) => [
      r.trace.frames.buffer,
      r.trace.offsets.buffer,
      r.trace.patches.buffer,
      r.trace.pathCells.buffer,
    ]);
    self.postMessage({ id, runs } satisfies Response, { transfer });
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "Search worker failed.",
    } satisfies Response);
  }
};
