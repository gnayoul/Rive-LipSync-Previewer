import { useCallback, useEffect, useRef, useState } from "react"

import { AppHeader } from "@/components/blocks/AppHeader"
import { PreviewStage } from "@/components/blocks/PreviewStage"
import { type RiveSettingsValues } from "@/components/blocks/RiveSettingsPanel"
import { SourcePanel } from "@/components/blocks/SourcePanel"
import { UploadRiveDialog } from "@/components/blocks/UploadRiveDialog"
import {
  DEFAULT_ASR_LANGUAGE,
  DEFAULT_SPEECH_TEXT,
  DEFAULT_VOICE,
  PRESET_MOUTH_URL,
  PRESET_SPEECH_URL,
  SHAPE_TO_VALUE,
  genderForVoice,
  riveFileNameForGender,
  riveUrlForGender,
  type MouthCue,
  type RhubarbJson,
  type VoiceGender,
} from "@/lib/constants"
import { isRestrictedPreviewBrowser } from "@/lib/asr/env"
import {
  cancelAsr,
  transcribeAudioFile,
  type AsrLanguagePreference,
  type AsrStatus,
} from "@/lib/asr/transcribe"
import {
  downloadBlob,
  downloadJson,
  findCueAtTime,
  resolveAnalyzeError,
  resolveSpeechGenerateError,
  getBlobExtension,
  normalizeMouthCues,
  refreshServerHealth,
  synthesizeEdgeTTS,
  ERR_TTS_NO_AUDIO,
} from "@/lib/previewer"
import { analyzeWithRhubarb, ensureRhubarbEngine } from "@/lib/rhubarb"
import {
  getFit,
  loadRiveRuntime,
  waitForRiveReveal,
} from "@/lib/rive-loader"
import {
  WEIGHTED_TEXT_LIMIT,
  getWeightedLength,
} from "@/lib/weighted-text"
import { useLocale } from "@/lib/i18n/locale-context"
import type { TabStatus } from "@/components/blocks/SourcePanel"

const EMPTY_STATUS: TabStatus = { messageKey: null, tone: "default" }

/**
 * 页面组装层：只拼功能块 + 接线业务逻辑。
 * UI 组合遵循 docs/shadcn-patterns.md（Playground + Field）。
 */
