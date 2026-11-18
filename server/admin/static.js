"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { sendError } = require("../shared/http-helpers");

const ADMIN_ROOT = path.resolve(__dirname, "../../admin");

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

// Serves static assets for the administrative dashboard from the admin UI directory.
function serveAdminStatic(pathname, response, method) {
  // Normalize /admin request to trailing-slash format
  if (pathname === "/admin") {
    response.writeHead(301, { Location: "/admin/" });
    response.end();
    return true;
  }

  if (!pathname.startsWith("/admin/")) {
    return false;
  }

  // Reject path traversal patterns, backslashes, or null bytes immediately
  if (pathname.includes("..") || pathname.includes("\\") || pathname.includes("\0")) {
    sendError(response, 404, "Page not found.");
    return true;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(response, 404, "Page not found.");
    return true;
  }

  if (decodedPath.includes("..") || decodedPath.includes("\\") || decodedPath.includes("\0")) {
    sendError(response, 404, "Page not found.");
    return true;
  }

  let relativePath = decodedPath.slice("/admin/".length);
  if (!relativePath || relativePath === "/") {
    relativePath = "index.html";
  }

  const filePath = path.resolve(ADMIN_ROOT, relativePath);

  // Guard against traversal outside the admin root directory
  if (!filePath.startsWith(ADMIN_ROOT + path.sep) && filePath !== ADMIN_ROOT) {
    sendError(response, 404, "Page not found.");
    return true;
  }

  // Enforce whitelist of allowed static file extensions
  const ext = path.extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES.get(ext);
  if (!contentType) {
    sendError(response, 404, "Page not found.");
    return true;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT" || error.code === "EISDIR") {
        sendError(response, 404, "Page not found.");
      } else {
        console.error(`Unable to read admin static file ${relativePath}:`, error.message);
        sendError(response, 500, "The requested page could not be loaded.");
      }
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

  return true;
}

module.exports = {
  serveAdminStatic,
};
