import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "../src/app.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("API responses are never cacheable and security headers are present", async (t) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-powered-by"), null);
  assert.ok(response.headers.get("content-security-policy"));
  assert.ok(response.headers.get("x-content-type-options"));
});

test("trust proxy is off in development and on (1 hop) in production", () => {
  assert.equal(app.get("trust proxy"), false);
  const probe = `import app from "./server/src/app.js"; console.log(JSON.stringify(app.get("trust proxy")));`;
  const run = (trustProxy) => {
    const env = { ...process.env, NODE_ENV: "production" };
    delete env.TRUST_PROXY;
    if (trustProxy) env.TRUST_PROXY = trustProxy;
    return execFileSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: root, env, encoding: "utf8" }).trim().split("\n").pop();
  };
  assert.equal(run(), "1");
  assert.equal(run("2"), "2");
});

test("production serves the SPA with correct caching and keeps API paths as JSON (never the SPA page)", { skip: !existsSync(path.join(root, "dist/index.html")) && "run `npm run build` first" }, () => {
  const asset = readdirSync(path.join(root, "dist/assets")).find((file) => file.endsWith(".js"));
  const probe = `
    import app from "./server/src/app.js";
    const server = app.listen(0);
    await new Promise((r) => server.once("listening", r));
    const base = "http://127.0.0.1:" + server.address().port;
    const out = {};
    for (const [key, url] of Object.entries({ root: "/", deep: "/employee-login", asset: "/assets/${asset}", api: "/api/nope" })) {
      const res = await fetch(base + url);
      out[key] = { status: res.status, type: res.headers.get("content-type"), cache: res.headers.get("cache-control") };
    }
    console.log(JSON.stringify(out));
    server.close();
  `;
  const env = { ...process.env, NODE_ENV: "production" };
  delete env.TRUST_PROXY;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", probe], { cwd: root, env, encoding: "utf8" }).trim().split("\n").pop());
  assert.equal(result.root.status, 200);
  assert.match(result.root.type, /text\/html/);
  assert.equal(result.root.cache, "no-cache");
  assert.equal(result.deep.status, 200);
  assert.match(result.deep.type, /text\/html/);
  assert.match(result.asset.cache, /immutable/);
  assert.equal(result.api.status, 401);
  assert.match(result.api.type, /application\/json/);
});
