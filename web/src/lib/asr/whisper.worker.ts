import {
  env,
  pipeline,
  Tensor,
  WhisperTextStreamer,
  type AutomaticSpeechRecognitionPipeline,
  type ProgressCallback,
} from "@huggingface/transformers"
import { Converter } from "opencc-js/t2cn"

/**
 * Multilingual Whisper base (~77MB q8) — supports Chinese; cached in Cache Storage.
 * When changing model/dtype, bump `ASR_MODEL_REV` in `./cache.ts` so main-thread
 * purges old transformers/whisper caches once before the next load.
 */
const WHISPER_MODEL_ID = "Xenova/whisper-base"

const SAMPLE_RATE = 16_000
/** Chunk long audio only; short clips skip overlap work. */
const CHUNK_THRESHOLD_S = 30
const CHUNK_LENGTH_S = 30
const STRIDE_LENGTH_S = 5
/** Whisper language detection uses the first ≤30s of audio. */
const DETECT_MAX_SAMPLES = SAMPLE_RATE * 30

/** Stable code — UI maps to i18n `status.asrFail`. */
const USER_FACING_ERROR = "ASR_FAIL"

/** Cursor / broken GPU stacks: fail fast instead of hanging forever. */
const WEBGPU_ADAPTER_TIMEOUT_MS = 2_500
/** No transformers progress within this window → treat WebGPU session as hung. */
const WEBGPU_PROGRESS_STALL_MS = 5_000

type AsrLanguagePreference = "auto" | "chinese" | "english"
type AsrWhisperLanguage = "chinese" | "english"
type AsrDevicePreference = "auto" | "wasm"

/**
 * Whisper `language: "chinese"` often emits Traditional Chinese.
 * Convert t→cn (OpenCC t2s) on every partial + final so the UI never flashes 繁体.
 * Latin letters / digits / punctuation are left unchanged by the dictionary.
 */
const toSimplified = Converter({ from: "t", to: "cn" })

env.allowLocalModels = false
env.useBrowserCache = true

type WorkerInMessage =
  | { type: "warmup"; jobId: number; preferDevice?: AsrDevicePreference }
  | {
      type: "transcribe"
      jobId: number
      audio: Float32Array
      language: AsrLanguagePreference
      preferDevice?: AsrDevicePreference
    }
  | { type: "cancel"; jobId: number }

type WorkerOutMessage =
  | { type: "progress"; jobId: number }
  | { type: "partial"; jobId: number; text: string }
  | { type: "done"; jobId: number; text: string }
  | { type: "error"; jobId: number; message: string }
  | { type: "cancelled"; jobId: number }

type AsrDevice = "webgpu" | "wasm"
type AsrDtype = "q8" | "fp32"

type WhisperGenerationConfigLike = {
  decoder_start_token_id?: number
  lang_to_id?: Record<string, number>
}

type WhisperLogitsTensor = {
  to: (dtype: string) => { data: ArrayLike<number> }
  [index: number]: WhisperLogitsTensor
}

type WhisperModelLike = {
  generation_config?: WhisperGenerationConfigLike | null
  // Pipeline model is callable; returns logits for language probing.
  (
    inputs: Record<string, unknown>,
  ): Promise<{ logits?: WhisperLogitsTensor }>
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerInMessage>) => void) | null
  postMessage: (message: WorkerOutMessage) => void
  navigator?: Navigator
}

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null =
  null
let activeJobId = 0
let cancelledJobId = 0
/** Sticky skip after a timed-out / failed WebGPU attempt in this worker. */
let webGpuBanned = false
let preferDevice: AsrDevicePreference = "auto"

