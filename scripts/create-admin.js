"use strict";

const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes("--revoke");
  const email = args.filter((arg) => !arg.startsWith("--"))[0];

  if (!email) {
    console.error("Error: Email address argument is required.");
    console.error("Usage: npm run create:admin -- <email> [--revoke]");
    console.error("Example: npm run create:admin -- admin@wellspring.edu.ng");
    console.error("Example (revoke): npm run create:admin -- admin@wellspring.edu.ng --revoke");
    process.exit(1);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    console.error("Error: FIREBASE_PROJECT_ID is not set.");
    console.error("Ensure your .env file is present or pass FIREBASE_PROJECT_ID in the environment.");
    process.exit(1);
  }

  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    }
  } catch (error) {
    console.error("Error: Could not initialize Firebase Admin SDK:", error.message);
    console.error("Check GOOGLE_APPLICATION_CREDENTIALS or your application default credentials setup.");
    process.exit(1);
  }

  const auth = getAuth();
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      console.error(`Error: User not found for email "${email}". The user must register an account first.`);
    } else {
      console.error(`Error: Failed to fetch user by email "${email}":`, error.message);
    }
    process.exit(1);
  }

  const existingClaims = userRecord.customClaims || {};
  const updatedClaims = { ...existingClaims };

  if (revoke) {
    delete updatedClaims.admin;
    await auth.setCustomUserClaims(userRecord.uid, updatedClaims);
    console.log(`Successfully revoked admin privileges from: ${email} (UID: ${userRecord.uid})`);
  } else {
    updatedClaims.admin = true;
    await auth.setCustomUserClaims(userRecord.uid, updatedClaims);
    console.log(`Successfully granted admin privileges to: ${email} (UID: ${userRecord.uid})`);
  }

  console.log("Reminder: The user must sign out and sign back in (or trigger an ID token refresh) for changes to apply.");
}

main().catch((error) => {
  console.error("Unexpected error updating admin claims:", error.message);
  process.exit(1);
});
