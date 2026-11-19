"use strict";

const { getAdminDb } = require("../firebase");
const { HttpError } = require("../../shared/http-error");
const { sendJson, sendError } = require("../../shared/http-helpers");

const ALLOWED_STATUSES = new Set(["active", "pending_payment"]);
const ALLOWED_LEVELS = new Set(["200", "300", "400"]);
const UID_PATTERN = /^[A-Za-z0-9]{1,128}$/;

// Validates a UID parameter against Firestore identifier constraints
function validateUid(uid) {
  if (typeof uid !== "string" || !UID_PATTERN.test(uid)) {
    throw new HttpError(400, "Invalid user ID format.");
  }
  return uid;
}

// Parses and normalizes query parameters for the student roster endpoint
function parseListQuery(searchParams) {
  const params = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || "");
  const statusParam = params.get("status");
  const status = ALLOWED_STATUSES.has(statusParam) ? statusParam : null;

  const levelParam = params.get("level");
  const level = ALLOWED_LEVELS.has(levelParam) ? levelParam : null;

  const rawQ = params.get("q");
  const q = typeof rawQ === "string" ? rawQ.toLowerCase().trim().slice(0, 100) : "";

  const rawLimit = params.get("limit");
  const parsedLimit = parseInt(rawLimit, 10);
  const limit = Number.isNaN(parsedLimit) ? 20 : Math.max(1, Math.min(50, parsedLimit));

  const rawCursor = params.get("cursor");
  let cursor = null;
  if (rawCursor) {
    if (!UID_PATTERN.test(rawCursor)) {
      throw new HttpError(400, "Invalid cursor parameter.");
    }
    cursor = rawCursor;
  }

  return { status, level, q, limit, cursor };
}

// Builds and runs Firestore queries for paginated student listing
async function getStudentsList({ status, level, q, limit, cursor }) {
  const db = getAdminDb();
  let query;

  if (q) {
    query = db.collection("users")
      .orderBy("email")
      .where("email", ">=", q)
      .where("email", "<", `${q}\uf8ff`);
  } else {
    query = db.collection("users").orderBy("createdAt", "desc");
    if (status) query = query.where("membershipStatus", "==", status);
    if (level) query = query.where("academicLevel", "==", level);
  }

  if (cursor) {
    const cursorDoc = await db.collection("users").doc(cursor).get();
    if (!cursorDoc.exists) {
      throw new HttpError(400, "Cursor document does not exist.");
    }
    query = query.startAfter(cursorDoc);
  }

  query = query.limit(limit + 1);
  const snapshot = await query.get();
  const hasMore = snapshot.docs.length > limit;
  const docs = hasMore ? snapshot.docs.slice(0, limit) : snapshot.docs;
  const nextCursor = hasMore && docs.length > 0 ? docs[docs.length - 1].id : null;

  const items = docs.map((doc) => {
    const data = doc.data();
    const progress = data.progress || {};
    return {
      uid: doc.id,
      displayName: data.displayName || "",
      email: data.email || "",
      university: data.university || "",
      academicLevel: data.academicLevel || "",
      membershipStatus: data.membershipStatus || "",
      createdAt: data.createdAt || "",
      progress: {
        sessionsCompleted: Number(progress.sessionsCompleted) || 0,
        questionsPracticed: Number(progress.questionsPracticed) || 0,
        totalCorrect: Number(progress.totalCorrect) || 0,
      },
    };
  });

  return { items, nextCursor, hasMore };
}

// Dispatches GET /api/admin/students requests
async function handleStudentsList(request, response, url) {
  try {
    const parsed = parseListQuery(url.searchParams);
    const data = await getStudentsList(parsed);
    sendJson(response, 200, data);
    return true;
  } catch (error) {
    if (error && (error.code === 9 || error.code === "9" || (error.message && error.message.includes("requires an index")))) {
      console.error(error.message || error);
      sendError(response, 400, "This filter combination needs a Firestore index. Check the server console for the link to create it.");
      return true;
    }
    throw error;
  }
}

// Dispatches GET /api/admin/students/:uid detail requests
async function handleStudentDetail(request, response, rawUid) {
  const uid = validateUid(rawUid);
  const db = getAdminDb();
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpError(404, "Student profile not found.");
  }

  const data = userDoc.data();
  const progress = data.progress || {};
  const profile = {
    uid: userDoc.id,
    displayName: data.displayName || "",
    email: data.email || "",
    university: data.university || "",
    academicLevel: data.academicLevel || "",
    membershipStatus: data.membershipStatus || "",
    paidAt: data.paidAt || null,
    createdAt: data.createdAt || "",
    progress: {
      sessionsCompleted: Number(progress.sessionsCompleted) || 0,
      questionsPracticed: Number(progress.questionsPracticed) || 0,
      totalCorrect: Number(progress.totalCorrect) || 0,
    },
  };

  const sessionsSnap = await db.collection("users").doc(uid).collection("sessions")
    .select("score", "total", "percent", "completedAt", "topic", "difficulty")
    .orderBy("completedAt", "desc")
    .limit(10)
    .get();

  const recentSessions = sessionsSnap.docs.map((doc) => {
    const s = doc.data();
    return {
      id: doc.id,
      score: Number(s.score) || 0,
      total: Number(s.total) || 0,
      percent: Number(s.percent) || 0,
      completedAt: s.completedAt || "",
      topic: s.topic || "",
      difficulty: s.difficulty || "",
    };
  });

  sendJson(response, 200, { profile, recentSessions });
  return true;
}

module.exports = {
  validateUid,
  parseListQuery,
  getStudentsList,
  handleStudentsList,
  handleStudentDetail,
};
