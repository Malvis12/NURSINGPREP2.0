"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateUid,
  validateActivateBody,
  activateStudentMembership,
} = require("../../server/admin/handlers/student-actions");
const { assertAdminClaims } = require("../../server/admin/guard");
const { HttpError } = require("../../server/shared/http-error");

function createMockDb({
  userExists = true,
  userData = { membershipStatus: "pending_payment" },
} = {}) {
  let userUpdated = null;
  let auditCreated = null;

  return {
    collection(name) {
      if (name === "users") {
        return {
          doc(uid) {
            return { id: uid, path: `users/${uid}` };
          },
        };
      }
      if (name === "adminAuditLog") {
        return {
          doc() {
            return { id: "mock-audit-id", path: "adminAuditLog/mock-audit-id" };
          },
        };
      }
      throw new Error(`Unexpected collection: ${name}`);
    },
    async runTransaction(updateFn) {
      const transaction = {
        async get(ref) {
          return {
            exists: userExists,
            data: () => userData,
          };
        },
        update(ref, data) {
          userUpdated = { ref, data };
        },
        set(ref, data) {
          auditCreated = { ref, data };
        },
      };
      return await updateFn(transaction);
    },
    getCaptured: () => ({ userUpdated, auditCreated }),
  };
}

const mockAdmin = {
  uid: "admin-uid-123",
  email: "admin@wellspring.edu.ng",
  admin: true,
};

test("non-admin token throws 403 administrator access required", () => {
  assert.throws(
    () => assertAdminClaims({ uid: "regular-user", admin: false }),
    (err) => err instanceof HttpError && err.statusCode === 403
  );
  assert.throws(
    () => assertAdminClaims({ uid: "regular-user" }),
    (err) => err instanceof HttpError && err.statusCode === 403
  );
});

test("validateActivateBody rejects short reason (< 5 chars) with 400", () => {
  assert.throws(
    () => validateActivateBody({ reason: "abc" }),
    (err) => err instanceof HttpError && err.statusCode === 400
  );
  assert.throws(
    () => validateActivateBody({ reason: "   " }),
    (err) => err instanceof HttpError && err.statusCode === 400
  );
  assert.throws(
    () => validateActivateBody({}),
    (err) => err instanceof HttpError && err.statusCode === 400
  );
});

test("validateActivateBody rejects unknown fields with 400", () => {
  assert.throws(
    () => validateActivateBody({ reason: "Valid reason here", extraField: "not allowed" }),
    (err) => err instanceof HttpError && err.statusCode === 400
  );
  assert.throws(
    () => validateActivateBody({ reason: "Valid reason here", paidAt: "2026-01-01" }),
    (err) => err instanceof HttpError && err.statusCode === 400
  );
});

test("validateActivateBody rejects long reason (> 300 chars) with 400", () => {
  const longReason = "a".repeat(301);
  assert.throws(
    () => validateActivateBody({ reason: longReason }),
    (err) => err instanceof HttpError && err.statusCode === 400
  );
});

test("validateActivateBody accepts valid reason and trims whitespace", () => {
  const result = validateActivateBody({ reason: "  Payment verified via bank wire transfer  " });
  assert.equal(result, "Payment verified via bank wire transfer");
});

test("activateStudentMembership throws 404 if uid does not exist in users", async () => {
  const mockDb = createMockDb({ userExists: false });
  await assert.rejects(
    () => activateStudentMembership("missingUid123", "Payment verified by bursar", mockAdmin, mockDb),
    (err) => err instanceof HttpError && err.statusCode === 404
  );
});

test("activateStudentMembership throws 409 if membershipStatus is already active", async () => {
  const mockDb = createMockDb({
    userExists: true,
    userData: { membershipStatus: "active", academicLevel: "300" },
  });

  await assert.rejects(
    () => activateStudentMembership("activeUid123", "Payment verified by bursar", mockAdmin, mockDb),
    (err) => err instanceof HttpError && err.statusCode === 409
  );

  const { userUpdated, auditCreated } = mockDb.getCaptured();
  assert.equal(userUpdated, null);
  assert.equal(auditCreated, null);
});

test("activateStudentMembership atomically writes user update and audit entry on success", async () => {
  const mockDb = createMockDb({
    userExists: true,
    userData: { membershipStatus: "pending_payment", academicLevel: "200" },
  });

  const result = await activateStudentMembership(
    "studentUid456",
    "Cash payment submitted at faculty office",
    mockAdmin,
    mockDb
  );

  assert.equal(result.success, true);
  assert.equal(result.membershipStatus, "active");

  const { userUpdated, auditCreated } = mockDb.getCaptured();
  assert.ok(userUpdated, "Expected user update in transaction");
  assert.ok(auditCreated, "Expected audit log creation in transaction");

  assert.equal(userUpdated.ref.id, "studentUid456");
  assert.equal(userUpdated.data.membershipStatus, "active");
  assert.equal(userUpdated.data.activationSource, "manual");
  assert.equal(userUpdated.data.activatedBy, "admin-uid-123");
  assert.ok(userUpdated.data.activatedAt);
  assert.equal(userUpdated.data.paidAt, undefined);
  assert.equal(userUpdated.data.paymentReference, undefined);

  assert.equal(auditCreated.data.action, "activate_membership");
  assert.equal(auditCreated.data.targetUid, "studentUid456");
  assert.equal(auditCreated.data.adminUid, "admin-uid-123");
  assert.equal(auditCreated.data.adminEmail, "admin@wellspring.edu.ng");
  assert.equal(auditCreated.data.reason, "Cash payment submitted at faculty office");
  assert.equal(auditCreated.data.previousStatus, "pending_payment");
  assert.equal(auditCreated.data.newStatus, "active");
  assert.ok(auditCreated.data.createdAt);
});
