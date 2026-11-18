"use strict";

// Injects an accessible placeholder container for views without active records
export function renderEmptyState(container, title, hint, symbol = "◈") {
  container.replaceChildren();

  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const mark = document.createElement("div");
  mark.className = "empty-state-symbol";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = symbol;

  const heading = document.createElement("h2");
  heading.textContent = title;

  const copy = document.createElement("p");
  copy.textContent = hint;

  wrapper.append(mark, heading, copy);
  container.append(wrapper);
}
