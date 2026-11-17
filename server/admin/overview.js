"use strict";

const { getAdminDb } = require("./firebase");
const { sendJson } = require("../http-helpers");

let cachedOverview = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 1000;

// Computes or returns cached platform metrics via Firestore aggregation queries.
async function getOverviewMetrics({ bypassCache = false } = {}) {
  const now = Date.now();
  if (!bypassCache && cachedOverview && (now - cachedAt < CACHE_TTL_MS)) {
    return cachedOverview;
  }

  const db = getAdminDb();
  const { AggregateField } = require("firebase-admin/firestore");

  const [
    totalUsersSnap,
    activeUsersSnap,
    pendingUsersSnap,
    revenueSnap,
    totalQuestionsSnap,
    publishedQuestionsSnap,
    q200Snap,
    q300Snap,
    q400Snap,
    examsSnap,
    recentUsersSnap,
  ] = await Promise.all([
    db.collection("users").count().get(),
    db.collection("users").where("membershipStatus", "==", "active").count().get(),
    db.collection("users").where("membershipStatus", "==", "pending_payment").count().get(),
    db.collection("payments")
      .where("status", "==", "success")
      .aggregate({ totalRevenue: AggregateField.sum("amount") })
      .get(),
    db.collection("questions").count().get(),
    db.collection("questions").where("published", "==", true).count().get(),
    db.collection("questions").where("academicLevel", "==", "200").count().get(),
    db.collection("questions").where("academicLevel", "==", "300").count().get(),
    db.collection("questions").where("academicLevel", "==", "400").count().get(),
    db.collectionGroup("sessions").count().get(),
    db.collection("users").orderBy("createdAt", "desc").limit(5).get(),
  ]);

  const recentSignups = recentUsersSnap.docs.map((doc) => {
    const data = doc.data();
    return {
      uid: doc.id,
      displayName: data.displayName || "",
      email: data.email || "",
      academicLevel: data.academicLevel || "",
      membershipStatus: data.membershipStatus || "",
      createdAt: data.createdAt || "",
    };
  });

  const payload = {
    students: {
      total: totalUsersSnap.data().count,
      active: activeUsersSnap.data().count,
      pendingPayment: pendingUsersSnap.data().count,
    },
    revenue: {
      minor: Number(revenueSnap.data().totalRevenue) || 0,
      currency: process.env.PAYSTACK_CURRENCY || "NGN",
    },
    questions: {
      total: totalQuestionsSnap.data().count,
      published: publishedQuestionsSnap.data().count,
      byLevel: {
        "200": q200Snap.data().count,
        "300": q300Snap.data().count,
        "400": q400Snap.data().count,
      },
    },
    exams: {
      completed: examsSnap.data().count,
    },
    recentSignups,
    generatedAt: new Date().toISOString(),
  };

  cachedOverview = payload;
  cachedAt = now;
  return payload;
}

async function handleOverview(request, response, url) {
  if (request.method !== "GET") {
    const { sendError } = require("../http-helpers");
    sendError(response, 405, "Method not allowed.");
    return true;
  }

  const bypassCache = url.searchParams.get("refresh") === "1";
  const data = await getOverviewMetrics({ bypassCache });
  sendJson(response, 200, data);
  return true;
}

module.exports = {
  getOverviewMetrics,
  handleOverview,
};
