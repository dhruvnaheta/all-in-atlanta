import { renderTVTimer, renderGamePage } from "./refresh.js";
export function go(page) {
  document.querySelectorAll(".page").forEach((p) => {
    p.classList.remove("active");
    p.style.display = "";
  });
  document
    .querySelectorAll(".nav-link")
    .forEach((l) => l.classList.remove("active"));
  document
    .querySelectorAll(".mob-tab")
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
