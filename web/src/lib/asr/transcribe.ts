import { decodeAudioFileToMono16k } from "@/lib/asr/audio"
import { ensureAsrModelCache } from "@/lib/asr/cache"
import {
  asrDevicePreference,
  isRestrictedPreviewBrowser,
} from "@/lib/asr/env"

// Purge stale model caches on page load when ASR_MODEL_REV changes (or ?asrCache=1).
// Skip eager work in Cursor/Electron Simple Browser — keep first paint responsive.
if (!isRestrictedPreviewBrowser()) {
  void ensureAsrModelCache()
}

export type AsrStatus = "idle" | "loading" | "streaming" | "done" | "error"

/** UI / worker language preference for Whisper ASR. */
export type AsrLanguagePreference = "auto" | "chinese" | "english"

export type AsrTranscribeHandlers = {
  onStatus?: (status: AsrStatus) => void
  onPartial?: (text: string) => void
  onDone?: (text: string) => void
  onError?: (message: string) => void
}

type WorkerOutMessage =
  | { type: "progress"; jobId: number }
  | { type: "partial"; jobId: number; text: string }
  | { type: "done"; jobId: number; text: string }
  | { type: "error"; jobId: number; message: string }
  | { type: "cancelled"; jobId: number }

let worker: Worker | null = null
let jobSeq = 0
let activeJobId = 0
let activeReject: ((reason?: unknown) => void) | null = null

function ensureWorker() {
  if (worker) return worker
  worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), {
    type: "module",
  })
  return worker
}

/** Cancel in-flight ASR; terminates the worker so WASM/WebGPU work stops ASAP. */
export function cancelAsr() {
  const jobId = activeJobId
  activeJobId = 0
  const reject = activeReject
  activeReject = null
  if (worker) {
    try {
      if (jobId) worker.postMessage({ type: "cancel", jobId })
    } catch {
      // ignore
    }
    worker.terminate()
    worker = null
  }
  reject?.(new DOMException("Aborted", "AbortError"))
}

function transferablePcm(audio: Float32Array): Float32Array {
  // Transfer only when the view owns its buffer; otherwise copy first.
  if (
    audio.byteOffset === 0 &&
    audio.byteLength === audio.buffer.byteLength
  ) {
    return audio
  }
  return audio.slice()
}

/**
 * Run Whisper ASR in a dedicated worker.
 * Independent from Rhubarb — safe to call in parallel with mouth analysis.
 */
export async function transcribeAudioFile(
  file: Blob,
  handlers: AsrTranscribeHandlers = {},
  signal?: AbortSignal,
  language: AsrLanguagePreference = "auto",
): Promise<string> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError")
  }

  cancelAsr()
  const jobId = ++jobSeq
  activeJobId = jobId
  handlers.onStatus?.("loading")

  const onAbort = () => {
    if (activeJobId === jobId) cancelAsr()
  }
  signal?.addEventListener("abort", onAbort, { once: true })

  try {
    // Drop stale whisper-small / transformers Cache Storage when model rev changes.
    await ensureAsrModelCache()
    if (signal?.aborted || activeJobId !== jobId) {
      throw new DOMException("Aborted", "AbortError")
    }

    const preferDevice = asrDevicePreference()
    const restricted = isRestrictedPreviewBrowser()

    // Overlap worker boot + model load with audio decode.
    // In Cursor Simple Browser, skip warmup so we don't spin transformers/WebGPU
    // while the main thread is still decoding — start the worker on transcribe only.
    if (!restricted) {
      const w = ensureWorker()
      try {
        w.postMessage({ type: "warmup", jobId, preferDevice })
      } catch {
        // Worker may die; transcribe path will recreate.
      }
    }

    const audio = await decodeAudioFileToMono16k(file, signal)
    if (signal?.aborted || activeJobId !== jobId) {
      throw new DOMException("Aborted", "AbortError")
    }

    // Worker may have been terminated mid-decode; recreate if needed.
    const liveWorker = ensureWorker()

    return await new Promise<string>((resolve, reject) => {
      activeReject = reject

      const cleanup = () => {
        if (activeReject === reject) activeReject = null
        liveWorker.removeEventListener("message", onMessage)
        liveWorker.removeEventListener("error", onWorkerError)
        signal?.removeEventListener("abort", onAbort)
      }

      const failIfStale = () => activeJobId !== jobId

      const onMessage = (event: MessageEvent<WorkerOutMessage>) => {
        const data = event.data
        if (!data || data.jobId !== jobId) return
        if (failIfStale()) return

        if (data.type === "partial") {
          handlers.onStatus?.("streaming")
          handlers.onPartial?.(data.text)
          return
        }

        if (data.type === "done") {
          handlers.onStatus?.("done")
          handlers.onDone?.(data.text)
          cleanup()
          resolve(data.text)
          return
        }

        if (data.type === "error") {
          handlers.onStatus?.("error")
          handlers.onError?.(data.message)
          cleanup()
          reject(new Error(data.message))
          return
        }

        if (data.type === "cancelled") {
          cleanup()
          reject(new DOMException("Aborted", "AbortError"))
        }
      }

      const onWorkerError = (event: ErrorEvent) => {
        if (failIfStale()) return
        console.error("[asr] Worker error:", event.message, event.error)
        const message = "ASR_FAIL"
        handlers.onStatus?.("error")
        handlers.onError?.(message)
        cleanup()
        reject(new Error(message))
      }

      liveWorker.addEventListener("message", onMessage)
      liveWorker.addEventListener("error", onWorkerError)

      const pcm = transferablePcm(audio)
      liveWorker.postMessage(
        { type: "transcribe", jobId, audio: pcm, language, preferDevice },
        [pcm.buffer],
      )
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error
    }
    if (activeJobId === jobId) {
      handlers.onStatus?.("error")
      console.error("[asr] Transcribe failed:", error)
      handlers.onError?.("ASR_FAIL")
    }
    throw error
  } finally {
    signal?.removeEventListener("abort", onAbort)
  }
}
