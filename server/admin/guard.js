"use strict";

const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { HttpError } = require("../http-error");

// Obtains the shared Firebase auth instance, reusing the app initialized in server.js.
function getFirebaseAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new HttpError(503, "Firebase is not configured. Add the project settings before using accounts.");
  }
  const app = getApps().find((item) => item.name === "nursing-prep")
    || initializeApp({
      credential: applicationDefault(),
      projectId,
    }, "nursing-prep");
  return getAuth(app);
}

// Verifies Bearer token from request headers and returns the full decoded token.
async function requireUser(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/);
  if (!match) throw new HttpError(401, "Sign in to continue.");
  const auth = getFirebaseAuth();
  try {
    return await auth.verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, "Your sign-in has expired. Please sign in again.");
  }
}

// Strictly asserts that the decoded token carries the admin custom claim.
function assertAdminClaims(decodedToken) {
  if (!decodedToken || decodedToken.admin !== true) {
    throw new HttpError(403, "Administrator access required.");
  }
  return decodedToken;
}

// Composes user authentication and admin privilege assertion.
async function requireAdmin(request) {
  const decodedToken = await requireUser(request);
  assertAdminClaims(decodedToken);
  return decodedToken;
}

module.exports = {
  assertAdminClaims,
  requireAdmin,
  requireUser,
};
