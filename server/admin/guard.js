"use strict";

const { getAdminAuth } = require("./firebase");
const { HttpError } = require("../shared/http-error");

// Verifies Bearer token from request headers, with optional token revocation checking.
async function requireUser(request, { checkRevoked = false } = {}) {
  const authorization = request.headers.authorization || "";
  const match = authorization.match(/^Bearer ([\w-]+\.[\w-]+\.[\w-]+)$/);
  if (!match) throw new HttpError(401, "Sign in to continue.");
  const auth = getAdminAuth();
  try {
    return await auth.verifyIdToken(match[1], checkRevoked);
  } catch (error) {
    if (error.code === "auth/id-token-revoked") {
      throw new HttpError(401, "Your session has been revoked. Please sign in again.");
    }
    throw new HttpError(401, "Your sign-in has expired. Please sign in again.");
  }
}

// Strictly asserts that the decoded token carries the admin custom claim.
function assertAdminClaims(decodedToken) {
  if (!decodedToken || decodedToken.admin !== true) {
    throw new HttpError(403, "Administrator access required.");
  }
  return decodedToken;
}

// Composes user authentication with revoked token check and admin privilege assertion.
async function requireAdmin(request) {
  const decodedToken = await requireUser(request, { checkRevoked: true });
  assertAdminClaims(decodedToken);
  return decodedToken;
}

module.exports = {
  assertAdminClaims,
  requireAdmin,
  requireUser,
};
