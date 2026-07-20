const LIP_SYNC_ENGINE_URL = "/vendor/lip-sync-engine/index.mjs"
const LIP_SYNC_WASM_BASE = "/vendor/lip-sync-engine/wasm"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lipSyncModulePromise: Promise<any> | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lipSyncEngine: any = null
let rhubarbReady = false

async function loadLipSyncModule() {
  if (!lipSyncModulePromise) {
    lipSyncModulePromise = import(
      /* @vite-ignore */ LIP_SYNC_ENGINE_URL
    )
  }
  return lipSyncModulePromise
}

export async function ensureRhubarbEngine() {
  if (rhubarbReady && lipSyncEngine) return lipSyncEngine
  const mod = await loadLipSyncModule()
  lipSyncEngine = mod.LipSyncEngine.getInstance()
  await lipSyncEngine.init({
    wasmPath: `${LIP_SYNC_WASM_BASE}/lip-sync-engine.wasm`,
    dataPath: `${LIP_SYNC_WASM_BASE}/lip-sync-engine.data`,
    jsPath: `${LIP_SYNC_WASM_BASE}/lip-sync-engine.js`,
  })
  rhubarbReady = true
  return lipSyncEngine
}

export async function analyzeWithRhubarb(audioBlob: Blob, dialogText: string) {
  const mod = await loadLipSyncModule()
  const engine = await ensureRhubarbEngine()
  const tempUrl = URL.createObjectURL(audioBlob)

  try {
    const { pcm16 } = await mod.loadAudio(tempUrl)
    const result = await engine.analyze(pcm16, {
      dialogText,
      sampleRate: 16000,
    })

    if (!result?.mouthCues?.length) {
      throw new Error("没有返回有效的嘴型数据。")
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
