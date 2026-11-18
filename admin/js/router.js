"use strict";

import { renderOverview } from "./views/overview.js";
import { renderQuestions } from "./views/questions.js";
import { renderStudents } from "./views/students.js";
import { renderPayments } from "./views/payments.js";

// Route registry mapping hash paths to view descriptors
const routes = {
  overview: { title: "Overview", render: renderOverview },
  questions: { title: "Questions", render: renderQuestions },
  students: { title: "Students", render: renderStudents },
  payments: { title: "Payments", render: renderPayments },
};

let currentRouteName = null;
let defaultRouteName = "overview";
let isRouterActive = false;

// Initializes router hashchange event listener
export function initRouter(defaultRoute = "overview") {
  defaultRouteName = defaultRoute;
  window.addEventListener("hashchange", () => {
    if (isRouterActive) {
      navigate(window.location.hash);
    }
  });
}

// Toggles router responsiveness to navigation events
export function setRouterActive(active) {
  isRouterActive = active;
}

// Navigates to a hash route, updating ARIA attributes, page heading, and view content
export function navigate(hash) {
  const cleanRoute = (hash || window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  const routeName = routes[cleanRoute] ? cleanRoute : defaultRouteName;
  const route = routes[routeName];
  if (!route) return;

  currentRouteName = routeName;

  document.querySelectorAll(".admin-nav-item").forEach((link) => {
    const isActive = link.dataset.route === routeName;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const heading = document.querySelector("#admin-view-heading");
  if (heading) {
    heading.textContent = route.title;
    heading.focus({ preventScroll: true });
  }

  const container = document.querySelector("#admin-view-content");
  if (container) {
    route.render(container);
  }
}

// Returns the currently active route identifier
export function getCurrentRoute() {
  return currentRouteName;
}
