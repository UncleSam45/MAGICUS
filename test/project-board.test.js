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

test("the production home still exposes and manages saved folders and apps", () => {
  const html = read("index.html");
  const renderer = read("renderer.js");
  assert.match(html, /id="workspace-folders"/);
  assert.match(html, /id="home-folder-list"/);
  assert.match(html, /id="home-folder-panel"/);
  assert.ok(
    html.indexOf('id="workspace-folders"') < html.indexOf('id="project-timelines"'),
    "folders appear above project timelines"
  );
  assert.match(renderer, /function renderFolders\(\)/);
  assert.match(renderer, /function folderForm\(folder\)/);
  assert.match(renderer, /function appForm\(folder,app\)/);
  assert.match(renderer, /window\.magicus\.launchApp\(app\)/);
  assert.match(renderer, /workspace\.folders\.splice\(to,0,workspace\.folders\.splice\(from,1\)\[0\]\)/);
});

test("project assignments use shared asset IDs and update activity", () => {
  const renderer = read("renderer.js");
  assert.match(renderer, /if\(!project\.assetIds\.includes\(assetId\)\) project\.assetIds\.push\(assetId\)/);
  assert.match(renderer, /project\.assetIds=project\.assetIds\.filter\(id=>id!==asset\.id\)/);
  assert.match(renderer, /project\.updatedAt=new Date\(\)\.toISOString\(\)/);
  assert.match(renderer, /workspace\.projects\.splice\(to, 0, workspace\.projects\.splice\(from, 1\)\[0\]\)/);
});

test("asset drops use a stable payload and do not flicker across timeline children", () => {
  const renderer = read("renderer.js");
  assert.match(renderer, /setData\("text\/plain",draggedAssetId\)/);
  assert.match(renderer, /!timeline\.contains\(event\.relatedTarget\)/);
  assert.match(renderer, /event\.stopImmediatePropagation\(\)/);
  assert.match(renderer, /data-reorder-project=/);
  assert.doesNotMatch(renderer, /class="project-timeline"[^>]+draggable="true"/);
});

test("desktop workspace persistence retains versioned project sync data", () => {
  const main = read("main.js");
  assert.match(main, /version: 4/);
  assert.match(main, /projects: Array\.isArray\(workspace\?\.projects\)/);
  assert.match(main, /provider: "MAGICUS_BRIDGE"/);
});

test("desktop close hides to a tray with an explicit quit action", () => {
  const main = read("main.js");
  assert.match(main, /new Tray\(/);
  assert.match(main, /label: "Open MAGICUS"/);
  assert.match(main, /label: "Quit MAGICUS"/);
  assert.match(main, /mainWindow\.on\("close", \(event\)/);
  assert.match(main, /event\.preventDefault\(\);\s*mainWindow\.hide\(\)/);
  assert.match(main, /app\.on\("before-quit", \(\) => \{ isQuitting = true/);
});
