export type Movement = 4 | 8;
export interface Scenario {
  version: 1;
  name: string;
  width: number;
  height: number;
  walls: number[];
  weights: number[];
  start: number;
  goal: number;
  movement: Movement;
  seed?: number;
  generator?: string;
}
export const MAX_SIZE = 128;
export function blank(width = 40, height = 24): Scenario {
  return {
    version: 1,
    name: "Untitled experiment",
    width,
    height,
    walls: Array(width * height).fill(0),
    weights: Array(width * height).fill(1),
    start: Math.floor(height / 2) * width + Math.min(4, width - 1),
    goal: Math.floor(height / 2) * width + Math.max(0, width - 5),
    movement: 4,
  };
}
export function validate(value: unknown): Scenario {
  if (!value || typeof value !== "object")
    throw new Error("This file does not contain a scenario.");
  const s = value as Scenario;
  if (s.version !== 1)
    throw new Error("Unsupported scenario version. Expected version 1.");
  if (
    ![s.width, s.height].every(
      (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SIZE,
    )
  )
    throw new Error(`Dimensions must be integers from 1 to ${MAX_SIZE}.`);
  const n = s.width * s.height;
  if (
    !Array.isArray(s.walls) ||
    !Array.isArray(s.weights) ||
    s.walls.length !== n ||
    s.weights.length !== n
  )
    throw new Error("Cell data does not match the grid dimensions.");
  if (
    !s.walls.every((n) => n === 0 || n === 1) ||
    !s.weights.every((n) => Number.isInteger(n) && n >= 1 && n <= 9)
  )
    throw new Error(
      "Walls must be 0 or 1; terrain costs must be integers from 1 to 9.",
    );
  if (
    ![s.start, s.goal].every(
      (id) => Number.isInteger(id) && id >= 0 && id < n && !s.walls[id],
    )
  )
    throw new Error("Start and goal must be open cells inside the grid.");
  if (s.movement !== 4 && s.movement !== 8)
    throw new Error("Movement must be four or eight directions.");
  return {
    version: 1,
    name:
      typeof s.name === "string" ? s.name.slice(0, 80) : "Imported experiment",
    width: s.width,
    height: s.height,
    start: s.start,
    goal: s.goal,
    movement: s.movement,
    walls: [...s.walls],
    weights: [...s.weights],
    ...(Number.isInteger(s.seed)
      ? { seed: s.seed, generator: String(s.generator ?? "").slice(0, 60) }
      : {}),
  };
}
export function parseScenario(text: string): Scenario {
  if (text.length > 1024 * 1024)
    throw new Error("Scenario files must be smaller than 1 MiB.");
  try {
    return validate(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("The file is not valid JSON.");
    throw error;
  }
}
export function fingerprint(s: Scenario): string {
  const text = JSON.stringify([
    s.width,
    s.height,
    s.walls,
    s.weights,
    s.start,
    s.goal,
    s.movement,
  ]);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}
export const presets = [
  "The crossing",
  "Weighted passage",
  "Open field",
  "Disconnected",
] as const;
export function preset(name: string, width = 40, height = 24): Scenario {
  const s = blank(width, height);
  s.name = name;
  const at = (x: number, y: number) => y * width + x;
  s.start = at(Math.floor(width * 0.15), Math.floor(height * 0.55));
  s.goal = at(Math.floor(width * 0.84), Math.floor(height * 0.34));
  if (name === "The crossing") {
    for (let y = 3; y < height - 3; y++)
      if (y !== Math.floor(height * 0.66))
        s.walls[at(Math.floor(width * 0.43), y)] = 1;
    for (let x = Math.floor(width * 0.43); x < width - 5; x++)
      if (x !== Math.floor(width * 0.72))
        s.walls[at(x, Math.floor(height * 0.34))] = 1;
    for (let y = Math.floor(height * 0.52); y < height - 4; y++)
      for (let x = Math.floor(width * 0.57); x < Math.floor(width * 0.76); x++)
        s.weights[at(x, y)] = 3;
  }
  if (name === "Weighted passage") {
    s.start = at(3, Math.floor(height / 2));
    s.goal = at(width - 4, Math.floor(height / 2));
    for (let x = 6; x < width - 6; x++)
      for (
        let y = Math.floor(height / 2) - 2;
        y <= Math.floor(height / 2) + 2;
        y++
      )
        s.weights[at(x, y)] = 9;
  }
  if (name === "Disconnected")
    for (let y = 0; y < height; y++) s.walls[at(Math.floor(width / 2), y)] = 1;
  s.walls[s.start] = s.walls[s.goal] = 0;
  return s;
}
export function random(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x += 0x6d2b79f5;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function maze(width: number, height: number, seed: number): Scenario {
  if (width < 3 || height < 3) {
    const s = blank(width, height);
    s.start = 0;
    s.goal = width * height - 1;
    s.name = "Backtracking maze";
    s.seed = seed;
    s.generator = "atlas-dfs-1";
    return s;
  }
  const s = blank(width, height);
  s.walls.fill(1);
  s.weights.fill(1);
  s.name = "Backtracking maze";
  s.seed = seed;
  s.generator = "atlas-dfs-1";
  const rng = random(seed);
  const stack = [width + 1];
  s.walls[stack[0]] = 0;
  while (stack.length) {
    const u = stack[stack.length - 1],
      x = u % width,
      y = Math.floor(u / width);
    const options = [
      [x, y - 2],
      [x + 2, y],
      [x, y + 2],
      [x - 2, y],
    ].filter(
      ([a, b]) =>
        a > 0 &&
        b > 0 &&
        a < width - 1 &&
        b < height - 1 &&
        s.walls[b * width + a],
    );
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [a, b] = options[Math.floor(rng() * options.length)];
    const v = b * width + a;
    s.walls[(u + v) / 2] = 0;
    s.walls[v] = 0;
    stack.push(v);
  }
  s.start = width + 1;
  s.goal =
    (height - (height % 2 === 0 ? 3 : 2)) * width +
    width -
    (width % 2 === 0 ? 3 : 2);
  s.walls[s.goal] = 0;
  return s;
}
export function resized(s: Scenario, width: number, height: number): Scenario {
  const out = blank(width, height);
  out.name = s.name;
  out.movement = s.movement;
  for (let y = 0; y < Math.min(height, s.height); y++)
    for (let x = 0; x < Math.min(width, s.width); x++) {
      out.walls[y * width + x] = s.walls[y * s.width + x];
      out.weights[y * width + x] = s.weights[y * s.width + x];
    }
  const move = (id: number) =>
    Math.min(height - 1, Math.floor(id / s.width)) * width +
    Math.min(width - 1, id % s.width);
  out.start = move(s.start);
  out.goal = move(s.goal);
  out.walls[out.start] = out.walls[out.goal] = 0;
  return out;
}
