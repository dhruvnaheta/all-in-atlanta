// Stack modal layers so Escape and focus always belong to the topmost popup.
const stack = [];
const focusable = (root) =>
  [
    ...root.querySelectorAll(
      "button, input, select, textarea, a[href], summary, [tabindex]",
    ),
  ].filter(
    (el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length,
  );
export function openModal(root, close) {
  if (stack.some((entry) => entry.root === root)) return;
  const previous = document.activeElement;
  const inert = [...document.body.children].filter(
    (el) => el !== root && !el.contains(root) && !el.inert,
  );
  inert.forEach((el) => {
    el.inert = true;
  });
  stack.push({ root, close, previous, inert });
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.tabIndex = -1;
  document.body.style.overflow = "hidden";
  (focusable(root)[0] || root).focus();
}
export function closeModal(root) {
  const index = stack.findIndex((entry) => entry.root === root);
  if (index < 0) return;
  while (stack.length > index + 1) stack.at(-1).close();
  const entry = stack.pop();
  entry.inert.forEach((el) => {
    el.inert = false;
  });
  if (!stack.length) document.body.style.overflow = "";
  if (entry.previous?.isConnected) entry.previous.focus();
  else if (stack.length)
    (focusable(stack.at(-1).root)[0] || stack.at(-1).root).focus();
}
globalThis.document?.addEventListener(
  "keydown",
  (event) => {
    const top = stack.at(-1);
    if (!top) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      top.close();
    } else if (event.key === "Tab") {
      const items = focusable(top.root);
      const index = items.indexOf(document.activeElement);
      if (
        !items.length ||
        (event.shiftKey ? index <= 0 : index < 0 || index === items.length - 1)
      ) {
        event.preventDefault();
        (items[event.shiftKey ? items.length - 1 : 0] || top.root).focus();
      }
    }
  },
  true,
);
globalThis.document?.addEventListener("focusin", (event) => {
  const top = stack.at(-1);
  if (top && !top.root.contains(event.target))
    (focusable(top.root)[0] || top.root).focus();
});
