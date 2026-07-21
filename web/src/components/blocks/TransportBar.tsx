import { useState, type ReactNode, type RefObject } from "react"
import { MinusIcon, PauseIcon, PlusIcon, PlayIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { OFFSET_STEP_SEC } from "@/lib/constants"
import { useLocale } from "@/lib/i18n/locale-context"
import { cn } from "@/lib/utils"

type TransportBarProps = {
  /** Rive 已就绪且当前页有有效嘴型数据时可播放 */
  controlsReady: boolean
  /** 当前页缺少有效 mouth cues 时为 true（用于 tip） */
  missingMouthData: boolean
  isPlaying: boolean
  seekMax: number
  seekValue: number
  timeText: string
  offsetSec: number
  onOffsetChange: (value: number) => void
  onOpenUploadDialog: () => void
  audioRef: RefObject<HTMLAudioElement | null>
  onPlay: () => void
  onRestart: () => void
  onSeek: (value: number) => void
  onAudioMeta: () => void
  onAudioPlay: () => void
  onAudioPause: () => void
  onAudioEnded: () => void
}

function PlaybackControlTip({
  showTip,
  tip,
  className,
  children,
}: {
  showTip: boolean
  tip: string
  className?: string
  children: ReactNode
}) {
  // Always keep the same wrapper tree so toggling tip never remounts controls.
  return (
    <Tooltip trackCursorAxis="both" disabled={!showTip}>
      <TooltipTrigger
        render={<span className={cn("inline-flex", className)} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={12}>
        {tip}
      </TooltipContent>
    </Tooltip>
  )
}

/** 播放条 + 动画设置 — 对照 Figma 预览舞台底栏 */
export function TransportBar({
  controlsReady,
  missingMouthData,
  isPlaying,
  seekMax,
  seekValue,
  timeText,
  offsetSec,
  onOffsetChange,
  onOpenUploadDialog,
  audioRef,
  onPlay,
  onRestart,
  onSeek,
  onAudioMeta,
  onAudioPlay,
  onAudioPause,
  onAudioEnded,
}: TransportBarProps) {
  const { t } = useLocale()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const offsetMs = Math.round(offsetSec * 1000)
  const progressPct =
    seekMax > 0 ? Math.min(100, Math.max(0, (seekValue / seekMax) * 100)) : 0
  const playbackDisabled = !controlsReady
  const tip = t("transport.missingMouthData")
  const showTip = playbackDisabled && missingMouthData

  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-6">
      <PlaybackControlTip showTip={showTip} tip={tip}>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 rounded-[16px]"
          disabled={playbackDisabled}
          aria-label={isPlaying ? t("transport.pause") : t("transport.play")}
          onClick={onPlay}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>
      </PlaybackControlTip>
      <PlaybackControlTip showTip={showTip} tip={tip}>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 rounded-[16px]"
          disabled={playbackDisabled}
          aria-label={t("transport.restart")}
          onClick={onRestart}
        >
          <RotateCcwIcon />
        </Button>
      </PlaybackControlTip>

      <PlaybackControlTip
        showTip={showTip}
        tip={tip}
        className="min-w-0 flex-1"
      >
        <div
          className={cn(
            "relative flex min-w-0 flex-1 items-center",
            playbackDisabled && "opacity-50",
          )}
        >
          <input
            type="range"
            min={0}
            max={seekMax || 0}
            step={0.001}
            value={seekValue}
            disabled={playbackDisabled}
            className="h-1 w-full cursor-pointer appearance-none rounded-full disabled:pointer-events-none disabled:cursor-not-allowed [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,0.12)] [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-black/10 [&::-moz-range-thumb]:bg-white"
            style={{
              background: `linear-gradient(to right, var(--foreground) ${progressPct}%, var(--border) ${progressPct}%)`,
            }}
            onChange={(event) => onSeek(Number(event.target.value))}
          />
        </div>
      </PlaybackControlTip>

      {/*
        Keep <audio> outside PlaybackControlTip. showTip toggles the Tooltip
        wrapper and would remount children — wiping src and leaving 0.00/0.00s.
      */}
      <audio
        ref={audioRef}
        className="hidden"
        onLoadedMetadata={onAudioMeta}
        onPlay={onAudioPlay}
        onPause={onAudioPause}
        onEnded={onAudioEnded}
      />

      <div className="shrink-0 px-2 text-right text-xs tabular-nums text-foreground">
        {timeText}
      </div>

      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              className="h-11 shrink-0 rounded-[16px] px-3 text-sm font-normal"
            />
          }
        >
          {t("transport.settings")}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={8}
          className="w-[197px] gap-0 rounded-[16px] p-0 px-4 shadow-md"
        >
          <div className="flex h-14 items-center justify-between gap-1">
            <span className="text-xs font-medium">
              {t("transport.offset", { ms: offsetMs })}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7 rounded-lg bg-background"
                aria-label={t("transport.offsetDec")}
                onClick={() =>
                  onOffsetChange(
                    Math.round((offsetSec - OFFSET_STEP_SEC) * 1000) / 1000,
                  )
                }
              >
                <MinusIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7 rounded-lg bg-background"
                aria-label={t("transport.offsetInc")}
                onClick={() =>
                  onOffsetChange(
                    Math.round((offsetSec + OFFSET_STEP_SEC) * 1000) / 1000,
                  )
                }
              >
                <PlusIcon />
              </Button>
            </div>
          </div>
          <button
            type="button"
            className="flex h-14 w-full items-center border-t border-border text-left text-xs font-medium hover:text-foreground/30"
            onClick={() => {
              setSettingsOpen(false)
              onOpenUploadDialog()
            }}
          >
            {t("transport.uploadCustom")}
          </button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
