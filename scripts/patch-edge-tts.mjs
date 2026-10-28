import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(repoRoot, "node_modules", "edge-tts-universal", "dist");

const OLD_ENDPOINT =
  "var WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;";
const NEW_ENDPOINT =
  'var WSS_URL = "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=" + TRUSTED_CLIENT_TOKEN;';

const OLD_OPEN_WAIT =
  'await new Promise((resolve) => websocket.on("open", resolve));';
const NEW_OPEN_WAIT = `await new Promise((resolve, reject) => {
      let timer;
      let settled = false;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        websocket.off("open", onOpen);
        websocket.off("unexpected-response", onUnexpectedResponse);
        websocket.off("error", onError);
        websocket.off("close", onClose);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onOpen = () => finish();
      const onUnexpectedResponse = (request, response) => {
        const status = response?.statusCode || "unknown";
        try { response?.resume?.(); } catch {}
        try { request?.destroy?.(); } catch {}
        finish(new WebSocketError(\`Handshake rejected: HTTP \${status}\`));
      };
      const onError = (error) =>
        finish(new WebSocketError(error?.message || "WebSocket handshake failed"));
      const onClose = (code) =>
        finish(new WebSocketError(\`Closed before open (code \${code})\`));

      websocket.once("open", onOpen);
      websocket.once("unexpected-response", onUnexpectedResponse);
      websocket.once("error", onError);
      websocket.once("close", onClose);
      timer = setTimeout(() => {
        try { websocket.terminate(); } catch {}
        finish(new WebSocketError("WebSocket handshake timed out"));
      }, 10000);
    });`;

export function patchEdgeTts() {
  if (!fs.existsSync(distRoot)) {
    throw new Error(
      `[patch-edge-tts] missing dependency at ${distRoot}; run npm install first`,
    );
  }

  const targets = ["index.js", "index.cjs"];
  for (const filename of targets) {
    const target = path.join(distRoot, filename);
    let source = fs.readFileSync(target, "utf8");
    let changed = false;

    if (source.includes(OLD_ENDPOINT)) {
      source = source.replace(OLD_ENDPOINT, NEW_ENDPOINT);
      changed = true;
    } else if (!source.includes(NEW_ENDPOINT)) {
      throw new Error(
        `[patch-edge-tts] ${filename} has an unknown endpoint layout; review the upstream package before deploying`,
      );
    }

    if (source.includes(OLD_OPEN_WAIT)) {
      source = source.replace(OLD_OPEN_WAIT, NEW_OPEN_WAIT);
      changed = true;
    } else if (!source.includes("WebSocket handshake timed out")) {
      throw new Error(
        `[patch-edge-tts] ${filename} has an unknown handshake layout; review the upstream package before deploying`,
      );
    }

    if (changed) {
      fs.writeFileSync(target, source);
      console.log(`[patch-edge-tts] patched ${filename}`);
    } else {
      console.log(`[patch-edge-tts] already patched ${filename}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  patchEdgeTts();
}
