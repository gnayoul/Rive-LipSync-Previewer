import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EdgeTTS } from "edge-tts-universal";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3921);
const KOKORO_URL = (process.env.KOKORO_URL || "http://127.0.0.1:3922").replace(/\/$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
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
      const kokoro = await probeKokoro();
      sendJson(res, 200, {
        ok: true,
        ttsProxy: true,
        port: PORT,
        kokoro: kokoro.ok,
        kokoroError: kokoro.error || "",
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/elevenlabs") {
      await handleElevenLabsTTS(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/azure") {
      await handleAzureTTS(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/edge") {
      await handleEdgeTTS(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tts/kokoro") {
      await handleKokoroTTS(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/kokoro/voices") {
      await handleKokoroVoices(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/elevenlabs/voices") {
      await handleElevenLabsVoices(req, res, url);
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
  console.log("TTS proxy ready for Kokoro / Edge / Azure / ElevenLabs.");
  console.log(`Kokoro expected at ${KOKORO_URL}`);
});

async function probeKokoro() {
  try {
    const response = await fetch(`${KOKORO_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    const data = await response.json();
    return { ok: Boolean(data.ok), error: data.error || "" };
  } catch (error) {
    return { ok: false, error: error.message || "unreachable" };
  }
}

async function handleKokoroTTS(req, res) {
  const body = await readJson(req);
  const text = String(body.text || "").trim();
  const voice = String(body.voice || "af_heart").trim();
  const rate = Number(body.rate) || 1;
  const lang = body.lang ? String(body.lang).trim() : undefined;

  if (!text) throw new Error("缺少文本。");

  let response;
  try {
    response = await fetch(`${KOKORO_URL}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed: rate, lang }),
    });
  } catch {
    throw new Error("无法连接 Kokoro 服务。请先运行 start-kokoro.bat。");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data.detail || data.error || "";
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || `Kokoro 请求失败（${response.status}）`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": response.headers.get("content-type") || "audio/wav",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": audioBuffer.length,
  });
  res.end(audioBuffer);
}

async function handleKokoroVoices(req, res) {
  try {
    const response = await fetch(`${KOKORO_URL}/voices`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    sendJson(res, 200, data);
  } catch {
    sendJson(res, 503, { error: "Kokoro 服务未启动。请先运行 start-kokoro.bat。" });
  }
}

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
    if (!audio) throw new Error("Edge 神经语音没有返回音频数据。");
    return Buffer.from(await audio.arrayBuffer());
  } catch (error) {
    const message = error?.message || String(error);
    throw new Error(`Edge 神经语音失败：${message}`);
  }
}

async function handleElevenLabsTTS(req, res) {
  const body = await readJson(req);
  const apiKey = String(body.apiKey || "").trim();
  const text = String(body.text || "").trim();
  const voiceId = String(body.voiceId || "").trim();
  const modelId = String(body.modelId || "eleven_multilingual_v2").trim();

  if (!apiKey) throw new Error("缺少 ElevenLabs API Key。");
  if (!text) throw new Error("缺少文本。");
  if (!voiceId) throw new Error("缺少 ElevenLabs 声音 ID。");

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs 请求失败：${response.status} ${detail}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": audioBuffer.length,
  });
  res.end(audioBuffer);
}

async function handleAzureTTS(req, res) {
  const body = await readJson(req);
  const apiKey = String(body.apiKey || "").trim();
  const region = String(body.region || "eastasia").trim();
  const text = String(body.text || "").trim();
  const voice = String(body.voice || "zh-CN-XiaoxiaoNeural").trim();
  const rate = Number(body.rate) || 1;
  const ratePercent = Math.round(rate * 100 - 100);
  const rateAttr = ratePercent === 0 ? "" : ` rate='${ratePercent > 0 ? "+" : ""}${ratePercent}%'`;

  if (!apiKey) throw new Error("缺少 Azure Speech API Key。");
  if (!text) throw new Error("缺少文本。");

  const ssml = `
    <speak version="1.0" xml:lang="zh-CN">
      <voice name="${voice}">
        <prosody${rateAttr}>${escapeXml(text)}</prosody>
      </voice>
    </speak>
  `.trim();

  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": apiKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
    },
    body: ssml,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Azure 语音请求失败：${response.status} ${detail}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": "audio/mpeg",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": audioBuffer.length,
  });
  res.end(audioBuffer);
}

async function handleElevenLabsVoices(req, res, url) {
  const apiKey = String(url.searchParams.get("apiKey") || "").trim();
  if (!apiKey) throw new Error("缺少 ElevenLabs API Key。");

  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`读取 ElevenLabs 声音列表失败：${response.status} ${detail}`);
  }

  const data = await response.json();
  const voices = (data.voices || []).map((voice) => ({
    id: voice.voice_id,
    label: voice.name,
    category: voice.category,
  }));

  sendJson(res, 200, { voices });
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

function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
