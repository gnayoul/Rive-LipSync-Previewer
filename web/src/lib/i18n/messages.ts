export type Locale = "zh" | "en"

export type MessageKey = keyof typeof zh

const zh = {
  "app.title": "Rive 嘴型同步预览器",
  "header.toggleLocale": "切换为 English",
  "header.toggleThemeLight": "切换到浅色模式",
  "header.toggleThemeDark": "切换到深色模式",
  "header.chromeTip": "完整 ASR 建议用系统 Chrome 打开",

  "source.aria": "素材来源",
  "source.tabText": "文本识别",
  "source.tabVoice": "声音识别",
  "source.inputLabel": "输入内容",
  "source.langHint": "支持英文/中文，英文表现佳",
  "source.placeholder": "请输入",
  "source.voiceLabel": "语言",
  "source.rateLabel": "声音倍速",
  "source.generate": "生成语音与嘴型数据",
  "source.generating": "生成中…",
  "source.downloadAudio": "下载语音",
  "source.downloadAudioDisclaimer":
    "语音仅可作为测试与学习交流，严禁商用。",
  "source.downloadAudioConfirm": "我已知晓，继续下载",
  "source.downloadJson": "下载嘴型数据",
  "source.uploadAudio": "上传语音",
  "source.uploadAudioTitle": "点击上传你的音频文件",
  "source.uploadAudioDesc": "仅支持 .wav / .ogg / .mp3",
  "source.asrLabel": "语音字幕生成",
  "source.asrLangAria": "识别语言",
  "source.analyze": "生成嘴型数据",
  "source.asrHint":
    "字幕生成中，可先点击下方「生成嘴型数据」预览动画。",
  "source.asrPlaceholder": "语音识别成功后，将在此处自动生成文本内容",

  "voice.enMale": "英文，男性",
  "voice.enFemale": "英文，女性",
  "voice.zhMale": "中英，男性",
  "voice.zhFemale": "中英，女性",
  "voice.zhBoy": "中英，男童",
  "voice.zhGirl": "中英，女童",

  "asr.auto": "自动识别语种",
  "asr.chinese": "中文",
  "asr.english": "英文",

  "file.replace": "更换",
  "file.clear": "清除文件",

  "transport.play": "播放",
  "transport.pause": "暂停",
  "transport.restart": "重播",
  "transport.settings": "动画设置",
  "transport.offset": "时间偏移 {ms}ms",
  "transport.offsetDec": "减少偏移",
  "transport.offsetInc": "增加偏移",
  "transport.uploadCustom": "上传自定义动画",
  "transport.missingMouthData": "缺少嘴型数据",

  "dialog.uploadTitle": "上传自定义动画",
  "dialog.uploadDesc": "上传 .riv 文件，并查看嘴型制作要求",
  "dialog.uploadRivTitle": "点击上传你的.riv文件",
  "dialog.uploadRivDesc":
    "PS：本工具无法自动生成嘴型，请先在rive中完成嘴型制作",
  "dialog.requirementsTitle": "Rive嘴型制作要求：",
  "dialog.req1": "1、请在rive中分别制作如下9个嘴型的Timeline",
  "dialog.req2":
    "2、在Data面板中创建number类型的变量（变量名建议为“mouth”）",
  "dialog.req3":
    "3、根据如下对应关系设置状态机：变量在不同数值下触发对应的嘴型Timeline",
  "dialog.colShape": "嘴型",
  "dialog.colDesc": "说明",
  "dialog.shapeAlt": "嘴型 {shape}",

  "mouth.x": "静息 / 闭嘴（静音）",
  "mouth.a": "双唇闭合（b / m / p等）如 back",
  "mouth.b": "微张、露齿感（多数辅音 / ee）如 bee",
  "mouth.c": "自然张开（eh 等）如 bat",
  "mouth.d": "大张（ah 等）如 high",
  "mouth.e": "略圆（er / aw 等）如 hot",
  "mouth.f": "撮口（oo / w 等）如 wow",
  "mouth.g": "上牙咬下唇（f / v）如 fun",
  "mouth.h": "舌尖顶上（L）如 let",

  "status.rhubarbLoadFail": "嘴型分析加载失败：{error}",
  "status.defaultRiveFail": "默认 Rive 加载失败：{error}",
  "status.unknownError": "未知错误",
  "status.asrFail": "字幕识别失败，请重试",
  "status.analyzing": "正在分析嘴型...",
  "status.analyzeOk": "嘴型数据已生成，请在左侧播放动画预览",
  "status.analyzeFail": "嘴型分析失败：{error}",
  "status.rhubarbNoCues": "没有返回有效的嘴型数据。",
  "status.textTooLong":
    "文本过长，请控制在加权 {limit} 单位以内",
  "status.generating": "正在生成语音与嘴型...",
  "status.ttsNoAudio": "语音合成失败，未获得音频数据。",
  "status.generateOk": "语音与嘴型数据已生成，请在左侧播放动画预览",
  "status.preloadIncomplete": "默认语音预加载未完成，可手动生成",
  "status.generateFail": "生成失败：{error}",
  "status.generateFailVoiceLang":
    "生成失败：所选音色可能不支持当前输入语言，请切换音色或调整文本语言后重试。",
  "status.ttsUnavailable":
    "无法连接语音服务。请确认已通过本站地址打开页面。",
  "status.ttsTimeout": "语音合成超时，请稍后重试。",
  "status.audioDurationFail": "无法读取生成音频的时长。",
  "status.requestFail": "请求失败（{status}）",
  "status.rateLimited": "请求过快，请稍后再试。",
  "status.ttsMissingText": "缺少文本。",
  "status.bodyTooLarge": "请求体过大，请缩短文本后重试。",

  "statusPanel.title": "当前状态",
  "statusPanel.shapeNow": "当前嘴型",
  "statusPanel.valueNow": "当前数值",
  "statusPanel.cueCount": "嘴型片段数量",
  "statusPanel.stateMachines": "检测到的 State Machine",

  "footer.prefix": "本工具由",
  "footer.suffix":
    "制作，嘴型数据可用于商业用途，语音仅可作为测试与学习交流，严禁商用。",

  "preview.aria": "预览舞台",
} as const

