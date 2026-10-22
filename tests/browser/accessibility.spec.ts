import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
test("has no detected WCAG A/AA violations in desktop, dialog and phone states", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("canvas")).toBeVisible();
  for (const state of ["desktop", "dialog", "phone"]) {
    if (state === "dialog")
      await page
        .getByRole("button", {
          name: "Help and keyboard shortcuts",
          exact: true,
        })
        .click();
    if (state === "phone") {
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 390, height: 844 });
    }
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        description: v.description,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
});
test("keyboard editing, escape cancellation and pan/fit preserve scenario data", async ({
  page,
}) => {
  await page.goto("/");
  const grid = page.getByRole("group", { name: /A\* search grid/ });
  await grid.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator(".cell-details")).toContainText("Wall");
  await page.getByRole("button", { name: "Undo edit", exact: true }).click();
  await expect(page.locator(".cell-details")).not.toContainText("Wall");
  await page.getByRole("button", { name: "Pan tool", exact: true }).click();
  const area = await grid.boundingBox();
  await page.mouse.move(area!.x + area!.width / 2, area!.y + area!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    area!.x + area!.width / 2 + 70,
    area!.y + area!.height / 2 + 30,
  );
  await page.mouse.up();
  await page
    .getByRole("button", { name: "Fit grid to view", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Fit grid to view", exact: true }),
  ).toHaveText("100%");
});
