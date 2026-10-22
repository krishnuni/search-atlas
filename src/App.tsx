import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Crosshair,
  Eraser,
  Flag,
  Focus,
  Grid2X2,
  Hand,
  Layers,
  LocateFixed,
  Minus,
  MousePointer2,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Route,
  Settings2,
  SkipBack,
  SkipForward,
  Square,
  StepBack,
  StepForward,
  Undo2,
  X,
} from "lucide-react";
import {
  blank,
  fingerprint,
  maze,
  parseScenario,
  preset,
  presets,
  resized,
  validate,
  type Scenario,
} from "./domain/scenario";
import {
  algorithms,
  allowed,
  estimate,
  type Algorithm,
  type Settings,
} from "./engine/search";
import { History, type Run } from "./playback/history";
import { paint } from "./editor/commands";
import { Grid, type Tool } from "./rendering/Grid";
import type { Request, Response } from "./worker/search.worker";
const DEFAULT: Settings[] = [
  { algorithm: "astar", heuristic: "manhattan" },
  { algorithm: "dijkstra", heuristic: "zero" },
];
const TOOLS: Array<{
  id: Tool;
  label: string;
  key: string;
  icon: typeof Hand;
}> = [
  { id: "inspect", label: "Inspect", key: "I", icon: MousePointer2 },
  { id: "wall", label: "Wall", key: "W", icon: Square },
  { id: "terrain", label: "Terrain", key: "T", icon: Layers },
  { id: "erase", label: "Erase", key: "E", icon: Eraser },
  { id: "start", label: "Start", key: "S", icon: LocateFixed },
  { id: "goal", label: "Goal", key: "G", icon: Flag },
  { id: "pan", label: "Pan", key: "P", icon: Hand },
];
function initial(): Scenario {
  try {
    if (location.hash.startsWith("#atlas="))
      return decodeShare(location.hash.slice(7)).scenario;
    const saved = localStorage.getItem("search-atlas-draft-v1");
    if (saved) return parseScenario(saved);
  } catch {
    /* A recoverable draft never blocks opening the lab. */
  }
  return preset("The crossing");
}
function normalized(settings: Settings, s: Scenario): Settings {
  const choices = allowed(s.movement, settings.algorithm);
  return {
    ...settings,
    heuristic: choices.includes(settings.heuristic)
      ? settings.heuristic
      : choices[0],
  };
}
function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function encodeShare(s: Scenario, settings: Settings[]) {
  const text = JSON.stringify({
    v: 1,
    w: s.width,
    h: s.height,
    c: s.walls.map((wall, i) => (wall ? "0" : s.weights[i])).join(""),
    s: s.start,
    g: s.goal,
    m: s.movement,
    n: s.name,
    settings,
  });
  const bytes = new TextEncoder().encode(text);
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function decodeShare(encoded: string): {
  scenario: Scenario;
  settings: Settings[];
} {
  if (encoded.length > 8000) throw new Error("Shared scenario is too large.");
  const text = new TextDecoder().decode(
    Uint8Array.from(
      atob(encoded.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    ),
  );
  const v = JSON.parse(text);
  if (v.v !== 1 || typeof v.c !== "string")
    throw new Error("Unsupported shared scenario.");
  const s = validate({
    version: 1,
    width: v.w,
    height: v.h,
    start: v.s,
    goal: v.g,
    movement: v.m,
    name: v.n,
    walls: [...v.c].map((c) => (c === "0" ? 1 : 0)),
    weights: [...v.c].map((c) => (c === "0" ? 1 : Number(c))),
  });
  return {
    scenario: s,
    settings:
      Array.isArray(v.settings) &&
      v.settings.length === 2 &&
      v.settings.every(
        (x: Settings) =>
          x &&
          Object.hasOwn(algorithms, x.algorithm) &&
          allowed(s.movement, x.algorithm).includes(x.heuristic),
      )
        ? v.settings
        : DEFAULT.map((x) => normalized(x, s)),
  };
}
export default function App() {
  const [scenario, setScenario] = useState(initial),
    scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const [settings, setSettings] = useState<Settings[]>(() => {
    try {
      if (location.hash.startsWith("#atlas="))
        return decodeShare(location.hash.slice(7)).settings;
    } catch {}
    return DEFAULT.map((x) => normalized(x, scenario));
  });
  const [compare, setCompare] = useState(false),
    [tool, setTool] = useState<Tool>("wall"),
    [weight, setWeight] = useState(3),
    [selected, setSelected] = useState(scenario.start),
    [zoom, setZoom] = useState(1),
    [cameraReset, setCameraReset] = useState(0),
    [camera, setCamera] = useState({ x: 0, y: 0 }),
    [runs, setRuns] = useState<Run[]>([]),
    [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [speed, setSpeed] = useState(150),
    [notice, setNotice] = useState(""),
    [panel, setPanel] = useState(false),
    [help, setHelp] = useState(false),
    [sizeDialog, setSizeDialog] = useState(false),
    [seed, setSeed] = useState(741),
    [mobilePane, setMobilePane] = useState(0),
    [size, setSize] = useState({
      width: scenario.width,
      height: scenario.height,
    });
  const histories = useRef<History[]>([]),
    cursor = useRef(0),
    worker = useRef<Worker | null>(null),
    runId = useRef(0),
    undo = useRef<Scenario[]>([]),
    redo = useRef<Scenario[]>([]),
    pending = useRef<Scenario | null>(null),
    rail = useRef<HTMLElement>(null),
    file = useRef<HTMLInputElement>(null),
    messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inform = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(messageTimer.current);
    messageTimer.current = setTimeout(() => setNotice(""), 6500);
  }, []);
  const invalidate = useCallback(() => {
    runId.current++;
    worker.current?.terminate();
    worker.current = null;
    setBusy(false);
    setPlaying(false);
    setRuns([]);
    histories.current = [];
    cursor.current = 0;
    setTick((v) => v + 1);
  }, []);
  useEffect(
    () => () => {
      worker.current?.terminate();
      clearTimeout(messageTimer.current);
    },
    [],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("search-atlas-draft-v1", JSON.stringify(scenario));
      } catch {
        inform(
          "Local saving is unavailable. Export your experiment to keep it.",
        );
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [scenario, inform]);
  useEffect(() => {
    if (!panel) return;
    const previous = document.activeElement as HTMLElement;
    const controls = () =>
      [
        ...(rail.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input,select:not(:disabled)",
        ) ?? []),
      ].filter((x) => x.getClientRects().length);
    controls()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setPanel(false);
      }
      if (e.key === "Tab") {
        const list = controls(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [panel]);
  const pushUndo = (s: Scenario) => {
    undo.current.push(s);
    let bytes = undo.current.reduce((n, x) => n + x.width * x.height * 16, 0);
    while (
      (undo.current.length > 100 || bytes > 8 * 1024 * 1024) &&
      undo.current.length > 1
    ) {
      const old = undo.current.shift()!;
      bytes -= old.width * old.height * 16;
    }
    redo.current = [];
  };
  const commit = (next: Scenario) => {
    pushUndo(scenarioRef.current);
    invalidate();
    setScenario(next);
    setSettings((current) => current.map((x) => normalized(x, next)));
    setSelected(next.start);
    setSize({ width: next.width, height: next.height });
  };
  const edit = (ids: number[], end: boolean) => {
    if (tool === "inspect" || tool === "pan") return;
    if (!pending.current && ids.length) {
      pending.current = scenarioRef.current;
      invalidate();
    }
    if (ids.length) {
      const next = paint(scenarioRef.current, ids, tool, weight);
      scenarioRef.current = next;
      setScenario(next);
    }
    if (end && pending.current) {
      pushUndo(pending.current);
      pending.current = null;
      setTick((v) => v + 1);
    }
  };
  const travelEdit = (back: boolean) => {
    const from = back ? undo.current : redo.current,
      to = back ? redo.current : undo.current;
    const next = from.pop();
    if (next) {
      to.push(scenarioRef.current);
      invalidate();
      setScenario(next);
      setSettings((current) => current.map((x) => normalized(x, next)));
      setSelected((x) => Math.min(x, next.width * next.height - 1));
    }
  };
  const cancelPaint = () => {
    if (pending.current) {
      setScenario(pending.current);
      scenarioRef.current = pending.current;
      pending.current = null;
    }
  };
  const run = () => {
    if (busy) {
      invalidate();
      inform("Preparation cancelled.");
      return;
    }
    if (runs.length) {
      if (cursor.current >= maxSteps()) seek(0);
      setPlaying((v) => !v);
      return;
    }
    const id = ++runId.current;
    setBusy(true);
    setPlaying(false);
    try {
      worker.current?.terminate();
      const w = new Worker(
        new URL("./worker/search.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = w;
      w.onmessage = (event: MessageEvent<Response>) => {
        if (event.data.id !== runId.current) return;
        setBusy(false);
        if ("error" in event.data) {
          inform(event.data.error);
          return;
        }
        const result = event.data.runs;
        histories.current = result.map(
          (r) => new History(r.trace, scenario.width * scenario.height),
        );
        cursor.current = 0;
        setRuns(result);
        setPlaying(true);
        setTick((v) => v + 1);
        w.terminate();
        worker.current = null;
      };
      w.onerror = () => {
        if (id === runId.current) {
          setBusy(false);
          inform(
            "The search worker could not start. Please reload and try again.",
          );
        }
      };
      w.postMessage({
        id,
        scenario,
        settings: settings.slice(0, compare ? 2 : 1),
      } satisfies Request);
    } catch {
      setBusy(false);
      inform(
        "Web Workers are unavailable in this browser. Export your experiment and try a current browser.",
      );
    }
  };
  const maxSteps = () => Math.max(0, ...histories.current.map((h) => h.length));
  const seek = (position: number) => {
    cursor.current = Math.max(0, Math.min(maxSteps(), position));
    histories.current.forEach((h) => h.seek(cursor.current));
    setTick((v) => v + 1);
  };
  useEffect(() => {
    if (!playing) return;
    let request = 0,
      last = 0,
      fraction = 0;
    const frame = (time: number) => {
      if (last) fraction += (Math.min(100, time - last) / 1000) * speed;
      last = time;
      const count = Math.floor(fraction);
      if (count) {
        fraction -= count;
        cursor.current = Math.min(maxSteps(), cursor.current + count);
        histories.current.forEach((h) => h.seek(cursor.current));
        setTick((v) => v + 1);
        if (cursor.current >= maxSteps()) {
          setPlaying(false);
          return;
        }
      }
      request = requestAnimationFrame(frame);
    };
    request = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(request);
  }, [playing, speed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const element = e.target as HTMLElement;
      if (
        ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(element.tagName) ||
        element.closest('[role="dialog"]')
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        travelEdit(!e.shiftKey);
        return;
      }
      if (e.key === " " && !e.repeat) {
        e.preventDefault();
        run();
      }
      if (element.classList.contains("grid-host")) {
        const picked = TOOLS.find(
          (x) => x.key.toLowerCase() === e.key.toLowerCase(),
        );
        if (picked) setTool(picked.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const changeSettings = (pane: number, next: Settings) => {
    invalidate();
    setSettings((current) =>
      current.map((x, i) => (i === pane ? normalized(next, scenario) : x)),
    );
  };
  const mode = (comparison: boolean) => {
    if (compare !== comparison) {
      invalidate();
      setCompare(comparison);
      setMobilePane(0);
    }
  };
  const importFile = async (selectedFile?: File) => {
    if (!selectedFile) return;
    try {
      if (selectedFile.size > 1024 * 1024)
        throw new Error("Scenario files must be smaller than 1 MiB.");
      const text = await selectedFile.text(),
        s = parseScenario(text),
        metadata = JSON.parse(text).atlas;
      if (
        metadata?.settings &&
        (!Array.isArray(metadata.settings) ||
          metadata.settings.length !== 2 ||
          !metadata.settings.every(
            (x: Settings) =>
              x &&
              Object.hasOwn(algorithms, x.algorithm) &&
              allowed(s.movement, x.algorithm).includes(x.heuristic),
          ))
      )
        throw new Error("The imported algorithm settings are incompatible.");
      commit(s);
      if (metadata?.settings) setSettings(metadata.settings);
      inform("Experiment imported.");
    } catch (error) {
      inform(
        error instanceof Error ? error.message : "Unable to import the file.",
      );
    }
    if (file.current) file.current.value = "";
  };
  const share = async () => {
    try {
      const encoded = encodeShare(scenario, settings);
      if (encoded.length > 8000) {
        inform(
          "This experiment is too large for a link. Use Export JSON instead.",
        );
        return;
      }
      const url = `${location.origin}${location.pathname}#atlas=${encoded}`;
      await navigator.clipboard.writeText(url);
      inform(
        "Experiment link copied. The complete scenario is stored in the link.",
      );
    } catch {
      inform(
        "Clipboard access is unavailable. Export JSON to share your experiment.",
      );
    }
  };
  const config = (pane: number) => (
    <>
      <label className="field-label" htmlFor={`algorithm-${pane}`}>
        Algorithm {compare ? String.fromCharCode(65 + pane) : ""}
      </label>
      <div className="select-wrap">
        <select
          id={`algorithm-${pane}`}
          value={settings[pane].algorithm}
          onChange={(e) =>
            changeSettings(pane, {
              ...settings[pane],
              algorithm: e.target.value as Algorithm,
            })
          }
        >
          {Object.entries(algorithms).map(([id, a]) => (
            <option key={id} value={id}>
              {a.name}
            </option>
          ))}
        </select>
        <ChevronDown size={14} />
      </div>
      <p className="algorithm-description">
        {algorithms[settings[pane].algorithm].description}
      </p>
      <label className="field-label" htmlFor={`heuristic-${pane}`}>
        Heuristic
      </label>
      <div className="select-wrap">
        <select
          id={`heuristic-${pane}`}
          value={settings[pane].heuristic}
          disabled={
            settings[pane].algorithm === "bfs" ||
            settings[pane].algorithm === "dijkstra"
          }
          onChange={(e) =>
            changeSettings(pane, {
              ...settings[pane],
              heuristic: e.target.value as Settings["heuristic"],
            })
          }
        >
          {allowed(scenario.movement, settings[pane].algorithm).map((x) => (
            <option key={x} value={x}>
              {settings[pane].algorithm === "bfs" ||
              settings[pane].algorithm === "dijkstra"
                ? "Not used"
                : x === "zero"
                  ? "Zero · uniform cost"
                  : x[0].toUpperCase() + x.slice(1)}
            </option>
          ))}
        </select>
        <ChevronDown size={14} />
      </div>
    </>
  );
  const active = histories.current[mobilePane] ?? histories.current[0],
    view = active?.view,
    phase = view?.frame.phase,
    total = maxSteps(),
    status = busy
      ? "Preparing"
      : !runs.length
        ? "Ready to explore"
        : phase === "found"
          ? "Route found"
          : phase === "unreachable"
            ? "No route"
            : phase === "reconstructing"
              ? "Reconstructing"
              : playing
                ? "Exploring"
                : "Paused";
  const minWeight = Math.min(
    ...scenario.weights.filter((_, i) => !scenario.walls[i]),
  );
  return (
    <div className="app-shell">
      <header className="app-header" inert={panel}>
        <a
          className="brand"
          href={location.pathname}
          aria-label="Search Atlas home"
        >
          <span className="brand-mark">
            <Route size={23} strokeWidth={1.6} />
          </span>
          <span>
            search<span className="brand-light">atlas</span>
            <sup>LAB</sup>
          </span>
        </a>
        <nav className="mode-nav" aria-label="Laboratory mode">
          <button
            className={!compare ? "active" : ""}
            onClick={() => mode(false)}
          >
            Laboratory
          </button>
          <button
            className={compare ? "active" : ""}
            onClick={() => mode(true)}
          >
            Compare<span className="nav-new">2</span>
          </button>
        </nav>
        <div className="header-right">
          <span className="local-badge">
            <span />
            LOCAL EXPERIMENT
          </span>
          <button
            className="icon-button"
            aria-label="Help and keyboard shortcuts"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={18} />
          </button>
          <button
            className="icon-button mobile-settings"
            aria-label="Open settings"
            onClick={() => setPanel(true)}
          >
            <Settings2 size={18} />
          </button>
        </div>
      </header>
      <div className="workspace">
        {panel && (
          <button
            className="sheet-backdrop"
            aria-label="Close settings"
            onClick={() => setPanel(false)}
          />
        )}
        <aside
          ref={rail}
          role={panel ? "dialog" : undefined}
          aria-modal={panel || undefined}
          className={`parameter-rail ${panel ? "open" : ""}`}
          aria-label="Experiment settings"
        >
          <div className="rail-heading">
            <span>EXPERIMENT / 01</span>
            <button
              className="icon-button mobile-settings"
              aria-label="Close settings"
              onClick={() => setPanel(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="rail-body">
            <section className="settings-section">
              {config(0)}
              {compare && <div className="second-config">{config(1)}</div>}
            </section>
            <section className="settings-section">
              <div className="section-heading">
                Movement<span>NO CORNER CUTTING</span>
              </div>
              <div className="segmented" aria-label="Movement">
                <button
                  aria-pressed={scenario.movement === 4}
                  onClick={() => {
                    if (scenario.movement !== 4)
                      commit({ ...scenario, movement: 4 });
                  }}
                >
                  4 directions
                </button>
                <button
                  aria-pressed={scenario.movement === 8}
                  onClick={() => {
                    if (scenario.movement !== 8) {
                      commit({ ...scenario, movement: 8 });
                      inform(
                        "Diagonal movement enabled. A* uses octile distance; Manhattan is unavailable.",
                      );
                    }
                  }}
                >
                  8 directions
                </button>
              </div>
              <p className="small-note">
                {scenario.movement === 4
                  ? "Cardinal steps cost 1 × terrain."
                  : "Diagonal steps cost √2 × terrain."}
              </p>
            </section>
            <section className="settings-section">
              <div className="section-heading">
                Terrain weight<span>ENTRY COST</span>
              </div>
              <div className="weight-options">
                {[1, 3, 6, 9].map((x) => (
                  <button
                    key={x}
                    aria-pressed={weight === x}
                    onClick={() => {
                      setWeight(x);
                      setTool("terrain");
                    }}
                  >
                    <span className={`terrain-swatch weight-${x}`} />
                    {x}
                  </button>
                ))}
              </div>
              <label className="inline-label">
                Custom cost{" "}
                <input
                  type="number"
                  aria-label="Custom terrain cost"
                  min="1"
                  max="9"
                  value={weight}
                  onChange={(e) => {
                    setWeight(
                      Math.max(1, Math.min(9, Number(e.target.value) || 1)),
                    );
                    setTool("terrain");
                  }}
                />
              </label>
            </section>
            <section className="settings-section">
              <div className="section-heading">
                Environment
                <button
                  className="text-button"
                  onClick={() => {
                    setSize({ width: scenario.width, height: scenario.height });
                    setSizeDialog(true);
                  }}
                >
                  Resize <ArrowUpRight size={11} />
                </button>
              </div>
              <label className="sr-only" htmlFor="preset">
                Environment preset
              </label>
              <div className="select-wrap">
                <select
                  id="preset"
                  value={
                    presets.includes(scenario.name as (typeof presets)[number])
                      ? scenario.name
                      : ""
                  }
                  onChange={(e) =>
                    commit(
                      preset(e.target.value, scenario.width, scenario.height),
                    )
                  }
                >
                  <option disabled value="">
                    Custom environment
                  </option>
                  {presets.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>
              <div className="seed-row">
                <label htmlFor="seed">Seed</label>
                <input
                  id="seed"
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value) >>> 0)}
                />
                <button
                  className="icon-button"
                  aria-label="Generate seeded maze"
                  title="Generate seeded maze"
                  onClick={() =>
                    commit(maze(scenario.width, scenario.height, seed))
                  }
                >
                  <Grid2X2 size={15} />
                </button>
              </div>
              <button
                className="rail-button"
                onClick={() =>
                  commit(maze(scenario.width, scenario.height, seed))
                }
              >
                Generate maze <ArrowUpRight size={14} />
              </button>
              <button
                className="text-button clear-environment"
                onClick={() => {
                  const s = blank(scenario.width, scenario.height);
                  s.movement = scenario.movement;
                  commit(s);
                }}
              >
                Clear environment
              </button>
            </section>
            <section className="settings-section inspector">
              <div className="section-heading">
                Cell navigator
                <Crosshair size={13} />
              </div>
              <div className="coordinate-fields">
                <label>
                  Column
                  <input
                    aria-label="Cell column"
                    type="number"
                    min="1"
                    max={scenario.width}
                    value={(selected % scenario.width) + 1}
                    onChange={(e) =>
                      setSelected(
                        Math.floor(selected / scenario.width) * scenario.width +
                          Math.max(
                            0,
                            Math.min(
                              scenario.width - 1,
                              Number(e.target.value) - 1,
                            ),
                          ),
                      )
                    }
                  />
                </label>
                <label>
                  Row
                  <input
                    aria-label="Cell row"
                    type="number"
                    min="1"
                    max={scenario.height}
                    value={Math.floor(selected / scenario.width) + 1}
                    onChange={(e) =>
                      setSelected(
                        Math.max(
                          0,
                          Math.min(
                            scenario.height - 1,
                            Number(e.target.value) - 1,
                          ),
                        ) *
                          scenario.width +
                          (selected % scenario.width),
                      )
                    }
                  />
                </label>
              </div>
              <div className="cell-details">
                <span>Terrain</span>
                <b>
                  {scenario.walls[selected]
                    ? "Wall"
                    : `Cost ${scenario.weights[selected]}`}
                </b>
                <span>State</span>
                <b>
                  {selected === scenario.start
                    ? "Start"
                    : selected === scenario.goal
                      ? "Goal"
                      : view?.status[selected] === 1
                        ? "Frontier"
                        : view?.status[selected] === 2
                          ? "Expanded"
                          : "Unexplored"}
                </b>
                {view && (
                  <>
                    <span>
                      {settings[mobilePane].algorithm === "bfs"
                        ? "Depth"
                        : "g · cost so far"}
                    </span>
                    <b>
                      {Number.isFinite(view.costs[selected])
                        ? settings[mobilePane].algorithm === "bfs"
                          ? view.depths[selected]
                          : view.costs[selected].toFixed(2)
                        : "—"}
                    </b>
                    <span>h · estimate</span>
                    <b>
                      {estimate(
                        selected,
                        scenario,
                        settings[mobilePane].heuristic,
                        minWeight,
                      ).toFixed(2)}
                    </b>
                    {settings[mobilePane].algorithm === "astar" && (
                      <>
                        <span>f · estimated total</span>
                        <b>
                          {Number.isFinite(view.costs[selected])
                            ? (
                                view.costs[selected] +
                                estimate(
                                  selected,
                                  scenario,
                                  settings[mobilePane].heuristic,
                                  minWeight,
                                )
                              ).toFixed(2)
                            : "—"}
                        </b>
                      </>
                    )}
                    <span>Parent</span>
                    <b>
                      {view.parents[selected] < 0
                        ? "—"
                        : `${(view.parents[selected] % scenario.width) + 1}, ${Math.floor(view.parents[selected] / scenario.width) + 1}`}
                    </b>
                  </>
                )}
              </div>
              <button
                className="rail-button"
                disabled={tool === "inspect" || tool === "pan"}
                onClick={() => edit([selected], true)}
              >
                Apply {tool} to cell <Check size={13} />
              </button>
            </section>
          </div>
          <div className="rail-footer">
            <span className="version-tag">ATLAS ENGINE / 1.0</span>
            <span>Made to be explored.</span>
          </div>
        </aside>
        <main className="laboratory" inert={panel}>
          <div className="experiment-heading">
            <div>
              <div className="eyebrow">PATHFINDING & SEARCH</div>
              <h1>
                {compare
                  ? "Two approaches. One problem."
                  : "Every search tells a story."}
              </h1>
              <p>
                {compare
                  ? "An identical environment. Different decisions. Compare the journey."
                  : "Shape the terrain. Follow the frontier. Find a way through."}
              </p>
            </div>
            <button
              className="scenario-share"
              aria-label="Share experiment"
              onClick={share}
            >
              <Copy size={14} />
              <span>Share experiment</span>
            </button>
          </div>
          <div className="stage-shell">
            <div className="stage-toolbar">
              <div
                className="tool-list"
                role="toolbar"
                aria-label="Grid editing tools"
              >
                {TOOLS.map(({ id, label, key, icon: Icon }) => (
                  <button
                    key={id}
                    className={`tool-button ${tool === id ? "selected" : ""}`}
                    aria-label={`${label} tool`}
                    aria-pressed={tool === id}
                    title={`${label} (${key})`}
                    onClick={() => setTool(id)}
                  >
                    <Icon size={15} strokeWidth={1.65} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <div className="stage-actions">
                <button
                  className="icon-button"
                  aria-label="Undo edit"
                  disabled={!undo.current.length}
                  onClick={() => travelEdit(true)}
                >
                  <Undo2 size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Redo edit"
                  disabled={!redo.current.length}
                  onClick={() => travelEdit(false)}
                >
                  <Redo2 size={15} />
                </button>
                <span className="toolbar-divider" />
                <button
                  className="icon-button"
                  aria-label="Zoom out"
                  onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
                >
                  <Minus size={14} />
                </button>
                <button
                  className="zoom-value"
                  aria-label="Fit grid to view"
                  onClick={() => {
                    setZoom(1);
                    setCameraReset((x) => x + 1);
                  }}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  className="icon-button"
                  aria-label="Zoom in"
                  onClick={() => setZoom((z) => Math.min(5, z * 1.25))}
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
            {compare && (
              <div className="comparison-tab-row">
                <span>
                  SYNCHRONIZED STEPS <span className="info-dot">·</span>{" "}
                  animation is independent of execution time
                </span>
                <div>
                  {settings.map((s, i) => (
                    <button
                      key={i}
                      aria-pressed={mobilePane === i}
                      onClick={() => setMobilePane(i)}
                    >
                      {String.fromCharCode(65 + i)} ·{" "}
                      {algorithms[s.algorithm].short}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={`grid-stage ${compare ? "comparison" : ""}`}>
              {settings.slice(0, compare ? 2 : 1).map((s, i) => (
                <div
                  className={`grid-pane ${compare && mobilePane !== i ? "mobile-hidden" : ""}`}
                  key={i}
                >
                  {compare && (
                    <div className="pane-label">
                      <span className="pane-letter">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <strong>{algorithms[s.algorithm].name}</strong>
                      <span>
                        {s.algorithm === "bfs"
                          ? "FEWEST MOVES"
                          : s.algorithm === "greedy"
                            ? "GOAL DIRECTED"
                            : "LOWEST COST"}
                      </span>
                    </div>
                  )}
                  <Grid
                    scenario={scenario}
                    history={histories.current[i]}
                    tick={tick}
                    tool={tool}
                    selected={selected}
                    onSelect={setSelected}
                    onPaint={edit}
                    onCancelPaint={cancelPaint}
                    cameraReset={cameraReset}
                    camera={camera}
                    onPan={setCamera}
                    onTogglePlayback={run}
                    zoom={zoom}
                    onZoom={setZoom}
                    label={algorithms[s.algorithm].name}
                  />
                </div>
              ))}
              {!runs.length && !busy && (
                <div className="grid-hint">
                  <MousePointer2 size={12} />
                  <span>Draw to shape the experiment</span>
                  <kbd>W</kbd>
                  <span>wall</span>
                  <kbd>E</kbd>
                  <span>erase</span>
                </div>
              )}
              {busy && (
                <div className="preparing-indicator">
                  <span className="status-dot" />
                  Preparing exact search history…
                </div>
              )}
            </div>
            <div className="stage-footer">
              <div className="legend">
                <span>
                  <i className="legend-frontier" />
                  Frontier
                </span>
                <span>
                  <i className="legend-expanded" />
                  Expanded
                </span>
                <span>
                  <i className="legend-route" />
                  Route
                </span>
                <span>
                  <i className="legend-wall" />
                  Wall
                </span>
                <span>
                  <i className="legend-terrain" />
                  Terrain
                </span>
              </div>
              <span className="grid-coordinate">
                X {String((selected % scenario.width) + 1).padStart(2, "0")}{" "}
                <span>/</span> Y{" "}
                {String(Math.floor(selected / scenario.width) + 1).padStart(
                  2,
                  "0",
                )}
              </span>
            </div>
          </div>
          <div className="playback">
            <button
              className={`run-button ${busy ? "preparing" : ""}`}
              onClick={run}
            >
              {busy ? (
                <X size={16} />
              ) : playing ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
              <span>
                {busy
                  ? "Cancel"
                  : playing
                    ? "Pause"
                    : runs.length
                      ? cursor.current >= total
                        ? "Replay"
                        : "Resume"
                      : compare
                        ? "Run comparison"
                        : "Run search"}
              </span>
              <kbd>SPACE</kbd>
            </button>
            <div className="step-controls">
              <button
                className="icon-button"
                aria-label="Rewind to beginning"
                disabled={!runs.length}
                onClick={() => {
                  setPlaying(false);
                  seek(0);
                }}
              >
                <SkipBack size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Previous step"
                disabled={!runs.length || cursor.current === 0}
                onClick={() => {
                  setPlaying(false);
                  seek(cursor.current - 1);
                }}
              >
                <StepBack size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Next step"
                disabled={!runs.length || cursor.current >= total}
                onClick={() => {
                  setPlaying(false);
                  seek(cursor.current + 1);
                }}
              >
                <StepForward size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Go to result"
                disabled={!runs.length}
                onClick={() => {
                  setPlaying(false);
                  seek(total);
                }}
              >
                <SkipForward size={16} />
              </button>
            </div>
            <div className="timeline">
              <label htmlFor="timeline">
                <span>{status}</span>
                <span className="mono">
                  {cursor.current.toLocaleString()}{" "}
                  <span className="dim">/ {total.toLocaleString()}</span>
                </span>
              </label>
              <input
                id="timeline"
                aria-label="Playback position"
                type="range"
                min="0"
                max={Math.max(1, total)}
                value={cursor.current}
                disabled={!runs.length}
                onChange={(e) => {
                  setPlaying(false);
                  seek(Number(e.target.value));
                }}
              />
            </div>
            <label className="speed-control">
              Speed
              <select
                aria-label="Playback speed"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                {[1, 10, 50, 150, 500, 2000].map((x) => (
                  <option key={x} value={x}>
                    {x} steps/s
                  </option>
                ))}
              </select>
            </label>
            <button
              className="icon-button reset-button"
              aria-label="Clear search results"
              title="Clear search results"
              onClick={invalidate}
            >
              <RotateCcw size={15} />
            </button>
          </div>
          {compare ? (
            <div className="comparison-results">
              <table>
                <caption className="sr-only">
                  Algorithm comparison; timings are separate untraced single-run
                  samples
                </caption>
                <thead>
                  <tr>
                    <th>RESULTS</th>
                    {settings.map((s, i) => (
                      <th key={i}>{algorithms[s.algorithm].name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    "Moves",
                    "Path cost",
                    "Expanded",
                    "Peak frontier",
                    "Search time",
                  ].map((label, row) => (
                    <tr key={label}>
                      <th>{label}</th>
                      {settings.map((_, i) => {
                        const r = runs[i],
                          h = histories.current[i],
                          done = h?.view.frame.phase === "found";
                        return (
                          <td key={i}>
                            {!r
                              ? "—"
                              : row === 0
                                ? done
                                  ? r.result.path.length - 1
                                  : r.result.outcome === "unreachable" &&
                                      h.position === h.length
                                    ? "No route"
                                    : "—"
                                : row === 1
                                  ? done
                                    ? fmt(r.result.cost)
                                    : "—"
                                  : row === 2
                                    ? h.view.frame.expanded.toLocaleString()
                                    : row === 3
                                      ? r.result.peakFrontier.toLocaleString()
                                      : `${r.ms < 0.1 ? "<0.1" : r.ms.toFixed(1)} ms`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small-note">
                Same scenario <b className="mono">{fingerprint(scenario)}</b> ·
                serial untraced timing samples · playback is synchronized by
                step.
              </p>
            </div>
          ) : (
            <div className="metrics-strip">
              <Metric
                label="Path length"
                value={
                  phase === "found"
                    ? String(runs[0].result.path.length - 1)
                    : phase === "unreachable"
                      ? "No route"
                      : "—"
                }
                unit={phase === "found" ? "moves" : ""}
              />
              <Metric
                label="Path cost"
                value={phase === "found" ? fmt(runs[0].result.cost) : "—"}
                unit={phase === "found" ? "units" : ""}
                accent
              />
              <Metric
                label="Nodes expanded"
                value={view ? view.frame.expanded.toLocaleString() : "—"}
                unit={
                  runs.length ? `of ${scenario.width * scenario.height}` : ""
                }
              />
              <Metric
                label="Search time"
                value={
                  runs[0]
                    ? runs[0].ms < 0.1
                      ? "<0.1"
                      : runs[0].ms.toFixed(1)
                    : "—"
                }
                unit={runs.length ? "ms · sample" : ""}
              />
              <Metric
                label="Peak frontier"
                value={
                  runs[0] ? runs[0].result.peakFrontier.toLocaleString() : "—"
                }
                unit={runs.length ? "nodes" : ""}
              />
            </div>
          )}
          <div className="bottom-row">
            <div className="run-state" role="status">
              <span className={`status-dot ${playing ? "running" : ""}`} />
              {status}
              <span className="dim">·</span>
              <span className="dim">
                {scenario.width} × {scenario.height} grid
              </span>
            </div>
            <div className="file-actions">
              <button onClick={() => file.current?.click()}>
                <ArrowUpFromLine size={13} />
                Import
              </button>
              <button
                onClick={() => {
                  download(
                    `search-atlas-${fingerprint(scenario)}.json`,
                    JSON.stringify(
                      { ...scenario, atlas: { engine: "1.0.0", settings } },
                      null,
                      2,
                    ),
                  );
                  inform("Experiment exported.");
                }}
              >
                <ArrowDownToLine size={13} />
                Export JSON
              </button>
              <input
                ref={file}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                aria-label="Import scenario file"
                onChange={(e) => void importFile(e.target.files?.[0])}
              />
            </div>
          </div>
          <details className="methodology">
            <summary>
              Inside the experiment <ChevronDown size={13} />
            </summary>
            <div className="methodology-content">
              <p>
                <b>What is being measured?</b> Search time is a separate
                untraced worker solve, including working-state setup and route
                reconstruction. It excludes trace recording, transport and
                rendering. A single sample is noisy; it is not a benchmark.
              </p>
              <p>
                <b>Optimality.</b> A* uses consistent lower-bound heuristics.
                Dijkstra finds the lowest cost. BFS finds the fewest moves and
                has no general cost guarantee on weighted or √2-diagonal grids.
                Greedy prioritises distance to the goal without optimality
                guarantees.
              </p>
              <p>
                <b>Memory.</b>{" "}
                {runs.length
                  ? runs
                      .map(
                        (r, i) =>
                          `${algorithms[r.settings.algorithm].short}: ${(r.result.bufferBytes / 1024).toFixed(1)} KiB algorithm buffers; ${(r.result.traceBytes / 1024).toFixed(1)} KiB packed trace; ${((histories.current[i]?.checkpointBytes ?? 0) / 1024).toFixed(1)} KiB checkpoint numeric payload.`,
                      )
                      .join(" ")
                  : "Run an experiment to inspect tracked algorithm and replay storage."}{" "}
                Counts exclude JavaScript object overhead, scenario copies,
                browser and GPU memory.
              </p>
              {runs[0]?.result.path.length > 0 && (
                <details>
                  <summary>
                    Route coordinates ({runs[0].result.path.length} cells)
                  </summary>
                  <p className="route-coordinates">
                    {runs[0].result.path
                      .map(
                        (id) =>
                          `(${(id % scenario.width) + 1}, ${Math.floor(id / scenario.width) + 1})`,
                      )
                      .join(" → ")}
                  </p>
                </details>
              )}
            </div>
          </details>
        </main>
      </div>
      <footer className="app-footer" inert={panel}>
        <span>
          SEARCH ATLAS <span className="dim">/</span> An instrument for
          curiosity.
        </span>
        <span>
          DETERMINISTIC BY DESIGN <span className="footer-dot">·</span> BUILT
          FROM FIRST PRINCIPLES
        </span>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {help && (
        <Modal title="A little direction." onClose={() => setHelp(false)}>
          <p className="modal-intro">
            Build a problem. Watch an algorithm make decisions. Go back and ask
            why.
          </p>
          <dl className="shortcut-list">
            <dt>W / E / T</dt>
            <dd>Wall, erase, terrain tools</dd>
            <dt>S / G / I / P</dt>
            <dd>Start, goal, inspect, pan</dd>
            <dt>Arrow keys + Enter</dt>
            <dd>Move cell focus and apply a tool</dd>
            <dt>Space</dt>
            <dd>Run or pause playback</dd>
            <dt>Ctrl/⌘ + Z</dt>
            <dd>Undo an environment edit</dd>
            <dt>Ctrl/⌘ + Shift + Z</dt>
            <dd>Redo an edit</dd>
            <dt>Pan / Zoom controls</dt>
            <dd>Explore a larger grid without changing it</dd>
          </dl>
          <p className="small-note">
            Letter shortcuts apply while the grid is focused. Cell navigator
            provides equivalent editing through labelled fields. Exploration
            colours show recorded state; animation speed never changes
            computation.
          </p>
          <button className="run-button" onClick={() => setHelp(false)}>
            Back to the laboratory <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
      {sizeDialog && (
        <Modal title="Shape the space." onClose={() => setSizeDialog(false)}>
          <p className="modal-intro">
            Choose 8–128 columns and rows. Cells outside the new bounds will be
            cropped; endpoints move inside. You can undo this change.
          </p>
          <div className="coordinate-fields">
            <label>
              Columns
              <input
                type="number"
                min="8"
                max="128"
                value={size.width}
                onChange={(e) =>
                  setSize((v) => ({ ...v, width: Number(e.target.value) }))
                }
              />
            </label>
            <label>
              Rows
              <input
                type="number"
                min="8"
                max="128"
                value={size.height}
                onChange={(e) =>
                  setSize((v) => ({ ...v, height: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <button
            className="run-button"
            disabled={
              ![size.width, size.height].every(
                (x) => Number.isInteger(x) && x >= 8 && x <= 128,
              )
            }
            onClick={() => {
              commit(resized(scenario, size.width, size.height));
              setZoom(1);
              setSizeDialog(false);
            }}
          >
            Apply dimensions <ArrowUpRight size={16} />
          </button>
        </Modal>
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className={`metric ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        <small>{unit}</small>
      </div>
    </div>
  );
}
function fmt(n: number) {
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const focusables = () => [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        "button,input,select,a[href]",
      ) ?? []),
    ];
    focusables()[0]?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = focusables().filter((x) => !x.hasAttribute("disabled"));
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button
          className="icon-button modal-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <div className="eyebrow">SEARCH ATLAS / FIELD NOTES</div>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
