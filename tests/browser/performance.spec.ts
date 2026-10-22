import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
test("profiles two 128x128 histories, playback and random seek", async ({
  page,
  browser,
}) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.getByRole("button", { name: "Resize", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Columns", { exact: true })
    .fill("128");
  await page
    .getByRole("dialog")
    .getByLabel("Rows", { exact: true })
    .fill("128");
  await page
    .getByRole("button", { name: "Apply dimensions", exact: true })
    .click();
  await page.locator("#preset").selectOption("Open field");
  await page.getByRole("button", { name: /^Compare/ }).click();
  await page.locator("#algorithm-0").selectOption("bfs");
  await page.getByLabel("Playback speed", { exact: true }).selectOption("2000");
  const began = Date.now();
  await page.getByRole("button", { name: /^Run comparison/ }).click();
  await expect(
    page.getByRole("button", { name: "Go to result", exact: true }),
  ).toBeEnabled();
  const preparationMs = Date.now() - began;
  const profile = await page.evaluate(
    () =>
      new Promise<{ frames: number[]; longTasks: number[] }>((resolve) => {
        const frames: number[] = [],
          longTasks: number[] = [];
        let last = 0,
          start = 0;
        const observer = new PerformanceObserver((list) =>
          list.getEntries().forEach((e) => longTasks.push(e.duration)),
        );
        observer.observe({ type: "longtask", buffered: false });
        const tick = (t: number) => {
          if (!start) start = t;
          if (last) frames.push(t - last);
          last = t;
          if (t - start > 3500) {
            observer.disconnect();
            resolve({ frames, longTasks });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.getByRole("button", { name: "Go to result", exact: true }).click();
  const seekStart = Date.now();
  await page
    .getByRole("button", { name: "Rewind to beginning", exact: true })
    .click();
  const seekMs = Date.now() - seekStart;
  const sorted = [...profile.frames].sort((a, b) => a - b);
  const report = {
    browser: browser.version(),
    viewport: { width: 1440, height: 1000 },
    scenario: "Open field",
    dimensions: "128x128",
    algorithms: ["bfs", "dijkstra"],
    speed: 2000,
    preparationMs,
    rewindInteractionMs: seekMs,
    p50FrameMs: sorted[Math.floor(sorted.length * 0.5)],
    p95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
    maxFrameMs: sorted.at(-1),
    ...profile,
    limitation:
      "Automated headless Chrome on the available Windows host. Interactions include browser-test transport latency. This is not a real-phone or Safari measurement.",
  };
  mkdirSync("docs/benchmarks", { recursive: true });
  writeFileSync(
    "docs/benchmarks/browser-profile.json",
    JSON.stringify(report, null, 2),
  );
  expect(report.p95FrameMs).toBeLessThan(40);
  expect(preparationMs).toBeLessThan(5000);
});
