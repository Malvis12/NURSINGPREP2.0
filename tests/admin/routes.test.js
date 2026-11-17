"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { handleAdminRoute } = require("../../server/admin/routes");
const { serveAdminStatic } = require("../../server/admin/static");

function createMockResponse() {
  let statusCode = 200;
  let headers = {};
  let body = "";
  return {
    writeHead(code, hdrs) {
      statusCode = code;
      headers = { ...headers, ...hdrs };
    },
    end(data) {
      body = data;
    },
    getStatus: () => statusCode,
    getHeaders: () => headers,
    getBody: () => (body ? JSON.parse(body) : null),
  };
}

function invokeServeAdminStatic(pathname, method = "GET") {
  return new Promise((resolve) => {
    let statusCode = 200;
    let headers = {};
    let body = "";
    const res = {
      writeHead(code, hdrs) {
        statusCode = code;
        headers = { ...headers, ...hdrs };
      },
      end(data) {
        body = data;
        resolve({ statusCode, headers, body, handled: true });
      },
    };
    const handled = serveAdminStatic(pathname, res, method);
    if (!handled) {
      resolve({ statusCode: null, headers: null, body: null, handled: false });
    }
  });
}

test("handleAdminRoute returns false for non-admin paths without auth checks", async () => {
  const nonAdminPaths = [
    "/",
    "/index.html",
    "/styles.css",
    "/admin",
    "/admin/",
    "/admin/index.html",
    "/api/config",
    "/api/health",
    "/api/profile",
    "/api/questions",
    "/api/submit",
  ];

  for (const path of nonAdminPaths) {
    const handled = await handleAdminRoute({}, {}, new URL(path, "http://127.0.0.1"));
    assert.equal(handled, false, `Expected false for path: ${path}`);
  }
});

test("handleAdminRoute intercepts /api/admin/* and rejects missing credentials with 401", async () => {
  const req = { headers: {} };
  const res = createMockResponse();

  const handled = await handleAdminRoute(req, res, new URL("/api/admin/overview", "http://127.0.0.1"));
  assert.equal(handled, true);
  assert.equal(res.getStatus(), 401);
  assert.deepEqual(res.getBody(), { error: "Sign in to continue." });
});

test("serveAdminStatic serves allowed static files with correct content types", async () => {
  const htmlResult = await invokeServeAdminStatic("/admin/index.html");
  assert.equal(htmlResult.handled, true);
  assert.equal(htmlResult.statusCode, 200);
  assert.equal(htmlResult.headers["Content-Type"], "text/html; charset=utf-8");

  const cssResult = await invokeServeAdminStatic("/admin/css/base.css");
  assert.equal(cssResult.handled, true);
  assert.equal(cssResult.statusCode, 200);
  assert.equal(cssResult.headers["Content-Type"], "text/css; charset=utf-8");

  const jsResult = await invokeServeAdminStatic("/admin/js/main.js");
  assert.equal(jsResult.handled, true);
  assert.equal(jsResult.statusCode, 200);
  assert.equal(jsResult.headers["Content-Type"], "text/javascript; charset=utf-8");
});

test("serveAdminStatic blocks directory traversal with 404", async () => {
  const dotdotResult = await invokeServeAdminStatic("/admin/../server.js");
  assert.equal(dotdotResult.handled, true);
  assert.equal(dotdotResult.statusCode, 404);

  const encodedResult = await invokeServeAdminStatic("/admin/%2e%2e/server.js");
  assert.equal(encodedResult.handled, true);
  assert.equal(encodedResult.statusCode, 404);
});

test("serveAdminStatic rejects disallowed extensions with 404", async () => {
  const jsonResult = await invokeServeAdminStatic("/admin/package.json");
  assert.equal(jsonResult.handled, true);
  assert.equal(jsonResult.statusCode, 404);

  const txtResult = await invokeServeAdminStatic("/admin/secret.txt");
  assert.equal(txtResult.handled, true);
  assert.equal(txtResult.statusCode, 404);
});
