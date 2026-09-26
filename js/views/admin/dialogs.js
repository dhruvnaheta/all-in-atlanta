export function askConfirm(msg, onYes) {
  const box = document.getElementById("aconfirm");
  const msgEl = document.getElementById("aconfirm-msg");
  const yesBtn = document.getElementById("aconfirm-yes");
  if (!box || !msgEl || !yesBtn) return;
  msgEl.textContent = msg;
  box.classList.add("open");
  // Remove old listener and attach fresh one
  const newYes = yesBtn.cloneNode(true);
  yesBtn.parentNode.replaceChild(newYes, yesBtn);
  newYes.addEventListener("click", async () => {
    if(newYes.disabled)return;newYes.disabled=true;newYes.textContent='Saving…';
    try {await onYes();box.classList.remove('open');}
    catch(error){adminAlert(error.message,'err');}
    finally{newYes.disabled=false;newYes.textContent='Yes, confirm';}
  });
  box.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
export function toggleGameHist(id, hdr) {
  const el = document.getElementById(id);
  if (!el) return;
  const open = el.style.display === "block";
  el.style.display = open ? "none" : "block";
  const lbl = hdr.querySelector(".gh-toggle-lbl");
  if (lbl) lbl.textContent = open ? "▼ Details" : "▲ Hide";
}
export function cancelConfirm() {
  const box = document.getElementById("aconfirm");
  if (box) box.classList.remove("open");
}

export function adminAlert(msg, type) {
  const el = document.getElementById("aalert");
  if (!el) return;
  el.textContent = msg;
  el.className = "aalert " + type;
  el.style.display = "block";
  setTimeout(() => {
    if (el) el.style.display = "none";
  }, 4000);
}
