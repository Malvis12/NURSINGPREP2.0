"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { createHmac, randomUUID, timingSafeEqual } = require("node:crypto");
const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpError } = require("./server/http-error");
const { handleAdminRoute } = require("./server/admin/routes");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY_BYTES = 64 * 1024;
const EXAM_SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const UNIVERSITY_OPTIONS = ["Wellspring University"];
const ACADEMIC_LEVELS = ["200", "300", "400"];
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/assets/nursing-prep-logo.png", ["assets/nursing-prep-logo.png", "image/png"]],
  ["/admin.html", ["admin.html", "text/html; charset=utf-8"]],
  ["/admin.js", ["admin.js", "text/javascript; charset=utf-8"]],
  ["/admin.css", ["admin.css", "text/css; charset=utf-8"]],
  ["/admin-table.js", ["admin-table.js", "text/javascript; charset=utf-8"]],
]);

let firebaseServices;

function getFirebaseServices() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    throw new HttpError(503, "Firebase is not configured. Add the project settings before using accounts.");
  }
  if (!firebaseServices) {
    const app = getApps().find((item) => item.name === "nursing-prep")
      || initializeApp({
        credential: applicationDefault(),
        projectId,
      }, "nursing-prep");
    firebaseServices = {
      auth: getAuth(app),
      db: getFirestore(app),
    };
  }
  return firebaseServices;
}

const { sendJson, sendError } = require("./server/http-helpers");

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;
    let finished = false;
    request.on("data", (chunk) => {
      if (finished) return;
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_BODY_BYTES) {
        finished = true;
        reject(new HttpError(413, "Request body is too large."));
        request.resume();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      if (!finished) resolve(Buffer.concat(chunks));
    });
    request.on("error", () => {
      if (finished) return;
      finished = true;
      reject(new HttpError(400, "Could not read the request body."));
    });
  });
}

async function readJsonBody(request) {
  const rawBody = await readRawBody(request);
  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

async function requireUser(request) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/);
  if (!match) throw new HttpError(401, "Sign in to continue.");
  const { auth } = getFirebaseServices();
  try {
    return await auth.verifyIdToken(match[1]);
  } catch {
    throw new HttpError(401, "Your sign-in has expired. Please sign in again.");
  }
}

async function getProfile(uid) {
  const { db } = getFirebaseServices();
  const snapshot = await db.collection("users").doc(uid).get();
  return snapshot.exists ? { id: uid, ...snapshot.data() } : null;
}

function publicProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    university: profile.university,
    academicLevel: profile.academicLevel,
    membershipStatus: profile.membershipStatus,
    createdAt: profile.createdAt || null,
    paidAt: profile.paidAt || null,
    accessFee: formatAccessFee(),
  };
}

function formatAccessFee() {
  const amountMinor = Number(process.env.PAYSTACK_AMOUNT_MINOR);
  const currency = process.env.PAYSTACK_CURRENCY || "NGN";
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    return "To be announced";
  }
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return "To be announced";
  }
}

function getPublicFirebaseConfig() {
  const firebaseConfig = {
    apiKey: process.env.FIREBASE_WEB_API_KEY || "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
    projectId: process.env.FIREBASE_PROJECT_ID || "",
    appId: process.env.FIREBASE_APP_ID || "",
    ...(process.env.FIREBASE_STORAGE_BUCKET
      ? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET }
      : {}),
    ...(process.env.FIREBASE_MESSAGING_SENDER_ID
      ? { messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID }
      : {}),
    ...(process.env.FIREBASE_MEASUREMENT_ID
      ? { measurementId: process.env.FIREBASE_MEASUREMENT_ID }
      : {}),
  };
  const firebaseConfigured = ["apiKey", "authDomain", "projectId", "appId"]
    .every((key) => Boolean(firebaseConfig[key]));
  return {
    firebaseConfigured,
    firebaseConfig: firebaseConfigured ? firebaseConfig : null,
    universities: UNIVERSITY_OPTIONS,
    academicLevels: ACADEMIC_LEVELS,
    accessFee: formatAccessFee(),
  };
}

