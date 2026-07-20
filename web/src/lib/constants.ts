export const EDGE_VOICES = [
  { id: "zh-CN-XiaoxiaoNeural", label: "晓晓（女声，中文）" },
  { id: "zh-CN-YunxiNeural", label: "云希（男声，中文）" },
  { id: "zh-CN-XiaoyiNeural", label: "晓伊（女声，中文）" },
  { id: "zh-CN-YunyangNeural", label: "云扬（男声，新闻）" },
  { id: "zh-TW-HsiaoChenNeural", label: "晓臻（女声，繁体）" },
  { id: "en-US-JennyNeural", label: "Jenny（女声，英文）" },
  { id: "en-US-GuyNeural", label: "Guy（男声，英文）" },
  { id: "ja-JP-NanamiNeural", label: "Nanami（女声，日文）" },
] as const

export const TTS_RATES = [
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
] as const

export const DEFAULT_RIVE_URL = "/boy.riv"

/** 文本识别默认台词（预加载语音与嘴型） */
export const DEFAULT_SPEECH_TEXT =
  "Hi, I'm Rive Lipsyncer. Nice to meet you!"

/** 默认英文句对应英文声线 */
export const DEFAULT_VOICE = "en-US-GuyNeural"

/** 嘴型时间偏移步进（秒）；UI 以 ms 展示 */
export const OFFSET_STEP_SEC = 0.05

export const MOUTH_GUIDE_ROWS = [
  {
    value: 0,
    shape: "X",
    desc: "静息 / 闭嘴（静音）",
    image: "/mouth/0.png",
  },
  {
    value: 1,
    shape: "A",
    desc: "双唇闭合（b / m / p等）如 back",
    image: "/mouth/1.png",
  },
  {
    value: 2,
    shape: "B",
    desc: "微张、露齿感（多数辅音 / ee）如 bee",
    image: "/mouth/2.png",
  },
  {
    value: 3,
    shape: "C",
    desc: "自然张开（eh 等）如 bat",
    image: "/mouth/3.png",
  },
  {
    value: 4,
    shape: "D",
    desc: "大张（ah 等）如 high",
    image: "/mouth/4.png",
  },
  {
    value: 5,
    shape: "E",
    desc: "略圆（er / aw 等）如 hot",
    image: "/mouth/5.png",
  },
  {
    value: 6,
    shape: "F",
    desc: "撮口（oo / w 等）如 wow",
    image: "/mouth/6.png",
  },
  {
    value: 7,
    shape: "G",
    desc: "上牙咬下唇（f / v）如 fun",
    image: "/mouth/7.png",
  },
  {
    value: 8,
    shape: "H",
    desc: "舌尖顶上（L）如 let",
    image: "/mouth/8.png",
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
