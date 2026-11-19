"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseListQuery, validateUid } = require("../../server/admin/handlers/students");
const { HttpError } = require("../../server/shared/http-error");

test("parseListQuery applies defaults for empty parameters", () => {
  const parsed = parseListQuery(new URLSearchParams());
  assert.deepEqual(parsed, {
    status: null,
    level: null,
    q: "",
    limit: 20,
    cursor: null,
  });
});

test("parseListQuery clamps limit parameter correctly (0, 1, 50, 51, abc)", () => {
  assert.equal(parseListQuery(new URLSearchParams("limit=0")).limit, 1);
  assert.equal(parseListQuery(new URLSearchParams("limit=1")).limit, 1);
  assert.equal(parseListQuery(new URLSearchParams("limit=50")).limit, 50);
  assert.equal(parseListQuery(new URLSearchParams("limit=51")).limit, 50);
  assert.equal(parseListQuery(new URLSearchParams("limit=abc")).limit, 20);
  assert.equal(parseListQuery(new URLSearchParams("limit=-10")).limit, 1);
  assert.equal(parseListQuery(new URLSearchParams("limit=999")).limit, 50);
});

test("parseListQuery ignores unwhitelisted status and academic level values", () => {
  const invalidStatus = parseListQuery(new URLSearchParams("status=suspended&level=500"));
  assert.equal(invalidStatus.status, null);
  assert.equal(invalidStatus.level, null);

  const validStatus = parseListQuery(new URLSearchParams("status=active&level=300"));
  assert.equal(validStatus.status, "active");
  assert.equal(validStatus.level, "300");

  const pendingStatus = parseListQuery(new URLSearchParams("status=pending_payment&level=200"));
  assert.equal(pendingStatus.status, "pending_payment");
  assert.equal(pendingStatus.level, "200");

  const level400 = parseListQuery(new URLSearchParams("level=400"));
  assert.equal(level400.level, "400");
});

test("parseListQuery normalizes q by lowercasing, trimming, and truncating to 100 characters", () => {
  const untrimmed = parseListQuery(new URLSearchParams("q=%20%20Test.Student@Example.COM%20%20"));
  assert.equal(untrimmed.q, "test.student@example.com");

  const longQuery = "a".repeat(150);
  const truncated = parseListQuery(new URLSearchParams(`q=${longQuery}`));
  assert.equal(truncated.q.length, 100);
  assert.equal(truncated.q, "a".repeat(100));
});

test("parseListQuery validates cursor format and rejects malformed values with 400", () => {
  const valid = parseListQuery(new URLSearchParams("cursor=user123ABCxyz"));
  assert.equal(valid.cursor, "user123ABCxyz");

  assert.throws(
    () => parseListQuery(new URLSearchParams("cursor=invalid/slash")),
    (err) => err instanceof HttpError && err.statusCode === 400
  );

  assert.throws(
    () => parseListQuery(new URLSearchParams("cursor=has%20spaces")),
    (err) => err instanceof HttpError && err.statusCode === 400
  );

  assert.throws(
    () => parseListQuery(new URLSearchParams("cursor=bad$character!")),
    (err) => err instanceof HttpError && err.statusCode === 400
  );

  const tooLongCursor = "a".repeat(129);
  assert.throws(
    () => parseListQuery(new URLSearchParams(`cursor=${tooLongCursor}`)),
    (err) => err instanceof HttpError && err.statusCode === 400
  );
});

test("parseListQuery ignores unknown query parameters", () => {
  const result = parseListQuery(new URLSearchParams("unknownParam=foo&extra=bar&status=active"));
  assert.equal(result.status, "active");
  assert.equal(result.unknownParam, undefined);
  assert.equal(result.extra, undefined);
});

test("validateUid enforces valid UID pattern and rejects malformed identifiers", () => {
  assert.equal(validateUid("ValidUid123"), "ValidUid123");
  assert.equal(validateUid("a".repeat(128)), "a".repeat(128));

  assert.throws(() => validateUid(""), (err) => err instanceof HttpError && err.statusCode === 400);
  assert.throws(() => validateUid("uid with space"), (err) => err instanceof HttpError && err.statusCode === 400);
  assert.throws(() => validateUid("uid/with/slashes"), (err) => err instanceof HttpError && err.statusCode === 400);
  assert.throws(() => validateUid("uid*special"), (err) => err instanceof HttpError && err.statusCode === 400);
  assert.throws(() => validateUid("a".repeat(129)), (err) => err instanceof HttpError && err.statusCode === 400);
  assert.throws(() => validateUid(null), (err) => err instanceof HttpError && err.statusCode === 400);
  assert.throws(() => validateUid(12345), (err) => err instanceof HttpError && err.statusCode === 400);
});
