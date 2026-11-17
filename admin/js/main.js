"use strict";

import { initAuth, signIn, signOut } from "./auth.js";
import { initRouter, setRouterActive, navigate } from "./router.js";
import { toast } from "./components/toast.js";

// Manages visibility transitions across authentication, access denied, and admin workspace screens
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

function renderSubmitButton(btn) {
  btn.replaceChildren();
  btn.append(document.createTextNode("Sign in to admin "));
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "→";
  btn.append(arrow);
}

// Initialize router with default route
initRouter("overview");

// Auth state listener
async function handleAuthState(state) {
  switch (state.status) {
    case "loading":
      showScreen("loading");
      break;

    case "authenticated": {
      const email = state.adminUser?.email || state.user?.email || "Admin";
      const userDisplay = document.querySelector("#admin-user-email");
      if (userDisplay) {
        userDisplay.textContent = email;
        userDisplay.title = email;
      }
      setRouterActive(true);
      showScreen("shell");
      navigate(window.location.hash);
      toast(`Welcome, ${email}`, "success");
      break;
    }

    case "denied": {
      setRouterActive(false);
      const deniedEmail = document.querySelector("#denied-user-email");
      if (deniedEmail) {
        deniedEmail.textContent = state.user?.email || state.user?.uid || "User";
      }
      showScreen("denied");
      break;
    }

    case "unauthenticated":
      setRouterActive(false);
      showScreen("auth");
      break;

    case "error": {
      setRouterActive(false);
      showScreen("auth");
      const loginError = document.querySelector("#admin-login-error");
      if (loginError) {
        loginError.textContent = state.error?.message || "Authentication failed.";
        loginError.hidden = false;
      }
      break;
    }
  }
}

// Sign-in form submission
async function handleSignInSubmit(event) {
  event.preventDefault();
  const errorElement = document.querySelector("#admin-login-error");
  errorElement.hidden = true;
  errorElement.textContent = "";

  const form = event.currentTarget;
  const formData = new FormData(form);
  const email = String(formData.get("email")).trim();
  const password = String(formData.get("password"));
  const submitBtn = document.querySelector("#admin-login-btn");

  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  try {
    await signIn(email, password);
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.hidden = false;
  } finally {
    submitBtn.disabled = false;
    renderSubmitButton(submitBtn);
  }
}

// Sign-out action
async function handleSignOutClick() {
  await signOut();
  setRouterActive(false);
  showScreen("auth");
  toast("Signed out successfully.", "info");
}

// Attach event listeners
document.querySelector("#admin-login-form")?.addEventListener("submit", handleSignInSubmit);
document.querySelector("#admin-signout-btn")?.addEventListener("click", handleSignOutClick);
document.querySelector("#admin-denied-signout-btn")?.addEventListener("click", handleSignOutClick);

// Start authentication lifecycle
initAuth(handleAuthState);
