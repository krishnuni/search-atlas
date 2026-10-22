import type { Scenario } from "../domain/scenario";
export type PaintTool = "wall" | "terrain" | "erase" | "start" | "goal";
/** Pure edit operation; the UI groups successive samples into one transaction. */
export function paint(
  s: Scenario,
  ids: number[],
  tool: PaintTool,
  weight: number,
): Scenario {
  const next = { ...s, walls: [...s.walls], weights: [...s.weights] };
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 0 || id >= next.walls.length) continue;
    if (tool === "start" || tool === "goal") {
      next[tool] = id;
      next.walls[id] = 0;
    } else if (id !== next.start && id !== next.goal) {
      if (tool === "wall") {
        next.walls[id] = 1;
        next.weights[id] = 1;
      }
      if (tool === "erase") {
        next.walls[id] = 0;
        next.weights[id] = 1;
      }
      if (tool === "terrain") {
        next.walls[id] = 0;
        next.weights[id] = Math.max(1, Math.min(9, Math.round(weight)));
      }
    }
  }
  return next;
}
