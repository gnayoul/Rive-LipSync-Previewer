import { UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
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
import { EDGE_VOICES, TTS_RATES, type StatusTone } from "@/lib/constants"
import { cn } from "@/lib/utils"

type TabStatus = {
  msg: string
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
  "h-11 w-full rounded-[16px]! bg-[#4a9830] text-white shadow-[0_4px_0_#36811c] hover:bg-[#45892c] hover:text-white active:translate-y-0.5 active:shadow-[0_2px_0_#36811c]"

const controlClass =
  "h-11! w-full rounded-[16px]! border-border bg-background/50"

function StatusLine({ msg, tone }: TabStatus) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-xs",
        tone === "ok" && "text-[#4a9830]",
        tone === "error" && "text-destructive",
        tone === "default" && "text-muted-foreground",
        tone === "warn" && "text-amber-700",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-current",
          tone === "ok" && "bg-[#4a9830]",
        )}
      />
      {msg}
    </p>
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
  textStatus,
  voiceStatus,
  canDownloadTextJson,
  canDownloadTextAudio,
  canDownloadVoiceJson,
  onDownloadTextJson,
  onDownloadTextAudio,
  onDownloadVoiceJson,
}: SourcePanelProps) {
  const rateValue = String(rate)
  const showTextDownloads = canDownloadTextAudio || canDownloadTextJson

  return (
    <section
      aria-label="素材来源"
      className="flex h-full min-h-[633px] flex-col gap-6 overflow-hidden rounded-[24px] bg-[#f1f1f1] py-6"
    >
      <Tabs
        value={mode}
        onValueChange={(value) =>
          onModeChange(value as "upload" | "generate")
        }
        className="flex min-h-0 flex-1 flex-col gap-6"
      >
        <div className="flex justify-center px-4">
          <TabsList className="box-border h-11! w-[222px] items-stretch rounded-[16px]! bg-border p-[2px]!">
            <TabsTrigger
              value="generate"
              className="h-full! min-h-0 rounded-[14px]! text-sm data-active:bg-background/50 data-active:shadow-none"
            >
              文本识别
            </TabsTrigger>
            <TabsTrigger
              value="upload"
              className="h-full! min-h-0 rounded-[14px]! text-sm data-active:bg-background/50 data-active:shadow-none"
            >
              声音识别
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4">
          <TabsContent
            value="generate"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <FieldGroup className="flex min-h-0 flex-1 flex-col gap-4">
              <Field className="min-h-0 flex-1 gap-1.5">
                <FieldLabel htmlFor="speechText">请输入你想同步的内容</FieldLabel>
                <FieldDescription className="text-xs text-foreground/30">
                  支持英文/中文/日文，英文表现更佳
                </FieldDescription>
                <Textarea
                  id="speechText"
                  rows={6}
                  value={speechText}
                  onChange={(event) => onSpeechText(event.target.value)}
                  placeholder="请输入"
                  className="min-h-[120px] flex-1 rounded-[16px] border-border bg-background/50"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="gap-1.5">
                  <FieldLabel>音色</FieldLabel>
                  <Select
                    value={voice}
                    onValueChange={(value) => value && onVoice(value)}
                  >
                    <SelectTrigger className={controlClass}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {EDGE_VOICES.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel>声音倍速</FieldLabel>
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
                {generating ? "生成中…" : "生成语音与嘴型数据"}
              </Button>
            </FieldGroup>

            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
              <StatusLine {...textStatus} />
              {showTextDownloads ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <Button
                    variant="outline"
                    className="h-11 rounded-[16px]! border-border bg-background/50"
                    disabled={!canDownloadTextAudio}
                    onClick={onDownloadTextAudio}
                  >
                    下载语音
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 rounded-[16px]! border-border bg-background/50"
                    disabled={!canDownloadTextJson}
                    onClick={onDownloadTextJson}
                  >
                    下载嘴型数据
                  </Button>
                </div>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent
            value="upload"
            className="mt-0 flex min-h-0 flex-1 flex-col"
          >
            <FieldGroup className="flex min-h-0 flex-1 flex-col gap-4">
              <Field className="min-h-0 flex-1 gap-1.5">
                <FieldLabel htmlFor="audioFile">
                  上传语音
                  <span className="font-medium text-foreground/30">
                    （支持英文/中文/日文，英文表现佳）
                  </span>
                </FieldLabel>
                <label
                  htmlFor="audioFile"
                  className="flex min-h-[96px] flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-border bg-background/50 px-3 py-4 text-center transition-colors hover:bg-background"
                >
                  <UploadIcon className="size-6 text-foreground" />
                  <span className="text-xs text-foreground">
                    {audioFileName
                      ? audioFileName
                      : "点击或拖拽上传你的音频文件（仅支持.wav/.ogg/.mp3）"}
                  </span>
                  <input
                    id="audioFile"
                    type="file"
                    accept=".wav,.ogg,.mp3,audio/wav,audio/ogg,audio/mpeg"
                    className="sr-only"
                    onChange={(event) => {
                      onAudioFile(event.target.files?.[0] ?? null)
                      event.target.value = ""
                    }}
                  />
                </label>
              </Field>

              <Field className="min-h-0 flex-1 gap-1.5">
                <FieldLabel htmlFor="asrText">语音字幕生成</FieldLabel>
                <Textarea
                  id="asrText"
                  rows={4}
                  readOnly
                  value=""
                  placeholder="语音识别成功后，将在此处自动生成文本内容"
                  className="min-h-[96px] flex-1 rounded-[16px] border-border bg-background/50 placeholder:text-[#aaa]"
                />
              </Field>

              <Button
                className={primaryCtaClass}
                disabled={analyzing || !audioFileName}
                onClick={onAnalyzeAudio}
              >
                {analyzing ? "生成中…" : "生成嘴型数据"}
              </Button>
            </FieldGroup>

            <div className="mt-6 flex flex-col gap-3 border-t border-border pt-6">
              <StatusLine {...voiceStatus} />
              {canDownloadVoiceJson ? (
                <Button
                  variant="outline"
                  className="h-11 w-full rounded-[16px]! border-border bg-background/50"
                  onClick={onDownloadVoiceJson}
                >
                  下载嘴型数据
                </Button>
              ) : null}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </section>
  )
}
