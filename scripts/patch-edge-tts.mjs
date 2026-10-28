import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(repoRoot, "node_modules", "node-edge-tts");
const obsoleteEndpoint =
  "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key=";
const readAloudEndpoint =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=";
const cookieHeader =
  "                'Cookie': `muid=${(0, node_crypto_1.randomBytes)(16).toString('hex').toUpperCase()};`,";

export function patchEdgeTts() {
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (manifest.version !== "1.2.12") {
    throw new Error("[patch-edge-tts] review the endpoint patch before changing node-edge-tts@1.2.12");
  }
  const target = path.join(packageRoot, "dist", "edge-tts.js");
  let source = fs.readFileSync(target, "utf8");
  const original = source;
  if (!source.includes("generateSecMsGecToken_V2") || !source.includes("SEC_MS_GEC_VERSION_V2")) {
    throw new Error("[patch-edge-tts] v2 authentication is required");
  }
  // The v2 release still points at the endpoint that now answers HTTP 200.
  // Use Bing Read Aloud with v2 signing, as in upstream edge-tts >=7.3.0.
  // https://github.com/Migushthe2nd/MsEdgeTTS/pull/43
  if (source.includes(obsoleteEndpoint)) {
    source = source.replace(obsoleteEndpoint, readAloudEndpoint);
  } else if (!source.includes(readAloudEndpoint)) {
    throw new Error("[patch-edge-tts] unknown WebSocket endpoint layout");
  }
  if (!source.includes(cookieHeader)) {
    const headers = "            headers: {";
    if (!source.includes(headers)) throw new Error("[patch-edge-tts] unknown header layout");
    source = source.replace(headers, `${headers}\n${cookieHeader}`);
  }
  if (source !== original) fs.writeFileSync(target, source);
  console.log("[patch-edge-tts] Bing endpoint + v2 signing + MUID ready");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  patchEdgeTts();
}
