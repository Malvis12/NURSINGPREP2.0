"use strict";

import { adminRequest, setTokenProvider } from "./api.js";

let firebaseAuth = null;
let firebaseSdk = null;
let currentAdminUser = null;

// Returns the authenticated admin user claims record, if active
export function getAdminUser() {
  return currentAdminUser;
}

// Retrieves the active Firebase user ID token
export async function getIdToken(forceRefresh = false) {
  if (!firebaseAuth?.currentUser) return null;
  return await firebaseAuth.currentUser.getIdToken(forceRefresh);
}

// Boots Firebase client and binds auth state observer with admin claim verification
export async function initAuth(onStateChange) {
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

    setTokenProvider(async () => {
      if (!firebaseAuth?.currentUser) return null;
      return await firebaseAuth.currentUser.getIdToken();
    });

    firebaseSdk.onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        currentAdminUser = null;
        onStateChange({ status: "unauthenticated" });
        return;
      }

      onStateChange({ status: "loading" });

      try {
        await user.getIdToken(true);
        const me = await adminRequest("/api/admin/me");
        if (me.admin === true) {
          currentAdminUser = me;
          onStateChange({ status: "authenticated", user, adminUser: me });
        } else {
          throw new Error("Missing administrator claim confirmation.");
        }
      } catch (error) {
        if (error.status === 403) {
          onStateChange({ status: "denied", user, error });
        } else {
          onStateChange({ status: "error", error });
        }
      }
    });
  } catch (error) {
    onStateChange({ status: "error", error });
  }
}

// Authenticates admin credentials via Firebase Auth
export async function signIn(email, password) {
  if (!firebaseAuth || !firebaseSdk) {
    throw new Error("Firebase authentication is not ready. Please refresh.");
  }
  return await firebaseSdk.signInWithEmailAndPassword(firebaseAuth, email, password);
}

// Terminates the active admin Firebase session
export async function signOut() {
  if (firebaseAuth && firebaseSdk) {
    await firebaseSdk.signOut(firebaseAuth);
  }
  currentAdminUser = null;
}
