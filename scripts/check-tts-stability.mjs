// Exercise the running server; optionally pass a deployed URL as the first argument.
// No upstream connections are made by this diagnostic process itself.
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = (process.argv[2] || "http://127.0.0.1:3921").replace(/\/$/, "");
const count = 6;
const results = [];
for (let index = 0; index < count; index += 1) {
  if (index) await delay(10_000);
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/api/tts/edge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Connection stability test number ${index + 1}.`, voice: "zh-CN-YunxiaNeural", rate: 1 }),
      signal: AbortSignal.timeout(60_000),
    });
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, body.toString("utf8"));
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.ok(body.length > 1000, "Expected speech audio");
    const result = { request: index + 1, ok: true, bytes: body.length, ms: Date.now() - started };
    results.push(result);
    console.log(JSON.stringify(result));
  } catch (error) {
    const result = { request: index + 1, ok: false, error: error.message, ms: Date.now() - started };
    results.push(result);
    console.error(JSON.stringify(result));
    break;
  }
}
const successful = results.filter((result) => result.ok).length;
console.log(`Result: ${successful}/${count} succeeded`);
process.exitCode = successful === count ? 0 : 1;