const en: Record<MessageKey, string> = {
  "app.title": "Rive Lip Sync Previewer",
  "header.toggleLocale": "Switch to 中文",
  "header.toggleThemeLight": "Switch to light mode",
  "header.toggleThemeDark": "Switch to dark mode",
  "header.chromeTip": "For full ASR, open in system Chrome:",

  "source.aria": "Source panel",
  "source.tabText": "Text to speech",
  "source.tabVoice": "Voice upload",
  "source.inputLabel": "Content",
  "source.langHint": "English & Chinese; English works best",
  "source.placeholder": "Enter text",
  "source.voiceLabel": "Voice",
  "source.rateLabel": "Speed",
  "source.generate": "Generate speech & mouth data",
  "source.generating": "Generating…",
  "source.downloadAudio": "Download audio",
  "source.downloadAudioDisclaimer":
    "Audio is for testing and learning only. Commercial use is prohibited.",
  "source.downloadAudioConfirm": "I understand, continue",
  "source.downloadJson": "Download mouth data",
  "source.uploadAudio": "Upload audio",
  "source.uploadAudioTitle": "Click to upload your audio file",
  "source.uploadAudioDesc": "Supports .wav / .ogg / .mp3 only",
  "source.asrLabel": "Transcript",
  "source.asrLangAria": "Recognition language",
  "source.analyze": "Generate mouth data",
  "source.asrHint":
    "Generating captions… You can click “Generate mouth data” below to preview.",
  "source.asrPlaceholder":
    "Transcript will appear here after speech recognition succeeds",

  "voice.enMale": "English, male",
  "voice.enFemale": "English, female",
  "voice.zhMale": "CN/EN, male",
  "voice.zhFemale": "CN/EN, female",
  "voice.zhBoy": "CN/EN, boy",
  "voice.zhGirl": "CN/EN, girl",

  "asr.auto": "Auto-detect language",
  "asr.chinese": "Chinese",
  "asr.english": "English",

  "file.replace": "Replace",
  "file.clear": "Clear file",

  "transport.play": "Play",
  "transport.pause": "Pause",
  "transport.restart": "Restart",
  "transport.settings": "Animation settings",
  "transport.offset": "Time offset {ms}ms",
  "transport.offsetDec": "Decrease offset",
  "transport.offsetInc": "Increase offset",
  "transport.uploadCustom": "Upload custom animation",
  "transport.missingMouthData": "Missing mouth data",

  "dialog.uploadTitle": "Upload custom animation",
  "dialog.uploadDesc": "Upload a .riv file and review mouth-shape requirements",
  "dialog.uploadRivTitle": "Click to upload your .riv file",
  "dialog.uploadRivDesc":
    "Note: this tool cannot create mouth shapes automatically — finish them in Rive first",
  "dialog.requirementsTitle": "Rive mouth-shape requirements:",
  "dialog.req1":
    "1. Create a Timeline in Rive for each of the 9 mouth shapes below",
  "dialog.req2":
    "2. Create a number variable in the Data panel (recommended name: “mouth”)",
  "dialog.req3":
    "3. Wire the state machine so each number value triggers the matching Timeline",
  "dialog.colShape": "Shape",
  "dialog.colDesc": "Description",
  "dialog.shapeAlt": "Mouth shape {shape}",

  "mouth.x": "Rest / closed (silence)",
  "mouth.a": "Lips closed (b / m / p) e.g. back",
  "mouth.b": "Slightly open, teeth (most consonants / ee) e.g. bee",
  "mouth.c": "Natural open (eh) e.g. bat",
  "mouth.d": "Wide open (ah) e.g. high",
  "mouth.e": "Slightly round (er / aw) e.g. hot",
  "mouth.f": "Puckered (oo / w) e.g. wow",
  "mouth.g": "Upper teeth on lower lip (f / v) e.g. fun",
  "mouth.h": "Tongue tip up (L) e.g. let",

  "status.rhubarbLoadFail": "Failed to load mouth analysis: {error}",
  "status.defaultRiveFail": "Failed to load default Rive: {error}",
  "status.unknownError": "Unknown error",
  "status.asrFail": "Caption recognition failed. Please try again.",
  "status.analyzing": "Analyzing mouth shapes…",
  "status.analyzeOk":
    "Mouth data ready — play the animation on the left to preview",
  "status.analyzeFail": "Mouth analysis failed: {error}",
  "status.rhubarbNoCues": "No valid mouth shape data returned.",
  "status.textTooLong":
    "Text too long — keep within {limit} weighted units",
  "status.generating": "Generating speech and mouth data…",
  "status.ttsNoAudio": "Speech synthesis failed — no audio returned.",
  "status.generateOk":
    "Speech and mouth data ready — play the animation on the left to preview",
  "status.preloadIncomplete":
    "Default speech preload incomplete — you can generate manually",
  "status.generateFail": "Generation failed: {error}",
  "status.generateFailVoiceLang":
    "Generation failed: the selected voice may not support this language. Switch voice or adjust the text language and try again.",
  "status.ttsUnavailable":
    "Cannot reach the speech service. Open this page via the site URL.",
  "status.ttsTimeout": "Speech synthesis timed out. Please try again.",
  "status.audioDurationFail": "Could not read the generated audio duration.",
  "status.requestFail": "Request failed ({status})",
  "status.rateLimited": "Too many requests. Please try again later.",
  "status.ttsMissingText": "Text is required.",
  "status.bodyTooLarge": "Request body too large. Shorten the text and try again.",

  "statusPanel.title": "Status",
  "statusPanel.shapeNow": "Current mouth shape",
  "statusPanel.valueNow": "Current value",
  "statusPanel.cueCount": "Mouth cue count",
  "statusPanel.stateMachines": "Detected state machines",

  "footer.prefix": "Built by",
  "footer.suffix":
    ". Mouth data may be used commercially; audio is for testing and learning only — commercial use prohibited.",

  "preview.aria": "Preview stage",
}

export const messages: Record<Locale, Record<MessageKey, string>> = {
  zh,
  en,
}

export const VOICE_LABEL_KEYS: Record<string, MessageKey> = {
  "en-US-GuyNeural": "voice.enMale",
  "en-US-AriaNeural": "voice.enFemale",
  "zh-CN-YunxiNeural": "voice.zhMale",
  "zh-CN-XiaoxiaoNeural": "voice.zhFemale",
  "zh-CN-YunxiaNeural": "voice.zhBoy",
  "zh-CN-XiaoyiNeural": "voice.zhGirl",
}

export const ASR_LABEL_KEYS: Record<string, MessageKey> = {
  auto: "asr.auto",
  chinese: "asr.chinese",
  english: "asr.english",
}

export const MOUTH_DESC_KEYS: Record<string, MessageKey> = {
  X: "mouth.x",
  A: "mouth.a",
  B: "mouth.b",
  C: "mouth.c",
  D: "mouth.d",
  E: "mouth.e",
  F: "mouth.f",
  G: "mouth.g",
  H: "mouth.h",
}
