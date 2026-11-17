"use strict";

const { HttpError } = require("../http-error");
const { sendJson, sendError } = require("../http-helpers");
const { requireAdmin } = require("./guard");
const { handleOverview } = require("./overview");

// Dispatches /api/admin/* requests through admin authentication guards.
async function handleAdminRoute(request, response, url) {
  const requestUrl = typeof url === "string" ? new URL(url, "http://127.0.0.1") : url;
  const { pathname } = requestUrl;

  if (!pathname.startsWith("/api/admin/")) {
    return false;
  }

  try {
    const adminUser = await requireAdmin(request);

    if (pathname === "/api/admin/me") {
      if (request.method !== "GET") {
        sendError(response, 405, "Method not allowed.");
        return true;
      }
      sendJson(response, 200, {
        admin: true,
        uid: adminUser.uid,
        email: adminUser.email || "",
      });
      return true;
    }

    if (pathname === "/api/admin/overview") {
      return await handleOverview(request, response, requestUrl);
    }

    sendError(response, 404, "Not found.");
    return true;
  } catch (error) {
    if (error instanceof HttpError) {
      sendError(response, error.statusCode, error.message);
      return true;
    }
    // Re-throw unexpected exceptions to let central server error handling log them.
    throw error;
  }
}

module.exports = {
  handleAdminRoute,
};
