"use strict";

// Accessible slide-in modal drawer utilizing the native dialog element
export function createDrawer() {
  const dialog = document.createElement("dialog");
  dialog.className = "admin-drawer";
  dialog.setAttribute("aria-labelledby", "drawer-heading");

  const panel = document.createElement("div");
  panel.className = "drawer-panel";

  const header = document.createElement("div");
  header.className = "drawer-header";

  const heading = document.createElement("h2");
  heading.id = "drawer-heading";
  heading.className = "drawer-title";
  heading.tabIndex = -1;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "drawer-close-btn";
  closeBtn.setAttribute("aria-label", "Close details drawer");
  closeBtn.textContent = "✕";

  header.append(heading, closeBtn);

  const body = document.createElement("div");
  body.className = "drawer-body";

  panel.append(header, body);
  dialog.append(panel);
  document.body.append(dialog);

  let lastOpener = null;
  let isClosing = false;

  function close() {
    if (!dialog.open || isClosing) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      dialog.classList.remove("is-open");
      dialog.close();
      if (lastOpener && typeof lastOpener.focus === "function") {
        lastOpener.focus();
      }
      lastOpener = null;
      return;
    }

    isClosing = true;
    dialog.classList.remove("is-open");
    dialog.classList.add("is-closing");

    function finishClose() {
      dialog.classList.remove("is-closing");
      dialog.close();
      isClosing = false;
      if (lastOpener && typeof lastOpener.focus === "function") {
        lastOpener.focus();
      }
      lastOpener = null;
    }

    dialog.addEventListener("animationend", finishClose, { once: true });
    setTimeout(() => {
      if (isClosing) finishClose();
    }, 280);
  }

  function open({ title, content, opener } = {}) {
    lastOpener = opener || document.activeElement;
    heading.textContent = title || "Student Details";
    body.replaceChildren();
    if (content instanceof Node) {
      body.append(content);
    }

    if (!dialog.open) {
      dialog.showModal();
    }
    dialog.classList.remove("is-closing");
    dialog.classList.add("is-open");
    heading.focus({ preventScroll: true });
  }

  closeBtn.addEventListener("click", () => close());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      close();
    }
  });

  return {
    open,
    close,
  };
}
