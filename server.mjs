import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EdgeTTS } from "edge-tts-universal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3921);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".riv": "application/octet-stream",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        ttsProxy: true,
        port: PORT,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/edge") {
      await handleEdgeTTS(req, res);
      return;
    }

    if (req.method === "GET") {
      await serveStatic(req, res, url.pathname);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Rive LipSync Previewer running at http://0.0.0.0:${PORT}`);
});

async function handleEdgeTTS(req, res) {
  const body = await readJson(req);
  const text = String(body.text || "").trim();
  const voice = String(body.voice || "zh-CN-XiaoxiaoNeural").trim();
  const rate = Number(body.rate) || 1;

  if (!text) throw new Error("缺少文本。");

  const audioBuffer = await synthesizeEdgeSpeech(text, voice, rate);
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": audioBuffer.length,
  });
  res.end(audioBuffer);
}

async function synthesizeEdgeSpeech(text, voice, rate = 1) {
  const ratePercent = Math.round(rate * 100 - 100);
  const rateOption = `${ratePercent >= 0 ? "+" : ""}${ratePercent}%`;

  try {
    const tts = new EdgeTTS(text, voice, {
      rate: rateOption,
      volume: "+0%",
      pitch: "+0Hz",
    });
    const result = await tts.synthesize();
    const audio = result?.audio;
    if (!audio) throw new Error("语音合成没有返回音频数据。");
    return Buffer.from(await audio.arrayBuffer());
  } catch (error) {
    const message = error?.message || String(error);
    throw new Error(`语音合成失败：${message}`);
  }
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(__dirname, decodeURIComponent(safePath));
  const resolved = path.resolve(filePath);

  if (!resolved.startsWith(__dirname)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  try {
    const content = await fs.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(content);
  } catch {
    sendJson(res, 404, { error: "File not found" });
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}
