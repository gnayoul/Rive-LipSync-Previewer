import { appUrl } from "@/lib/app-url"

/** 预设动画按音色性别切换：男（含男童）→ boy，女（含女童）→ girl */
export type VoiceGender = "male" | "female"

/**
 * Edge TTS 可选音色（与 Azure Voice Gallery 选型对应）。
 * 注：Yunyi Dragon / Brandon / Amber / 晓双 等 HD 或较新音色在 Edge 端不可用，
 * 已换成同气质、可合成的最接近 ShortName。
 */
export const EDGE_VOICES = [
  // 英文优先 → 中英成人 → 中英儿童；同组内男先于女
  { value: "en-US-GuyNeural", label: "英文，男性", gender: "male" }, // Brandon 近似
  { value: "en-US-AriaNeural", label: "英文，女性", gender: "female" }, // Amber 近似
  { value: "zh-CN-YunxiNeural", label: "中英，男性", gender: "male" },
  { value: "zh-CN-XiaoxiaoNeural", label: "中英，女性", gender: "female" },
  { value: "zh-CN-YunxiaNeural", label: "中英，男童", gender: "male" },
  { value: "zh-CN-XiaoyiNeural", label: "中英，女童", gender: "female" }, // 晓双 近似
] as const

export const TTS_RATES = [
  { value: "0.5", label: "0.5x" },
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
  { value: "1.75", label: "1.75x" },
  { value: "2", label: "2x" },
] as const

/** bump 以迫使浏览器绕过对 .riv 的强缓存 */
const RIVE_ASSET_VERSION = "20260721-2304"
/** bump 当 web/public/brand/logo.riv 更新时 */
const LOGO_RIVE_VERSION = "20260721-2316"

export const BOY_RIVE_URL = appUrl(`boy.riv?v=${RIVE_ASSET_VERSION}`)
export const GIRL_RIVE_URL = appUrl(`girl.riv?v=${RIVE_ASSET_VERSION}`)
export const LOGO_RIVE_URL = appUrl(`brand/logo.riv?v=${LOGO_RIVE_VERSION}`)
/** 默认音色为男童 → boy */
export const DEFAULT_RIVE_URL = BOY_RIVE_URL

export function genderForVoice(voiceValue: string): VoiceGender {
  const found = EDGE_VOICES.find((item) => item.value === voiceValue)
  return found?.gender ?? "male"
}

export function riveUrlForGender(gender: VoiceGender): string {
  return gender === "female" ? GIRL_RIVE_URL : BOY_RIVE_URL
}

export function riveFileNameForGender(gender: VoiceGender): string {
  return gender === "female" ? "girl.riv" : "boy.riv"
}

/** 文本 Tab 默认台词（与预置 speech/mouth 对齐） */
export const DEFAULT_SPEECH_TEXT =
  "Hello, I am a talking animated character. Nice to meet you!"

/** 首次体验预置：静态音频 + Rhubarb 嘴型 JSON（无需启动时 TTS） */
export const PRESET_SPEECH_URL = appUrl("preset/speech.mp3")
export const PRESET_MOUTH_URL = appUrl("preset/mouth.json")

/** 默认音色：中英，男童 */
export const DEFAULT_VOICE = "zh-CN-YunxiaNeural"

/** Whisper ASR language preference on the 声音识别 tab. */
export const ASR_LANGUAGES = [
  { value: "auto", label: "自动识别语种" },
  { value: "chinese", label: "中文" },
  { value: "english", label: "英文" },
] as const

export const DEFAULT_ASR_LANGUAGE = "auto" as const

/** 嘴型时间偏移步进（秒）；UI 以 ms 展示 */
export const OFFSET_STEP_SEC = 0.05

export const MOUTH_GUIDE_ROWS = [
  {
    value: 0,
    shape: "X",
    desc: "静息 / 闭嘴（静音）",
    image: appUrl("mouth/0.png"),
  },
  {
    value: 1,
    shape: "A",
    desc: "双唇闭合（b / m / p等）如 back",
    image: appUrl("mouth/1.png"),
  },
  {
    value: 2,
    shape: "B",
    desc: "微张、露齿感（多数辅音 / ee）如 bee",
    image: appUrl("mouth/2.png"),
  },
  {
    value: 3,
    shape: "C",
    desc: "自然张开（eh 等）如 bat",
    image: appUrl("mouth/3.png"),
  },
  {
    value: 4,
    shape: "D",
    desc: "大张（ah 等）如 high",
    image: appUrl("mouth/4.png"),
  },
  {
    value: 5,
    shape: "E",
    desc: "略圆（er / aw 等）如 hot",
    image: appUrl("mouth/5.png"),
  },
  {
    value: 6,
    shape: "F",
    desc: "撮口（oo / w 等）如 wow",
    image: appUrl("mouth/6.png"),
  },
  {
    value: 7,
    shape: "G",
    desc: "上牙咬下唇（f / v）如 fun",
    image: appUrl("mouth/7.png"),
  },
  {
    value: 8,
    shape: "H",
    desc: "舌尖顶上（L）如 let",
    image: appUrl("mouth/8.png"),
  },
] as const

export const SHAPE_TO_VALUE: Record<string, number> = {
  X: 0,
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
}

export const RIVE_SETTINGS_FIELDS = [
  {
    key: "dataMode",
    label: "数据控制方式",
    kind: "select" as const,
    options: [
      { value: "viewModel", label: "ViewModel Number" },
      { value: "stateMachine", label: "State Machine Input" },
    ],
  },
  {
    key: "artboardName",
    label: "Artboard 名称",
    kind: "text" as const,
    placeholder: "留空使用默认",
  },
  {
    key: "stateMachine",
    label: "State Machine 名称",
    kind: "text" as const,
    placeholder: "留空自动使用第一个",
  },
  {
    key: "mouthInputName",
    label: "Number 输入名称",
    kind: "text" as const,
  },
  {
    key: "viewModelName",
    label: "ViewModel 名称",
    kind: "text" as const,
  },
  {
    key: "viewModelPath",
    label: "ViewModel Number 属性",
    kind: "text" as const,
  },
  {
    key: "fit",
    label: "画面适配",
    kind: "select" as const,
    options: [
      { value: "contain", label: "Contain" },
      { value: "cover", label: "Cover" },
      { value: "fitWidth", label: "Fit Width" },
      { value: "fitHeight", label: "Fit Height" },
    ],
  },
  {
    key: "offset",
    label: "嘴型时间偏移 秒",
    kind: "number" as const,
    step: 0.01,
  },
]

export type StatusTone = "default" | "ok" | "warn" | "error"

export type MouthCue = {
  start: number
  end: number
  value: string
}

export type RhubarbJson = {
  metadata?: Record<string, unknown>
  mouthCues?: MouthCue[]
}
