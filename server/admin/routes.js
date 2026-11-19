"use strict";

const { HttpError } = require("../shared/http-error");
const { sendJson, sendError } = require("../shared/http-helpers");
const { requireAdmin } = require("./guard");
const { handleOverview } = require("./handlers/overview");
const { handleStudentsList, handleStudentDetail } = require("./handlers/students");
const { handleActivateStudent } = require("./handlers/student-actions");

// Dispatches /api/admin/* requests through admin authentication guards to handlers.
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

    if (pathname === "/api/admin/students") {
      if (request.method !== "GET") {
        sendError(response, 405, "Method not allowed.");
        return true;
      }
      return await handleStudentsList(request, response, requestUrl);
    }

    const activateMatch = pathname.match(/^\/api\/admin\/students\/([^/]+)\/activate$/);
    if (activateMatch) {
      if (request.method !== "POST") {
        sendError(response, 405, "Method not allowed.");
        return true;
      }
      return await handleActivateStudent(request, response, activateMatch[1], adminUser);
    }

    if (pathname.startsWith("/api/admin/students/")) {
      if (request.method !== "GET") {
        sendError(response, 405, "Method not allowed.");
        return true;
      }
      const uid = pathname.slice("/api/admin/students/".length);
      return await handleStudentDetail(request, response, uid);
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
