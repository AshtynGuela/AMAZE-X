import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { chromium, devices, expect } from "@playwright/test";
import { encodeSession } from "../src/share.mjs";

const base = process.env.BASE_URL ?? "http://127.0.0.1:5173";
const resultDir = process.env.USABILITY_OUTPUT ?? ".cache/comparison-usability";
const session = encodeSession({
  scenarios: [], custom: [], mastM: 2, minAntennaEl: 5,
  time: Date.parse("2025-03-14T07:00Z"), selected: "apollo11", view: "globe", mode: "plain",
});
await fs.mkdir(resultDir, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const page = await browser.newPage({
  ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, reducedMotion: "reduce",
});
page.on("pageerror", error => {
  if (error.message !== "Could not load /assets/rocky-web.glb: Failed to fetch") errors.push(error.message);
});
await page.route("**/assets/rocky-web.glb", route => route.abort());
const save = async name => {
  if (process.env.CAPTURE_UI === "1") await page.screenshot({ path: resultDir + "/" + name + ".png" });
};
const noHorizontalOverflow = async () => assert.equal(await page.evaluate(
  () => document.documentElement.scrollWidth), await page.evaluate(() => innerWidth));

try {
  await page.goto(base + "/?session=" + encodeURIComponent(session));
  await page.getByRole("dialog", { name: "AMAZE-X", exact: true }).press("Escape");
  const sites = page.getByRole("button", { name: "Sites", exact: true });
  const searchSites = page.getByRole("textbox", { name: "Search lunar sites" });
  await expect(page.locator(".app")).not.toHaveClass(/app--entering/);
  if (!await searchSites.isVisible()) await sites.tap();
  await searchSites.fill("Apollo 11");
  await page.getByRole("button", { name: /Apollo 11 Mare Tranquillitatis/i }).tap();
  const inspector = page.locator("#site-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Apollo 11" })).toBeVisible();
  const inspectorSize = await inspector.boundingBox();
  assert.ok(inspectorSize.width > 360 && inspectorSize.height > 580);
  await save("phone-site");

  const started = performance.now();
  await inspector.getByRole("button", { name: "Compare sites or dates" }).tap();
  const compare = page.getByRole("region", { name: "Compare landing plans", exact: false });
  await expect(compare.getByRole("heading", { name: /Compare landing plans/ })).toBeFocused();
  const chooseSite = compare.getByRole("combobox", { name: "Site", exact: true });
  await expect(chooseSite).toHaveValue("apollo11");
  await compare.getByRole("button", { name: "Add to comparison", exact: true }).tap();
  await chooseSite.selectOption("im1");
  await compare.getByRole("button", { name: "Add to comparison", exact: true }).tap();
  const matrix = compare.getByRole("table");
  await expect(matrix.getByRole("columnheader")).toHaveCount(3);
  await expect(matrix.getByRole("row", { name: /^Sunlight/ }).getByRole("cell").last()).toHaveText(/\d+\s*(h|min)/, { timeout: 120000 });
  await expect(matrix.getByRole("row", { name: /^Horizon model/ }).getByRole("cell").last()).toHaveText("Detailed terrain");
  await expect(compare.getByRole("status")).toContainText(/sunlight/);
  const comparisonSeconds = (performance.now() - started) / 1000;
  const takeaway = await compare.getByRole("status").innerText();
  assert.ok(await matrix.evaluate(node => node.offsetWidth <= node.parentElement.clientWidth + 1));
  await expect(matrix.getByRole("row", { name: /^Sunlight/ })).toBeInViewport();
  await noHorizontalOverflow();
  await save("phone-comparison");

  await chooseSite.selectOption("apollo11");
  await compare.getByLabel("Landing date (UTC)").fill("2025-03-15T07:00");
  await compare.getByRole("button", { name: "Add to comparison", exact: true }).tap();
  await expect(matrix.getByRole("columnheader")).toHaveCount(4);
  await expect(matrix.getByRole("row", { name: /^Landing/ }).getByRole("cell").last()).toContainText("2025-03-15");
  await noHorizontalOverflow();

  await page.setViewportSize({ width: 320, height: 700 });
  await noHorizontalOverflow();
  await expect(compare.getByRole("button", { name: "Close comparison" })).toBeInViewport();
  await page.setViewportSize({ width: 844, height: 390 });
  await noHorizontalOverflow();
  await expect(compare.getByRole("button", { name: "Close comparison" })).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await compare.getByRole("button", { name: "Close comparison" }).tap();

  const openNearby = inspector.getByRole("button", { name: "Find better spots nearby" });
  await openNearby.tap();
  const nearby = page.getByRole("dialog", { name: "Nearby sites" });
  await expect(nearby.getByLabel("Landing date (UTC)")).toBeFocused();
  await nearby.getByLabel("Landing date (UTC)").fill("2025-03-14T07:00");
  await nearby.getByLabel("Search radius (km)").fill("4");
  await nearby.getByLabel("Surface stay (Earth days)").fill("1");
  await nearby.getByLabel("Minimum sunlight (%)").fill("30");
  await nearby.getByLabel("Minimum Earth contact (%)").fill("25");
  await nearby.getByLabel("Maximum continuous darkness (h)").fill("12");
  await nearby.getByLabel("Only show sites that meet the limits").check();
  await expect(nearby.getByRole("button", { name: "Rank nearby sites" })).toBeEnabled();
  await noHorizontalOverflow();
  await save("phone-nearby");
  const startNearby = async () => {
    const outgoing = page.waitForRequest(request => request.url().includes("/api/terrain/nearby-preview"));
    await nearby.getByRole("button", { name: "Rank nearby sites" }).tap();
    await outgoing;
    await expect(nearby.getByRole("status")).toContainText("Checked");
  };
  await startNearby();
  const nearbyResult = nearby.locator(".nearby-results li").first();
  await expect(nearbyResult).toContainText("Likely meets mission limits", { timeout: 27000 });
  await expect(nearbyResult).toContainText("Earth contact");
  await expect(nearby.getByRole("button", { name: "Rank nearby sites" })).toBeEnabled();
  let releasePreview;
  const stalled = new Promise(resolve => { releasePreview = resolve; });
  await page.route("**/api/terrain/nearby-preview", async route => {
    await stalled;
    await route.abort().catch(() => {});
  }, { times: 1 });
  await startNearby();
  await nearby.getByRole("button", { name: "Cancel search" }).tap();
  releasePreview();
  await expect(nearby.getByRole("button", { name: "Rank nearby sites" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(nearby).toHaveCount(0);
  await expect(openNearby).toBeFocused();

  await openNearby.tap();
  await nearby.getByLabel("Search radius (km)").fill("4");
  await startNearby();
  await nearbyResult.getByRole("button", { name: "Compare", exact: true }).tap({ timeout: 27000 });
  await expect(nearby).toHaveCount(0);
  await expect(matrix.getByRole("columnheader").last()).toContainText("Nearby");
  await expect(matrix.getByRole("row", { name: /^Horizon model/ }).getByRole("cell").last())
    .toHaveText(/Terrain preview|Detailed terrain/, { timeout: 45000 });
  await compare.getByRole("button", { name: /Nearby ·/ }).tap();
  await expect(inspector.getByRole("heading", { name: /Nearby ·/ })).toBeVisible();
  await page.getByRole("button", { name: "Close details", exact: true }).tap();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Compare", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(compare.getByRole("heading", { name: /Compare landing plans/ })).toBeFocused();
  await save("desktop-comparison");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Compare", exact: true })).toBeFocused();
  assert.deepEqual(errors, []);
  const result = {
    testedUtc: new Date().toISOString(), base, realApi: true,
    phoneWidths: [320, 390], landscapeViewport: [844, 390], emulatedTouch: true,
    startedWithNoPlans: true, twoSiteComparisonSeconds: comparisonSeconds, takeaway,
    alternateDateAdded: true, nearbyFiltersMatchingResultAndCancellation: true, nearbyPlanCreated: true,
    keyboardComparisonFocus: true, physicalPhoneTested: false, errors,
  };
  await fs.writeFile(resultDir + "/result.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  await save("failure").catch(() => {});
  throw error;
} finally {
  await browser.close();
}