export function Previewer() {
  const { t } = useLocale()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const riveRef = useRef<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    instance: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mouthInput: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mouthViewModelNumber: any
    raf: number
  }>({ instance: null, mouthInput: null, mouthViewModelNumber: null, raf: 0 })
  const cuesRef = useRef<MouthCue[]>([])
  const offsetRef = useRef(0)
  const uploadTokenRef = useRef(0)
  const generateTokenRef = useRef(0)
  const asrAbortRef = useRef<AbortController | null>(null)
  const preloadDoneRef = useRef(false)
  const textAudioUrlRef = useRef<string | null>(null)
  const voiceAudioUrlRef = useRef<string | null>(null)
  const healthOkRef = useRef(false)
  const pendingAudioRef = useRef<File | null>(null)
  const speechTextRef = useRef(DEFAULT_SPEECH_TEXT)
  const voiceRef = useRef(DEFAULT_VOICE)
  const rateRef = useRef(1)
  /** 最近一次加载的预设 riv 性别；自定义上传期间不更新 */
  const presetGenderRef = useRef<VoiceGender | null>(null)

  const [mode, setMode] = useState<"upload" | "generate">("generate")
  const [riveFile, setRiveFile] = useState<File | null>(null)
  const [customRiveName, setCustomRiveName] = useState<string | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [audioFileName, setAudioFileName] = useState<string | null>(null)
  const [speechText, setSpeechText] = useState(DEFAULT_SPEECH_TEXT)
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE)
  const [rate, setRate] = useState(1)
  const [textStatus, setTextStatus] = useState<TabStatus>(EMPTY_STATUS)
  const [voiceStatus, setVoiceStatus] = useState<TabStatus>(EMPTY_STATUS)
  const [generating, setGenerating] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [textCues, setTextCues] = useState<MouthCue[]>([])
  const [voiceCues, setVoiceCues] = useState<MouthCue[]>([])
  const [textJson, setTextJson] = useState<RhubarbJson | null>(null)
  const [voiceJson, setVoiceJson] = useState<RhubarbJson | null>(null)
  const [textAudioBlob, setTextAudioBlob] = useState<Blob | null>(null)
  const [speechTranscript, setSpeechTranscript] = useState("")
  const [asrLanguage, setAsrLanguage] =
    useState<AsrLanguagePreference>(DEFAULT_ASR_LANGUAGE)
  const [asrStatus, setAsrStatus] = useState<AsrStatus>("idle")
  const [asrError, setAsrError] = useState(false)
  const [controlsReady, setControlsReady] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [timeText, setTimeText] = useState("0.00 / 0.00s")
  const [seekMax, setSeekMax] = useState(0)
  const [seekValue, setSeekValue] = useState(0)
  const [settings, setSettings] = useState<RiveSettingsValues>({
    dataMode: "viewModel",
    artboardName: "",
    stateMachine: "",
    mouthInputName: "mouth",
    viewModelName: "ViewModel2",
    viewModelPath: "mouth",
    fit: "contain",
    offset: 0,
  })

  useEffect(() => {
    cuesRef.current = mode === "generate" ? textCues : voiceCues
  }, [mode, textCues, voiceCues])

  useEffect(() => {
    offsetRef.current = settings.offset
  }, [settings.offset])

  useEffect(() => {
    speechTextRef.current = speechText
  }, [speechText])

  useEffect(() => {
    voiceRef.current = voice
  }, [voice])

  useEffect(() => {
    rateRef.current = rate
  }, [rate])

  const setMouthShape = useCallback((shape: string) => {
    const clean = SHAPE_TO_VALUE[shape] === undefined ? "X" : shape
    const value = SHAPE_TO_VALUE[clean]
    const { mouthInput, mouthViewModelNumber } = riveRef.current
    if (mouthViewModelNumber && typeof mouthViewModelNumber.value === "number") {
      mouthViewModelNumber.value = value
    }
    if (mouthInput && typeof mouthInput.value === "number") {
      mouthInput.value = value
    }
  }, [])

  const applyMouthAtTime = useCallback(
    (currentTime: number) => {
      const list = cuesRef.current
      if (!list.length) {
        setMouthShape("X")
        return
      }
      const t = Math.max(0, currentTime + (offsetRef.current || 0))
      const cue = findCueAtTime(list, t)
      setMouthShape(cue?.value || "X")
    },
    [setMouthShape],
  )

  const updateTimeText = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0
    setSeekMax(duration)
    setSeekValue(current)
    setTimeText(`${current.toFixed(2)} / ${duration.toFixed(2)}s`)
  }, [])

  const stopTick = useCallback(() => {
    if (riveRef.current.raf) {
      cancelAnimationFrame(riveRef.current.raf)
      riveRef.current.raf = 0
    }
  }, [])

  const startTick = useCallback(() => {
    stopTick()
    const frame = () => {
      const audio = audioRef.current
      if (audio) {
        applyMouthAtTime(audio.currentTime)
        updateTimeText()
      }
      riveRef.current.raf = requestAnimationFrame(frame)
    }
    frame()
  }, [applyMouthAtTime, stopTick, updateTimeText])

  const destroyRive = useCallback(() => {
    stopTick()
    riveRef.current.mouthInput = null
    riveRef.current.mouthViewModelNumber = null
    // 盖回同色遮罩再 cleanup。切勿对 canvas getContext("2d")——会锁死 WebGL2。
    setControlsReady(false)
    if (riveRef.current.instance) {
      try {
        riveRef.current.instance.cleanup?.()
      } catch {
        /* ignore */
      }
      riveRef.current.instance = null
    }
  }, [stopTick])

  useEffect(() => {
    // Cursor Simple Browser: defer WASM warm-up so first paint isn't starved.
    const restricted = isRestrictedPreviewBrowser()
    const warmRhubarb = () => {
      ensureRhubarbEngine().catch((error: Error) => {
        const next: TabStatus = {
          messageKey: "status.rhubarbLoadFail",
          params: { error: error.message || "unknown" },
          tone: "error",
        }
        setTextStatus(next)
        setVoiceStatus(next)
      })
    }
    const warmTimer = restricted
      ? window.setTimeout(warmRhubarb, 800)
      : (warmRhubarb(), undefined)

    const onFocus = () => {
      void refreshServerHealth().then((health) => {
        healthOkRef.current = Boolean(health.ok)
      })
    }
    void refreshServerHealth().then((health) => {
      healthOkRef.current = Boolean(health.ok)
    })
    window.addEventListener("focus", onFocus)
    return () => {
      if (warmTimer !== undefined) window.clearTimeout(warmTimer)
      window.removeEventListener("focus", onFocus)
      destroyRive()
      asrAbortRef.current?.abort()
      cancelAsr()
      if (textAudioUrlRef.current) URL.revokeObjectURL(textAudioUrlRef.current)
      if (voiceAudioUrlRef.current) URL.revokeObjectURL(voiceAudioUrlRef.current)
    }
  }, [destroyRive])

  /** 未上传自定义 .riv 时，按音色性别加载 boy / girl 预设 */
  useEffect(() => {
    if (customRiveName) return

    const gender = genderForVoice(voice)
    if (presetGenderRef.current === gender) return

    let cancelled = false
    async function loadPresetRive() {
      const url = riveUrlForGender(gender)
      const fileName = riveFileNameForGender(gender)
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        if (cancelled) return
        presetGenderRef.current = gender
        setRiveFile(
          new File([blob], fileName, { type: "application/octet-stream" }),
        )
      } catch (error) {
        if (cancelled) return
        setTextStatus({
          messageKey: "status.defaultRiveFail",
          params: {
            error: (error as Error).message || "unknown",
          },
          tone: "error",
        })
      }
    }
    void loadPresetRive()
    return () => {
      cancelled = true
    }
  }, [voice, customRiveName])

  const activeMouthCues = mode === "generate" ? textCues : voiceCues
  const hasMouthData = activeMouthCues.length > 0
  const canPlayPreview = controlsReady && hasMouthData

  const canDownloadTextJson = Boolean(textJson?.mouthCues?.length)
  const canDownloadTextAudio = Boolean(textAudioBlob)
  const canDownloadVoiceJson = Boolean(voiceJson?.mouthCues?.length)
  const asrHintVisible =
    (asrStatus === "loading" || asrStatus === "streaming") &&
    !speechTranscript.trim()

  const resetAsrState = useCallback(() => {
    asrAbortRef.current?.abort()
    asrAbortRef.current = null
    cancelAsr()
    setSpeechTranscript("")
    setAsrError(false)
    setAsrStatus("idle")
  }, [])

  /** ASR runs independently of Rhubarb mouth analysis — never blocks preview. */
  const startAsrForFile = useCallback(
    (file: File, language: AsrLanguagePreference = asrLanguage) => {
      asrAbortRef.current?.abort()
      cancelAsr()
      const controller = new AbortController()
      asrAbortRef.current = controller
      setSpeechTranscript("")
      setAsrError(false)
      setAsrStatus("loading")

      void transcribeAudioFile(
        file,
        {
          onStatus: (status) => {
            if (controller.signal.aborted) return
            setAsrStatus(status)
          },
          onPartial: (text) => {
            if (controller.signal.aborted) return
            setSpeechTranscript(text)
            setAsrStatus("streaming")
          },
          onDone: (text) => {
            if (controller.signal.aborted) return
            setSpeechTranscript(text)
            setAsrError(false)
            setAsrStatus("done")
          },
          onError: () => {
            if (controller.signal.aborted) return
            setSpeechTranscript("")
            setAsrError(true)
            setAsrStatus("error")
          },
        },
        controller.signal,
        language,
      ).catch((error) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return
        }
      })
    },
    [asrLanguage],
  )

  const handleAsrLanguageChange = useCallback(
    (next: AsrLanguagePreference) => {
      setAsrLanguage(next)
      const file = pendingAudioRef.current
      if (file) startAsrForFile(file, next)
    },
    [startAsrForFile],
  )

  const bindAudioSrc = useCallback((url: string | null) => {
    const audio = audioRef.current
    if (!audio) return
    if (!url) {
      audio.removeAttribute("src")
      audio.load()
      setSeekMax(0)
      setSeekValue(0)
      setTimeText("0.00 / 0.00s")
      setMouthShape("X")
      return
    }
    // Avoid no-op reload that would reset currentTime when React re-syncs.
    if (audio.getAttribute("src") === url && audio.src) {
      updateTimeText()
      return
    }
    audio.src = url
    audio.load()
    setMouthShape("X")
    // Metadata may already be cached; also wait for loadedmetadata via onAudioMeta.
    if (audio.readyState >= 1) updateTimeText()
  }, [setMouthShape, updateTimeText])

  // Re-bind after cues land so duration/src survive any TransportBar remount.
  useEffect(() => {
    const url =
      mode === "generate" ? textAudioUrlRef.current : voiceAudioUrlRef.current
    if (!url) return
    bindAudioSrc(url)
  }, [bindAudioSrc, hasMouthData, mode, textCues, voiceCues])

  const applyTabPreview = useCallback(
    (nextMode: "upload" | "generate") => {
      cuesRef.current = nextMode === "generate" ? textCues : voiceCues
      if (nextMode === "generate") {
        bindAudioSrc(textAudioUrlRef.current)
      } else {
        bindAudioSrc(voiceAudioUrlRef.current)
      }
    },
    [bindAudioSrc, textCues, voiceCues],
  )

  const handleModeChange = useCallback(
    (nextMode: "upload" | "generate") => {
      if (nextMode === mode) return
      audioRef.current?.pause()
      setIsPlaying(false)
      setMode(nextMode)
      applyTabPreview(nextMode)
    },
    [applyTabPreview, mode],
  )

  const prepareViewModel = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (instance: any) => {
      riveRef.current.mouthViewModelNumber = null
      const requestedName = settings.viewModelName.trim()
      const propertyPath = settings.viewModelPath.trim() || "mouth"
      const viewModel =
        (requestedName && instance.viewModelByName?.(requestedName)) ||
        instance.defaultViewModel?.() ||
        instance.viewModelByIndex?.(0)

      if (!viewModel) return

      setSettings((prev) => ({
        ...prev,
        viewModelName: viewModel.name || requestedName || "",
      }))

      const viewModelInstance =
        instance.viewModelInstance ||
        viewModel.defaultInstance?.() ||
        viewModel.instanceByIndex?.(0) ||
        viewModel.instance?.()

      if (!viewModelInstance) return

      instance.bindViewModelInstance?.(viewModelInstance)
      const numberProp = viewModelInstance.number?.(propertyPath)
      if (!numberProp) return

      riveRef.current.mouthViewModelNumber = numberProp
    },
    [settings.viewModelName, settings.viewModelPath],
  )

  const prepareControls = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (instance: any) => {
      const names: string[] = instance.stateMachineNames || []
      const machineName = settings.stateMachine.trim() || names[0]
      if (machineName) {
        setSettings((prev) => ({ ...prev, stateMachine: machineName }))
        instance.play(machineName)
      }

      if (settings.dataMode === "viewModel") {
        prepareViewModel(instance)
        setMouthShape("X")
        return
      }

      const inputs = instance.stateMachineInputs(machineName) || []
      const wanted = settings.mouthInputName.trim() || "mouth"
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = inputs.find((input: any) => input.name === wanted)
      riveRef.current.mouthInput = found || null
      if (!found) return
      setMouthShape("X")
    },
    [
      prepareViewModel,
      setMouthShape,
      settings.dataMode,
      settings.mouthInputName,
      settings.stateMachine,
    ],
  )

  const createRiveInstance = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rive: any, buffer: ArrayBuffer, requestedMachine: string, isAutoReload: boolean) => {
      if (!canvasRef.current) return
      // 新建实例前保持遮罩。防闪只靠 CSS bg-muted + 遮罩层，禁止 2D clearRect。
      setControlsReady(false)
      // onLoad 若永久不来，2s 后强制揭开，避免灰底死锁
      const revealFallback = window.setTimeout(() => {
        if (riveRef.current.instance) setControlsReady(true)
      }, 2000)

      const selectedFit = getFit(rive, settings.fit)
      riveRef.current.instance = new rive.Rive({
        buffer: buffer.slice(0),
        canvas: canvasRef.current,
        autoplay: true,
        autoBind: true,
        artboard: settings.artboardName.trim() || undefined,
        stateMachines: requestedMachine || undefined,
        layout: new rive.Layout({
          fit: selectedFit,
          alignment: rive.Alignment.Center,
        }),
        onLoad: () => {
          const instance = riveRef.current.instance
          try {
            instance?.resizeDrawingSurfaceToCanvas?.()
          } catch {
            /* ignore */
          }
          const names: string[] = instance?.stateMachineNames || []

          if (!requestedMachine && names[0] && !isAutoReload) {
            const first = names[0]
            setSettings((prev) => ({ ...prev, stateMachine: first }))
            setControlsReady(false)
            try {
              instance?.cleanup?.()
            } catch {
              /* ignore */
            }
            riveRef.current.instance = null
            window.clearTimeout(revealFallback)
            createRiveInstance(rive, buffer, first, true)
            return
          }

          try {
            prepareControls(instance)
          } catch (err) {
            console.warn("[preview] prepareControls failed:", err)
          }

          // 短等绘帧后揭开；超时强制揭开，避免遮罩永久盖死
          void waitForRiveReveal(2).then(() => {
            window.clearTimeout(revealFallback)
            if (riveRef.current.instance !== instance) return
            setControlsReady(true)
          })
        },
        onLoadError: (err: unknown) => {
          console.error("[preview] Rive load error:", err)
          window.clearTimeout(revealFallback)
          // 失败也揭开遮罩，至少不要永久灰底
          setControlsReady(true)
        },
      })
    },
    [prepareControls, settings.artboardName, settings.fit],
  )

  const loadPreview = useCallback(async () => {
    if (!riveFile) return
    destroyRive()
    try {
      const rive = await loadRiveRuntime()
      const buffer = await riveFile.arrayBuffer()
      createRiveInstance(rive, buffer, settings.stateMachine.trim(), false)
    } catch (err) {
      console.error("[preview] loadPreview failed:", err)
      // 加载失败也揭开，避免永久灰遮罩
      setControlsReady(true)
    }
  }, [createRiveInstance, destroyRive, riveFile, settings.stateMachine])

  const loadPreviewRef = useRef(loadPreview)
  loadPreviewRef.current = loadPreview

  useEffect(() => {
    if (!riveFile) return
    void loadPreviewRef.current()
  }, [riveFile])

  const handleAudioSelect = (file: File | null) => {
    pendingAudioRef.current = file
    setAudioFileName(file?.name ?? null)
    setVoiceCues([])
    setVoiceJson(null)
    resetAsrState()

    if (voiceAudioUrlRef.current) {
      URL.revokeObjectURL(voiceAudioUrlRef.current)
      voiceAudioUrlRef.current = null
    }

    if (!file) {
      if (mode === "upload") bindAudioSrc(null)
      setVoiceStatus(EMPTY_STATUS)
      return
    }

    voiceAudioUrlRef.current = URL.createObjectURL(file)
    if (mode === "upload") bindAudioSrc(voiceAudioUrlRef.current)
    setVoiceStatus(EMPTY_STATUS)
    // Auto-start Whisper ASR; mouth analysis stays on the CTA button.
    startAsrForFile(file)
  }

  const analyzePendingAudio = async () => {
    const file = pendingAudioRef.current
    if (!file) return

    const token = ++uploadTokenRef.current
    setAnalyzing(true)
    setVoiceCues([])
    setVoiceJson(null)
    setVoiceStatus({ messageKey: "status.analyzing", tone: "warn" })

    try {
      await ensureRhubarbEngine()
      if (token !== uploadTokenRef.current) return
      const rhubarbData = await analyzeWithRhubarb(file, "")
      if (token !== uploadTokenRef.current) return
      const nextCues = normalizeMouthCues(rhubarbData.mouthCues || [])
      setVoiceCues(nextCues)
      setVoiceJson(rhubarbData)
      if (mode === "upload") cuesRef.current = nextCues
      setVoiceStatus({
        messageKey: "status.analyzeOk",
        tone: "ok",
      })
    } catch (error) {
      if (token !== uploadTokenRef.current) return
      setVoiceCues([])
      setVoiceJson(null)
      const resolved = resolveAnalyzeError(error)
      setVoiceStatus({
        messageKey: resolved.messageKey,
        params: resolved.params,
        tone: "error",
      })
    } finally {
      if (token === uploadTokenRef.current) setAnalyzing(false)
    }
  }

  const generateSpeech = async (): Promise<boolean> => {
    const text = speechTextRef.current.trim()
    if (!text) return false

    if (getWeightedLength(text) > WEIGHTED_TEXT_LIMIT) {
      setTextStatus({
        messageKey: "status.textTooLong",
        params: { limit: WEIGHTED_TEXT_LIMIT },
        tone: "error",
      })
      return false
    }

    const token = ++generateTokenRef.current
    setGenerating(true)
    setTextStatus({ messageKey: "status.generating", tone: "warn" })

    try {
      await ensureRhubarbEngine()
      if (token !== generateTokenRef.current) return false

      const blob = await synthesizeEdgeTTS(
        text,
        voiceRef.current,
        rateRef.current,
        healthOkRef.current,
      )
      if (token !== generateTokenRef.current) return false
      if (!blob) throw new Error(ERR_TTS_NO_AUDIO)

      const rhubarbData = await analyzeWithRhubarb(blob, text)
      if (token !== generateTokenRef.current) return false

      const nextCues = normalizeMouthCues(rhubarbData.mouthCues || [])
      setTextCues(nextCues)
      setTextJson(rhubarbData)
      setTextAudioBlob(blob)

      if (textAudioUrlRef.current) URL.revokeObjectURL(textAudioUrlRef.current)
      textAudioUrlRef.current = URL.createObjectURL(blob)
      if (mode === "generate") {
        cuesRef.current = nextCues
        bindAudioSrc(textAudioUrlRef.current)
      }

      setTextStatus({
        messageKey: "status.generateOk",
        tone: "ok",
      })
      return true
    } catch (error) {
      if (token !== generateTokenRef.current) return false
      setTextAudioBlob(null)
      setTextJson(null)
      setTextCues([])
      const resolved = resolveSpeechGenerateError(error)
      setTextStatus({
        messageKey: resolved.messageKey,
        params: resolved.params,
        tone: "error",
      })
      return false
    } finally {
      if (token === generateTokenRef.current) setGenerating(false)
    }
  }

  // 默认台词：加载预置音频 + 嘴型 JSON（无需启动时 TTS），与「已生成」状态一致
  useEffect(() => {
    if (!riveFile) return

    let cancelled = false

    async function preloadPresetSpeech() {
      if (preloadDoneRef.current) return
      // 用户已改过台词则不再覆盖预置结果
      if (speechTextRef.current.trim() !== DEFAULT_SPEECH_TEXT) {
        preloadDoneRef.current = true
        return
      }

      try {
        const [audioRes, mouthRes] = await Promise.all([
          fetch(PRESET_SPEECH_URL),
          fetch(PRESET_MOUTH_URL),
        ])
        if (cancelled) return
        if (!audioRes.ok || !mouthRes.ok) {
          setTextStatus({
            messageKey: "status.preloadIncomplete",
            tone: "default",
          })
          preloadDoneRef.current = true
          return
        }

        const [blob, rhubarbData] = await Promise.all([
          audioRes.blob(),
          mouthRes.json() as Promise<RhubarbJson>,
        ])
        if (cancelled) return
        if (speechTextRef.current.trim() !== DEFAULT_SPEECH_TEXT) {
          preloadDoneRef.current = true
          return
        }
        if (preloadDoneRef.current) return

        const nextCues = normalizeMouthCues(rhubarbData.mouthCues || [])
        if (!nextCues.length) {
          setTextStatus({
            messageKey: "status.preloadIncomplete",
            tone: "default",
          })
          preloadDoneRef.current = true
          return
        }

        if (textAudioUrlRef.current) URL.revokeObjectURL(textAudioUrlRef.current)
        textAudioUrlRef.current = URL.createObjectURL(blob)

        setTextCues(nextCues)
        setTextJson(rhubarbData)
        setTextAudioBlob(blob)
        setTextStatus({
          messageKey: "status.generateOk",
          tone: "ok",
        })
        preloadDoneRef.current = true
      } catch {
        if (!cancelled) {
          setTextStatus({
            messageKey: "status.preloadIncomplete",
            tone: "default",
          })
          preloadDoneRef.current = true
        }
      }
    }

    void preloadPresetSpeech()
    return () => {
      cancelled = true
    }
  }, [riveFile])

  useEffect(() => {
    const onResize = () => {
      riveRef.current.instance?.resizeDrawingSurfaceToCanvas?.()
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  return (
    <div className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-4 pb-12 md:px-6">
        <AppHeader />

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
          <PreviewStage
            canvasRef={canvasRef}
            canvasReady={controlsReady}
            transport={{
              controlsReady: canPlayPreview,
              missingMouthData: !hasMouthData,
              isPlaying,
              seekMax,
              seekValue,
              timeText,
              offsetSec: settings.offset,
              onOffsetChange: (value) =>
                setSettings((prev) => ({ ...prev, offset: value })),
              onOpenUploadDialog: () => setUploadDialogOpen(true),
              audioRef,
              onPlay: () => {
                const audio = audioRef.current
                if (!audio) return
                const url =
                  mode === "generate"
                    ? textAudioUrlRef.current
                    : voiceAudioUrlRef.current
                // Recover if src was lost (e.g. element remount) while cues exist.
                if (url && !audio.getAttribute("src")) {
                  bindAudioSrc(url)
                }
                if (audio.paused) {
                  void audio.play().catch((error: Error) => {
                    console.warn("[preview] audio.play failed", error)
                  })
                } else {
                  audio.pause()
                }
              },
              onRestart: () => {
                if (!audioRef.current) return
                audioRef.current.currentTime = 0
                setMouthShape("X")
                void audioRef.current.play()
              },
              onSeek: (next) => {
                if (audioRef.current) audioRef.current.currentTime = next
                setSeekValue(next)
                applyMouthAtTime(next)
                updateTimeText()
              },
              onAudioMeta: updateTimeText,
              onAudioPlay: () => {
                setIsPlaying(true)
                startTick()
              },
              onAudioPause: () => {
                setIsPlaying(false)
                startTick()
              },
              onAudioEnded: () => {
                setIsPlaying(false)
                setMouthShape("X")
                startTick()
              },
            }}
          />

          <SourcePanel
            mode={mode}
            onModeChange={handleModeChange}
            audioFileName={audioFileName}
            onAudioFile={handleAudioSelect}
            speechText={speechText}
            onSpeechText={setSpeechText}
            voice={voice}
            onVoice={setVoice}
            rate={rate}
            onRate={setRate}
            generating={generating}
            analyzing={analyzing}
            onGenerate={() => void generateSpeech()}
            onAnalyzeAudio={() => void analyzePendingAudio()}
            speechTranscript={speechTranscript}
            onSpeechTranscript={(value) => {
              setSpeechTranscript(value)
              if (asrError) setAsrError(false)
              if (asrStatus === "error") setAsrStatus("done")
            }}
            asrLanguage={asrLanguage}
            onAsrLanguage={handleAsrLanguageChange}
            asrStatus={asrStatus}
            asrHintVisible={asrHintVisible}
            asrError={asrError}
            textStatus={textStatus}
            voiceStatus={voiceStatus}
            canDownloadTextJson={canDownloadTextJson}
            canDownloadTextAudio={canDownloadTextAudio}
            canDownloadVoiceJson={canDownloadVoiceJson}
            onDownloadTextJson={() => textJson && downloadJson(textJson)}
            onDownloadTextAudio={() => {
              if (!textAudioBlob) return
              downloadBlob(
                textAudioBlob,
                `speech.${getBlobExtension(textAudioBlob)}`,
              )
            }}
            onDownloadVoiceJson={() => voiceJson && downloadJson(voiceJson)}
          />
        </div>

        <footer className="text-xs text-foreground/30">
          {t("footer.prefix")}{" "}
          <a
            href="https://xhslink.com/m/2rTR4jMrFyN"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            @gnayoul
          </a>{" "}
          {t("footer.suffix")}
        </footer>
      </div>

      <UploadRiveDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onRiveFile={(file) => {
          if (!file) {
            // 清除自定义 → 恢复按当前音色性别切换预设
            setCustomRiveName(null)
            presetGenderRef.current = null
            return
          }
          setRiveFile(file)
          setCustomRiveName(file.name)
        }}
        riveFileName={customRiveName}
      />
    </div>
  )
}
