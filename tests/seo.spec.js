import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seoPages, siteURL, pagePath } from "../js/seo.js";

test("public pages have distinct metadata and visible content without JavaScript", async ({
  browser,
  request,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [name, data] of Object.entries(seoPages)) {
    await page.goto(pagePath(name));
    await expect(page).toHaveTitle(data.title);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      data.description,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      siteURL + pagePath(name),
    );
    await expect(page.locator(".page.active")).toHaveCount(1);
    await expect(page.locator(`#page-${name}`)).toBeVisible();
    const robots = await page
      .locator('meta[name="robots"]')
      .getAttribute("content");
    expect(robots.startsWith("noindex")).toBe(Boolean(data.noindex));
    const schemas = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    for (const schema of schemas)
      expect(() => JSON.parse(schema)).not.toThrow();
  }
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  for (const [name, data] of Object.entries(seoPages))
    expect(xml.includes(`<loc>${siteURL + pagePath(name)}</loc>`)).toBe(
      !data.noindex,
    );
  expect(await (await request.get("/robots.txt")).text()).toContain(
    `Sitemap: ${siteURL}/sitemap.xml`,
  );
  await context.close();
});

test("navigation restores descriptions, indexing and page schema", async ({
  page,
}) => {
  const mock = await readFile(
    new URL("./mock-firebase.js", import.meta.url),
    "utf8",
  );
  await page.route("https://**/*", (route) => route.abort());
  await page.route("**/js/firebase.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body: mock }),
  );
  await page.goto("/tv/");
  await expect(page.locator("#page-tv")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveTitle(seoPages.games.title);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "index, follow, max-image-preview:large",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    seoPages.games.description,
  );
  expect(
    JSON.parse(await page.locator("#page-schema").textContent())["@graph"][1]
      .url,
  ).toBe(siteURL + "/games/");
  await page.goBack();
  await expect(page).toHaveTitle("Timer");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex, follow",
  );
});
