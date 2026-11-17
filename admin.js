"use strict";

import { createDataTable } from "./admin-table.js";

// Module state
let firebaseAuth = null;
let firebaseSdk = null;
let currentAdminUser = null;

// ==========================================================================
// 1. API & Request Wrapper
// Reusable by subsequent admin feature modules. Attaches the Firebase ID token.
// ==========================================================================

async function adminRequest(url, options = {}) {
  const requestOptions = {
    ...options,
    headers: { ...(options.headers || {}) },
  };

  if (firebaseAuth?.currentUser) {
    const token = await firebaseAuth.currentUser.getIdToken();
    requestOptions.headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, requestOptions);
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`The server returned non-JSON response (${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Unable to parse server JSON response.");
  }

  if (!response.ok) {
    const error = new Error(payload.error || payload.message || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

// ==========================================================================
// 2. Reusable UI Primitives (Toasts & Empty States)
// ==========================================================================

/**
 * Displays a non-blocking toast notification stacked in the top-right corner.
 * @param {string} message - Text notification to present.
 * @param {"success"|"error"|"info"} [type="info"] - Semantic visual variant.
 * @param {number} [duration=4000] - Lifespan in milliseconds before auto-dismissal.
 */
function toast(message, type = "info", duration = 4000) {
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

/**
 * Injects an accessible placeholder container for views without active records.
 * @param {HTMLElement} container - DOM parent element.
 * @param {string} title - Main heading.
 * @param {string} hint - Descriptive body copy.
 * @param {string} [symbol="◈"] - Icon mark.
 */
function renderEmptyState(container, title, hint, symbol = "◈") {
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

// ==========================================================================
// 3. View Implementations & Number Animation
// ==========================================================================

function animateNumber(element, target, duration = 600) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    element.textContent = target.toLocaleString();
    return;
  }
  const startTime = performance.now();
  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(target * ease);
    element.textContent = current.toLocaleString();
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  requestAnimationFrame(update);
}

function formatRevenue(minor, currency = "NGN") {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

async function renderOverviewView(container) {
  container.replaceChildren();

  // Top action bar with Refresh control
  const headerBar = document.createElement("div");
  headerBar.className = "overview-header-bar";

  const title = document.createElement("h2");
  title.className = "overview-section-title";
  title.textContent = "Platform Metrics";

  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.className = "button button-secondary";
  refreshBtn.style.minHeight = "36px";
  refreshBtn.style.fontSize = "11px";
  refreshBtn.innerHTML = '↻ Refresh Metrics';

  headerBar.append(title, refreshBtn);
  container.append(headerBar);

  // 4-Card Metrics Grid
  const grid = document.createElement("div");
  grid.className = "overview-grid";
  container.append(grid);

  function renderSkeletonCards() {
    grid.replaceChildren();
    for (let i = 0; i < 4; i += 1) {
      const card = document.createElement("div");
      card.className = "stat-card";
      const lbl = document.createElement("div");
      lbl.className = "skeleton";
      lbl.style.height = "12px";
      lbl.style.width = "40%";
      const val = document.createElement("div");
      val.className = "skeleton";
      val.style.height = "28px";
      val.style.width = "60%";
      const sub = document.createElement("div");
      sub.className = "skeleton";
      sub.style.height = "12px";
      sub.style.width = "75%";
      card.append(lbl, val, sub);
      grid.append(card);
    }
  }

  // Recent signups table section
  const tableTitle = document.createElement("h2");
  tableTitle.className = "overview-section-title";
  tableTitle.style.marginTop = "36px";
  tableTitle.style.marginBottom = "14px";
  tableTitle.textContent = "Recent Student Signups";
  container.append(tableTitle);

  const table = createDataTable({
    caption: "Five most recent student registrations",
    columns: [
      { key: "displayName", label: "Name", render: (r) => r.displayName || "—" },
      { key: "email", label: "Email", render: (r) => r.email || "—" },
      { key: "academicLevel", label: "Level", nowrap: true, render: (r) => `${r.academicLevel || "—"} Level` },
      {
        key: "membershipStatus",
        label: "Status",
        nowrap: true,
        render: (r) => {
          const pill = document.createElement("span");
          pill.className = "pill";
          if (r.membershipStatus === "active") {
            pill.classList.add("multiple-choice");
            pill.textContent = "Active";
          } else if (r.membershipStatus === "pending_payment") {
            pill.classList.add("hard");
            pill.textContent = "Pending Payment";
          } else {
            pill.textContent = r.membershipStatus || "—";
          }
          return pill;
        },
      },
      {
        key: "createdAt",
        label: "Signed Up",
        nowrap: true,
        render: (r) => {
          if (!r.createdAt) return "—";
          try {
            return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" })
              .format(new Date(r.createdAt));
          } catch {
            return r.createdAt;
          }
        },
      },
    ],
    emptyTitle: "No registered students yet",
    emptyHint: "When students create an account, their details will appear here.",
    onRetry: () => loadData(true),
  });

  container.append(table.element);

  async function loadData(forceRefresh = false) {
    renderSkeletonCards();
    table.setLoading();
    refreshBtn.disabled = true;

    try {
      const url = forceRefresh ? "/api/admin/overview?refresh=1" : "/api/admin/overview";
      const data = await adminRequest(url);

      // Populate 4 Stat Cards
      grid.replaceChildren();

      // Card 1: Students
      const card1 = document.createElement("div");
      card1.className = "stat-card";
      card1.innerHTML = `
        <span class="stat-card-label">Total Students</span>
        <h3 class="stat-card-value">0</h3>
        <p class="stat-card-subtext">${data.students.active} active · ${data.students.pendingPayment} pending</p>
      `;
      animateNumber(card1.querySelector("h3"), data.students.total);

      // Card 2: Revenue
      const card2 = document.createElement("div");
      card2.className = "stat-card";
      card2.innerHTML = `
        <span class="stat-card-label">Verified Revenue</span>
        <h3 class="stat-card-value">${formatRevenue(data.revenue.minor, data.revenue.currency)}</h3>
        <p class="stat-card-subtext">Paystack successful charges</p>
      `;

      // Card 3: Questions
      const card3 = document.createElement("div");
      card3.className = "stat-card";
      card3.innerHTML = `
        <span class="stat-card-label">Question Bank</span>
        <h3 class="stat-card-value">0</h3>
        <div class="stat-pill-group">
          <span class="pill">${data.questions.published} published</span>
          <span class="pill">200L: ${data.questions.byLevel["200"]}</span>
          <span class="pill">300L: ${data.questions.byLevel["300"]}</span>
          <span class="pill">400L: ${data.questions.byLevel["400"]}</span>
        </div>
      `;
      animateNumber(card3.querySelector("h3"), data.questions.total);

      // Card 4: Exams
      const card4 = document.createElement("div");
      card4.className = "stat-card";
      card4.innerHTML = `
        <span class="stat-card-label">Exams Completed</span>
        <h3 class="stat-card-value">0</h3>
        <p class="stat-card-subtext">Across all student levels</p>
      `;
      animateNumber(card4.querySelector("h3"), data.exams.completed);

      grid.append(card1, card2, card3, card4);
      table.setRows(data.recentSignups);

      if (forceRefresh) {
        toast("Overview data refreshed.", "success");
      }
    } catch (error) {
      grid.replaceChildren();
      const errCard = document.createElement("div");
      errCard.className = "stat-card stat-card-error";
      errCard.style.gridColumn = "1 / -1";
      errCard.innerHTML = `
        <span class="stat-card-label" style="color: var(--red);">Metrics Unavailable</span>
        <p class="stat-card-subtext">${error.message}</p>
      `;
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "button button-secondary";
      retry.style.minHeight = "34px";
      retry.style.fontSize = "11px";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => loadData(true));
      errCard.append(retry);
      grid.append(errCard);

      table.setError(error.message);
      if (forceRefresh) {
        toast(`Refresh failed: ${error.message}`, "error");
      }
    } finally {
      refreshBtn.disabled = false;
    }
  }

  refreshBtn.addEventListener("click", () => loadData(true));
  await loadData(false);
}

function renderQuestionsView(container) {
  renderEmptyState(
    container,
    "Question Bank Management",
    "Create, edit, search, and bulk-import nursing questions for 200, 300, and 400 levels here.",
    "☷"
  );
}

function renderStudentsView(container) {
  renderEmptyState(
    container,
    "Student Profiles",
    "View registered students, track exam progress history, and manually grant membership access here.",
    "👥"
  );
}

function renderPaymentsView(container) {
  renderEmptyState(
    container,
    "Payment Auditing",
    "Audit Paystack one-time access transactions, check references, and verify payment statuses here.",
    "💳"
  );
}

// ==========================================================================
// 4. Hash-Based Router Table
// ==========================================================================

const routes = {
  overview: { title: "Overview", render: renderOverviewView },
  questions: { title: "Questions", render: renderQuestionsView },
  students: { title: "Students", render: renderStudentsView },
  payments: { title: "Payments", render: renderPaymentsView },
};

function navigateRoute(hash) {
  const cleanRoute = (hash || window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
  const routeName = routes[cleanRoute] ? cleanRoute : "overview";
  const route = routes[routeName];

  // Update navigation link highlights
  document.querySelectorAll(".admin-nav-item").forEach((link) => {
    const isActive = link.dataset.route === routeName;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  // Update heading and render target view
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

// ==========================================================================
// 5. Screen Transition Manager & Client Authentication
// ==========================================================================

function showScreen(screen) {
  const screens = {
    loading: document.querySelector("#admin-loading"),
    auth: document.querySelector("#admin-auth"),
    denied: document.querySelector("#admin-denied"),
    shell: document.querySelector("#admin-shell"),
  };

  Object.entries(screens).forEach(([name, element]) => {
    if (element) {
      element.hidden = name !== screen;
    }
  });

  if (screen === "auth") {
    const emailInput = document.querySelector("#admin-email");
    if (emailInput) emailInput.focus();
  }
}

async function handleAdminSignIn(event) {
  event.preventDefault();
  const errorElement = document.querySelector("#admin-login-error");
  errorElement.hidden = true;
  errorElement.textContent = "";

  if (!firebaseAuth || !firebaseSdk) {
    errorElement.textContent = "Firebase authentication is not ready. Please refresh.";
    errorElement.hidden = false;
    return;
  }

  const form = event.currentTarget;
  const formData = new FormData(form);
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const submitBtn = document.querySelector("#admin-login-btn");

  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  try {
    const credential = await firebaseSdk.signInWithEmailAndPassword(firebaseAuth, email, password);
    await credential.user.getIdToken(true);
    await verifyAndEnterAdmin(credential.user);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Sign in to admin <span aria-hidden="true">→</span>';
  }
}

async function handleAdminSignOut() {
  if (firebaseAuth && firebaseSdk) {
    await firebaseSdk.signOut(firebaseAuth);
  }
  currentAdminUser = null;
  showScreen("auth");
  toast("Signed out successfully.", "info");
}

async function verifyAndEnterAdmin(user) {
  showScreen("loading");
  try {
    await user.getIdToken(true);
    const me = await adminRequest("/api/admin/me");

    if (me.admin === true) {
      currentAdminUser = me;
      const userDisplay = document.querySelector("#admin-user-email");
      if (userDisplay) {
        userDisplay.textContent = user.email || me.uid;
        userDisplay.title = user.email || me.uid;
      }
      showScreen("shell");
      navigateRoute(window.location.hash);
      toast(`Welcome, ${user.email || "Admin"}`, "success");
    } else {
      throw new Error("Missing admin confirmation.");
    }
  } catch (error) {
    if (error.status === 403) {
      const deniedEmail = document.querySelector("#denied-user-email");
      if (deniedEmail) {
        deniedEmail.textContent = user.email || user.uid;
      }
      showScreen("denied");
    } else {
      showScreen("auth");
      const loginError = document.querySelector("#admin-login-error");
      if (loginError) {
        loginError.textContent = error.message;
        loginError.hidden = false;
      }
    }
  }
}

async function initializeAdminPortal() {
  showScreen("loading");

  try {
    const configResponse = await fetch("/api/config");
    if (!configResponse.ok) {
      throw new Error("Could not fetch server configuration.");
    }
    const config = await configResponse.json();

    if (!config.firebaseConfigured || !config.firebaseConfig) {
      throw new Error("Firebase project settings are not configured on the server.");
    }

    firebaseSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js")
      .then(async (appSdk) => ({
        ...appSdk,
        ...(await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")),
      }));

    const app = firebaseSdk.initializeApp(config.firebaseConfig);
    firebaseAuth = firebaseSdk.getAuth(app);

    firebaseSdk.onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        currentAdminUser = null;
        showScreen("auth");
        return;
      }
      await verifyAndEnterAdmin(user);
    });
  } catch (error) {
    showScreen("auth");
    const loginError = document.querySelector("#admin-login-error");
    if (loginError) {
      loginError.textContent = `Initialization failed: ${error.message}`;
      loginError.hidden = false;
    }
  }
}

// Bind UI event listeners
document.querySelector("#admin-login-form")?.addEventListener("submit", handleAdminSignIn);
document.querySelector("#admin-signout-btn")?.addEventListener("click", handleAdminSignOut);
document.querySelector("#admin-denied-signout-btn")?.addEventListener("click", handleAdminSignOut);

window.addEventListener("hashchange", () => {
  if (currentAdminUser) {
    navigateRoute(window.location.hash);
  }
});

// Kick off initialization
initializeAdminPortal();

// Export utilities for future admin extension modules
export {
  adminRequest,
  toast,
  renderEmptyState,
  navigateRoute,
};
