"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertAdminClaims } = require("../server/admin/guard");
const { HttpError } = require("../server/http-error");

test("assertAdminClaims passes when admin is true", () => {
  const token = { admin: true, uid: "test-admin-uid", email: "admin@example.com" };
  const result = assertAdminClaims(token);
  assert.equal(result, token);
});

test("assertAdminClaims throws 403 for missing or false admin claim", () => {
  const invalidClaims = [
    {},
    { admin: false },
    { admin: "true" },
    { admin: 1 },
    { admin: null },
    null,
    undefined,
  ];

  for (const claims of invalidClaims) {
    assert.throws(
      () => assertAdminClaims(claims),
      (error) => {
        assert.ok(error instanceof HttpError || error.statusCode === 403);
        assert.equal(error.statusCode, 403);
        assert.equal(error.message, "Administrator access required.");
        return true;
      },
      `Expected 403 error for claims: ${JSON.stringify(claims)}`
    );
  }
});
