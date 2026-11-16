"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { questions } = require("../data/questions");

test("question bank contains 300 questions split evenly by difficulty", () => {
  assert.equal(questions.length, 300);
  assert.equal(questions.filter((question) => question.level === "medium").length, 150);
  assert.equal(questions.filter((question) => question.level === "hard").length, 150);
  assert.equal(questions.filter((question) => question.format === "written").length, 210);
  assert.equal(questions.filter((question) => question.format === "multiple-choice").length, 90);
  assert.equal(questions.filter((question) => question.level === "medium" && question.format === "written").length, 105);
  assert.equal(questions.filter((question) => question.level === "hard" && question.format === "written").length, 105);
});

test("every question has a unique ID and a valid answer format", () => {
  const ids = new Set();
  for (const question of questions) {
    assert.equal(ids.has(question.id), false, `duplicate question ID: ${question.id}`);
    ids.add(question.id);
    if (question.format === "multiple-choice") {
      assert.equal(question.options.length, 4, `${question.id} should have four options`);
      assert.equal(new Set(question.options).size, 4, `${question.id} should have distinct options`);
      assert.ok(question.correctIndex >= 0 && question.correctIndex < question.options.length);
    } else {
      assert.equal(question.format, "written");
      assert.equal(question.options, undefined, `${question.id} should not have answer choices`);
      assert.ok(question.correctIndex >= 0);
    }
    assert.ok(question.answer.length > 0, `${question.id} should have a reference answer`);
    assert.ok(question.stem.length > 10);
    assert.ok(question.explanation.length > 10);
    assert.ok(question.source.endsWith(".docx") || question.source.endsWith(".DOC"));
  }
});

test("each study fact supplies one medium item and one hard item", () => {
  const pairs = new Map();
  for (const question of questions) {
    const factId = question.id.slice(0, 3);
    const levels = pairs.get(factId) || new Set();
    levels.add(question.level);
    pairs.set(factId, levels);
  }
  assert.equal(pairs.size, 150);
  for (const levels of pairs.values()) {
    assert.deepEqual([...levels].sort(), ["hard", "medium"]);
  }
});
