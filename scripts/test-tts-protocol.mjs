import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const entry = require.resolve("node-edge-tts");
const clientRequire = createRequire(entry);
const { WebSocket, WebSocketServer } = clientRequire("ws");
const { generateSecMsGecToken_V2 } = clientRequire("./drm");

test("v2 tokens match independently verified upstream vectors", () => {
  // https://github.com/SchneeHertz/node-edge-tts/issues/15
  const vectors = [
    [1700000000, "2CD23A2CA0B2595A-F3C846C370E05F9CC83ACC5F995C5F5D87A4D0F14CE8936A0F902E64099E38A2"],
    [1735689600, "54404AFE67C9B44A-E72E51D8B4F5F75E9A96B7E20D7877227455BC310433BD30C817CD54A1D9313E"],
    [1800000000, "99E54519B490BE5C-E162DB0977FBDCB9B86DD8148BF1BCDC3C0303176CE39852A42B415935C20654"],
  ];
  for (const [seconds, token] of vectors) assert.equal(generateSecMsGecToken_V2(seconds), token);
});

// Reroute only the test client's WebSocket transport to loopback. The real
// package still constructs its production URL, headers and synthesis frames.
async function fixture(t, mode) {
  const server = http.createServer((_req, res) => res.writeHead(200).end());
  const sockets = new WebSocketServer({ noServer: true });
  const observed = { messages: [] };
  if (mode !== "http200") {
    server.on("upgrade", (req, socket, head) => {
      observed.headers = req.headers;
      sockets.handleUpgrade(req, socket, head, (ws) => sockets.emit("connection", ws));
    });
  }
  const audio = Buffer.from([0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4]);
  sockets.on("connection", (ws) => {
    ws.on("message", (message) => {
      const text = message.toString();
      observed.messages.push(text);
      if (!text.includes("Path:ssml") || mode === "stall") return;
      const headers = Buffer.from("Path:audio\r\nContent-Type:audio/mpeg\r\n");
      const prefix = Buffer.alloc(2);
      prefix.writeUInt16BE(headers.length);
      ws.send(Buffer.concat([prefix, headers, audio]));
      if (mode === "close") ws.close();
      else ws.send("Path:turn.end\r\n\r\n");
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
    await new Promise((resolve) => server.close(resolve));
  });
  class LoopbackWebSocket extends WebSocket {
    constructor(url, options) {
      observed.url = new URL(url);
      super(`ws://127.0.0.1:${server.address().port}`, { ...options, host: "127.0.0.1", agent: undefined });
    }
  }
  const exports = {};
  const load = vm.runInNewContext(`(function(require, exports) {\n${fs.readFileSync(entry, "utf8")}\n})`, {
    Buffer, Uint8Array, setTimeout, clearTimeout,
  });
  load((name) => name === "ws" ? { WebSocket: LoopbackWebSocket } : clientRequire(name), exports);
  const client = new exports.EdgeTTS({ voice: "en-US-AriaNeural", lang: "en-US", rate: "+20%", timeout: 300 });
  return { client, observed, audio };
}

async function collect(client) {
  const chunks = [];
  for await (const chunk of client.streamAudio("A & B <test>")) if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("Bing v2 handshake, MUID, SSML escaping and framed audio", { timeout: 3000 }, async (t) => {
  const { client, observed, audio } = await fixture(t, "success");
  assert.deepEqual(await collect(client), audio);
  assert.equal(observed.url.hostname, "speech.platform.bing.com");
  assert.equal(observed.url.pathname, "/consumer/speech/synthesize/readaloud/edge/v1");
  assert.ok(observed.url.searchParams.get("TrustedClientToken"));
  assert.match(observed.url.searchParams.get("Sec-MS-GEC"), /^[A-F0-9]{16}-[A-F0-9]{64}$/);
  assert.match(observed.url.searchParams.get("Sec-MS-GEC-Version"), /^2-/);
  assert.match(observed.headers.cookie, /^muid=[A-F0-9]{32};$/);
  assert.ok(observed.messages.some((message) => message.includes("Path:speech.config")));
  const ssml = observed.messages.find((message) => message.includes("Path:ssml"));
  assert.match(ssml, /A &amp; B &lt;test&gt;/);
  assert.match(ssml, /voice name="en-US-AriaNeural"/);
  assert.match(ssml, /rate="\+20%"/);
});

test("HTTP 200 cannot be accepted as a successful WebSocket handshake", { timeout: 3000 }, async (t) => {
  const { client } = await fixture(t, "http200");
  await assert.rejects(collect(client), /Unexpected server response: 200/);
});

test("audio followed by disconnect without turn.end is rejected", { timeout: 3000 }, async (t) => {
  const { client } = await fixture(t, "close");
  await assert.rejects(collect(client), /closed before turn.end/);
});

test("a stalled stream is terminated within its time budget", { timeout: 3000 }, async (t) => {
  const { client } = await fixture(t, "stall");
  await assert.rejects(collect(client), /Timed out/);
});