function isCancelled(jobId: number) {
  return jobId !== activeJobId || jobId === cancelledJobId
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * Probe WebGPU quickly. Broken embedded browsers often hang on requestAdapter
 * instead of rejecting — never await it without a timeout.
 */
async function canUseWebGpu(): Promise<boolean> {
  try {
    const gpu = workerScope.navigator?.gpu
    if (!gpu) return false
    const adapter = await withTimeout(
      gpu.requestAdapter(),
      WEBGPU_ADAPTER_TIMEOUT_MS,
      "WebGPU requestAdapter",
    )
    return Boolean(adapter)
  } catch (error) {
    console.warn("[asr] WebGPU adapter probe failed:", error)
    return false
  }
}

/**
 * Create a WebGPU pipeline but bail if ORT never reports progress (hang).
 * Once download/compile progress starts, allow the load to finish (large models).
 */
async function createWebGpuTranscriber(
  progress_callback: ProgressCallback,
): Promise<AutomaticSpeechRecognitionPipeline> {
  let progressed = false
  let stallTimer: ReturnType<typeof setTimeout> | undefined

  const wrapped: ProgressCallback = (data) => {
    progressed = true
    if (stallTimer !== undefined) {
      clearTimeout(stallTimer)
      stallTimer = undefined
    }
    progress_callback(data)
  }

  const createPromise = createTranscriberForDevice("webgpu", wrapped)

  const stallPromise = new Promise<never>((_, reject) => {
    stallTimer = setTimeout(() => {
      if (!progressed) {
        reject(
          new Error(
            `WebGPU session stalled (no progress in ${WEBGPU_PROGRESS_STALL_MS}ms)`,
          ),
        )
      }
    }, WEBGPU_PROGRESS_STALL_MS)
  })

  try {
    return await Promise.race([createPromise, stallPromise])
  } finally {
    if (stallTimer !== undefined) clearTimeout(stallTimer)
  }
}

async function createPipeline(
  device: AsrDevice,
  dtype: AsrDtype,
  progress_callback: ProgressCallback,
): Promise<AutomaticSpeechRecognitionPipeline> {
  return pipeline("automatic-speech-recognition", WHISPER_MODEL_ID, {
    device,
    dtype,
    progress_callback,
  })
}

/**
 * Prefer WebGPU (much faster than WASM). Prefer q8 (~77MB) over fp32 (~291MB).
 * Some transformers.js / ORT builds rewrite quantized Whisper into MatMulNBits
 * and fail with missing scales — on any q8 session failure, retry fp32.
 */
async function createTranscriberForDevice(
  device: AsrDevice,
  progress_callback: ProgressCallback,
): Promise<AutomaticSpeechRecognitionPipeline> {
  try {
    return await createPipeline(device, "q8", progress_callback)
  } catch (error) {
    console.warn(
      `[asr] ${device} q8 load failed (e.g. MatMulNBits); falling back to fp32 (~291MB):`,
      error,
    )
    return createPipeline(device, "fp32", progress_callback)
  }
}

async function createTranscriber(
  progress_callback: ProgressCallback,
): Promise<AutomaticSpeechRecognitionPipeline> {
  const skipWebGpu = preferDevice === "wasm" || webGpuBanned
  if (!skipWebGpu) {
    const useWebGpu = await canUseWebGpu()
    if (useWebGpu) {
      try {
        return await createWebGpuTranscriber(progress_callback)
      } catch (error) {
        webGpuBanned = true
        console.warn(
          "[asr] WebGPU load failed; falling back to WASM:",
          error,
        )
      }
    } else {
      webGpuBanned = true
    }
  } else {
    console.info(
      `[asr] Using WASM (preferDevice=${preferDevice}, webGpuBanned=${webGpuBanned})`,
    )
  }

  return createTranscriberForDevice("wasm", progress_callback)
}

function getTranscriber(jobId: number) {
  if (!transcriberPromise) {
    transcriberPromise = createTranscriber(() => {
      if (isCancelled(jobId)) return
      post({ type: "progress", jobId })
    }).catch((error) => {
      // Allow a later job to retry model load after a failed session create.
      transcriberPromise = null
      throw error
    })
  }
  return transcriberPromise
}

/** Cap decode length from audio duration — avoids long greedy tails on silence. */
function maxNewTokensForAudio(samples: number): number {
  const durationSec = samples / SAMPLE_RATE
  // ~12 tokens/s speech upper bound + slack; Whisper max is typically 448.
  return Math.min(448, Math.max(48, Math.ceil(durationSec * 12) + 24))
}

function post(message: WorkerOutMessage) {
  workerScope.postMessage(message)
}

function maybeSimplify(text: string, language: AsrWhisperLanguage): string {
  return language === "chinese" ? toSimplified(text) : text
}

/**
 * transformers.js Whisper still has `// TODO: Implement language detection` and
 * silently defaults omitted `language` to English. We probe zh vs en logits with
 * a single encoder+decoder forward (same idea as upstream PR #1541).
 */
async function detectWhisperLanguage(
  transcriber: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array,
): Promise<AsrWhisperLanguage> {
  const model = transcriber.model as unknown as WhisperModelLike
  const generationConfig = model.generation_config
  const langToId = generationConfig?.lang_to_id
  const sot = generationConfig?.decoder_start_token_id
  const zhId = langToId?.["<|zh|>"]
  const enId = langToId?.["<|en|>"]

  if (sot == null || zhId == null || enId == null || !transcriber.processor) {
    console.warn(
      "[asr] language detect unavailable (missing lang_to_id); defaulting to chinese",
    )
    return "chinese"
  }

  const clip =
    audio.length > DETECT_MAX_SAMPLES
      ? audio.subarray(0, DETECT_MAX_SAMPLES)
      : audio

  try {
    const processed = await (
      transcriber.processor as unknown as (audio: Float32Array) => Promise<{
        input_features: unknown
      }>
    )(clip)

    const decoderInputIds = new Tensor(
      "int64",
      BigInt64Array.from([BigInt(sot)]),
      [1, 1],
    )

    const outputs = await model({
      input_features: processed.input_features,
      decoder_input_ids: decoderInputIds,
    })

    // logits[batch][seq] → float32 vocab scores (seq length is 1 = only SOT).
    const data = outputs.logits?.[0]?.[0]?.to("float32")?.data ?? null

    if (!data) {
      console.warn("[asr] language detect got no logits; defaulting to chinese")
      return "chinese"
    }

    const zhScore = Number(data[zhId] ?? Number.NEGATIVE_INFINITY)
    const enScore = Number(data[enId] ?? Number.NEGATIVE_INFINITY)
    const detected: AsrWhisperLanguage =
      zhScore >= enScore ? "chinese" : "english"

    console.log("[asr] language detect", {
      detected,
      zhScore,
      enScore,
      zhId,
      enId,
    })

    return detected
  } catch (error) {
    console.warn(
      "[asr] language detect failed; defaulting to chinese:",
      error,
    )
    return "chinese"
  }
}

async function resolveWhisperLanguage(
  preference: AsrLanguagePreference,
  transcriber: AutomaticSpeechRecognitionPipeline,
  audio: Float32Array,
): Promise<AsrWhisperLanguage> {
  if (preference === "chinese" || preference === "english") {
    console.log("[asr] language preference", preference)
    return preference
  }
  return detectWhisperLanguage(transcriber, audio)
}

workerScope.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const data = event.data

  if (data.type === "cancel") {
    cancelledJobId = data.jobId
    if (activeJobId === data.jobId) {
      post({ type: "cancelled", jobId: data.jobId })
    }
    return
  }

  if (data.type === "warmup") {
    if (data.preferDevice) preferDevice = data.preferDevice
    // Overlap model download/compile with main-thread audio decode.
    void getTranscriber(data.jobId).catch((error) => {
      console.warn("[asr] Warmup load failed (will retry on transcribe):", error)
    })
    return
  }

  if (data.type !== "transcribe") return

  const { jobId, audio, language: languagePreference = "auto" } = data
  if (data.preferDevice) preferDevice = data.preferDevice
  activeJobId = jobId

  try {
    const transcriber = await getTranscriber(jobId)
    if (isCancelled(jobId)) {
      post({ type: "cancelled", jobId })
      return
    }

    const whisperLanguage = await resolveWhisperLanguage(
      languagePreference,
      transcriber,
      audio,
    )
    if (isCancelled(jobId)) {
      post({ type: "cancelled", jobId })
      return
    }

    let streamed = ""
    const streamer = new WhisperTextStreamer(
      // WhisperTextStreamer expects WhisperTokenizer; pipeline tokenizer is compatible at runtime.
      transcriber.tokenizer as ConstructorParameters<
        typeof WhisperTextStreamer
      >[0],
      {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (piece: string) => {
          if (isCancelled(jobId)) return
          if (!piece) return
          streamed += piece
          // Convert full buffer each tick (not per-piece) so OpenCC phrases
          // spanning chunk boundaries still map correctly.
          post({
            type: "partial",
            jobId,
            text: maybeSimplify(streamed.trimStart(), whisperLanguage),
          })
        },
      },
    )

    const durationSec = audio.length / SAMPLE_RATE
    const useChunking = durationSec > CHUNK_THRESHOLD_S

    // Never omit `language`: transformers.js defaults missing language to "en".
    // Never use task "translate" (that forces English output).
    // OpenCC only runs for chinese (English is left as-is).
    const result = await transcriber(audio, {
      language: whisperLanguage,
      task: "transcribe",
      // Text-only UI — timestamps add encoder/decoder cost we do not need.
      return_timestamps: false,
      do_sample: false,
      num_beams: 1,
      max_new_tokens: maxNewTokensForAudio(audio.length),
      ...(useChunking
        ? {
            chunk_length_s: CHUNK_LENGTH_S,
            stride_length_s: STRIDE_LENGTH_S,
          }
        : {}),
      streamer,
    })

    if (isCancelled(jobId)) {
      post({ type: "cancelled", jobId })
      return
    }

    const finalText = (
      typeof result === "object" && result && "text" in result
        ? String((result as { text?: string }).text || "")
        : streamed
    ).trim()

    post({
      type: "done",
      jobId,
      text: maybeSimplify(finalText || streamed.trim(), whisperLanguage),
    })
  } catch (error) {
    if (isCancelled(jobId)) {
      post({ type: "cancelled", jobId })
      return
    }
    console.error("[asr] Whisper failed:", error)
    post({ type: "error", jobId, message: USER_FACING_ERROR })
  }
}
