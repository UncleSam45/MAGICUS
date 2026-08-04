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

test("folder rail supports persistent drag reordering", () => {
  const renderer = fs.readFileSync(path.join(root, "renderer.js"), "utf8");
  assert.match(renderer, /data-folder="\$\{folder\.id\}" draggable="true"/);
  assert.match(renderer, /addEventListener\("dragstart"/);
  assert.match(renderer, /addEventListener\("dragover"/);
  assert.match(renderer, /addEventListener\("drop"/);
  assert.match(renderer, /workspace\.folders\.splice/);
  assert.match(renderer, /await saveWorkspace\(\);renderFolders\(\)/);
});

test("remembered access uses the controlled desktop bridge", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const preload = fs.readFileSync(path.join(root, "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "main.js"), "utf8");
  assert.match(html, /id="remember-access" type="checkbox"/);
  assert.match(preload, /loadRememberedAccess/);
  assert.match(preload, /rememberAccess/);
  assert.match(preload, /forgetAccess/);
  assert.match(main, /safeStorage\.encryptString/);
  assert.match(main, /safeStorage\.decryptString/);
});
