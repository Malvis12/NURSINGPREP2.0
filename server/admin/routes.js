"use strict";

const { HttpError } = require("../http-error");
const { requireAdmin } = require("./guard");

// Reusable JSON responder matching the response conventions of server.js.
function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

// Dispatches /api/admin/* requests through admin authentication guards.
async function handleAdminRoute(request, response, url) {
  const pathname = typeof url === "string" ? new URL(url, "http://127.0.0.1").pathname : url.pathname;
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
  sendJson,
  sendError,
};
