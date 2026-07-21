/** Bump when the Whisper model / dtype shipped to clients changes. */
export const ASR_MODEL_REV = "whisper-base-q8"

const ASR_MODEL_REV_KEY = "asr-model-rev"

/** Cache Storage name fragments used by transformers.js / ORT / HF CDN. */
const CACHE_NAME_HINTS = [
  "transformers",
  "onnx",
  "whisper",
  "huggingface",
  "xenova",
] as const

let ready: Promise<void> | null = null

function forceClearRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("asrCache") === "1"
  } catch {
    return false
  }
}

function readStoredRev(): string | null {
  try {
    return localStorage.getItem(ASR_MODEL_REV_KEY)
  } catch {
    return null
  }
}

function writeStoredRev(rev: string) {
  try {
    localStorage.setItem(ASR_MODEL_REV_KEY, rev)
  } catch {
    // Private mode / blocked storage — next visit may re-purge; harmless.
  }
}

async function deleteMatchingCaches(): Promise<string[]> {
  if (typeof caches === "undefined") return []

  const keys = await caches.keys()
  const deleted: string[] = []

  await Promise.all(
    keys.map(async (name) => {
      const lower = name.toLowerCase()
      if (!CACHE_NAME_HINTS.some((hint) => lower.includes(hint))) return
      const ok = await caches.delete(name)
      if (ok) deleted.push(name)
    }),
  )

  return deleted
}

/**
 * One-shot Cache Storage purge when the ASR model revision changes
 * (e.g. whisper-small → whisper-base) or when `?asrCache=1` is present.
 * After purge, transformers.js can re-cache the new model normally.
 */
export function ensureAsrModelCache(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const prev = readStoredRev()
      const force = forceClearRequested()
      if (!force && prev === ASR_MODEL_REV) return

      const deleted = await deleteMatchingCaches()
      console.info(
        `[asr] Cache purge (rev ${prev ?? "(none)"} → ${ASR_MODEL_REV}${force ? ", ?asrCache=1" : ""}): removed ${deleted.length} cache(s)`,
        deleted,
      )
      writeStoredRev(ASR_MODEL_REV)
    })().catch((error) => {
      // Allow a later call to retry if the first attempt failed.
      ready = null
      console.warn("[asr] Cache purge failed:", error)
    })
  }
  return ready ?? Promise.resolve()
}