function normalizeAnswer(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function getPublicQuestion(question) {
  const {
    correctIndex,
    answer,
    explanation,
    options,
    academicLevel,
    published,
    updatedAt,
    ...publicQuestion
  } = question;
  if (question.format === "multiple-choice") publicQuestion.options = options;
  return publicQuestion;
}

function scoreAnswer(question, submittedAnswer) {
  if (question.format === "written") {
    const responseText = submittedAnswer.trim();
    return {
      responseText,
      correct: Boolean(responseText) && normalizeAnswer(responseText) === normalizeAnswer(question.answer),
      correctAnswer: question.answer,
      explanation: question.explanation,
    };
  }
  return {
    selectedIndex: submittedAnswer,
    correct: submittedAnswer === question.correctIndex,
    correctAnswer: question.answer,
    explanation: question.explanation,
  };
}

function getBankMeta(questions) {
  const topics = [...new Set(questions.map((question) => question.topic))].sort();
  const topicCounts = Object.fromEntries(topics.map((topic) => {
    const byTopic = questions.filter((question) => question.topic === topic);
    return [topic, {
      total: byTopic.length,
      medium: byTopic.filter((question) => question.level === "medium").length,
      hard: byTopic.filter((question) => question.level === "hard").length,
    }];
  }));
  return {
    total: questions.length,
    levels: {
      medium: questions.filter((question) => question.level === "medium").length,
      hard: questions.filter((question) => question.level === "hard").length,
    },
    topics,
    topicCounts,
  };
}

async function getPublishedQuestions(academicLevel) {
  const { db } = getFirebaseServices();
  const snapshot = await db.collection("questions")
    .where("academicLevel", "==", academicLevel)
    .get();
  return snapshot.docs
    .map((document) => ({ id: document.id, ...document.data() }))
    .filter((question) => question.published === true);
}

async function requireActiveProfile(uid) {
  const profile = await getProfile(uid);
  if (!profile) throw new HttpError(409, "Complete your study profile before continuing.");
  if (profile.membershipStatus !== "active") {
    throw new HttpError(402, "Complete the one-time access payment to unlock your dashboard.");
  }
  return profile;
}

async function handleProfile(request, response, user) {
  const { db } = getFirebaseServices();
  const userRef = db.collection("users").doc(user.uid);
  if (request.method === "GET") {
    const snapshot = await userRef.get();
    sendJson(response, 200, { profile: snapshot.exists ? publicProfile({ id: user.uid, ...snapshot.data() }) : null });
    return;
  }
  if (request.method !== "POST") {
    sendError(response, 405, "Method not allowed.");
    return;
  }

  const payload = await readJsonBody(request);
  if (!payload || !UNIVERSITY_OPTIONS.includes(payload.university)) {
    throw new HttpError(400, "Choose a university from the available list.");
  }
  if (!ACADEMIC_LEVELS.includes(payload.academicLevel)) {
    throw new HttpError(400, "Choose an academic level from 200, 300, or 400.");
  }

  const profile = {
    email: user.email || "",
    displayName: typeof payload.fullName === "string" && payload.fullName.trim()
      ? payload.fullName.trim().slice(0, 100)
      : typeof user.name === "string"
        ? user.name.slice(0, 100)
        : "",
    university: payload.university,
    academicLevel: payload.academicLevel,
    membershipStatus: "pending_payment",
    progress: {
      sessionsCompleted: 0,
      questionsPracticed: 0,
      totalCorrect: 0,
    },
    createdAt: new Date().toISOString(),
  };
  const created = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    if (snapshot.exists) return false;
    transaction.create(userRef, profile);
    return true;
  });
  if (!created) throw new HttpError(409, "A study profile already exists for this account.");
  sendJson(response, 201, { profile: publicProfile({ id: user.uid, ...profile }) });
}

