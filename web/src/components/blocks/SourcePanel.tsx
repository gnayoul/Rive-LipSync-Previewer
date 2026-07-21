import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { UploadedFileCard, UploadEmptyCard } from "@/components/blocks/UploadedFileCard"
import {
  ASR_LANGUAGES,
  EDGE_VOICES,
  TTS_RATES,
  type StatusTone,
} from "@/lib/constants"
import type {
  AsrLanguagePreference,
  AsrStatus,
} from "@/lib/asr/transcribe"
import {
  ASR_LABEL_KEYS,
  VOICE_LABEL_KEYS,
  type MessageKey,
} from "@/lib/i18n/messages"
import { useLocale } from "@/lib/i18n/locale-context"
import { cn } from "@/lib/utils"
import {
  WEIGHTED_TEXT_LIMIT,
  clampWeightedText,
  getWeightedLength,
} from "@/lib/weighted-text"

export type TabStatus = {
  messageKey: MessageKey | null
  params?: Record<string, string | number>
  tone: StatusTone
}

type SourcePanelProps = {
  mode: "upload" | "generate"
  onModeChange: (mode: "upload" | "generate") => void
  audioFileName: string | null
  onAudioFile: (file: File | null) => void
  speechText: string
  onSpeechText: (value: string) => void
  voice: string
  onVoice: (value: string) => void
  rate: number
  onRate: (value: number) => void
  generating: boolean
  analyzing: boolean
  onGenerate: () => void
  onAnalyzeAudio: () => void
  speechTranscript: string
  onSpeechTranscript: (value: string) => void
  asrLanguage: AsrLanguagePreference
  onAsrLanguage: (value: AsrLanguagePreference) => void
  asrStatus: AsrStatus
  asrHintVisible: boolean
  asrError?: boolean
  textStatus: TabStatus
  voiceStatus: TabStatus
  canDownloadTextJson: boolean
  canDownloadTextAudio: boolean
  canDownloadVoiceJson: boolean
  onDownloadTextJson: () => void
  onDownloadTextAudio: () => void
  onDownloadVoiceJson: () => void
}

const primaryCtaClass =
  "h-11 w-full rounded-[16px]! bg-[#4a9830] text-white shadow-[0_4px_0_#36811c] hover:bg-[#45892c] hover:text-white active:translate-y-0.5 active:shadow-[0_2px_0_#36811c] dark:hover:bg-[#549938] dark:hover:shadow-[0_4px_0_#36811c] dark:active:bg-[#45892c] dark:active:shadow-[0_2px_0_#36811c]"

const controlClass =
  "h-11! w-full rounded-[16px]! border-border bg-background/50"

