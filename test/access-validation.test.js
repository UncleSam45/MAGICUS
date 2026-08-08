const test = require("node:test");
const assert = require("node:assert/strict");
const { ALWAYS_ON_TOP_LEVEL, enforceAlwaysOnTop, isElectronMainProcess, keepWindowOnTop, validateAccessKey } = require("../main.js");

const response = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("validates the account before its private MAGICUS_BRIDGE", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return calls.length === 1
      ? response(200, { login: "arcana" })
      : response(200, { name: "MAGICUS_BRIDGE", private: true });
  };
  const result = await validateAccessKey("secret-value", request);
  assert.deepEqual(result, { ok: true, account: "arcana", bridge: "MAGICUS_BRIDGE" });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /arcana\/MAGICUS_BRIDGE$/);
  assert.equal(calls[0].options.headers.Authorization, "Bearer secret-value");
});

test("returns sanitized messages for rejected access", async () => {
  const result = await validateAccessKey("do-not-echo", async () => response(401));
  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid");
  assert.doesNotMatch(JSON.stringify(result), /do-not-echo/);
});

test("requires the expected repository to be private", async () => {
  let call = 0;
  const result = await validateAccessKey("key", async () => {
    call += 1;
    return call === 1 ? response(200, { login: "arcana" }) : response(200, { name: "MAGICUS_BRIDGE", private: false });
  });
  assert.equal(result.code, "bridge");
});

test("validates the server selected by the connection form", async () => {
  const calls = [];
  const result = await validateAccessKey("key", async (url) => {
    calls.push(url);
    return calls.length === 1 ? response(200, { login: "arcana" }) : response(200, { name: "studio-server", private: true });
  }, "studio-server");
  assert.equal(result.ok, true);
  assert.equal(result.bridge, "studio-server");
  assert.match(calls[1], /arcana\/studio-server$/);
});

test("recognizes Electron's browser process without relying on require.main", () => {
  assert.equal(isElectronMainProcess({ versions: { electron: "37.2.4" }, type: "browser" }), true);
  assert.equal(isElectronMainProcess({ versions: { electron: "37.2.4" }, type: "renderer" }), false);
  assert.equal(isElectronMainProcess({ versions: { node: "24.0.0" } }), false);
});

test("keeps Electron windows in the floating always-on-top level", () => {
  const calls = [];
  const window = { setAlwaysOnTop: (...args) => calls.push(args) };
  assert.equal(keepWindowOnTop(window), window);
  assert.deepEqual(calls, [[true, ALWAYS_ON_TOP_LEVEL]]);
  assert.equal(ALWAYS_ON_TOP_LEVEL, "floating");
});

test("applies always-on-top to every BrowserWindow created by Electron", () => {
  let createdWindowHandler;
  const app = {
    on: (event, handler) => {
      assert.equal(event, "browser-window-created");
      createdWindowHandler = handler;
    },
  };
  const calls = [];
  const window = { setAlwaysOnTop: (...args) => calls.push(args) };

  enforceAlwaysOnTop(app);
  createdWindowHandler({}, window);

  assert.deepEqual(calls, [[true, ALWAYS_ON_TOP_LEVEL]]);
});
