import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { EdgeTTS } from "node-edge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3921);
/** Microsoft Edge TTS often stalls on slow/blocked networks; fail the HTTP request instead of hanging forever. */
const TTS_TIMEOUT_MS = Number(process.env.TTS_TIMEOUT_MS || 55_000);
const TTS_MAX_ATTEMPTS = Math.max(
  1,
  Math.min(4, Math.floor(Number(process.env.TTS_MAX_ATTEMPTS) || 4)),
);
// Local Windows network clients may route raw TLS differently from HTTP CONNECT.
// Keep machine-specific proxy configuration out of the deployed repository.
const TTS_CONNECTION = await readTtsConnection();
const TTS_PROXY_URL = TTS_CONNECTION.proxyUrl;

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

const DIST_ROOT = path.resolve(__dirname, "web", "dist");
const DIST_INDEX = path.join(DIST_ROOT, "index.html");
const VENDOR_ROOT = path.resolve(__dirname, "vendor");
const APP_BASE_PATH = "/rive-lipsync";
let distIndexReady = false;

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
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
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
    const pathname = stripAppBasePath(url.pathname);

    if (
      (req.method === "GET" || req.method === "HEAD") &&
      pathname === "/api/health"
    ) {
      sendJson(
        res,
        200,
        {
          ok: true,
          ttsProxy: true,
          port: PORT,
          revision: process.env.RENDER_GIT_COMMIT || null,
        },
        {},
        req.method === "HEAD",
      );
      return;
    }

    if (req.method === "POST" && pathname === "/api/tts/edge") {
      await handleEdgeTTS(req, res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res, pathname, req.method === "HEAD");
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

await assertDistReady();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Rive LipSync Previewer running at http://0.0.0.0:${server.address().port}`);
  console.log(`Static root: ${DIST_ROOT}`);
  console.log(`Serving SPA index: ${DIST_INDEX}`);
  console.log(`TTS transport: ${TTS_PROXY_URL ? "configured HTTP proxy" : "direct"}`);
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
  const started = Date.now();
  const ratePercent = Math.round(rate * 100 - 100);
  const rateOption = `${ratePercent >= 0 ? "+" : ""}${ratePercent}%`;

  let lastError;
  for (let attempt = 1; attempt <= TTS_MAX_ATTEMPTS; attempt += 1) {
    // A broken local tunnel must not consume every retry on the same route.
    // Direct fallback is opt-in so deployments with a mandatory proxy keep it.
    const proxy = TTS_PROXY_URL &&
      !(TTS_CONNECTION.fallbackToDirect && attempt % 2 === 0)
      ? TTS_PROXY_URL
      : undefined;
    const route = proxy ? "proxy" : "direct";
    try {
      // The v2 client owns its socket timeout and closes on incomplete streams.
      // Keep every attempt within the HTTP request's overall time budget.
      const remainingMs = TTS_TIMEOUT_MS - (Date.now() - started) - 250;
      if (remainingMs <= 0) throw new Error("语音合成超时，请稍后重试。");
      const tts = new EdgeTTS({
        voice,
        lang: voice.split("-").slice(0, 2).join("-"),
        rate: rateOption,
        volume: "+0%",
        pitch: "+0Hz",
        proxy,
        outputFormat: "audio-24khz-48kbitrate-mono-mp3",
        timeout: remainingMs,
      });
      const chunks = [];
      for await (const chunk of tts.streamAudio(text)) {
        if (Buffer.isBuffer(chunk) && chunk.length) {
          chunks.push(chunk);
        }
      }
      const audio = Buffer.concat(chunks);
      if (!audio.length) throw new Error("语音合成没有返回音频数据。");
      console.log(
        `[tts] success route=${route} attempt=${attempt} bytes=${audio.length} elapsed=${Date.now() - started}ms`,
      );
      return audio;
    } catch (error) {
      lastError = error;
      const message = error?.message || String(error);
      const retryable = isTransientTtsError(message);
      if (!retryable || attempt >= TTS_MAX_ATTEMPTS) {
        console.error(`[tts] failed route=${route} attempt=${attempt}: ${message}`);
        break;
      }

      const delayMs = attempt === 1 ? 750 : 2_000;
      if (Date.now() - started + delayMs >= TTS_TIMEOUT_MS - 250) break;
      console.warn(
        `[tts] transient failure route=${route} attempt=${attempt}/${TTS_MAX_ATTEMPTS}: ${message}; retrying in ${delayMs}ms`,
      );
      await delay(delayMs);
    }
  }

  const message = lastError?.message || String(lastError || "unknown error");
  if (/超时|timeout/i.test(message)) throw lastError;
  throw new Error(`语音合成失败：${message}`);
}

