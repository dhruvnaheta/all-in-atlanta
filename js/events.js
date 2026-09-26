import { toast } from "./dom.js";
export function bindActions(actions, root = document) {
  const pending = new Set();
  const events = ["click", "change", "input", "keydown", "mousedown", "submit"];
  const handlers = events.map((type) => {
    const handler = async (event) => {
      const element = event.target.closest?.("[data-" + type + "]");
      if (!element || !root.contains(element)) return;
      const name = element.dataset[type],
        action = actions[name];
      if (!action) return;
      if (type === "submit") event.preventDefault();
      const key = name + ":" + (element.dataset.arg0 || "");
      if (pending.has(key)) return;
      let busy = false;
      try {
        const result = action(element, event);
        if (result?.then) {
          busy = true;
          pending.add(key);
          element.setAttribute("aria-busy", "true");
          if ("disabled" in element) element.disabled = true;
          await result;
        }
      } catch (error) {
        toast("Not saved: " + error.message);
      } finally {
        if (busy) {
          pending.delete(key);
          element.removeAttribute("aria-busy");
          if ("disabled" in element) element.disabled = false;
        }
      }
    };
    root.addEventListener(type, handler);
    return [type, handler];
  });
  return () =>
    handlers.forEach(([type, handler]) =>
      root.removeEventListener(type, handler),
    );
}
