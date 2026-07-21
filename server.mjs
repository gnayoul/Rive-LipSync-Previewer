import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EdgeTTS } from "edge-tts-universal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3921);
/** Microsoft Edge TTS often stalls on slow/blocked networks; fail the HTTP request instead of hanging forever. */
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 55_000);

/** Anti-abuse MVP for Edge TTS proxy. */
const TTS_BODY_MAX_BYTES = Number(process.env.TTS_BODY_MAX_BYTES || 8 * 1024);
const TTS_WEIGHTED_TEXT_LIMIT = Number(process.env.TTS_WEIGHTED_TEXT_LIMIT || 600);
const TTS_RATE_LIMIT_PER_MIN = Number(process.env.TTS_RATE_LIMIT_PER_MIN || 8);
const TTS_RATE_WINDOW_MS = 60_000;
const TTS_SUCCESS_COOLDOWN_MS = Number(process.env.TTS_SUCCESS_COOLDOWN_MS || 3_000);
const TTS_MAX_CONCURRENT = Number(process.env.TTS_MAX_CONCURRENT || 1);

/** CJK / kana / Hangul / emoji → 2; else → 1 (matches web/src/lib/weighted-text.ts). */
const DOUBLE_UNIT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u;

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

/** @type {Map<string, number[]>} */
const ttsRequestTimestampsByIp = new Map();
/** @type {Map<string, number>} */
const ttsLastSuccessAtByIp = new Map();
let ttsInFlight = 0;

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
    if (error?.code === "BODY_TOO_LARGE") {
      sendJson(res, 413, { error: error.message || "Request body too large." });
      return;
    }
    if (error?.code === "INVALID_JSON") {
      sendJson(res, 400, { error: error.message || "Invalid JSON body." });
      return;
    }
    const message = error?.message || "Server error";
    const timedOut = /超时|timeout/i.test(message);
    sendJson(res, timedOut ? 504 : 500, { error: message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Rive LipSync Previewer running at http://0.0.0.0:${PORT}`);
});

async function handleEdgeTTS(req, res) {
  const ip = getClientIp(req);
  const now = Date.now();

  const rate = checkRateLimit(ip, now);
  if (!rate.ok) {
    sendRateLimited(res, rate.retryAfterSec, "请求过快，请稍后再试。");
    return;
  }

  const cooldown = checkSuccessCooldown(ip, now);
  if (!cooldown.ok) {
    sendRateLimited(res, cooldown.retryAfterSec, "请求过快，请稍后再试。");
    return;
  }

  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > TTS_BODY_MAX_BYTES) {
    sendJson(res, 413, { error: "请求体过大。" });
    return;
  }

  let body;
  try {
    body = await readJson(req, TTS_BODY_MAX_BYTES);
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      sendJson(res, 413, { error: "请求体过大。" });
      return;
    }
    if (error?.code === "INVALID_JSON") {
      sendJson(res, 400, { error: "无效的 JSON 请求体。" });
      return;
    }
    throw error;
  }

  const text = String(body.text || "").trim();
  const voice = String(body.voice || "zh-CN-YunxiaNeural").trim();
  const speechRate = Number(body.rate) || 1;

  if (!text) {
    sendJson(res, 400, { error: "缺少文本。" });
    return;
  }

  const weighted = getWeightedLength(text);
  if (weighted > TTS_WEIGHTED_TEXT_LIMIT) {
    sendJson(res, 400, {
      error: `文本过长，请控制在加权 ${TTS_WEIGHTED_TEXT_LIMIT} 单位以内`,
      limit: TTS_WEIGHTED_TEXT_LIMIT,
      weighted,
    });
    return;
  }

  // Count only after validation (avoid burning quota on junk bodies).
  // Check concurrency before recording so a busy server does not burn IP quota.
  if (ttsInFlight >= TTS_MAX_CONCURRENT) {
    sendRateLimited(res, 1, "服务繁忙，请稍后再试。");
    return;
  }

  recordRateLimitHit(ip, now);
  ttsInFlight += 1;
  try {
    const audioBuffer = await withTimeout(
      synthesizeEdgeSpeech(text, voice, speechRate),
      TTS_TIMEOUT_MS,
      "语音合成超时，请稍后重试。",
    );
    ttsLastSuccessAtByIp.set(ip, Date.now());
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Access-Control-Allow-Origin": "*",
      "Content-Length": audioBuffer.length,
    });
    res.end(audioBuffer);
  } finally {
    ttsInFlight = Math.max(0, ttsInFlight - 1);
  }
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    const first = String(forwarded[0]).split(",")[0]?.trim();
    if (first) return first;
  }
  const remote = req.socket?.remoteAddress || "";
  if (remote === "::1" || remote === "::ffff:127.0.0.1") return "127.0.0.1";
  if (remote.startsWith("::ffff:")) return remote.slice(7);
  return remote || "unknown";
}

function pruneTimestamps(timestamps, now) {
  const cutoff = now - TTS_RATE_WINDOW_MS;
  while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
}

function checkRateLimit(ip, now) {
  const timestamps = ttsRequestTimestampsByIp.get(ip) || [];
  pruneTimestamps(timestamps, now);
  if (timestamps.length >= TTS_RATE_LIMIT_PER_MIN) {
    const oldest = timestamps[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + TTS_RATE_WINDOW_MS - now) / 1000),
    );
    return { ok: false, retryAfterSec };
  }
  return { ok: true, retryAfterSec: 0 };
}

function recordRateLimitHit(ip, now) {
  const timestamps = ttsRequestTimestampsByIp.get(ip) || [];
  pruneTimestamps(timestamps, now);
  timestamps.push(now);
  ttsRequestTimestampsByIp.set(ip, timestamps);
}

function checkSuccessCooldown(ip, now) {
  const lastSuccess = ttsLastSuccessAtByIp.get(ip) || 0;
  const elapsed = now - lastSuccess;
  if (lastSuccess && elapsed < TTS_SUCCESS_COOLDOWN_MS) {
    return {
      ok: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((TTS_SUCCESS_COOLDOWN_MS - elapsed) / 1000),
      ),
    };
  }
  return { ok: true, retryAfterSec: 0 };
}

function sendRateLimited(res, retryAfterSec, error) {
  sendJson(
    res,
    429,
    { error, retryAfterSec },
    { "Retry-After": String(retryAfterSec) },
  );
}

function getWeightedLength(text) {
  let total = 0;
  for (const char of text) {
    total += DOUBLE_UNIT.test(char) ? 2 : 1;
  }
  return total;
}

function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      if (timer) clearTimeout(timer);
    }),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
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
    if (/超时|timeout/i.test(message)) throw error;
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

async function readJson(req, maxBytes = TTS_BODY_MAX_BYTES) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      req.destroy();
      const err = new Error("请求体过大。");
      err.code = "BODY_TOO_LARGE";
      throw err;
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("无效的 JSON 请求体。");
    err.code = "INVALID_JSON";
    throw err;
  }
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extraHeaders,
  });
  res.end(body);
}