function StatusLine({ messageKey, params, tone }: TabStatus) {
  const { t } = useLocale()
  const isThinking = tone === "warn"
  if (!messageKey) return null
  const msg = t(messageKey, params)

  return (
    <p
      className={cn(
        "flex items-center gap-2 text-xs",
        tone === "ok" && "text-[#4a9830]",
        tone === "error" && "text-destructive",
        tone === "default" && "text-muted-foreground",
        isThinking && "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tone === "ok" && "bg-[#4a9830]",
          tone === "error" && "bg-destructive",
          tone === "default" && "bg-muted-foreground",
          isThinking && "status-thinking-dot",
        )}
      />
      <span className={cn(isThinking && "status-thinking")}>{msg}</span>
    </p>
  )
}

/** Distance from bottom (px) within which we treat the field as stuck to bottom. */
const ASR_STICK_BOTTOM_PX = 12

/**
 * ASR transcript field.
 * Native textarea cannot apply background-clip shimmer on its value text, so
 * during loading/streaming we mirror content in an overlay with status-thinking
 * and keep the textarea transparent + readOnly until done.
 *
 * Scroll lives on the textarea only; the overlay is visual (pointer-events-none,
 * overflow-hidden) and mirrors scrollTop so generation stays scrollable.
 */
function AsrTranscriptField({
  value,
  onChange,
  asrStatus,
  asrHintVisible,
  asrError,
}: {
  value: string
  onChange: (value: string) => void
  asrStatus: AsrStatus
  asrHintVisible: boolean
  asrError?: boolean
}) {
  const { t } = useLocale()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)

  const busy = asrStatus === "loading" || asrStatus === "streaming"
  const editable = asrStatus === "done" || asrStatus === "error"
  const showShimmerOverlay = busy || asrHintVisible
  const overlayText = asrHintVisible ? t("source.asrHint") : value
  const showErrorHint = asrStatus === "error" && !value.trim() && Boolean(asrError)

  const syncOverlayScroll = () => {
    const ta = textareaRef.current
    const overlay = overlayRef.current
    if (!ta || !overlay) return
    overlay.scrollTop = ta.scrollTop
  }

  const scrollToBottomIfStuck = () => {
    const ta = textareaRef.current
    if (!ta || !stickToBottomRef.current) return
    ta.scrollTop = ta.scrollHeight
    syncOverlayScroll()
  }

  // New recognition session (or audio reset → idle): re-enable stick-to-bottom.
  useEffect(() => {
    if (asrStatus === "loading" || asrStatus === "idle") {
      stickToBottomRef.current = true
    }
  }, [asrStatus])

  // While streaming/loading, keep latest text visible when stuck to bottom.
  useEffect(() => {
    if (!busy) return
    scrollToBottomIfStuck()
  }, [value, busy, showShimmerOverlay])

  // After overlay mounts, align with current textarea scroll.
  useEffect(() => {
    if (!showShimmerOverlay) return
    syncOverlayScroll()
  }, [showShimmerOverlay])

  const handleScroll = () => {
    const ta = textareaRef.current
    if (!ta) return
    const distanceFromBottom =
      ta.scrollHeight - ta.scrollTop - ta.clientHeight
    stickToBottomRef.current = distanceFromBottom <= ASR_STICK_BOTTOM_PX
    syncOverlayScroll()
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showShimmerOverlay ? (
        <div
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-[16px] px-3 py-3 text-base md:text-sm"
        >
          <span className="status-thinking break-words whitespace-pre-wrap">
            {overlayText}
          </span>
        </div>
      ) : null}
      <Textarea
        ref={textareaRef}
        id="asrText"
        readOnly={!editable || busy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onScroll={handleScroll}
        placeholder={
          showErrorHint
            ? t("status.asrFail")
            : asrStatus === "idle"
              ? t("source.asrPlaceholder")
              : undefined
        }
        className={cn(
          "app-scrollbar min-h-0 flex-1 field-sizing-fixed resize-none rounded-[16px] border-border bg-background/50 placeholder:text-muted-foreground",
          showShimmerOverlay &&
            "text-transparent caret-transparent placeholder:text-transparent",
          showErrorHint && "placeholder:text-destructive",
        )}
      />
    </div>
  )
}

