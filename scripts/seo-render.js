import { seoPages, siteURL, pagePath, pageSchema } from "../js/seo.js";
export const start = "<!-- SEO:START -->";
export const end = "<!-- SEO:END -->";
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
export function metadata(page) {
  const data = seoPages[page];
  const meta = (key, value, property = false) =>
    `<meta ${property ? "property" : "name"}="${key}" content="${escape(value)}" />`;
  return [
    `<title>${escape(data.title)}</title>`,
    meta("description", data.description),
    meta(
      "robots",
      data.noindex
        ? "noindex, follow"
        : "index, follow, max-image-preview:large",
    ),
    `<link rel="canonical" href="${siteURL + pagePath(page)}" />`,
    ...Object.entries({
      type: "website",
      url: siteURL + pagePath(page),
      site_name: "All In Atlanta Poker League",
      title: data.title,
      description: data.description,
      image: siteURL + "/preview.png",
      "image:width": "1254",
      "image:height": "1254",
      "image:alt": "All In Atlanta poker league",
      locale: "en_US",
    }).map(([key, value]) => meta("og:" + key, value, true)),
    ...Object.entries({
      card: "summary_large_image",
      title: data.title,
      description: data.description,
      image: siteURL + "/preview.png",
      "image:alt": "All In Atlanta poker league",
    }).map(([key, value]) => meta("twitter:" + key, value)),
    `<script id="page-schema" type="application/ld+json">${JSON.stringify(pageSchema(page)).replaceAll("<", "\\u003c")}</script>`,
  ].join("\n");
}
export function renderPage(html, page) {
  html =
    html.split(start)[0] +
    start +
    "\n" +
    metadata(page) +
    "\n" +
    end +
    html.split(end)[1];
  if (page !== "home")
    html = html
      .replace(
        'class="page active" id="page-home"',
        'class="page" id="page-home"',
      )
      .replace(
        `class="page" id="page-${page}"`,
        `class="page active" id="page-${page}"`,
      );
  return html;
}
