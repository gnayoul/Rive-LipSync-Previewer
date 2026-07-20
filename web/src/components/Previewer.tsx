import { useCallback, useEffect, useRef, useState } from "react"

import { AppHeader } from "@/components/blocks/AppHeader"
import { PreviewStage } from "@/components/blocks/PreviewStage"
import { type RiveSettingsValues } from "@/components/blocks/RiveSettingsPanel"
import { SourcePanel } from "@/components/blocks/SourcePanel"
import { UploadRiveDialog } from "@/components/blocks/UploadRiveDialog"
import {
  DEFAULT_RIVE_URL,
  DEFAULT_SPEECH_TEXT,
  DEFAULT_VOICE,
  SHAPE_TO_VALUE,
  type MouthCue,
  type RhubarbJson,
  type StatusTone,
} from "@/lib/constants"
import {
  downloadBlob,
  downloadJson,
  findCueAtTime,
  getBlobExtension,
  normalizeMouthCues,
  refreshServerHealth,
  synthesizeEdgeTTS,
} from "@/lib/previewer"
import { analyzeWithRhubarb, ensureRhubarbEngine } from "@/lib/rhubarb"
import { getFit, loadRiveRuntime } from "@/lib/rive-loader"

/**
 * 页面组装层：只拼功能块 + 接线业务逻辑。
 * UI 组合遵循 docs/shadcn-patterns.md（Playground + Field）。
 */
