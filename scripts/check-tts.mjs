// Diagnose only the configured Microsoft TTS connection. No user text is sent.
import { EdgeTTS } from "node-edge-tts";
import fs from "node:fs/promises";
import dns from "node:dns/promises";
import { setTimeout as delay } from "node:timers/promises";

const localConfig = await fs.readFile(new URL("../tts.local.json", import.meta.url), "utf8")
  .then(JSON.parse)
  .catch((error) => {
    if (error.code === "ENOENT") return {};
    throw error;
  });
const proxy = process.env.TTS_PROXY_URL ?? localConfig.proxyUrl;
console.log(`Node ${process.version}`);
console.log("Microsoft DNS:", await dns.lookup("speech.platform.bing.com", { all: true }));

let failed = 0;
const repetitions = process.argv.includes("--repeat") ? 6 : 1;
async function checkRoute(name, proxyUrl, repetition) {
  const started = Date.now();
  let timer;
  try {
    const bytes = await Promise.race([
      (async () => {
        let size = 0;
        const client = new EdgeTTS({
          voice: "zh-CN-YunxiaNeural",
          proxy: proxyUrl,
          timeout: 10_000,
        });
        for await (const chunk of client.streamAudio("Connection test.")) {
          if (Buffer.isBuffer(chunk)) size += chunk.length;
        }
        if (!size) throw new Error("No audio returned");
        return size;
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Diagnostic timed out after 15 seconds")), 15_000);
      }),
    ]);
    console.log(`${name} ${repetition}/${repetitions}: OK, ${bytes} audio bytes, ${Date.now() - started}ms`);
  } catch (error) {
    failed += 1;
    console.error(`${name} ${repetition}/${repetitions}: FAILED, ${error.message}, ${Date.now() - started}ms`);
  } finally {
    clearTimeout(timer);
  }
}
for (let repetition = 1; repetition <= repetitions; repetition += 1) {
  if (repetition > 1) await delay(10_000);
  for (const [name, proxyUrl] of [["direct", undefined], ...(proxy ? [["proxy", proxy]] : [])]) {
    await checkRoute(name, proxyUrl, repetition);
  }
}
// End diagnostic-only sockets, including an upstream stream that stalled.
process.exit(failed ? 1 : 0);
