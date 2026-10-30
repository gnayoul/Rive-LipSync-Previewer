import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { gunzipSync } from "node:zlib";
import vm from "node:vm";
import test from "node:test";

const root = new URL("../", import.meta.url);
const ts = createRequire(new URL("web/package.json", root))("typescript");
const source = ts.transpileModule(fs.readFileSync(new URL("web/src/lib/rive-loader.ts", root), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loader(runtime) {
  const window = { rive: runtime };
  const exports = {};
  vm.runInNewContext(`(function(require, exports) { ${source}\n})`, { window })(
    () => ({ appUrl: (path) => `/rive-lipsync/${path}` }), exports,
  );
  return exports.loadRiveRuntime;
}

test("logo and character await one shared engine; fallback stays on the same origin", async () => {
  let finish;
  const ready = new Promise((resolve) => { finish = resolve; });
  const urls = [];
  const runtime = { RuntimeLoader: {
    setWasmUrl: (url) => urls.push(url),
    setWasmFallbackUrl: (url) => urls.push(url),
    awaitInstance: () => ready,
  } };
  const load = loader(runtime);
  const logo = load();
  assert.equal(load(), logo);
  assert.deepEqual(urls, [
    "/rive-lipsync/vendor/rive/rive.wasm?v=2.38.5",
    "/rive-lipsync/vendor/rive/rive_fallback.wasm?v=2.38.5",
  ]);
  finish();
  assert.equal(await logo, runtime);
  assert.equal(await load(), runtime);
  assert.equal(urls.length, 2, "do not reset the primary URL after fallback initialization");
});

test("failed initialization can retry instead of retaining a rejected promise", async () => {
  let attempts = 0;
  const runtime = { RuntimeLoader: {
    setWasmUrl() {}, setWasmFallbackUrl() {},
    awaitInstance: () => ++attempts === 1 ? Promise.reject(new Error("network")) : Promise.resolve(),
  } };
  const load = loader(runtime);
  await assert.rejects(load(), /network/);
  assert.equal(await load(), runtime);
  assert.equal(attempts, 2);
});

test("vendored compatibility engine loads the existing character and mouth binding", async () => {
  const module = { exports: {} };
  const require = createRequire(import.meta.url);
  new Function("module", "exports", "require", fs.readFileSync(new URL("vendor/rive/rive.js", root), "utf8"))(module, module.exports, require);
  const binary = (path) => {
    const b = fs.readFileSync(new URL(path, root));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  };
  const { RiveFile, RuntimeLoader } = module.exports;
  RuntimeLoader.setWasmBinary(binary("vendor/rive/rive_fallback.wasm"));
  RuntimeLoader.setWasmFallbackUrl(null);
  const file = new RiveFile({ buffer: binary("web/public/boy.riv"), enableRiveAssetCDN: false });
  try {
    await file.init();
    const model = file.viewModelByName("ViewModel2");
    const instance = model.defaultInstance() || model.instanceByIndex(0);
    const mouth = instance.number("mouth");
    mouth.value = 2;
    assert.equal(mouth.value, 2);
  } finally { file.cleanup(); }
});

function request(port, path, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path, method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error("local request timeout")));
    req.on("error", reject);
    req.end();
  });
}

test("real HTTP server compresses and revalidates WASM while keeping HTML fresh", { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: root, env: { ...process.env, PORT: "0", TTS_PROXY_URL: "" },
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stderr.on("data", (data) => { output += data; });
  try {
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 5000);
      child.on("error", (error) => { clearTimeout(timer); reject(error); });
      child.on("exit", () => { clearTimeout(timer); reject(new Error(output)); });
      child.stdout.on("data", (data) => {
        output += data;
        const match = output.match(/running at http:\/\/0\.0\.0\.0:(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    const html = await request(port, "/");
    assert.equal(html.headers["cache-control"], "no-cache");
    assert.match(html.body.toString(), /rive\.wasm\?v=2\.38\.5/);
    // The acoustic/language package must survive HTTP compression byte-for-byte.
    const dataPath = "/rive-lipsync/vendor/lip-sync-engine/wasm/lip-sync-engine.data";
    const dataOriginal = fs.readFileSync(new URL("vendor/lip-sync-engine/wasm/lip-sync-engine.data", root));
    const dataZipped = await request(port, dataPath, { "Accept-Encoding": "gzip" });
    assert.equal(dataZipped.status, 200);
    assert.equal(dataZipped.headers["content-encoding"], "gzip");
    assert.equal(dataZipped.headers.vary, "Accept-Encoding");
    assert.equal(Number(dataZipped.headers["content-length"]), dataZipped.body.length);
    assert.ok(dataZipped.body.length < dataOriginal.length * 0.8);
    assert.deepEqual(gunzipSync(dataZipped.body), dataOriginal);
    const dataCached = await request(port, dataPath, { "If-None-Match": dataZipped.headers.etag });
    assert.equal(dataCached.status, 304);
    const dataPlain = await request(port, dataPath, { "Accept-Encoding": "gzip;q=0" });
    assert.equal(dataPlain.headers["content-encoding"], undefined);
    assert.deepEqual(dataPlain.body, dataOriginal);
    for (const filename of ["rive.wasm", "rive_fallback.wasm", "rive.js"]) {
      const path = `/rive-lipsync/vendor/rive/${filename}?v=2.38.5`;
      const original = fs.readFileSync(new URL(`vendor/rive/${filename}`, root));
      const zipped = await request(port, path, { "Accept-Encoding": "gzip, deflate" });
      assert.equal(zipped.status, 200);
      assert.equal(zipped.headers["content-encoding"], "gzip");
      assert.equal(zipped.headers["vary"], "Accept-Encoding");
      assert.equal(Number(zipped.headers["content-length"]), zipped.body.length);
      assert.ok(zipped.body.length < original.length / 2);
      assert.deepEqual(gunzipSync(zipped.body), original);
      const cached = await request(port, path, { "If-None-Match": zipped.headers.etag, "Accept-Encoding": "gzip" });
      assert.equal(cached.status, 304);
      assert.equal(cached.body.length, 0);
      const plain = await request(port, path, { "Accept-Encoding": "gzip;q=0" });
      assert.equal(plain.headers["content-encoding"], undefined);
      assert.deepEqual(plain.body, original);
      const head = await request(port, path, { "Accept-Encoding": "gzip" }, "HEAD");
      assert.equal(head.status, 200);
      assert.equal(head.body.length, 0);
      assert.equal(Number(head.headers["content-length"]), zipped.body.length);
      if (filename.endsWith(".wasm")) assert.ok(WebAssembly.validate(original));
    }
  } finally { child.kill(); }
});
