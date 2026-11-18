"use strict";

const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { HttpError } = require("../shared/http-error");

let cachedAuth = null;
let cachedDb = null;

// Obtains or initializes the shared Firebase app instance for administrative modules.
function getAdminFirebaseApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new HttpError(503, "Firebase is not configured. Add the project settings before using accounts.");
  }
  return getApps().find((item) => item.name === "nursing-prep")
    || initializeApp({
      credential: applicationDefault(),
      projectId,
    }, "nursing-prep");
}

function getAdminAuth() {
  if (!cachedAuth) {
    const app = getAdminFirebaseApp();
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

function getAdminDb() {
  if (!cachedDb) {
    // Lazy require so environments without firestore installed can still use auth
    const { getFirestore } = require("firebase-admin/firestore");
    const app = getAdminFirebaseApp();
    cachedDb = getFirestore(app);
  }
  return cachedDb;
}

module.exports = {
  getAdminAuth,
  getAdminDb,
};
