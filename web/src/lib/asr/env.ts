export type AsrDevicePreference = "auto" | "wasm"

/**
 * Cursor / VS Code Simple Browser (and similar Electron shells) often expose
 * a broken or hanging WebGPU path. Prefer WASM there; system Chrome stays on auto.
 *
 * Override: `?asrDevice=wasm` | `?asrDevice=webgpu` (webgpu forces auto try).
 */
export function isRestrictedPreviewBrowser(): boolean {
  if (typeof window === "undefined") return false

  try {
    const w = window as Window & { cursorBrowser?: unknown }
    if (w.cursorBrowser != null) return true
  } catch {
    // ignore
  }

  const ua = navigator.userAgent || ""
  // Editor Simple Browser runs in Electron; system Chrome does not.
  if (/\bElectron\b/i.test(ua)) return true

  return false
}

export function asrDevicePreference(): AsrDevicePreference {
  try {
    const q = new URLSearchParams(window.location.search).get("asrDevice")
    if (q === "wasm") return "wasm"
    if (q === "webgpu") return "auto"
  } catch {
    // ignore
  }
  return isRestrictedPreviewBrowser() ? "wasm" : "auto"
}