/** 素材区 — 对照 Figma「文本识别 / 声音识别」侧栏 */
export function SourcePanel({
  mode,
  onModeChange,
  audioFileName,
  onAudioFile,
  speechText,
  onSpeechText,
  voice,
  onVoice,
  rate,
  onRate,
  generating,
  analyzing,
  onGenerate,
  onAnalyzeAudio,
  speechTranscript,
  onSpeechTranscript,
  asrLanguage,
  onAsrLanguage,
  asrStatus,
  asrHintVisible,
  asrError,
  textStatus,
  voiceStatus,
  canDownloadTextJson,
  canDownloadTextAudio,
  canDownloadVoiceJson,
  onDownloadTextJson,
  onDownloadTextAudio,
  onDownloadVoiceJson,
}: SourcePanelProps) {
  const { t } = useLocale()
  const asrBusy = asrStatus === "loading" || asrStatus === "streaming"
  const rateValue = String(rate)
  const showTextDownloads = canDownloadTextAudio || canDownloadTextJson
  const showTextStatus = Boolean(textStatus.messageKey)
  const showVoiceStatus = Boolean(voiceStatus.messageKey)
  const showTextFooter = showTextStatus || showTextDownloads
  const showVoiceFooter = showVoiceStatus || canDownloadVoiceJson
  const audioInputRef = useRef<HTMLInputElement>(null)
  const [audioDownloadOpen, setAudioDownloadOpen] = useState(false)

  const voiceItems = EDGE_VOICES.map((item) => ({
    value: item.value,
    label: t(VOICE_LABEL_KEYS[item.value] ?? "voice.enMale"),
  }))
  const asrItems = ASR_LANGUAGES.map((item) => ({
    value: item.value,
    label: t(ASR_LABEL_KEYS[item.value] ?? "asr.auto"),
  }))

  return (
    <section
      aria-label={t("source.aria")}
      className="flex h-full min-h-[633px] flex-col gap-6 overflow-hidden rounded-[24px] bg-muted py-6"
    >
      <Tabs
        value={mode}
        onValueChange={(value) =>
          onModeChange(value as "upload" | "generate")
        }
        className="flex min-h-0 flex-1 flex-col gap-6"
      >
        <div className="flex justify-center px-4">
          <TabsList className="box-border inline-grid h-11! grid-flow-col auto-cols-fr items-stretch rounded-[16px]! bg-border p-[2px]!">
            <TabsTrigger
              value="generate"
              className="h-full! min-h-0 w-full justify-center rounded-[14px]! px-4 text-sm data-active:bg-background/50 data-active:shadow-none"
            >
              {t("source.tabText")}
            </TabsTrigger>
            <TabsTrigger
              value="upload"
              className="h-full! min-h-0 w-full justify-center rounded-[14px]! px-4 text-sm data-active:bg-background/50 data-active:shadow-none"
            >
              {t("source.tabVoice")}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4">
          <TabsContent
            value="generate"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <FieldGroup className="flex min-h-0 flex-1 flex-col gap-4">
              <Field className="flex min-h-0 flex-1 flex-col gap-1.5">
                <div className="flex shrink-0 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <FieldLabel htmlFor="speechText" className="shrink-0">
                      {t("source.inputLabel")}
                    </FieldLabel>
                    <span className="text-xs text-foreground/30">
                      {t("source.langHint")}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-foreground/30">
                    {getWeightedLength(speechText)}/{WEIGHTED_TEXT_LIMIT}
                  </span>
                </div>
                <Textarea
                  id="speechText"
                  value={speechText}
                  onChange={(event) =>
                    onSpeechText(clampWeightedText(event.target.value))
                  }
                  placeholder={t("source.placeholder")}
                  className="app-scrollbar min-h-0 flex-1 field-sizing-fixed resize-none rounded-[16px] border-border bg-background/50 placeholder:text-muted-foreground"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="gap-1.5">
                  <FieldLabel>{t("source.voiceLabel")}</FieldLabel>
                  <Select
                    value={voice}
                    onValueChange={(value) => value && onVoice(value)}
                    items={voiceItems}
                  >
                    <SelectTrigger className={controlClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {voiceItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel>{t("source.rateLabel")}</FieldLabel>
                  <Select
                    value={rateValue}
                    onValueChange={(value) => {
                      if (!value) return
                      const parsed = Number(value)
                      if (Number.isFinite(parsed)) onRate(parsed)
                    }}
                  >
                    <SelectTrigger className={controlClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {TTS_RATES.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Button
                className={primaryCtaClass}
                disabled={generating || !speechText.trim()}
                onClick={onGenerate}
              >
                {generating ? t("source.generating") : t("source.generate")}
              </Button>
            </FieldGroup>

            {showTextFooter ? (
              <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
                {showTextStatus ? <StatusLine {...textStatus} /> : null}
                {showTextDownloads ? (
                  <div className="grid grid-cols-2 gap-4">
                    <Popover
                      open={audioDownloadOpen}
                      onOpenChange={setAudioDownloadOpen}
                    >
                      <PopoverTrigger
                        render={
                          <Button
                            variant="outline"
                            className="h-11 rounded-[16px]! border-border bg-background/50"
                            disabled={!canDownloadTextAudio}
                          />
                        }
                      >
                        {t("source.downloadAudio")}
                      </PopoverTrigger>
                      <PopoverContent
                        side="top"
                        align="start"
                        sideOffset={8}
                        className="w-[260px] gap-3 rounded-[16px] bg-background p-4 shadow-md"
                      >
                        <PopoverDescription className="text-sm text-foreground">
                          {t("source.downloadAudioDisclaimer")}
                        </PopoverDescription>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-[16px]! border-border bg-background"
                          onClick={() => {
                            setAudioDownloadOpen(false)
                            onDownloadTextAudio()
                          }}
                        >
                          {t("source.downloadAudioConfirm")}
                        </Button>
                      </PopoverContent>
                    </Popover>
                    <Button
                      variant="outline"
                      className="h-11 rounded-[16px]! border-border bg-background/50"
                      disabled={!canDownloadTextJson}
                      onClick={onDownloadTextJson}
                    >
                      {t("source.downloadJson")}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent
            value="upload"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <FieldGroup className="flex min-h-0 flex-1 flex-col gap-4">
              <Field className="shrink-0 gap-1.5">
                <div className="flex shrink-0 items-center gap-2">
                  <FieldLabel htmlFor="audioFile" className="shrink-0">
                    {t("source.uploadAudio")}
                  </FieldLabel>
                  <span className="text-xs text-foreground/30">
                    {t("source.langHint")}
                  </span>
                </div>
                <input
                  ref={audioInputRef}
                  id="audioFile"
                  type="file"
                  accept=".wav,.ogg,.mp3,audio/wav,audio/ogg,audio/mpeg"
                  className="sr-only"
                  onChange={(event) => {
                    onAudioFile(event.target.files?.[0] ?? null)
                    event.target.value = ""
                  }}
                />
                {audioFileName ? (
                  <UploadedFileCard
                    fileName={audioFileName}
                    onReplace={() => audioInputRef.current?.click()}
                    onClear={() => onAudioFile(null)}
                  />
                ) : (
                  <UploadEmptyCard
                    htmlFor="audioFile"
                    title={t("source.uploadAudioTitle")}
                    description={t("source.uploadAudioDesc")}
                  />
                )}
              </Field>

              <Field className="flex min-h-0 flex-1 flex-col gap-1.5">
                <div className="flex w-full items-center justify-between gap-3">
                  <FieldLabel htmlFor="asrText" className="shrink-0">
                    {t("source.asrLabel")}
                  </FieldLabel>
                  <Select
                    value={asrLanguage}
                    disabled={asrBusy}
                    onValueChange={(value) => {
                      if (
                        value === "auto" ||
                        value === "chinese" ||
                        value === "english"
                      ) {
                        onAsrLanguage(value)
                      }
                    }}
                    items={asrItems}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t("source.asrLangAria")}
                      className="h-auto shrink-0 gap-1 border-0 bg-transparent p-0 px-0 text-xs shadow-none hover:bg-transparent focus-visible:border-transparent focus-visible:ring-0 data-[size=sm]:h-auto"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      align="end"
                      className="w-auto min-w-(--anchor-width)"
                    >
                      <SelectGroup>
                        {asrItems.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <AsrTranscriptField
                  value={speechTranscript}
                  onChange={onSpeechTranscript}
                  asrStatus={asrStatus}
                  asrHintVisible={asrHintVisible}
                  asrError={asrError}
                />
              </Field>

              <Button
                className={cn(primaryCtaClass, "shrink-0")}
                disabled={analyzing || !audioFileName}
                onClick={onAnalyzeAudio}
              >
                {analyzing ? t("source.generating") : t("source.analyze")}
              </Button>
            </FieldGroup>

            {showVoiceFooter ? (
              <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
                {showVoiceStatus ? <StatusLine {...voiceStatus} /> : null}
                {canDownloadVoiceJson ? (
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-[16px]! border-border bg-background/50"
                    onClick={onDownloadVoiceJson}
                  >
                    {t("source.downloadJson")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}
