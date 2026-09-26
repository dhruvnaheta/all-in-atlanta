import { getActiveGameId } from "./state.js";
const drafts = new Map();
const draft = (scope) => {
  if (!drafts.has(scope)) drafts.set(scope, { fields: {}, registration: null });
  return drafts.get(scope);
};
export function bindDrafts(root = document) {
  const capture = (event) => {
    const element = event.target,
      scope = element.closest?.("[data-draft-scope]")?.dataset.draftScope;
    if (
      !scope ||
      !element.id ||
      element.id === "gcGameSelect" ||
      element.type === "password"
    )
      return;
    draft(scope).fields[element.id] = element.value;
  };
  root.addEventListener("input", capture, true);
  root.addEventListener("change", capture, true);
  return () => {
    root.removeEventListener("input", capture, true);
    root.removeEventListener("change", capture, true);
  };
}
export function setRegistration(prefix, name) {
  draft(`${prefix}:${getActiveGameId()}`).registration = name;
}
export function clearRegistration(prefix) {
  const state = draft(`${prefix}:${getActiveGameId()}`);
  state.registration = null;
  for (const key of Object.keys(state.fields))
    if (key.startsWith(prefix + "Np") || key === prefix + "SearchInput")
      delete state.fields[key];
}
export function clearGameDrafts(id) {
  drafts.delete("pub:" + id);
  drafts.delete("admin:" + id);
}
export function clearPrivateDrafts() {
  for (const key of [...drafts.keys()])
    if (key.startsWith("admin:") || key.startsWith("edit:")) drafts.delete(key);
}
export function applyDrafts(root, scope) {
  const state = drafts.get(scope);
  if (!state) return;
  for (const input of root.querySelectorAll(
    "input[id],select[id],textarea[id]",
  )) {
    if (Object.hasOwn(state.fields, input.id)) {
      input.value = state.fields[input.id];
      if (input.tagName === "SELECT")
        for (const option of input.options)
          option.selected = option.value === input.value;
      else input.setAttribute("value", input.value);
    }
  }
  if (state.registration) {
    const prefix = scope.split(":")[0];
    const form = root.querySelector("#" + prefix + "NpForm");
    if (form) {
      form.classList.add("open");
      form.dataset.pendingName = state.registration;
    }
    const label = root.querySelector(
      "#" + (prefix === "pub" ? "pubNpName" : "adminNpNameLabel"),
    );
    if (label) label.textContent = state.registration;
    const search = root.querySelector("#" + prefix + "SearchInput");
    if (search) {
      search.value = state.registration;
      search.setAttribute("value", state.registration);
      search.disabled = true;
    }
  }
}
