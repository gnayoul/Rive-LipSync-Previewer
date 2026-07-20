import type { MouthCue, RhubarbJson } from "@/lib/constants"

export function getServerBaseUrl() {
  if (window.location.protocol.startsWith("http")) {
    return window.location.origin
  }
  return "http://localhost:3921"
}

export async function parseApiError(response: Response) {
  const raw = await response.text()
  try {
    const data = JSON.parse(raw) as { error?: string }
    return data.error || raw
  } catch {
    return raw || `请求失败（${response.status}）`
  }
}

export async function refreshServerHealth() {
  try {
    const response = await fetch(`${getServerBaseUrl()}/api/health`, {
      cache: "no-store",
    })
    if (!response.ok) throw new Error("health check failed")
    return (await response.json()) as { ok: boolean; ttsProxy?: boolean }
  } catch {
    return { ok: false, ttsProxy: false }
  }
}

export function normalizeMouthCues(mouthCues: MouthCue[] = []): MouthCue[] {
  return mouthCues
    .map((cue) => ({
      start: Number(cue.start),
      end: Number(cue.end),
      value: String(cue.value || "X").toUpperCase(),
    }))
    .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end))
    .sort((a, b) => a.start - b.start)
}

export function findCueAtTime(list: MouthCue[], time: number) {
  let low = 0
  let high = list.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const cue = list[mid]
    if (time < cue.start) high = mid - 1
    else if (time >= cue.end) low = mid + 1
    else return cue
  }
  return null
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function getBlobExtension(blob: Blob) {
  const type = blob.type || ""
  if (type.includes("wav")) return "wav"
  if (type.includes("ogg")) return "ogg"
  if (type.includes("webm")) return "webm"
  return "mp3"
}

export async function synthesizeEdgeTTS(
  text: string,
  voice: string,
  rate = 1,
  healthOk = false,
) {
  let ok = healthOk
  if (!ok) {
    const health = await refreshServerHealth()
    ok = Boolean(health.ok)
  }
  if (!ok) {
    throw new Error("无法连接语音服务。请确认已通过本站地址打开页面。")
  }

  const response = await fetch(`${getServerBaseUrl()}/api/tts/edge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, rate }),
  })

  if (!response.ok) {
    throw new Error(await parseApiError(response))
  }

  return response.blob()
}

export async function getAudioDuration(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    const audio = new Audio()
    const duration = await new Promise<number>((resolve, reject) => {
      audio.preload = "metadata"
      audio.onloadedmetadata = () => resolve(audio.duration)
      audio.onerror = () => reject(new Error("无法读取生成音频的时长。"))
      audio.src = url
    })
    return Number.isFinite(duration) ? duration : 0
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function downloadJson(data: RhubarbJson) {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    "mouth.json",
  )
}

export function statusBadgeClass(tone: string) {
  if (tone === "ok") return "border-green-600/30 bg-green-600/10 text-green-700"
  if (tone === "warn") return "border-amber-600/30 bg-amber-600/10 text-amber-700"
  if (tone === "error")
    return "border-destructive/40 bg-destructive/10 text-destructive"
  return ""
}
