// Integration regression: a refused proxy connection must fall back to direct.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["server.mjs"], {
  cwd: new URL("../", import.meta.url),
  env: {
    ...process.env,
    PORT: "0",
    TTS_PROXY_URL: "http://127.0.0.1:1",
    TTS_FALLBACK_TO_DIRECT: "1",
    TTS_MAX_ATTEMPTS: "2",
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (data) => { output += data; });
child.stderr.on("data", (data) => { output += data; });

try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Test server did not start")), 5000);
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Test server exited with ${code}: ${output}`));
    });
    child.stdout.on("data", () => {
      const match = output.match(/running at http:\/\/0\.0\.0\.0:(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/tts/edge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "Connection recovery test.", voice: "zh-CN-YunxiaNeural", rate: 1 }),
    signal: AbortSignal.timeout(30_000),
  });
  const audio = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, audio.toString("utf8"));
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.ok(audio.length > 1000, "Expected non-empty speech audio");
  assert.match(output, /transient failure route=proxy attempt=1\/2/);
  assert.match(output, /success route=direct attempt=2/);
  console.log(`PASS: refused proxy -> direct retry -> HTTP 200, ${audio.length} audio bytes`);
  console.log(output.trim());
} finally {
  child.kill();
}
