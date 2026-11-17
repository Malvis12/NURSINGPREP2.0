"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DIRS_TO_CHECK = ["admin", "server", "scripts", "tests", "data"];
const INDIVIDUAL_FILES = ["server.js", "app.js"];

function collectJsFiles(dirPath) {
  let results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      results.push(fullPath);
    }
  }
  return results;
}

let allFiles = [...INDIVIDUAL_FILES.map((f) => path.join(ROOT, f))];
for (const dir of DIRS_TO_CHECK) {
  allFiles = allFiles.concat(collectJsFiles(path.join(ROOT, dir)));
}

let hasError = false;
for (const file of allFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
  } catch {
    hasError = true;
    console.error(`Syntax check failed on: ${path.relative(ROOT, file)}`);
  }
}

if (hasError) {
  process.exit(1);
}
