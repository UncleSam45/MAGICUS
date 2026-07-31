const test = require("node:test");
const assert = require("node:assert/strict");

const { BRIDGE_WORKSPACE_PATH, mergeWorkspace, readBridgeWorkspace, workspacePayload, writeBridgeWorkspace } = require("../main");

const response = (status, body = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

test("reads the shared workspace file from the private bridge", async () => {
  const stored = { folders: [{ id: "folder-1" }], projects: [{ id: "project-1" }] };
  let requested;
  const result = await readBridgeWorkspace(
    { account: "arcana", accessKey: "secret" },
    async (url, options) => {
      requested = { url, options };
      return response(200, { sha: "abc123", content: Buffer.from(JSON.stringify(stored)).toString("base64") });
    },
  );

  assert.match(requested.url, new RegExp(`${BRIDGE_WORKSPACE_PATH.replace(".", "\\.")}$`));
  assert.equal(requested.options.headers.Authorization, "Bearer secret");
  assert.equal(result.sha, "abc123");
  assert.deepEqual(result.workspace.folders, stored.folders);
  assert.deepEqual(result.workspace.projects, stored.projects);
  assert.equal(result.workspace.sync.status, "synced");
});

test("writes workspace data with the current GitHub content sha", async () => {
  let request;
  await writeBridgeWorkspace(
    { account: "arcana", accessKey: "secret" },
    { folders: [{ id: "folder-1" }], projects: [] },
    async (url, options) => { request = { url, options }; return response(200); },
    "old-sha",
  );

  const body = JSON.parse(request.options.body);
  const stored = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
  assert.equal(request.options.method, "PUT");
  assert.equal(body.sha, "old-sha");
  assert.deepEqual(stored.folders, [{ id: "folder-1" }]);
  assert.equal(stored.assets, undefined);
});

test("workspace payload deliberately excludes the local asset vault", () => {
  const safe = workspacePayload({ folders: [], projects: [], assets: [{ id: "local-only" }] });
  assert.equal(safe.assets, undefined);
  assert.equal(safe.sync.provider, "MAGICUS_BRIDGE");
});

test("treats an empty bridge workspace as uninitialized", async () => {
  const result = await readBridgeWorkspace(
    { account: "arcana", accessKey: "secret" },
    async () => response(200, { sha: "empty-sha", size: 0, content: "" }),
  );
  assert.deepEqual(result, { workspace: null, sha: "empty-sha" });
});

test("downloads GitHub's raw representation when base64 content is omitted", async () => {
  let calls = 0;
  const result = await readBridgeWorkspace(
    { account: "arcana", accessKey: "secret" },
    async (_url, options) => {
      calls += 1;
      if (calls === 1) return response(200, { sha: "large-sha", size: 1_100_000 });
      assert.equal(options.headers.Accept, "application/vnd.github.raw+json");
      return { ...response(200), text: async () => JSON.stringify({ folders: [{ id: "large" }], projects: [] }) };
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(result.workspace.folders, [{ id: "large" }]);
});

test("merges existing local data into an empty bridge instead of erasing it", () => {
  const local = {
    folders: [{ id: "local-folder", name: "Local", apps: [{ id: "local-app" }] }],
    projects: [{ id: "local-project", name: "Recovered" }],
    sync: { updatedAt: "2025-01-01T00:00:00.000Z" },
  };
  const remote = { folders: [], projects: [], sync: { updatedAt: "2026-01-01T00:00:00.000Z" } };
  const merged = mergeWorkspace(local, remote);
  assert.deepEqual(merged.folders.map(item => item.id), ["local-folder"]);
  assert.deepEqual(merged.projects.map(item => item.id), ["local-project"]);
});

test("restores records from both clients and prefers the newer copy on collisions", () => {
  const local = {
    folders: [{ id: "shared", name: "Old", apps: [{ id: "local-app" }] }],
    projects: [{ id: "local-project" }],
    sync: { updatedAt: "2025-01-01T00:00:00.000Z" },
  };
  const remote = {
    folders: [{ id: "shared", name: "New", apps: [{ id: "remote-app" }] }],
    projects: [{ id: "remote-project" }],
    sync: { updatedAt: "2026-01-01T00:00:00.000Z" },
  };
  const merged = mergeWorkspace(local, remote);
  assert.equal(merged.folders[0].name, "New");
  assert.deepEqual(merged.folders[0].apps.map(item => item.id), ["remote-app", "local-app"]);
  assert.deepEqual(merged.projects.map(item => item.id), ["remote-project", "local-project"]);
});

test("retries an empty successful metadata response with cache disabled", async () => {
  let calls = 0;
  const result = await readBridgeWorkspace(
    { account: "arcana", accessKey: "secret" },
    async (_url, options) => {
      calls += 1;
      assert.equal(options.cache, "no-store");
      assert.equal(options.headers["Cache-Control"], "no-cache");
      if (calls === 1) return { ...response(200), json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } };
      return response(200, { sha: "recovered", content: Buffer.from('{"folders":[],"projects":[]}').toString("base64") });
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.sha, "recovered");
});

test("replaces repeated JSON parser failures with a bridge-specific error", async () => {
  await assert.rejects(
    readBridgeWorkspace(
      { account: "arcana", accessKey: "secret" },
      async () => ({ ...response(200), json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } }),
    ),
    /MAGICUS_BRIDGE returned an empty response/,
  );
});

test("browser restore bypasses caches and treats bridge data as authoritative", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const renderer = fs.readFileSync(path.join(__dirname, "..", "renderer.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(renderer, /cache:"no-store"/);
  assert.match(renderer, /"Cache-Control":"no-cache"/);
  assert.match(renderer, /if\(hasBrowserWorkspaceData\(remote\)\)workspace=remote/);
  assert.match(renderer, /const latest=await browserBridgeRead\(\)/);
  assert.match(html, /renderer\.js\?v=7/);
});
