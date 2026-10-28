// Diagnose only the configured Microsoft TTS connection. No user text is sent.
import { Communicate } from "edge-tts-universal";
import fs from "node:fs/promises";
import dns from "node:dns/promises";

const localConfig = await fs.readFile(new URL("../tts.local.json", import.meta.url), "utf8")
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === "ENOENT") return {};
    throw error;
  });
const proxy = process.env.TTS_PROXY_URL ?? localConfig.proxyUrl;
console.log(`Node ${process.version}`);
console.log("Microsoft DNS:", await dns.lookup("api.msedgeservices.com", { all: true }));

let failed = 0;
for (const [name, proxyUrl] of [["direct", undefined], ...(proxy ? [["proxy", proxy]] : [])]) {
  const started = Date.now();
  let timer;
  try {
    const bytes = await Promise.race([
      (async () => {
        let size = 0;
        const client = new Communicate("Connection test.", {
          voice: "zh-CN-YunxiaNeural",
          proxy: proxyUrl,
          connectionTimeout: 10_000,
        });
        for await (const chunk of client.stream()) {
          if (chunk.type === "audio") size += chunk.data.length;
        }
        if (!size) throw new Error("No audio returned");
        return size;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Diagnostic timed out after 15 seconds")), 15_000);
      }),
    ]);
    console.log(`${name}: OK, ${bytes} audio bytes, ${Date.now() - started}ms`);
  } catch (error) {
    failed += 1;
    console.error(`${name}: FAILED, ${error.message}, ${Date.now() - started}ms`);
  } finally {
    clearTimeout(timer);
  }
}
// End diagnostic-only sockets, including an upstream stream that stalled.
process.exit(failed ? 1 : 0);
