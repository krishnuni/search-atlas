import { expect, it } from "vitest";
import { blank, resized, validate } from "../src/domain/scenario";
import { paint } from "../src/editor/commands";
it("protects endpoints, retains terrain under moved markers, and does not mutate input", () => {
  const original = blank(8, 8),
    originalWalls = [...original.walls];
  const walls = paint(
    original,
    [original.start, original.goal, 0, -1, 999],
    "wall",
    3,
  );
  expect(walls.walls[0]).toBe(1);
  expect(walls.walls[original.start]).toBe(0);
  expect(original.walls).toEqual(originalWalls);
  const terrain = paint(walls, [0], "terrain", 6),
    goal = paint(terrain, [0], "goal", 6);
  expect(goal.weights[0]).toBe(6);
  expect(goal.goal).toBe(0);
  expect(goal.walls[0]).toBe(0);
  const erased = paint(goal, [1], "erase", 1);
  expect(erased.weights[1]).toBe(1);
  expect(validate(resized(goal, 4, 4)).walls).toHaveLength(16);
});
