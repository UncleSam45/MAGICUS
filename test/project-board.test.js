const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("production home exposes timelines, searchable tray, and album", () => {
  const html = read("index.html");
  assert.match(html, /id="project-timelines"/);
  assert.match(html, /id="tray-search" type="search"/);
  assert.match(html, /data-tray-filter="unassigned"/);
  assert.match(html, /id="project-album"/);
});

test("project assignments use shared asset IDs and update activity", () => {
  const renderer = read("renderer.js");
  assert.match(renderer, /if\(!project\.assetIds\.includes\(assetId\)\) project\.assetIds\.push\(assetId\)/);
  assert.match(renderer, /project\.assetIds=project\.assetIds\.filter\(id=>id!==asset\.id\)/);
  assert.match(renderer, /project\.updatedAt=new Date\(\)\.toISOString\(\)/);
  assert.match(renderer, /workspace\.projects\.splice\(to, 0, workspace\.projects\.splice\(from, 1\)\[0\]\)/);
});

test("desktop workspace persistence retains versioned project sync data", () => {
  const main = read("main.js");
  assert.match(main, /version: 4/);
  assert.match(main, /projects: Array\.isArray\(workspace\?\.projects\)/);
  assert.match(main, /provider: "MAGICUS_BRIDGE"/);
});
