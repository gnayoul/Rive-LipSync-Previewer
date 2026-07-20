const RIVE_JS_URL = "/vendor/rive/rive.js"
const RIVE_WASM_URL = "/vendor/rive/rive.wasm"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let riveRuntimePromise: Promise<any> | null = null

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rive?: any
  }
}

export function loadRiveRuntime() {
  if (window.rive) {
    window.rive.RuntimeLoader?.setWasmUrl?.(RIVE_WASM_URL)
    return Promise.resolve(window.rive)
  }

  if (!riveRuntimePromise) {
    riveRuntimePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script")
      script.src = RIVE_JS_URL
      script.async = true
      script.crossOrigin = "anonymous"
      script.onload = () => {
        if (!window.rive) {
          reject(new Error("Rive runtime 已载入，但 window.rive 不存在。"))
          return
        }
        window.rive.RuntimeLoader?.setWasmUrl?.(RIVE_WASM_URL)
        resolve(window.rive)
      }
      script.onerror = () =>
        reject(new Error("无法载入 Rive runtime。请确认已通过本站地址打开页面。"))
      document.head.appendChild(script)
    })
  }

  return riveRuntimePromise
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFit(rive: any, value: string) {
  const map: Record<string, unknown> = {
    contain: rive.Fit.Contain,
    cover: rive.Fit.Cover,
    fitWidth: rive.Fit.FitWidth,
    fitHeight: rive.Fit.FitHeight,
  }
  return map[value] || rive.Fit.Contain
}
