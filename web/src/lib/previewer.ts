import type { MouthCue, RhubarbJson } from "@/lib/constants"
import type { MessageKey } from "@/lib/i18n/messages"
import { WEIGHTED_TEXT_LIMIT } from "@/lib/weighted-text"

/** Stable error codes thrown from previewer helpers (mapped to i18n in the UI). */
export const ERR_TTS_UNAVAILABLE = "TTS_UNAVAILABLE"
export const ERR_TTS_TIMEOUT = "TTS_TIMEOUT"
export const ERR_AUDIO_DURATION = "AUDIO_DURATION_FAIL"
export const ERR_TTS_NO_AUDIO = "TTS_NO_AUDIO"
export const ERR_RHUBARB_NO_CUES = "RHUBARB_NO_CUES"
export const ERR_RATE_LIMITED = "RATE_LIMITED"
export const ERR_TTS_MISSING_TEXT = "TTS_MISSING_TEXT"
export const ERR_TEXT_TOO_LONG = "TEXT_TOO_LONG"
export const ERR_BODY_TOO_LARGE = "BODY_TOO_LARGE"
export const ERR_REQUEST_FAIL = "REQUEST_FAIL"

/** Edge TTS can hang for minutes on flaky Microsoft endpoints; fail fast in the UI. */
const TTS_FETCH_TIMEOUT_MS = 60_000
const HEALTH_FETCH_TIMEOUT_MS = 5_000

export type StatusMessageSpec = {
  messageKey: MessageKey
  params?: Record<string, string | number>
}

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
    return data.error || raw || `${ERR_REQUEST_FAIL}:${response.status}`
  } catch {
    return raw || `${ERR_REQUEST_FAIL}:${response.status}`
  }
}

function stripGenerateFailPrefix(raw: string) {
  return raw
    .replace(/^生成失败[：:]\s*/u, "")
    .replace(/^Generation failed:\s*/i, "")
    .replace(/^语音合成失败[：:]\s*/u, "")
    .trim()
}