async function handleDashboard(response, user) {
  const profile = await requireActiveProfile(user.uid);
  const { db } = getFirebaseServices();
  const [questions, sessions] = await Promise.all([
    getPublishedQuestions(profile.academicLevel),
    db.collection("users").doc(user.uid).collection("sessions")
      .orderBy("completedAt", "desc").limit(5).get(),
  ]);
  const progress = profile.progress || {};
  const questionsPracticed = Number(progress.questionsPracticed) || 0;
  const totalCorrect = Number(progress.totalCorrect) || 0;
  sendJson(response, 200, {
    profile: publicProfile(profile),
    progress: {
      sessionsCompleted: Number(progress.sessionsCompleted) || 0,
      questionsPracticed,
      averageScore: questionsPracticed ? Math.round((totalCorrect / questionsPracticed) * 100) : null,
    },
    bankMeta: getBankMeta(questions),
    recentSessions: sessions.docs.map((document) => {
      const { score, total, percent, completedAt, topic, difficulty } = document.data();
      return { id: document.id, score, total, percent, completedAt, topic, difficulty };
    }),
  });
}

async function handleQuestions(requestUrl, response, user) {
  const profile = await requireActiveProfile(user.uid);
  const level = requestUrl.searchParams.get("level") || "mixed";
  const topic = requestUrl.searchParams.get("topic") || "";
  const count = Number(requestUrl.searchParams.get("count") || "50");
  if (!["mixed", "medium", "hard"].includes(level)) {
    throw new HttpError(400, "Difficulty must be mixed, medium, or hard.");
  }
  if (!Number.isInteger(count) || count < 1 || count > 300) {
    throw new HttpError(400, "Question count must be a whole number from 1 to 300.");
  }
  let matches = await getPublishedQuestions(profile.academicLevel);
  if (topic) matches = matches.filter((question) => question.topic === topic);
  if (level !== "mixed") matches = matches.filter((question) => question.level === level);
  if (matches.length === 0) {
    throw new HttpError(404, `No published questions are available for ${profile.academicLevel} level and these filters yet.`);
  }

  const examCount = Math.min(count, matches.length);
  const byFormat = {
    written: shuffle(matches.filter((question) => question.format === "written")),
    multipleChoice: shuffle(matches.filter((question) => question.format === "multiple-choice")),
  };
  const writtenCount = Math.min(Math.round(examCount * 0.7), byFormat.written.length);
  const selected = byFormat.written.slice(0, writtenCount);
  selected.push(...byFormat.multipleChoice.slice(0, examCount - selected.length));
  if (selected.length < examCount) {
    selected.push(...byFormat.written.slice(writtenCount, writtenCount + examCount - selected.length));
  }
  const questions = shuffle(selected);
  const { db } = getFirebaseServices();
  const examId = randomUUID();
  await db.collection("examSessions").doc(examId).create({
    userId: user.uid,
    academicLevel: profile.academicLevel,
    questions,
    checkedAnswers: {},
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + EXAM_SESSION_TTL_MS,
    submitted: false,
  });
  sendJson(response, 200, { examId, questions: questions.map(getPublicQuestion) });
}

function validateSubmittedAnswer(question, answer) {
  if (question.format === "written") {
    return typeof answer === "string" && answer.length <= 2000;
  }
  return Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
}

async function handleAnswerCheck(request, response, user) {
  const payload = await readJsonBody(request);
  if (!payload || typeof payload.examId !== "string" || typeof payload.questionId !== "string") {
    throw new HttpError(400, "Answer check must include an examId and questionId.");
  }
  const { db } = getFirebaseServices();
  const examRef = db.collection("examSessions").doc(payload.examId);
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(examRef);
    if (!snapshot.exists) throw new HttpError(400, "This exam session is invalid or expired.");
    const exam = snapshot.data();
    if (exam.userId !== user.uid) throw new HttpError(403, "This exam does not belong to your account.");
    if (exam.submitted || exam.expiresAt <= Date.now()) {
      throw new HttpError(400, "This exam session is invalid, expired, or already submitted.");
    }
    const question = exam.questions.find((item) => item.id === payload.questionId);
    if (!question) throw new HttpError(400, "The question does not belong to this exam.");
    const answer = payload.answer;
    if (!validateSubmittedAnswer(question, answer) || (question.format === "written" && !answer.trim())) {
      throw new HttpError(400, "Enter a valid answer before checking it.");
    }
    const previous = exam.checkedAnswers?.[question.id];
    if (previous !== undefined) {
      const sameAnswer = question.format === "written"
        ? normalizeAnswer(previous) === normalizeAnswer(answer)
        : previous === answer;
      if (!sameAnswer) throw new HttpError(409, "This answer has already been checked and cannot be changed.");
      return { ...scoreAnswer(question, previous), alreadyChecked: true };
    }
    transaction.update(examRef, { [`checkedAnswers.${question.id}`]: answer });
    return { ...scoreAnswer(question, answer), alreadyChecked: false };
  });
  sendJson(response, 200, result);
}

