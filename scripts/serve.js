import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve(import.meta.dirname, "..");
const types = {
  ".html": "text/html",
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
    if (
      /^\/(about|rankings|games|rules|restrictions|tv|account)\/?$/.test(path)
    )
      path = "/index.html";
    const file = resolve(root, "." + (path === "/" ? "/index.html" : path));
    if (
      !file.startsWith(root + sep) ||
      path.includes("/.") ||
      (!["/index.html", "/styles.css", "/preview.png"].includes(path) &&
        !/^\/(js|assets)\//.test(path))
    ) {
      response.writeHead(404).end();
      return;
    }
    const body = await readFile(file);
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
