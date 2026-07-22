import { appUrl } from "@/lib/app-url"

const LIP_SYNC_ENGINE_URL = appUrl("vendor/lip-sync-engine/index.mjs")
const LIP_SYNC_WORKER_URL = appUrl("vendor/lip-sync-engine/worker.js")
const LIP_SYNC_WASM_BASE = appUrl("vendor/lip-sync-engine/wasm")

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lipSyncModulePromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let workerPool: any = null
let rhubarbReady = false

async function loadLipSyncModule() {
  if (!lipSyncModulePromise) {
    lipSyncModulePromise = import(
      /* @vite-ignore */ LIP_SYNC_ENGINE_URL
    )
  }
  return lipSyncModulePromise
}

function wasmInitOptions() {
  return {
    wasmPath: `${LIP_SYNC_WASM_BASE}/lip-sync-engine.wasm`,
    dataPath: `${LIP_SYNC_WASM_BASE}/lip-sync-engine.data`,
    jsPath: `${LIP_SYNC_WASM_BASE}/lip-sync-engine.js`,
    workerScriptUrl: LIP_SYNC_WORKER_URL,
  }
}

/**
 * Warm up Rhubarb via WorkerPool so analysis never runs on the main thread.
 * Keeps ASR partials / React updates responsive while mouth cues generate.
 */
export async function ensureRhubarbEngine() {
  if (rhubarbReady && workerPool) return workerPool
  const mod = await loadLipSyncModule()
  workerPool = mod.WorkerPool.getInstance(1, LIP_SYNC_WORKER_URL)
  await workerPool.init(wasmInitOptions())
  rhubarbReady = true
  return workerPool
}

export async function analyzeWithRhubarb(audioBlob: Blob, dialogText: string) {
  const mod = await loadLipSyncModule()
  const pool = await ensureRhubarbEngine()
  const tempUrl = URL.createObjectURL(audioBlob)

  try {
    // Decode stays on main thread (async AudioContext); WASM analyze runs in worker.
    const { pcm16 } = await mod.loadAudio(tempUrl)
    const result = await pool.analyze(pcm16, {
      dialogText,
      sampleRate: 16000,
    })

    if (!result?.mouthCues?.length) {
      throw new Error("RHUBARB_NO_CUES")
    }

    return {
      metadata: {
        source: "rhubarb-wasm",
        generator: "lip-sync-engine",
        dialogText,
        ...(result.metadata || {}),
      },
      mouthCues: result.mouthCues,
    }
  } finally {
    URL.revokeObjectURL(tempUrl)
  }
}