async function handleSubmission(request, response, user) {
  const payload = await readJsonBody(request);
  if (!payload || typeof payload.examId !== "string" || !payload.answers
    || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
    throw new HttpError(400, "Submission must include an examId and an answers object.");
  }
  const { db } = getFirebaseServices();
  const examRef = db.collection("examSessions").doc(payload.examId);
  const userRef = db.collection("users").doc(user.uid);
  const sessionRef = userRef.collection("sessions").doc(payload.examId);
  const submission = await db.runTransaction(async (transaction) => {
    const examSnapshot = await transaction.get(examRef);
    const userSnapshot = await transaction.get(userRef);
    if (!examSnapshot.exists || !userSnapshot.exists) {
      throw new HttpError(400, "This exam session or account profile is no longer available.");
    }
    const exam = examSnapshot.data();
    const profile = userSnapshot.data();
    if (exam.userId !== user.uid) throw new HttpError(403, "This exam does not belong to your account.");
    if (exam.submitted) throw new HttpError(409, "This exam has already been submitted.");
    if (exam.expiresAt <= Date.now()) throw new HttpError(400, "This exam session has expired.");
    if (profile.membershipStatus !== "active") throw new HttpError(402, "An active membership is required.");
    const questionIds = new Set(exam.questions.map((question) => question.id));
    if (Object.keys(payload.answers).some((id) => !questionIds.has(id))) {
      throw new HttpError(400, "Submission includes answers for questions outside this exam.");
    }
    for (const question of exam.questions) {
      const answer = payload.answers[question.id];
      if (answer !== undefined && !validateSubmittedAnswer(question, answer)) {
        throw new HttpError(400, `The answer for ${question.id} is invalid.`);
      }
    }

    const results = exam.questions.map((question) => {
      const answer = exam.checkedAnswers?.[question.id] ?? payload.answers[question.id];
      const hasAnswer = question.format === "written"
        ? typeof answer === "string" && Boolean(answer.trim())
        : Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
      const correct = question.format === "written"
        ? hasAnswer && normalizeAnswer(answer) === normalizeAnswer(question.answer)
        : hasAnswer && answer === question.correctIndex;
      return {
        ...getPublicQuestion(question),
        selectedIndex: hasAnswer && question.format === "multiple-choice" ? answer : null,
        responseText: hasAnswer && question.format === "written" ? answer.trim() : null,
        answered: hasAnswer,
        correctIndex: question.correctIndex,
        correctAnswer: question.answer,
        explanation: question.explanation,
        correct,
      };
    });
    const score = results.filter((result) => result.correct).length;
    const total = results.length;
    const percent = Math.round((score / total) * 100);
    const completedAt = new Date().toISOString();
    const oldProgress = profile.progress || {};
    const sessionsCompleted = (Number(oldProgress.sessionsCompleted) || 0) + 1;
    const questionsPracticed = (Number(oldProgress.questionsPracticed) || 0) + total;
    const totalCorrect = (Number(oldProgress.totalCorrect) || 0) + score;
    const progress = {
      sessionsCompleted,
      questionsPracticed,
      averageScore: Math.round((totalCorrect / questionsPracticed) * 100),
    };
    transaction.update(examRef, { submitted: true, submittedAt: completedAt });
    transaction.create(sessionRef, {
      score,
      total,
      percent,
      completedAt,
      topic: exam.questions.every((question) => question.topic === exam.questions[0].topic)
        ? exam.questions[0].topic
        : "All topics",
      difficulty: "Mixed",
      results,
    });
    transaction.update(userRef, {
      progress: { sessionsCompleted, questionsPracticed, totalCorrect },
    });
    return { examId: payload.examId, score, total, percent, completedAt, progress, results };
  });
  sendJson(response, 200, submission);
}

