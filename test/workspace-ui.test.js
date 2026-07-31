const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("workspace form dialog keeps fields above its dismissible backdrop", () => {
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const renderer = fs.readFileSync(path.join(root, "renderer.js"), "utf8");

  assert.match(css, /\.modal-backdrop\s*\{\s*z-index:\s*0/);
  assert.match(css, /\.form-modal\s*\{\s*z-index:\s*1;\s*pointer-events:\s*auto/);
  assert.match(css, /\.form-modal input:not\(\[type="radio"\]\)[^{]*\{[^}]*user-select:\s*text/);
  assert.match(renderer, /\$\("\.modal-backdrop"\)\.addEventListener\("click", closeModal\)/);
  assert.match(renderer, /\$\("#form-modal"\)\.addEventListener\("click"/);
});

test("app form exposes editable name and URL fields", () => {
  const renderer = fs.readFileSync(path.join(root, "renderer.js"), "utf8");
  assert.match(renderer, /<input name="name" maxlength="40" required/);
  assert.match(renderer, /<input name="url" type="url" required/);
  assert.match(renderer, /firstInput\?\.focus/);
});
