"use strict";

const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { questions } = require("../data/questions");

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  throw new Error("Set FIREBASE_PROJECT_ID before seeding the question bank.");
}

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
  });
}

async function seedQuestionBank() {
  const db = getFirestore();
  for (let offset = 0; offset < questions.length; offset += 400) {
    const batch = db.batch();
    const chunk = questions.slice(offset, offset + 400);
    for (const question of chunk) {
      batch.set(db.collection("questions").doc(question.id), {
        ...question,
        academicLevel: "300",
        published: true,
        updatedAt: new Date(),
      });
    }
    await batch.commit();
    console.log(`Seeded ${Math.min(offset + chunk.length, questions.length)} of ${questions.length} questions.`);
  }
}

seedQuestionBank().catch((error) => {
  console.error("Could not seed Firestore questions:", error.message);
  process.exitCode = 1;
});