export function Previewer() {
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
  const preloadDoneRef = useRef(false)
  const textAudioUrlRef = useRef<string | null>(null)
  const voiceAudioUrlRef = useRef<string | null>(null)
  const healthOkRef = useRef(false)
  const pendingAudioRef = useRef<File | null>(null)
  const speechTextRef = useRef(DEFAULT_SPEECH_TEXT)
  const voiceRef = useRef(DEFAULT_VOICE)
  const rateRef = useRef(1)

  const [mode, setMode] = useState<"upload" | "generate">("generate")
  const [riveFile, setRiveFile] = useState<File | null>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [audioFileName, setAudioFileName] = useState<string | null>(null)
  const [speechText, setSpeechText] = useState(DEFAULT_SPEECH_TEXT)
  const [voice, setVoice] = useState<string>(DEFAULT_VOICE)
  const [rate, setRate] = useState(1)
  const [textStatus, setTextStatus] = useState<{
    msg: string
    tone: StatusTone
  }>({ msg: "正在准备嘴型分析...", tone: "default" })
  const [voiceStatus, setVoiceStatus] = useState<{
    msg: string
    tone: StatusTone
  }>({ msg: "正在准备嘴型分析...", tone: "default" })
  const [generating, setGenerating] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [textCues, setTextCues] = useState<MouthCue[]>([])
  const [voiceCues, setVoiceCues] = useState<MouthCue[]>([])
  const [textJson, setTextJson] = useState<RhubarbJson | null>(null)
  const [voiceJson, setVoiceJson] = useState<RhubarbJson | null>(null)
  const [textAudioBlob, setTextAudioBlob] = useState<Blob | null>(null)
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
    const wasDefault = speechTextRef.current.trim() === DEFAULT_SPEECH_TEXT
    speechTextRef.current = speechText
    // 用户改掉默认台词后，取消进行中的自动预加载
    if (wasDefault && speechText.trim() !== DEFAULT_SPEECH_TEXT) {
      generateTokenRef.current += 1
    }
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
    if (riveRef.current.instance) {
      riveRef.current.instance.cleanup?.()
      riveRef.current.instance = null
    }
    setControlsReady(false)
  }, [stopTick])

  useEffect(() => {
    ensureRhubarbEngine()
      .then(() => {
        setTextStatus({ msg: "嘴型分析已就绪", tone: "ok" })
        setVoiceStatus({ msg: "嘴型分析已就绪", tone: "ok" })
      })
      .catch((error: Error) => {
        const msg = `嘴型分析加载失败：${error.message}`
        setTextStatus({ msg, tone: "error" })
        setVoiceStatus({ msg, tone: "error" })
      })

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
      window.removeEventListener("focus", onFocus)
      destroyRive()
      if (textAudioUrlRef.current) URL.revokeObjectURL(textAudioUrlRef.current)
      if (voiceAudioUrlRef.current) URL.revokeObjectURL(voiceAudioUrlRef.current)
    }
  }, [destroyRive])

  useEffect(() => {
    let cancelled = false
    async function loadDefaultRive() {
      try {
        const response = await fetch(DEFAULT_RIVE_URL)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        if (cancelled) return
        setRiveFile(
          new File([blob], "boy.riv", { type: "application/octet-stream" }),
        )
      } catch (error) {
        if (cancelled) return
        setTextStatus({
          msg: `默认 Rive 加载失败：${(error as Error).message || "未知错误"}`,
          tone: "error",
        })
      }
    }
    void loadDefaultRive()
    return () => {
      cancelled = true
    }
  }, [])

  const canDownloadTextJson = Boolean(textJson?.mouthCues?.length)
  const canDownloadTextAudio = Boolean(textAudioBlob)
  const canDownloadVoiceJson = Boolean(voiceJson?.mouthCues?.length)

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
    audio.src = url
    audio.load()
    setMouthShape("X")
  }, [setMouthShape])

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
          instance?.resizeDrawingSurfaceToCanvas?.()
          const names: string[] = instance?.stateMachineNames || []

          if (!requestedMachine && names[0] && !isAutoReload) {
            const first = names[0]
            setSettings((prev) => ({ ...prev, stateMachine: first }))
            instance?.cleanup?.()
            riveRef.current.instance = null
            createRiveInstance(rive, buffer, first, true)
            return
          }

          prepareControls(instance)
          setControlsReady(true)
        },
        onLoadError: () => {
          setControlsReady(false)
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
    } catch {
      setControlsReady(false)
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

    if (voiceAudioUrlRef.current) {
      URL.revokeObjectURL(voiceAudioUrlRef.current)
      voiceAudioUrlRef.current = null
    }

    if (!file) {
      if (mode === "upload") bindAudioSrc(null)
      setVoiceStatus({
        msg: "嘴型分析已就绪",
        tone: "ok",
      })
      return
    }

    voiceAudioUrlRef.current = URL.createObjectURL(file)
    if (mode === "upload") bindAudioSrc(voiceAudioUrlRef.current)
    setVoiceStatus({
      msg: "音频已选择，点击「生成嘴型数据」开始分析",
      tone: "default",
    })
  }

  const analyzePendingAudio = async () => {
    const file = pendingAudioRef.current
    if (!file) return

    const token = ++uploadTokenRef.current
    setAnalyzing(true)
    setVoiceCues([])
    setVoiceJson(null)
    setVoiceStatus({ msg: "正在分析嘴型...", tone: "warn" })

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
        msg: "嘴型数据已生成，请在左侧播放动画预览",
        tone: "ok",
      })
    } catch (error) {
      if (token !== uploadTokenRef.current) return
      setVoiceCues([])
      setVoiceJson(null)
      setVoiceStatus({
        msg: `嘴型分析失败：${(error as Error).message}`,
        tone: "error",
      })
    } finally {
      if (token === uploadTokenRef.current) setAnalyzing(false)
    }
  }

  const generateSpeech = async (options?: {
    silentFail?: boolean
  }): Promise<boolean> => {
    const text = speechTextRef.current.trim()
    if (!text) return false

    const token = ++generateTokenRef.current
    const silentFail = Boolean(options?.silentFail)
    setGenerating(true)
    setTextStatus({ msg: "正在生成语音与嘴型...", tone: "warn" })

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
      if (!blob) throw new Error("语音合成失败，未获得音频数据。")

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
        msg: "语音与嘴型数据已生成，请在左侧播放动画预览",
        tone: "ok",
      })
      return true
    } catch (error) {
      if (token !== generateTokenRef.current) return false
      if (silentFail) {
        setTextStatus({
          msg: "默认语音预加载未完成，可手动生成",
          tone: "default",
        })
        return false
      }
      setTextAudioBlob(null)
      setTextJson(null)
      setTextCues([])
      setTextStatus({
        msg: `生成失败：${(error as Error).message}`,
        tone: "error",
      })
      return false
    } finally {
      if (token === generateTokenRef.current) setGenerating(false)
    }
  }

  const generateSpeechRef = useRef(generateSpeech)
  generateSpeechRef.current = generateSpeech

  // 默认台词：页面就绪后自动预生成语音与嘴型，方便直接预览
  useEffect(() => {
    if (!riveFile) return

    let cancelled = false

    async function preloadDefaultSpeech() {
      if (preloadDoneRef.current) return
      if (speechTextRef.current.trim() !== DEFAULT_SPEECH_TEXT) {
        preloadDoneRef.current = true
        return
      }

      try {
        const health = await refreshServerHealth()
        healthOkRef.current = Boolean(health.ok)
        if (cancelled) return
        if (!health.ok) return

        await ensureRhubarbEngine()
        if (cancelled) return
        if (speechTextRef.current.trim() !== DEFAULT_SPEECH_TEXT) {
          preloadDoneRef.current = true
          return
        }
        if (preloadDoneRef.current) return

        await generateSpeechRef.current({ silentFail: true })
        // 成功或业务失败都标记完成；被取消时不标记，便于 Strict Mode 重试
        if (!cancelled) preloadDoneRef.current = true
      } catch {
        if (!cancelled) preloadDoneRef.current = true
      }
    }

    void preloadDefaultSpeech()
    return () => {
      cancelled = true
      generateTokenRef.current += 1
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
            transport={{
              controlsReady,
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
                if (audio.paused) {
                  void audio.play()
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
          本工具由{" "}
          <a
            href="https://x.com/gnayoul"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            @gnayoul
          </a>{" "}
          制作，嘴型数据可用于商业用途，语音仅可作为测试与学习交流，严禁商用。
        </footer>
      </div>

      <UploadRiveDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onRiveFile={setRiveFile}
      />
    </div>
  )
}