function getPaystackConfig() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY || "";
  const amount = Number(process.env.PAYSTACK_AMOUNT_MINOR);
  const currency = process.env.PAYSTACK_CURRENCY || "NGN";
  if (process.env.PAYSTACK_MODE !== "test" || !secretKey.startsWith("sk_test_")) {
    throw new HttpError(503, "Paystack test mode is not configured. Add a Paystack test secret key before taking payment.");
  }
  if (!Number.isSafeInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    throw new HttpError(503, "The one-time access fee has not been configured yet.");
  }
  const baseUrl = process.env.APP_BASE_URL || `http://127.0.0.1:${PORT}`;
  let callbackUrl;
  try {
    callbackUrl = new URL("/", baseUrl);
  } catch {
    throw new HttpError(503, "Set a valid APP_BASE_URL for the Paystack callback.");
  }
  if (callbackUrl.protocol !== "https:" && callbackUrl.hostname !== "127.0.0.1" && callbackUrl.hostname !== "localhost") {
    throw new HttpError(503, "APP_BASE_URL must use HTTPS outside local development.");
  }
  callbackUrl.searchParams.set("payment", "return");
  return { secretKey, amount, currency, callbackUrl: callbackUrl.toString() };
}

async function callPaystack(pathname, options = {}) {
  const { secretKey } = getPaystackConfig();
  const response = await fetch(`https://api.paystack.co${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, "Paystack returned an unreadable response. Please try again.");
  }
  if (!response.ok || payload.status !== true) {
    console.error("Paystack request failed:", response.status, payload.message || "Unknown provider error.");
    throw new HttpError(502, "Paystack could not process the request. Please try again.");
  }
  return payload.data;
}

async function handlePaymentInitialize(request, response, user) {
  if (!user.email) throw new HttpError(400, "An email address is required for payment.");
  const { db } = getFirebaseServices();
  const config = getPaystackConfig();
  const userRef = db.collection("users").doc(user.uid);
  const reference = `nursing-${user.uid.slice(0, 8)}-${randomUUID()}`;
  const paymentRef = db.collection("payments").doc(reference);
  const reservation = await db.runTransaction(async (transactionWriter) => {
    const profileSnapshot = await transactionWriter.get(userRef);
    if (!profileSnapshot.exists) throw new HttpError(409, "Complete your study profile before paying.");
    const profile = profileSnapshot.data();
    if (profile.membershipStatus === "active") throw new HttpError(409, "Your dashboard is already unlocked.");
    if (profile.pendingPaymentReference) {
      const existingPaymentRef = db.collection("payments").doc(profile.pendingPaymentReference);
      const existingSnapshot = await transactionWriter.get(existingPaymentRef);
      if (existingSnapshot.exists) {
        const existing = existingSnapshot.data();
        const isRecent = Date.now() - Date.parse(existing.createdAt) < 30 * 60 * 1000;
        if (existing.uid === user.uid && isRecent && existing.status === "pending"
          && existing.authorizationUrl) {
          return {
            authorizationUrl: existing.authorizationUrl,
            reference: profile.pendingPaymentReference,
          };
        }
        if (existing.uid === user.uid && isRecent && existing.status === "initializing") {
          throw new HttpError(409, "A checkout is already being prepared. Please retry in a few seconds.");
        }
      }
    }
    transactionWriter.create(paymentRef, {
      uid: user.uid,
      email: user.email,
      amount: config.amount,
      currency: config.currency,
      status: "initializing",
      createdAt: new Date().toISOString(),
    });
    transactionWriter.update(userRef, { pendingPaymentReference: reference });
    return { reference };
  });
  if (reservation.authorizationUrl) {
    sendJson(response, 200, reservation);
    return;
  }

  const callbackUrl = new URL(config.callbackUrl);
  try {
    const transaction = await callPaystack("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        email: user.email,
        amount: String(config.amount),
        currency: config.currency,
        reference: reservation.reference,
        callback_url: callbackUrl.toString(),
        metadata: { uid: user.uid },
      }),
    });
    if (!transaction.authorization_url || transaction.reference !== reservation.reference) {
      throw new HttpError(502, "Paystack did not return a valid checkout session.");
    }
    const checkoutUrl = new URL(transaction.authorization_url);
    if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.paystack.com") {
      throw new HttpError(502, "Paystack returned an unexpected checkout URL.");
    }
    await paymentRef.update({
      status: "pending",
      authorizationUrl: transaction.authorization_url,
    });
    sendJson(response, 200, {
      authorizationUrl: transaction.authorization_url,
      reference: reservation.reference,
    });
  } catch (error) {
    await paymentRef.update({ status: "initialization_failed" });
    throw error;
  }
}

function validatePaystackSignature(rawBody, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY || "";
  if (!secret.startsWith("sk_test_") || typeof signature !== "string") return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const actualBytes = Buffer.from(signature, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

async function verifyPaystackPayment(reference) {
  if (typeof reference !== "string" || !/^[A-Za-z0-9.=:-]{1,120}$/.test(reference)) {
    throw new HttpError(400, "A valid Paystack payment reference is required.");
  }
  const config = getPaystackConfig();
  const { db } = getFirebaseServices();
  const paymentRef = db.collection("payments").doc(reference);
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists) throw new HttpError(404, "Payment reference was not found.");
  const payment = paymentSnapshot.data();
  const userRef = db.collection("users").doc(payment.uid);
  const profile = await getProfile(payment.uid);
  if (!profile) throw new HttpError(404, "The payment account was not found.");
  if (payment.status === "success" && profile.membershipStatus === "active") {
    return publicProfile(profile);
  }

  const transaction = await callPaystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (transaction.reference !== reference) throw new HttpError(400, "The payment reference does not match.");
  if (transaction.status !== "success") {
    await paymentRef.update({ status: transaction.status || "pending" });
    throw new HttpError(409, "Payment is not complete yet. Complete checkout and try again.");
  }
  if (
    transaction.amount !== config.amount
    || transaction.amount !== payment.amount
    || transaction.currency !== config.currency
    || transaction.currency !== payment.currency
    || String(transaction.customer?.email || "").toLowerCase() !== String(payment.email || "").toLowerCase()
    || transaction.metadata?.uid !== payment.uid
  ) {
    await paymentRef.update({ status: "verification_mismatch" });
    console.error("A Paystack payment failed amount, currency, email, or user metadata verification:", reference);
    throw new HttpError(400, "Payment details did not match this order. Contact support before retrying.");
  }

  const verifiedAt = new Date().toISOString();
  await db.runTransaction(async (transactionWriter) => {
    const [latestPayment, latestProfile] = await Promise.all([
      transactionWriter.get(paymentRef),
      transactionWriter.get(userRef),
    ]);
    if (!latestPayment.exists || !latestProfile.exists) {
      throw new HttpError(404, "The payment account or record is no longer available.");
    }
    const latestPaymentData = latestPayment.data();
    const latestProfileData = latestProfile.data();
    if (latestPaymentData.uid !== payment.uid) throw new HttpError(403, "This payment belongs to another account.");
    if (latestProfileData.membershipStatus === "active"
      && latestProfileData.paymentReference !== reference) {
      transactionWriter.update(paymentRef, { status: "duplicate_success", verifiedAt });
      return false;
    }
    transactionWriter.update(paymentRef, { status: "success", verifiedAt });
    transactionWriter.update(userRef, {
      membershipStatus: "active",
      paidAt: verifiedAt,
      paymentReference: reference,
      pendingPaymentReference: FieldValue.delete(),
    });
    return true;
  });
  if (!activated) {
    throw new HttpError(409, "This account already has an active payment. Contact support if you were charged twice.");
  }
  return publicProfile(await getProfile(payment.uid));
}

async function handlePaymentVerify(request, response, user) {
  const payload = await readJsonBody(request);
  if (!payload || typeof payload.reference !== "string") {
    throw new HttpError(400, "Payment reference is required.");
  }
  const { db } = getFirebaseServices();
  const payment = await db.collection("payments").doc(payload.reference).get();
  if (!payment.exists || payment.data().uid !== user.uid) {
    throw new HttpError(404, "Payment reference was not found for this account.");
  }
  const profile = await verifyPaystackPayment(payload.reference);
  sendJson(response, 200, { profile });
}

async function handlePaystackWebhook(request, response) {
  const rawBody = await readRawBody(request);
  if (!validatePaystackSignature(rawBody, request.headers["x-paystack-signature"])) {
    throw new HttpError(401, "Webhook signature is invalid.");
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new HttpError(400, "Webhook body must be valid JSON.");
  }
  if (event.event === "charge.success" && typeof event.data?.reference === "string") {
    await verifyPaystackPayment(event.data.reference);
  }
  sendJson(response, 200, { received: true });
}

function serveStatic(pathname, response, method) {
  const file = staticFiles.get(pathname);
  if (!file) {
    sendError(response, 404, "Page not found.");
    return;
  }
  const [fileName, contentType] = file;
  const filePath = path.join(__dirname, fileName);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      console.error(`Unable to read ${fileName}:`, error.message);
      sendError(response, 500, "The requested page could not be loaded.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' https://www.gstatic.com; style-src 'self'; connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firebaseinstallations.googleapis.com https://api.paystack.co; frame-src https://*.firebaseapp.com https://checkout.paystack.com; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    });
    response.end(method === "HEAD" ? undefined : content);
  });
}

async function handleApi(request, response, requestUrl) {
  if (await handleAdminRoute(request, response, requestUrl)) {
    return;
  }
  const { pathname } = requestUrl;
  if (pathname === "/api/config" && request.method === "GET") {
    sendJson(response, 200, getPublicFirebaseConfig());
    return;
  }
  if (pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      firebaseConfigured: Boolean(process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT),
      paystackMode: process.env.PAYSTACK_MODE === "test" ? "test" : "not-configured",
    });
    return;
  }
  if (pathname === "/api/payments/webhook" && request.method === "POST") {
    await handlePaystackWebhook(request, response);
    return;
  }

  const user = await requireUser(request);
  if (pathname === "/api/profile") {
    await handleProfile(request, response, user);
    return;
  }
  if (pathname === "/api/dashboard" && request.method === "GET") {
    await handleDashboard(response, user);
    return;
  }
  if (pathname === "/api/questions" && request.method === "GET") {
    await handleQuestions(requestUrl, response, user);
    return;
  }
  if (pathname === "/api/check-answer" && request.method === "POST") {
    await handleAnswerCheck(request, response, user);
    return;
  }
  if (pathname === "/api/submit" && request.method === "POST") {
    await handleSubmission(request, response, user);
    return;
  }
  if (pathname === "/api/payments/initialize" && request.method === "POST") {
    await handlePaymentInitialize(request, response, user);
    return;
  }
  if (pathname === "/api/payments/verify" && request.method === "POST") {
    await handlePaymentVerify(request, response, user);
    return;
  }
  if (pathname.startsWith("/api/")) {
    sendError(response, 404, "API endpoint not found.");
    return;
  }
  sendError(response, 404, "Page not found.");
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${HOST}:${PORT}`);
  try {
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(request, response, requestUrl);
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendError(response, 405, "Method not allowed.");
      return;
    }
    serveStatic(requestUrl.pathname, response, request.method);
  } catch (error) {
    if (response.writableEnded) return;
    if (error instanceof HttpError) {
      sendError(response, error.statusCode, error.message);
      return;
    }
    console.error("Request processing failed:", error.message);
    sendError(response, 500, "The request could not be completed.");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Nursing Prep is running at http://${HOST}:${PORT}`);
  console.log(`Firebase ${process.env.FIREBASE_PROJECT_ID ? "project configured" : "not configured"}; Paystack mode: ${process.env.PAYSTACK_MODE === "test" ? "test" : "not configured"}.`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. The app may already be running at http://${HOST}:${PORT}.`);
  } else {
    console.error("Server failed to start:", error.message);
  }
  process.exitCode = 1;
});
