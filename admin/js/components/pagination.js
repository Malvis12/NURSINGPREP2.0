"use strict";

// Accessible pagination bar managing page state and count status
export function createPagination({ onPrev, onNext }) {
  const nav = document.createElement("nav");
  nav.className = "admin-pagination";
  nav.setAttribute("aria-label", "Student list pagination");

  const countSpan = document.createElement("span");
  countSpan.className = "pagination-count";
  countSpan.setAttribute("aria-live", "polite");
  countSpan.textContent = "Showing 0 students";

  const controls = document.createElement("div");
  controls.className = "pagination-actions";

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "button button-secondary pagination-btn";
  prevBtn.disabled = true;
  prevBtn.textContent = "← Previous";
  prevBtn.addEventListener("click", () => {
    if (typeof onPrev === "function") onPrev();
  });

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "button button-secondary pagination-btn";
  nextBtn.disabled = true;
  nextBtn.textContent = "Next →";
  nextBtn.addEventListener("click", () => {
    if (typeof onNext === "function") onNext();
  });

  controls.append(prevBtn, nextBtn);
  nav.append(countSpan, controls);

  function update({ hasPrev = false, hasNext = false, count = 0 } = {}) {
    prevBtn.disabled = !hasPrev;
    nextBtn.disabled = !hasNext;
    const safeCount = typeof count === "number" ? count : 0;
    countSpan.textContent = `Showing ${safeCount} student${safeCount === 1 ? "" : "s"}`;
  }

  return {
    element: nav,
    update,
  };
}
