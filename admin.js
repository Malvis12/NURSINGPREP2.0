"use strict";

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
// 3. Hash-Based Router & View Registrations
// Extensible route table allowing subsequent feature modules to plug in views.
// ==========================================================================

function renderOverviewView(container) {
  renderEmptyState(
    container,
    "Overview Dashboard",
    "System metrics, question bank totals, and active student sessions will be displayed here.",
    "◈"
  );
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
// 4. Screen Transition Manager & Client Authentication
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
    // Force token refresh to pick up custom claims that may have been assigned recently
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
    // Force a fresh ID token before pinging the guard endpoint
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

    // Dynamic import adhering strictly to CSP script-src gstatic whitelist
    firebaseSdk = await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js")
      .then(async (appSdk) => ({
        ...appSdk,
        ...(await import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js")),
      }));

    const app = firebaseSdk.initializeApp(config.firebaseConfig);
    firebaseAuth = firebaseSdk.getAuth(app);

    // Watch for session changes
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
