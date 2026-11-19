"use strict";

const { getAdminDb } = require("../firebase");
const { HttpError } = require("../../shared/http-error");
const { sendJson } = require("../../shared/http-helpers");

const UID_PATTERN = /^[A-Za-z0-9]{1,128}$/;

// Validates a UID against Firestore identifier constraints
function validateUid(uid) {
  if (typeof uid !== "string" || !UID_PATTERN.test(uid)) {
    throw new HttpError(400, "Invalid user ID format.");
  }
  return uid;
}

// Reads and parses JSON payload from incoming request stream
function readJsonBody(request, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;
    let finished = false;

    request.on("data", (chunk) => {
      if (finished) return;
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        finished = true;
        reject(new HttpError(413, "Request body is too large."));
        request.resume?.();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (finished) return;
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        reject(new HttpError(400, "Request body is required."));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new HttpError(400, "Request body must be valid JSON."));
      }
    });

    request.on("error", (err) => {
      if (finished) return;
      finished = true;
      reject(err);
    });
  });
}

// Validates activation payload: requires reason (5-300 chars) and rejects unknown keys
function validateActivateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }

  const keys = Object.keys(body);
  if (!keys.includes("reason")) {
    throw new HttpError(400, "Reason is required.");
  }
  if (keys.some((k) => k !== "reason")) {
    throw new HttpError(400, "Unknown or unexpected fields in request body.");
  }
  if (typeof body.reason !== "string") {
    throw new HttpError(400, "Reason must be a string.");
  }

  const trimmed = body.reason.trim();
  if (trimmed.length < 5 || trimmed.length > 300) {
    throw new HttpError(400, "Reason must be between 5 and 300 characters.");
  }

  return trimmed;
}

// Atomically activates membership and writes an audit log entry in one transaction
async function activateStudentMembership(rawUid, reason, adminUser, db = getAdminDb()) {
  const uid = validateUid(rawUid);
  const trimmedReason = typeof reason === "string" ? validateActivateBody({ reason }) : "";
  const now = new Date().toISOString();

  const userRef = db.collection("users").doc(uid);
  const auditRef = db.collection("adminAuditLog").doc();

  return await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
      throw new HttpError(404, "Student profile not found.");
    }

    const userData = userDoc.data() || {};
    if (userData.membershipStatus === "active") {
      throw new HttpError(409, "Student membership is already active.");
    }

    const previousStatus = userData.membershipStatus || "";

    transaction.update(userRef, {
      membershipStatus: "active",
      activationSource: "manual",
      activatedBy: adminUser.uid,
      activatedAt: now,
    });

    transaction.set(auditRef, {
      action: "activate_membership",
      targetUid: uid,
      adminUid: adminUser.uid,
      adminEmail: adminUser.email || "",
      reason: trimmedReason,
      previousStatus,
      newStatus: "active",
      createdAt: now,
    });

    return {
      success: true,
      membershipStatus: "active",
      activatedAt: now,
    };
  });
}

// Dispatches POST /api/admin/students/:uid/activate requests
async function handleActivateStudent(request, response, rawUid, adminUser, db = getAdminDb()) {
  const uid = validateUid(rawUid);
  const body = await readJsonBody(request);
  const reason = validateActivateBody(body);

  const result = await activateStudentMembership(uid, reason, adminUser, db);
  sendJson(response, 200, result);
  return true;
}

module.exports = {
  validateUid,
  validateActivateBody,
  readJsonBody,
  activateStudentMembership,
  handleActivateStudent,
};
