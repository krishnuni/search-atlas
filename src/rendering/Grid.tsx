import { useEffect, useRef, useState } from "react";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { Scenario } from "../domain/scenario";
import type { History } from "../playback/history";
export type Tool =
  | "inspect"
  | "wall"
  | "terrain"
  | "erase"
  | "start"
  | "goal"
  | "pan";
interface Props {
  scenario: Scenario;
  history?: History;
  tick: number;
  tool: Tool;
  selected: number;
  onSelect: (id: number) => void;
  onPaint: (ids: number[], end: boolean) => void;
  onCancelPaint: () => void;
  cameraReset: number;
  camera: { x: number; y: number };
  onPan: (p: { x: number; y: number }) => void;
  onTogglePlayback: () => void;
  zoom: number;
  onZoom: (z: number) => void;
  label: string;
}
interface Scene {
  app: Application;
  root: Container;
  terrain: Sprite[];
  search: Sprite[];
  route: Graphics;
  markers: Graphics;
  focus: Graphics;
  labels: Container;
  startText: Text;
  goalText: Text;
  frontier: Texture;
  width: number;
  height: number;
  size: number;
  ox: number;
  oy: number;
  lastStates: Uint8Array;
}
const color = {
  open: 0x162024,
  wall: 0x56636a,
  amber: 0xf0b86a,
  cyan: 0x67d4df,
  text: 0xe8eef1,
};
export function Grid(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    scene = useRef<Scene | null>(null),
    latest = useRef(props),
    [ready, setReady] = useState(0),
    [error, setError] = useState("");
  latest.current = props;
  const pan = useRef({ x: 0, y: 0 }),
    drag = useRef<{
      id: number;
      x: number;
      y: number;
      panning: boolean;
      pointer: number;
      moved: boolean;
    } | null>(null),
    space = useRef(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>()),
    pinch = useRef<{
      distance: number;
      zoom: number;
      x: number;
      y: number;
      px: number;
      py: number;
    } | null>(null),
    spacePanned = useRef(false);
  pan.current = props.camera;
  useEffect(() => {
    pan.current = { x: 0, y: 0 };
    props.onPan(pan.current);
    setReady((v) => v + 1);
  }, [props.cameraReset, props.scenario.width, props.scenario.height]);
  useEffect(() => {
    let disposed = false;
    const app = new Application();
    const initialise = async () => {
      try {
        await app.init({
          preference: "webgl",
          backgroundAlpha: 0,
          antialias: true,
          autoStart: false,
          resolution: Math.min(devicePixelRatio, 2),
          autoDensity: true,
        });
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.current!.appendChild(app.canvas);
        app.canvas.setAttribute("aria-hidden", "true");
        const root = new Container(),
          labels = new Container();
        app.stage.addChild(root);
        const ring = new Graphics()
          .rect(0, 0, 24, 24)
          .fill({ color: color.cyan, alpha: 0.1 })
          .rect(0.7, 0.7, 22.6, 22.6)
          .stroke({ color: color.cyan, width: 1.5 });
        const frontier = app.renderer.generateTexture(ring);
        ring.destroy();
        const route = new Graphics(),
          markers = new Graphics(),
          focus = new Graphics();
        const style = {
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 11,
          fill: 0x101416,
          fontWeight: "600" as const,
        };
        const startText = new Text({ text: "S", style }),
          goalText = new Text({ text: "G", style });
        startText.anchor.set(0.5);
        goalText.anchor.set(0.5);
        scene.current = {
          app,
          root,
          terrain: [],
          search: [],
          route,
          markers,
          focus,
          labels,
          startText,
          goalText,
          frontier,
          width: 0,
          height: 0,
          size: 0,
          ox: 0,
          oy: 0,
          lastStates: new Uint8Array(0),
        };
        const resize = new ResizeObserver(() => {
          if (!disposed && host.current) {
            app.renderer.resize(
              host.current.clientWidth,
              host.current.clientHeight,
            );
            setReady((v) => v + 1);
          }
        });
        resize.observe(host.current!);
        app.canvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          setError(
            "Graphics connection lost. Your scenario is safe. Reload to restore the grid, or use the cell navigator.",
          );
        });
        setReady((v) => v + 1);
        (scene.current as Scene & { cleanup?: () => void }).cleanup = () =>
          resize.disconnect();
      } catch {
        if (!disposed)
          setError(
            "GPU rendering is unavailable. You can still edit with the cell navigator and export your scenario.",
          );
      }
    };
    void initialise();
    return () => {
      disposed = true;
      const current = scene.current as
        | (Scene & { cleanup?: () => void })
        | null;
      current?.cleanup?.();
      if (current) {
        current.frontier.destroy();
        app.destroy(true, { children: true });
        scene.current = null;
      }
    };
  }, []);
  useEffect(() => {
    const v = scene.current;
    if (!v) return;
    const s = props.scenario,
      n = s.width * s.height;
    const size =
      Math.max(
        2,
        Math.min(
          (v.app.screen.width - 56) / s.width,
          (v.app.screen.height - 64) / s.height,
        ),
      ) * props.zoom;
    v.size = size;
    v.ox = Math.round(
      (v.app.screen.width - s.width * size) / 2 + pan.current.x,
    );
    v.oy = Math.round(
      (v.app.screen.height - s.height * size) / 2 + pan.current.y,
    );
    v.root.position.set(v.ox, v.oy);
    if (v.terrain.length !== n) {
      v.root.removeChildren();
      v.terrain.forEach((x) => x.destroy());
      v.search.forEach((x) => x.destroy());
      v.terrain = [];
      v.search = [];
      v.lastStates = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const terrain = new Sprite(Texture.WHITE),
          search = new Sprite(Texture.WHITE);
        v.terrain.push(terrain);
        v.search.push(search);
        v.root.addChild(terrain);
      }
      v.search.forEach((x) => v.root.addChild(x));
      v.root.addChild(
        v.labels,
        v.route,
        v.markers,
        v.startText,
        v.goalText,
        v.focus,
      );
    }
    v.labels.removeChildren().forEach((c) => c.destroy());
    for (let i = 0; i < n; i++) {
      const x = (i % s.width) * size,
        y = Math.floor(i / s.width) * size,
        a = v.terrain[i],
        b = v.search[i];
      a.position.set(x, y);
      a.width = a.height = Math.max(0.5, size - (size > 6 ? 1 : 0.4));
      a.tint = s.walls[i]
        ? color.wall
        : s.weights[i] > 1
          ? 0x3b352a
          : color.open;
      b.position.set(x, y);
      b.width = b.height = a.width;
      b.visible = false;
      if (s.weights[i] > 1 && !s.walls[i] && size >= 16 && n <= 4096) {
        const label = new Text({
          text: String(s.weights[i]),
          style: {
            fontFamily: "IBM Plex Mono, monospace",
            fontSize: Math.min(11, size * 0.42),
            fill: 0xb6a58b,
          },
        });
        label.anchor.set(0.5);
        label.position.set(x + size / 2, y + size / 2);
        v.labels.addChild(label);
      }
    }
    v.lastStates.fill(255);
    v.width = s.width;
    v.height = s.height;
    draw(v, props);
    v.app.render();
  }, [props.scenario, props.zoom, props.camera, ready]);
  useEffect(() => {
    const v = scene.current;
    if (v) {
      draw(v, props);
      v.app.render();
    }
  }, [props.tick, props.selected, props.history]);
  function cell(x: number, y: number) {
    const v = scene.current;
    if (!v || !host.current) return -1;
    const r = host.current.getBoundingClientRect(),
      a = Math.floor((x - r.left - v.ox) / v.size),
      b = Math.floor((y - r.top - v.oy) / v.size);
    return a < 0 ||
      b < 0 ||
      a >= props.scenario.width ||
      b >= props.scenario.height
      ? -1
      : b * props.scenario.width + a;
  }
  function stroke(a: number, b: number) {
    const w = props.scenario.width,
      x0 = a % w,
      y0 = Math.floor(a / w),
      x1 = b % w,
      y1 = Math.floor(b / w),
      count = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)),
      ids = [];
    for (let i = 0; i <= count; i++) {
      const t = count ? i / count : 0;
      ids.push(
        Math.round(y0 + (y1 - y0) * t) * w + Math.round(x0 + (x1 - x0) * t),
      );
    }
    return ids;
  }
  return (
    <div
      className="grid-host"
      ref={host}
      role="group"
      aria-label={`${props.label} grid. Arrow keys move cell focus; Enter applies the selected tool. Use Cell navigator for text editing.`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          if (!space.current) spacePanned.current = false;
          space.current = true;
          return;
        }
        const delta: Record<string, number> = {
          ArrowLeft: -1,
          ArrowRight: 1,
          ArrowUp: -props.scenario.width,
          ArrowDown: props.scenario.width,
        };
        if (e.key in delta) {
          e.preventDefault();
          const id = Math.max(
            0,
            Math.min(
              props.scenario.width * props.scenario.height - 1,
              props.selected + delta[e.key],
            ),
          );
          props.onSelect(id);
          const v = scene.current;
          if (v) {
            const x = ((id % props.scenario.width) + 0.5) * v.size + v.ox,
              y = (Math.floor(id / props.scenario.width) + 0.5) * v.size + v.oy;
            if (
              x < 12 ||
              x > v.app.screen.width - 12 ||
              y < 12 ||
              y > v.app.screen.height - 12
            )
              props.onPan({
                x: pan.current.x + v.app.screen.width / 2 - x,
                y: pan.current.y + v.app.screen.height / 2 - y,
              });
          }
        }
        if (e.key === "Enter") {
          e.preventDefault();
          props.onPaint([props.selected], true);
        }
        if (e.key === "Escape") {
          props.onCancelPaint();
          drag.current = null;
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          space.current = false;
          if (!spacePanned.current) props.onTogglePlayback();
        }
      }}
      onBlur={() => {
        space.current = false;
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 2) {
          props.onCancelPaint();
          drag.current = null;
          const [a, b] = [...pointers.current.values()];
          pinch.current = {
            distance: Math.hypot(a.x - b.x, a.y - b.y),
            zoom: props.zoom,
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            px: pan.current.x,
            py: pan.current.y,
          };
          return;
        }
        const id = cell(e.clientX, e.clientY);
        drag.current = {
          id,
          x: e.clientX,
          y: e.clientY,
          panning: props.tool === "pan" || space.current,
          pointer: e.pointerId,
          moved: false,
        };
        if (id >= 0 && !drag.current.panning) {
          props.onSelect(id);
          if (props.tool !== "inspect") props.onPaint([id], false);
        }
      }}
      onPointerMove={(e) => {
        if (pointers.current.has(e.pointerId))
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch.current && pointers.current.size === 2) {
          const [a, b] = [...pointers.current.values()],
            p = pinch.current;
          props.onZoom(
            Math.max(
              0.5,
              Math.min(
                5,
                (p.zoom * Math.hypot(a.x - b.x, a.y - b.y)) /
                  Math.max(1, p.distance),
              ),
            ),
          );
          props.onPan({
            x: p.px + (a.x + b.x) / 2 - p.x,
            y: p.py + (a.y + b.y) / 2 - p.y,
          });
          return;
        }
        const d = drag.current;
        if (!d || d.pointer !== e.pointerId) return;
        if (d.panning) {
          spacePanned.current = true;
          pan.current = {
            x: pan.current.x + e.clientX - d.x,
            y: pan.current.y + e.clientY - d.y,
          };
          props.onPan(pan.current);
          d.x = e.clientX;
          d.y = e.clientY;
          return;
        }
        const id = cell(e.clientX, e.clientY);
        if (id >= 0 && id !== d.id) {
          props.onSelect(id);
          if (props.tool !== "inspect")
            props.onPaint(d.id >= 0 ? stroke(d.id, id) : [id], false);
          d.id = id;
          d.moved = true;
        }
      }}
      onPointerUp={(e) => {
        pointers.current.delete(e.pointerId);
        if (pinch.current) {
          pinch.current = null;
          drag.current = null;
          return;
        }
        if (drag.current?.pointer === e.pointerId) {
          if (!drag.current.panning && props.tool !== "inspect")
            props.onPaint([], true);
          drag.current = null;
        }
      }}
      onPointerCancel={(e) => {
        pointers.current.delete(e.pointerId);
        pinch.current = null;
        props.onCancelPaint();
        drag.current = null;
      }}
    >
      {error && (
        <div className="render-error" role="alert">
          {error}
        </div>
      )}
      <span className="axis-label axis-top">
        {props.scenario.width} × {props.scenario.height} /{" "}
        {props.scenario.movement === 4 ? "ORTHOGONAL" : "OCTILE"}
      </span>
      <span className="axis-label axis-bottom">
        {props.scenario.name.toUpperCase()}
      </span>
    </div>
  );
}
function draw(v: Scene, props: Props) {
  const s = props.scenario,
    view = props.history?.view,
    size = v.size,
    center = (id: number) => ({
      x: ((id % s.width) + 0.5) * size,
      y: (Math.floor(id / s.width) + 0.5) * size,
    });
  for (let i = 0; i < v.search.length; i++) {
    const state = view?.status[i] ?? 0;
    if (state === v.lastStates[i]) continue;
    v.lastStates[i] = state;
    const sprite = v.search[i];
    sprite.visible = !!state;
    sprite.texture = state === 1 ? v.frontier : Texture.WHITE;
    sprite.tint = state === 1 ? 0xffffff : color.cyan;
    sprite.alpha = state === 1 ? 0.95 : 0.22;
    sprite.width = sprite.height = Math.max(0.5, size - (size > 6 ? 1 : 0.4));
  }
  v.route.clear();
  const path = view?.path ?? [];
  if (path.length) {
    const start = center(path[0]);
    v.route.moveTo(start.x, start.y);
    for (const id of path.slice(1)) {
      const p = center(id);
      v.route.lineTo(p.x, p.y);
    }
    v.route.stroke({
      color: color.amber,
      width: Math.max(2, size * 0.22),
      cap: "round",
      join: "round",
    });
  }
  v.markers.clear();
  const start = center(s.start),
    goal = center(s.goal),
    r = Math.max(4, size * 0.37);
  v.markers.circle(start.x, start.y, r).fill(color.text);
  v.markers
    .poly([
      goal.x,
      goal.y - r * 1.2,
      goal.x + r * 1.2,
      goal.y,
      goal.x,
      goal.y + r * 1.2,
      goal.x - r * 1.2,
      goal.y,
    ])
    .fill(color.text);
  v.startText.position.set(start.x, start.y);
  v.goalText.position.set(goal.x, goal.y);
  v.startText.visible = v.goalText.visible = size > 11;
  v.startText.text = s.start === s.goal ? "S/G" : "S";
  v.goalText.visible &&= s.start !== s.goal;
  v.focus.clear();
  if (props.selected >= 0) {
    const p = center(props.selected);
    v.focus
      .rect(p.x - size / 2 - 1, p.y - size / 2 - 1, size + 1, size + 1)
      .stroke({ color: color.cyan, width: 1.5 });
  }
  if (view && view.frame.current >= 0 && view.frame.phase === "exploring") {
    const p = center(view.frame.current);
    v.focus
      .rect(p.x - size * 0.4, p.y - size * 0.4, size * 0.8, size * 0.8)
      .stroke({ color: color.text, width: 1 });
  }
}
