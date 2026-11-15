import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://127.0.0.1:5175";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const rocketRequests = [];
const failOnRocketAssets = request => {
  if (request.url().includes("/assets/entry/")) rocketRequests.push(request.url());
};
try {
  const desktop = await browser.newPage({ viewport: { width: 1130, height: 790 }, reducedMotion: "no-preference" });
  desktop.on("request", failOnRocketAssets);
  await desktop.goto(base);
  const welcome = desktop.getByRole("dialog", { name: "AMAZE-X", exact: true });
  await expect(welcome).toBeFocused();
  await expect(welcome).toHaveCSS("transition-property", "opacity");
  await expect(welcome).toHaveCSS("transition-duration", "0.42s");
  await welcome.evaluate(node => {
    new MutationObserver(() => {
      if (node.hasAttribute("data-fading")) window.welcomeFadeObserved = true;
    }).observe(node, { attributes: true, attributeFilter: ["data-fading"] });
  });
  await desktop.mouse.move(500, 380);
  await desktop.mouse.wheel(0, -120);
  await expect(welcome).toHaveCount(0, { timeout: 30000 });
  await expect(desktop.getByRole("button", { name: "Sites", exact: true })).toBeVisible();
  assert.ok(await desktop.evaluate(() => window.welcomeFadeObserved), "scroll activates the fade before dismissing the welcome");
  await expect(desktop.locator(".welcome-flight, .welcome-cutscene-stars")).toHaveCount(0);
  await desktop.close();

  const reduced = await browser.newPage({ reducedMotion: "reduce" });
  reduced.on("request", failOnRocketAssets);
  await reduced.route("**/assets/World-*.js", async route => {
    await new Promise(resolve => setTimeout(resolve, 3000));
    await route.continue().catch(() => {});
  });
  await reduced.goto(base);
  const reducedWelcome = reduced.getByRole("dialog", { name: "AMAZE-X", exact: true });
  await reducedWelcome.click({ position: { x: 32, y: 32 } });
  await expect(reducedWelcome).toHaveCount(0, { timeout: 2500 });
  await expect(reduced.getByRole("button", { name: "Sites", exact: true })).toBeVisible();
  assert.deepEqual(rocketRequests, []);
  console.log("Scroll fade and reduced-motion click entry passed. No spaceship asset requests.");
} finally {
  await browser.close();
}
