import { renderTVTimer, renderGamePage } from "./refresh.js";
const pages = {
  home: "Home",
  about: "About",
  rankings: "Rankings",
  games: "Active Games",
  rules: "League Rules",
  restrictions: "Eligibility & Promotions",
  tv: "Timer",
  account: "My Account",
};
const homeTitle =
  "All In Atlanta — Free Poker League | 3 Weekly Games in Atlanta, GA";
export function initializeNavigation() {
  const restore = () =>
    go(location.pathname.split("/").filter(Boolean)[0] || "home", {
      history: false,
    });
  window.addEventListener("popstate", restore);
  restore();
}
export function toggleMobileMenu() {
  const menu = document.getElementById("mobileMore");
  menu.hidden = !menu.hidden;
  document
    .getElementById("mobt-more")
    .setAttribute("aria-expanded", String(!menu.hidden));
}
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    document.getElementById("mobileMore")?.hidden === false
  ) {
    toggleMobileMenu();
    document.getElementById("mobt-more").focus();
  }
});
document.addEventListener("click", (event) => {
  if (
    document.getElementById("mobileMore")?.hidden === false &&
    !event.target.closest("#mobTabs")
  )
    toggleMobileMenu();
});
export function go(page, { history = true } = {}) {
  if (!Object.hasOwn(pages, page)) return;
  document.getElementById("mobileMore").hidden = true;
  document.getElementById("mobt-more").setAttribute("aria-expanded", "false");
  const path = page === "home" ? "/" : `/${page}/`;
  if (history && location.pathname !== path)
    window.history.pushState(null, "", path);
  document.title =
    page === "home" ? homeTitle : `${pages[page]} | All In Atlanta`;
  const url = `https://allinatlanta.com${path}`;
  document.querySelector('link[rel="canonical"]').href = url;
  document.querySelector('meta[property="og:url"]').content = url;
  for (const selector of [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ])
    document.querySelector(selector).content = document.title;
  document
    .querySelectorAll('a[data-click="go"], a[data-click="openAccount"]')
    .forEach((link) => {
      if (link.getAttribute("href") === path)
        link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  document.querySelectorAll(".page").forEach((p) => {
    p.classList.remove("active");
    p.style.display = "";
  });
  document
    .querySelectorAll(".nav-link, .nav-account-btn")
    .forEach((l) => l.classList.remove("active"));
  document
    .querySelectorAll(".mob-tab, .mobile-more a")
    .forEach((t) => t.classList.remove("active"));
  const pageEl = document.getElementById("page-" + page);
  if (!pageEl) return;
  // TV page: fullscreen, hide nav/footer/tabs
  const isTV = page === "tv";
  document.querySelector("nav").style.display = isTV ? "none" : "";
  document.querySelector("footer") &&
    (document.querySelector("footer").style.display = isTV ? "none" : "");
  document.getElementById("mobTabs") &&
    (document.getElementById("mobTabs").style.display = isTV ? "none" : "");
  if (isTV) {
    pageEl.style.display = "flex";
    renderTVTimer();
  } else {
    pageEl.classList.add("active");
    const navEl = document.getElementById("nav-" + page);
    if (navEl) navEl.classList.add("active");
    const mobEl = document.getElementById("mobt-" + page);
    if (mobEl) mobEl.classList.add("active");
    if (mobEl?.closest(".mobile-more"))
      document.getElementById("mobt-more").classList.add("active");
    if (page === "games") renderGamePage();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}
export function switchTab(btn, id) {
  btn
    .closest(".section")
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  btn
    .closest(".section")
    .querySelectorAll(".tab-pane")
    .forEach((p) => p.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(id).classList.add("active");
}
export function sR(btn, id) {
  document
    .querySelectorAll(".rnav-btn")
    .forEach((b) => b.classList.remove("active"));
  document
    .querySelectorAll(".rsec")
    .forEach((s) => s.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById(id).classList.add("active");
}
