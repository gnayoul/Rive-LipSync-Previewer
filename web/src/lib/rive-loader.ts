import { appUrl } from "@/lib/app-url"

const RIVE_JS_URL = appUrl("vendor/rive/rive.js")
const RIVE_WASM_URL = appUrl("vendor/rive/rive.wasm")

/** 遮罩揭开失败时的硬超时，避免 ready 永远 false */
export const RIVE_REVEAL_TIMEOUT_MS = 2000

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

/**
 * 等 N 帧 rAF，再揭开遮罩（减轻首帧空缓冲闪一下）。
 * 切勿在此期间对 Rive canvas 调用 getContext("2d")——本站用 @rive-app/webgl2，
 * 一旦拿到 2D context 会永久锁死，WebGL 再也建不起来。
 */
export function waitForRivePaint(frames = 2): Promise<void> {
  return new Promise((resolve) => {
    let left = Math.max(1, frames)
    const tick = () => {
      left -= 1
      if (left <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/**
 * 短等绘帧 + 硬超时；任一先到就 resolve。
 * 保证遮罩不会因 onLoad/绘帧异常而永久盖住。
 */
export function waitForRiveReveal(
  frames = 2,
  timeoutMs = RIVE_REVEAL_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      resolve()
    }
    void waitForRivePaint(frames).then(done)
    window.setTimeout(done, Math.max(0, timeoutMs))
  })
}
