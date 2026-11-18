"use strict";

// Displays a non-blocking toast notification in the toast container
export function toast(message, type = "info", duration = 4000) {
  const container = document.querySelector("#toast-container");
  if (!container) return;

  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.setAttribute("role", "status");

  const text = document.createElement("p");
  text.className = "toast-message";
  text.textContent = message;

  const closeButton = document.createElement("button");
  closeButton.className = "toast-close";
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Dismiss notification");
  closeButton.textContent = "✕";

  function dismiss() {
    if (item.classList.contains("is-leaving")) return;
    item.classList.add("is-leaving");
    item.addEventListener("animationend", () => item.remove(), { once: true });
  }

  closeButton.addEventListener("click", dismiss);
  item.append(text, closeButton);
  container.append(item);

  if (duration > 0) {
    window.setTimeout(dismiss, duration);
  }
}
