import { emulator, environmentURL } from "./environment.js";
import { updateSEO } from "./seo.js";
import { renderTVTimer, renderGamePage, renderAdmin } from "./refresh.js";
import { refreshToken } from "./auth.js";
import { toast } from "./dom.js";
const pages = {
  home: "Home",
  about: "About",
  rankings: "Rankings",
  games: "Active Games",
  rules: "League Rules",
  restrictions: "Eligibility & Promotions",
  tv: "Timer",
  account: "Admin",
  admin: "Admin",
};
export function initializeNavigation() {
  if (emulator) {
    const updateLinks = () => {
      document.querySelectorAll("a[href]").forEach((link) => {
        const url = environmentURL(link.getAttribute("href"));
        if (url.href !== link.href) link.href = url.href;
      });
    };
    updateLinks();
    new MutationObserver(updateLinks).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    });
  }
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
document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.key === "Escape" &&
      document.getElementById("page-tv")?.classList.contains("active")
    ) {
      event.preventDefault();
      go("games");
      return;
    }
    if (
      event.key === "Escape" &&
      document.getElementById("mobileMore")?.hidden === false
    ) {
      toggleMobileMenu();
      document.getElementById("mobt-more").focus();
    }
  },
  // Modal capture handlers get first refusal, including while viewing the timer.
  { capture: false },
);
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
    window.history.pushState(null, "", environmentURL(path));
  updateSEO(page);
  document
    .querySelectorAll('a[data-click="go"], a[data-click="openAccount"]')
    .forEach((link) => {
      if (
        new URL(link.href).pathname === (page === "admin" ? "/account/" : path)
      )
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
  pageEl.classList.add("active");
  if (page === "account")
    refreshToken().catch((error) =>
      toast("Unable to refresh account access. " + error.message),
    );
  // TV page: fullscreen, hide nav/footer/tabs
  const isTV = page === "tv";
  document.querySelector("nav").style.display = isTV ? "none" : "";
  document.querySelector("footer") &&
    (document.querySelector("footer").style.display = isTV ? "none" : "");
  document.getElementById("mobTabs") &&
    (document.getElementById("mobTabs").style.display = isTV ? "none" : "");
  if (isTV) {
    renderTVTimer();
  } else {
    const navPage = page === "admin" ? "account" : page;
    const navEl = document.getElementById("nav-" + navPage);
    if (navEl) navEl.classList.add("active");
    const mobEl = document.getElementById("mobt-" + navPage);
    if (mobEl) mobEl.classList.add("active");
    if (mobEl?.closest(".mobile-more"))
      document.getElementById("mobt-more").classList.add("active");
    if (page === "games") renderGamePage();
    if (page === "admin") renderAdmin();
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
