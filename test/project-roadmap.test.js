const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("authenticated header offers logout beside the user identity", () => {
  const html = read("index.html");
  const renderer = read("renderer.js");
  assert.match(html, /class="user-session"[^>]*>[\s\S]*id="display-name"[\s\S]*id="logout-button"/);
  assert.match(renderer, /button\.id==='logout-button'/);
  assert.match(renderer, /browserBridge=null/);
});

test("folders are the dedicated home tab and projects have their own tab", () => {
  const html = read("index.html");
  assert.match(html, /data-view-tab="folders"/);
  assert.match(html, /data-view-tab="projects"/);
  assert.match(html, /data-tab-panel="folders"/);
  assert.match(html, /data-tab-panel="projects" hidden/);
  assert.match(html, /class="folders-hero"/);
});

test("project view manages bridge-backed roadmap milestones", () => {
  const renderer = read("renderer.js");
  assert.match(renderer, /project\.roadmap \|\|= \[\]/);
  assert.match(renderer, /function roadmapForm\(project,entry\)/);
  assert.match(renderer, /data-toggle-roadmap/);
  assert.match(renderer, /entry\.completed=!entry\.completed/);
  assert.match(renderer, /await saveWorkspace\(\);renderAlbum\(\);renderHome\(\)/);
  assert.match(renderer, /class="roadmap-layout"/);
});


test("roadmap notes are unlimited and long entries can be expanded", () => {
  const renderer = read("renderer.js");
  const styles = read("styles.css");
  assert.doesNotMatch(renderer, /textarea name="description" maxlength="240"/);
  assert.match(renderer, /class="roadmap-description-input" name="description"/);
  assert.match(renderer, /data-expand-roadmap/);
  assert.match(renderer, /aria-expanded="false"/);
  assert.match(renderer, /prepareRoadmapDescriptions\(\)/);
  assert.match(styles, /\.roadmap-description\.collapsed p/);
});
