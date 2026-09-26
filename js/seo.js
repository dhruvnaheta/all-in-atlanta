export const siteURL = "https://allinatlanta.com";
export const seoPages = {
  home: {
    title: "Atlanta Poker — Free Texas Hold’em League | All In Atlanta",
    description:
      "Play free poker in Atlanta: Mondays and Thursdays at Wicked Wolf and Wednesdays at 5 Paces, all at 8PM. No buy-in. New Texas Hold’em players welcome, ages 21+.",
    label: "Home",
  },
  about: {
    title: "Free Poker League in Atlanta | About All In Atlanta",
    description:
      "Meet All In Atlanta, a welcoming free Texas Hold’em poker league. Learn how to join, where to play and how our Atlanta poker nights work. Ages 21+.",
    label: "About the league",
  },
  games: {
    title: "Atlanta Poker Games & Weekly Schedule | All In Atlanta",
    description:
      "Find free Atlanta poker games at Wicked Wolf and 5 Paces. View the weekly Texas Hold’em schedule, upcoming tournaments and check in when registration opens.",
    label: "Poker games",
  },
  rankings: {
    title: "Atlanta Poker League Rankings & Results | All In Atlanta",
    description:
      "See All In Atlanta poker league rankings, monthly and all-time standings, and tournament results. Follow player points from our free Atlanta poker games.",
    label: "League rankings",
  },
  rules: {
    title: "Texas Hold’em Poker League Rules | All In Atlanta",
    description:
      "Read All In Atlanta’s Texas Hold’em tournament rules, scoring and table etiquette. Get ready for our free poker league games in Atlanta, Georgia.",
    label: "League rules",
  },
  restrictions: {
    title: "Free Poker Eligibility & Promotions | All In Atlanta",
    description:
      "Review All In Atlanta tournament eligibility, free entry, bonus chips and prize rules. Players must be 21 or older. No purchase necessary to enter or win.",
    label: "Eligibility and promotions",
  },
  admin: {
    title: "Admin | All In Atlanta",
    description: "Manage All In Atlanta games and player results.",
    label: "Admin",
    noindex: true,
  },
  tv: {
    title: "Timer",
    description:
      "Live tournament blind timer for All In Atlanta poker league games.",
    label: "Tournament timer",
    noindex: true,
  },
};
export const pagePath = (page) => (page === "home" ? "/" : `/${page}/`);
export function pageSchema(page) {
  const data = seoPages[page];
  const url = siteURL + pagePath(page);
  const graph = [
    {
      "@type": "WebSite",
      "@id": siteURL + "/#website",
      url: siteURL + "/",
      name: "All In Atlanta",
      publisher: { "@id": siteURL + "/#organization" },
    },
    {
      "@type": page === "about" ? "AboutPage" : "WebPage",
      "@id": url + "#webpage",
      url,
      name: data.title,
      description: data.description,
      inLanguage: "en-US",
      isPartOf: { "@id": siteURL + "/#website" },
      about: { "@id": siteURL + "/#organization" },
      ...(page !== "home" && !data.noindex
        ? { breadcrumb: { "@id": url + "#breadcrumb" } }
        : {}),
    },
  ];
  if (page !== "home" && !data.noindex)
    graph.push({
      "@type": "BreadcrumbList",
      "@id": url + "#breadcrumb",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteURL + "/" },
        { "@type": "ListItem", position: 2, name: data.label, item: url },
      ],
    });
  return { "@context": "https://schema.org", "@graph": graph };
}
export function updateSEO(page) {
  const data = seoPages[page];
  document.title = data.title;
  for (const selector of [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ])
    document.querySelector(selector).content = data.title;
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ])
    document.querySelector(selector).content = data.description;
  document.querySelector('meta[name="robots"]').content = data.noindex
    ? "noindex, follow"
    : "index, follow, max-image-preview:large";
  document.querySelector('link[rel="canonical"]').href =
    siteURL + pagePath(page);
  document.querySelector('meta[property="og:url"]').content =
    siteURL + pagePath(page);
  document.getElementById("page-schema").textContent = JSON.stringify(
    pageSchema(page),
  );
}
