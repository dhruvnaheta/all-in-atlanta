import { renderPage } from "./seo-render.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(import.meta.dirname, "..");
const types = {
  ".html": "text/html",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    ).replace(/^\/$/, "/index.html");
    if (/^\/account\/?$/.test(path)) {
      response.writeHead(301, { Location: "/admin/" + new URL(request.url, "http://localhost").search }).end();
      return;
    }
    const page = path.split("/").filter(Boolean)[0] || "home";
    if (
      /^\/(about|rankings|games|rules|restrictions|tv|admin)\/?$/.test(
        path,
      )
    )
      path = "/index.html";
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (
      !file.startsWith(root + sep) ||
      path.includes("/.") ||
      (![
        "/index.html",
        "/styles.css",
        "/preview.png",
        "/robots.txt",
        "/sitemap.xml",
      ].includes(path) &&
        !/^\/(js|assets)\//.test(path))
    ) {
      response.writeHead(404).end();
      return;
    }
    let body = await readFile(file);
    if (path === "/index.html")
      body = renderPage(body.toString(), page === "index.html" ? "home" : page);
    response
      .writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      })
      .end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
  console.log("Local preview: http://127.0.0.1:" + (process.env.PORT || 4173)),
);