/** Map known thrown codes / legacy Chinese messages to status keys. */
export function resolveKnownErrorKey(raw: string): MessageKey | null {
  if (raw.startsWith(`${ERR_REQUEST_FAIL}:`) || /^请求失败[（(]/u.test(raw)) {
    return null // handled with params in resolveSpeechGenerateError
  }
  switch (raw) {
    case ERR_TTS_UNAVAILABLE:
    case "无法连接语音服务。请确认已通过本站地址打开页面。":
      return "status.ttsUnavailable"
    case ERR_TTS_TIMEOUT:
    case "语音合成超时，请稍后重试。":
      return "status.ttsTimeout"
    case ERR_AUDIO_DURATION:
    case "无法读取生成音频的时长。":
      return "status.audioDurationFail"
    case ERR_TTS_NO_AUDIO:
    case "语音合成失败，未获得音频数据。":
    case "语音合成没有返回音频数据。":
      return "status.ttsNoAudio"
    case ERR_RHUBARB_NO_CUES:
    case "没有返回有效的嘴型数据。":
      return "status.rhubarbNoCues"
    case ERR_RATE_LIMITED:
    case "请求过快，请稍后再试。":
    case "服务繁忙，请稍后再试。":
      return "status.rateLimited"
    case ERR_TTS_MISSING_TEXT:
    case "缺少文本。":
      return "status.ttsMissingText"
    case ERR_TEXT_TOO_LONG:
      return "status.textTooLong"
    case ERR_BODY_TOO_LARGE:
    case "请求体过大。":
      return "status.bodyTooLarge"
    default:
      return null
  }
}

function resolveRequestFail(raw: string): StatusMessageSpec | null {
  if (raw.startsWith(`${ERR_REQUEST_FAIL}:`)) {
    return {
      messageKey: "status.requestFail",
      params: { status: raw.slice(ERR_REQUEST_FAIL.length + 1) },
    }
  }
  const match = raw.match(/^请求失败[（(](\d+)[）)]/u)
  if (match) {
    return {
      messageKey: "status.requestFail",
      params: { status: match[1] },
    }
  }
  return null
}

/** Map TTS / generate failures to i18n keys (translate at render time). */
export function resolveSpeechGenerateError(
  error: unknown,
): StatusMessageSpec {
  const raw = error instanceof Error ? error.message : String(error || "")
  const lower = raw.toLowerCase()

  const requestFail = resolveRequestFail(raw)
  if (requestFail) return requestFail

  const known = resolveKnownErrorKey(raw)
  if (known) {
    if (known === "status.textTooLong") {
      return { messageKey: known, params: { limit: WEIGHTED_TEXT_LIMIT } }
    }
    return { messageKey: known }
  }

  if (
    lower.includes("no audio was received") ||
    raw.includes("没有返回音频") ||
    raw.includes("未获得音频") ||
    raw.includes("没有返回音频数据")
  ) {
    return { messageKey: "status.generateFailVoiceLang" }
  }

  if (
    lower.includes("429") ||
    lower.includes("too many") ||
    lower.includes("rate limit") ||
    raw.includes("请求过快") ||
    raw.includes("服务繁忙")
  ) {
    return { messageKey: "status.rateLimited" }
  }

  if (raw.includes("文本过长") || lower.includes("text too long")) {
    return {
      messageKey: "status.textTooLong",
      params: { limit: WEIGHTED_TEXT_LIMIT },
    }
  }

  if (
    raw.includes("请求体过大") ||
    lower.includes("payload too large") ||
    lower.includes("body too large")
  ) {
    return { messageKey: "status.bodyTooLarge" }
  }

  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    raw.includes("超时") ||
    (error instanceof DOMException &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  ) {
    return { messageKey: "status.ttsTimeout" }
  }

  if (
    error instanceof TypeError ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed")
  ) {
    return { messageKey: "status.ttsUnavailable" }
  }

  const cleaned = stripGenerateFailPrefix(raw)
  return {
    messageKey: "status.generateFail",
    params: { error: cleaned || raw || "unknown" },
  }
}

export function resolveAnalyzeError(error: unknown): StatusMessageSpec {
  const raw = error instanceof Error ? error.message : String(error || "")
  const known = resolveKnownErrorKey(raw)
  if (known) return { messageKey: known }
  return {
    messageKey: "status.analyzeFail",
    params: { error: raw || "unknown" },
  }
}

export async function refreshServerHealth() {
  try {
    const response = await fetch(`${getServerBaseUrl()}/api/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(HEALTH_FETCH_TIMEOUT_MS),
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
    throw new Error(ERR_TTS_UNAVAILABLE)
  }

  let response: Response
  try {
    response = await fetch(`${getServerBaseUrl()}/api/tts/edge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, rate }),
      signal: AbortSignal.timeout(TTS_FETCH_TIMEOUT_MS),
    })
  } catch (error) {
    if (
      (error instanceof DOMException &&
        (error.name === "AbortError" || error.name === "TimeoutError")) ||
      (error instanceof Error && /timeout|aborted/i.test(error.message))
    ) {
      throw new Error(ERR_TTS_TIMEOUT)
    }
    if (error instanceof TypeError) {
      throw new Error(ERR_TTS_UNAVAILABLE)
    }
    throw error
  }

  if (!response.ok) {
    if (response.status === 429) throw new Error(ERR_RATE_LIMITED)
    if (response.status === 413) throw new Error(ERR_BODY_TOO_LARGE)
    if (response.status === 504) throw new Error(ERR_TTS_TIMEOUT)

    const apiError = await parseApiError(response)
    if (apiError === "缺少文本。" || apiError === ERR_TTS_MISSING_TEXT) {
      throw new Error(ERR_TTS_MISSING_TEXT)
    }
    if (
      response.status === 400 &&
      (apiError.includes("文本过长") || /text too long/i.test(apiError))
    ) {
      throw new Error(ERR_TEXT_TOO_LONG)
    }
    if (
      apiError.includes("请求体过大") ||
      /body too large|payload too large/i.test(apiError)
    ) {
      throw new Error(ERR_BODY_TOO_LARGE)
    }
    if (
      apiError.includes("请求过快") ||
      apiError.includes("服务繁忙") ||
      /rate limit|too many|busy/i.test(apiError)
    ) {
      throw new Error(ERR_RATE_LIMITED)
    }
    if (/超时|timeout/i.test(apiError)) {
      throw new Error(ERR_TTS_TIMEOUT)
    }
    throw new Error(apiError)
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
      audio.onerror = () => reject(new Error(ERR_AUDIO_DURATION))
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