function isTransientTtsError(message) {
  return /(?:ECONNRESET|ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|EAI_AGAIN|socket hang up|TLS connection|timed out|Unexpected server response: (?:429|50[234])|closed before)/i.test(
    message,
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readTtsConnection() {
  let proxyUrl = process.env.TTS_PROXY_URL;
  let fallbackToDirect = process.env.TTS_FALLBACK_TO_DIRECT === "1";
  if (proxyUrl === undefined) {
    try {
      const localConfig = JSON.parse(
        await fs.readFile(path.join(__dirname, "tts.local.json"), "utf8"),
      );
      proxyUrl = localConfig.proxyUrl;
      fallbackToDirect = localConfig.fallbackToDirect === true;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw new Error("Cannot read tts.local.json; check its JSON format.");
      }
    }
  }
  if (!proxyUrl) return { proxyUrl: undefined, fallbackToDirect: false };
  let parsed;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    throw new Error("TTS proxy must be an http:// or https:// URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("TTS proxy must be an http:// or https:// URL.");
  }
  return { proxyUrl: parsed.href, fallbackToDirect };
}

function isPathInsideRoot(root, resolved) {
  const relative = path.relative(root, resolved);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

const gzipAsync = promisify(gzip);
const staticGzipCache = new Map();

async function sendFile(req, res, resolved, headOnly = false) {
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error("Not a file");
  const ext = path.extname(resolved).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  const isCompressible = [".js", ".mjs", ".wasm", ".css", ".json", ".svg", ".data"].includes(ext);
  const headers = {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    ETag: etag,
    ...(isCompressible ? { Vary: "Accept-Encoding" } : {}),
  };
  if (req.headers["if-none-match"]?.split(/\s*,\s*/).some((tag) => tag === etag || tag === "*")) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  let content;
  const acceptsGzip = String(req.headers["accept-encoding"] || "").split(",").some((entry) => {
    const [name, ...params] = entry.trim().split(";");
    return name === "gzip" && !params.some((param) => /^\s*q\s*=\s*0(?:\.0*)?\s*$/.test(param));
  });
  if (isCompressible && acceptsGzip) {
    const cached = staticGzipCache.get(resolved);
    if (cached?.etag === etag) content = await cached.body;
    else {
      const body = fs.readFile(resolved).then((bytes) => gzipAsync(bytes));
      staticGzipCache.set(resolved, { etag, body });
      try { content = await body; }
      catch (error) { staticGzipCache.delete(resolved); throw error; }
    }
    headers["Content-Encoding"] = "gzip";
  } else content = await fs.readFile(resolved);
  headers["Content-Length"] = content.length;
  res.writeHead(200, headers);
  res.end(headOnly ? undefined : content);
}

async function assertDistReady() {
  try {
    await fs.access(DIST_INDEX);
    distIndexReady = true;
  } catch {
    distIndexReady = false;
    console.error(
      `[serveStatic] FATAL: missing SPA entry ${DIST_INDEX}. ` +
        `cwd=${process.cwd()} __dirname=${__dirname}. ` +
        `Run: npm run build (or ensure Render buildCommand/postinstall built web/dist).`,
    );
    process.exit(1);
  }
}

function stripAppBasePath(pathname) {
  if (pathname === APP_BASE_PATH) return "/";
  if (pathname.startsWith(`${APP_BASE_PATH}/`)) {
    return pathname.slice(APP_BASE_PATH.length) || "/";
  }
  return pathname;
}

async function serveStatic(req, res, pathname, headOnly = false) {
  const decoded = decodeURIComponent(pathname);
  const isVendor = decoded === "/vendor" || decoded.startsWith("/vendor/");
  const root = isVendor ? VENDOR_ROOT : DIST_ROOT;
  const relativePath = isVendor
    ? decoded.slice("/vendor".length) || "/"
    : decoded === "/"
      ? "/index.html"
      : decoded;
  const resolved = path.resolve(path.join(root, relativePath));

  if (!isPathInsideRoot(root, resolved)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  if (!isVendor && !distIndexReady) {
    console.error(
      `[serveStatic] web/dist not ready; requested ${decoded}; expected ${DIST_INDEX}`,
    );
    sendJson(res, 503, {
      error: "Frontend build missing",
      detail: `Expected ${DIST_INDEX}. Run npm run build on the server image.`,
      distRoot: DIST_ROOT,
    });
    return;
  }

  try {
    await sendFile(req, res, resolved, headOnly);
  } catch (error) {
    // SPA fallback for client routes (not /api or /vendor).
    if (!isVendor && !decoded.startsWith("/api")) {
      try {
        if (isPathInsideRoot(DIST_ROOT, DIST_INDEX)) {
          await sendFile(req, res, DIST_INDEX, headOnly);
          return;
        }
      } catch (fallbackError) {
        console.error(
          `[serveStatic] SPA fallback failed for ${decoded}:`,
          fallbackError?.message || fallbackError,
          `| missing ${DIST_INDEX}`,
        );
      }
    } else {
      console.error(
        `[serveStatic] File not found: ${resolved} (${error?.code || error?.message || error})`,
      );
    }
    sendJson(res, 404, {
      error: "File not found",
      path: decoded,
      resolved,
      distRoot: DIST_ROOT,
    });
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

function sendJson(res, status, payload, extraHeaders = {}, headOnly = false) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extraHeaders,
  });
  res.end(headOnly ? undefined : body);
}
