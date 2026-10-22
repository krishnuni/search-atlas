import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
});
test("solves in worker, rewinds and steps exact logical counters", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.getByRole("button", { name: /^Run search/ }).click();
  await expect(
    page.getByRole("button", { name: "Go to result", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Go to result", exact: true }).click();
  await expect(page.locator(".metrics-strip")).toContainText("36");
  await expect(page.locator(".run-state")).toContainText("Route found");
  await page
    .getByRole("button", { name: "Rewind to beginning", exact: true })
    .click();
  await expect(page.locator("#timeline")).toHaveValue("0");
  await page.getByRole("button", { name: "Next step", exact: true }).click();
  await expect(page.locator("#timeline")).toHaveValue("1");
  await page
    .getByRole("button", { name: "Previous step", exact: true })
    .click();
  await expect(page.locator("#timeline")).toHaveValue("0");
  expect(errors).toEqual([]);
});
test("compares BFS with Dijkstra on the exact weighted problem", async ({
  page,
}) => {
  await page.getByRole("button", { name: /^Compare/ }).click();
  await page.locator("#algorithm-0").selectOption("bfs");
  await page.locator("#preset").selectOption("Weighted passage");
  await page.getByRole("button", { name: /^Run comparison/ }).click();
  await expect(
    page.getByRole("button", { name: "Go to result", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Go to result", exact: true }).click();
  const costs = await page
    .locator(".comparison-results tbody tr")
    .nth(1)
    .locator("td")
    .allTextContents();
  expect(Number(costs[0])).toBeGreaterThan(Number(costs[1]));
  await expect(page.locator("canvas")).toHaveCount(2);
  await page.screenshot({
    path: "docs/screenshots/comparison.png",
    fullPage: true,
  });
});
test("edits through keyboard-equivalent cell navigator and undo/redo", async ({
  page,
}) => {
  await page.getByLabel("Cell column", { exact: true }).fill("2");
  await page.getByLabel("Cell row", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Apply wall to cell", exact: true })
    .click();
  await expect(page.locator(".cell-details")).toContainText("Wall");
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(page.locator(".cell-details")).not.toContainText("Wall");
  await page.getByRole("button", { name: "Redo edit", exact: true }).click();
  await page.getByRole("button", { name: "8 directions", exact: true }).click();
  await expect(page.locator("#heuristic-0")).toHaveValue("octile");
  await expect(
    page.locator('#heuristic-0 option[value="manhattan"]'),
  ).toHaveCount(0);
});
test("exports and imports without losing the scenario; invalid import preserves state", async ({
  page,
}) => {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  const exported = await download;
  const path = await exported.path();
  expect(path).toBeTruthy();
  await page
    .getByLabel("Import scenario file", { exact: true })
    .setInputFiles(path!);
  await expect(
    page.getByRole("status").filter({ hasText: "Experiment imported" }),
  ).toBeVisible();
  await page.getByLabel("Import scenario file", { exact: true }).setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":99}'),
  });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Unsupported scenario version" }),
  ).toBeVisible();
  await expect(page.locator("#preset")).toHaveValue("The crossing");
});
test("phone and reduced motion layouts remain operable with no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page
    .getByRole("button", { name: "Open settings", exact: true })
    .click();
  await page.locator("#preset").selectOption("Open field");
  await page
    .getByRole("dialog", { name: "Experiment settings" })
    .getByRole("button", { name: "Close settings", exact: true })
    .click();
  await page.getByRole("button", { name: /^Run search/ }).click();
  await expect(
    page.getByRole("button", { name: "Go to result", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Go to result", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 760 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("captures the genuine laboratory and keeps dialogs keyboard accessible", async ({
  page,
}) => {
  await page.getByRole("button", { name: /^Run search/ }).click();
  await expect(
    page.getByRole("button", { name: "Go to result", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Go to result", exact: true }).click();
  await page.screenshot({
    path: "docs/screenshots/laboratory.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Help and keyboard shortcuts", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
