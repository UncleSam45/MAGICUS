const test = require("node:test");
const assert = require("node:assert/strict");

const { BRIDGE_WORKSPACE_PATH, readBridgeWorkspace, workspacePayload, writeBridgeWorkspace } = require("../main");

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
