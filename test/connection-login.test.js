const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("login requests only server and access key while fixing the identity", () => {
  const html = read("index.html");
  const renderer = read("renderer.js");
  const login = html.match(/<section id="login"[\s\S]*?<\/section>/)[0];

  assert.match(login, /for="server">Server/);
  assert.match(login, /for="access-key">Access Key/);
  assert.doesNotMatch(login, /Username|GitHub|fine.grained/i);
  assert.match(renderer, /FIXED_USERNAME = "unclesam45"/);
  assert.match(renderer, /display-name"\)\.textContent = FIXED_USERNAME/);
});

test("floating connection logger submits credentials and exposes autofill API", () => {
  const html = read("index.html");
  const renderer = read("renderer.js");
  const styles = read("styles.css");

  assert.match(html, /id="crowdnet-connection-logger"/);
  assert.match(html, /id="logger-form"[\s\S]*name="server"[\s\S]*name="accessKey"/);
  assert.match(renderer, /window\.crowdnetLogger = Object\.freeze/);
  assert.match(renderer, /crowdnet:logger-update/);
  assert.match(renderer, /loggerForm\.addEventListener\("submit"/);
  assert.match(renderer, /logger\.classList\.add\("connected"\)/);
  assert.match(styles, /#crowdnet-connection-logger\.connected/);
  assert.match(styles, /@keyframes loggerDepart/);
});

