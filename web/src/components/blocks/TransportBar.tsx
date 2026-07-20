import { useState, type RefObject } from "react"
import { MinusIcon, PauseIcon, PlusIcon, PlayIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { OFFSET_STEP_SEC } from "@/lib/constants"

type TransportBarProps = {
  controlsReady: boolean
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

/** 播放条 + 动画设置 — 对照 Figma 预览舞台底栏 */
export function TransportBar({
  controlsReady,
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const offsetMs = Math.round(offsetSec * 1000)
  const progressPct =
    seekMax > 0 ? Math.min(100, Math.max(0, (seekValue / seekMax) * 100)) : 0

  return (
    <div className="flex items-center gap-3 border-t border-border px-4 py-6">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 rounded-2xl"
        disabled={!controlsReady}
        aria-label={isPlaying ? "暂停" : "播放"}
        onClick={onPlay}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 rounded-2xl"
        disabled={!controlsReady}
        aria-label="重播"
        onClick={onRestart}
      >
        <RotateCcwIcon />
      </Button>

      <div className="relative flex min-w-0 flex-1 items-center">
        <input
          type="range"
          min={0}
          max={seekMax || 0}
          step={0.001}
          value={seekValue}
          disabled={!controlsReady}
          className="h-1 w-full cursor-pointer appearance-none rounded-full disabled:opacity-50 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_var(--border)] [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-border [&::-moz-range-thumb]:bg-background"
          style={{
            background: `linear-gradient(to right, #000 ${progressPct}%, var(--border) ${progressPct}%)`,
          }}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
        <audio
          ref={audioRef}
          className="hidden"
          onLoadedMetadata={onAudioMeta}
          onPlay={onAudioPlay}
          onPause={onAudioPause}
          onEnded={onAudioEnded}
        />
      </div>

      <div className="shrink-0 px-2 text-right text-xs tabular-nums text-foreground">
        {timeText}
      </div>

      <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              className="h-11 shrink-0 rounded-2xl px-3 text-sm font-normal"
            />
          }
        >
          动画设置
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={8}
          className="w-[197px] gap-0 rounded-[16px] p-0 px-4 shadow-md"
        >
          <div className="flex h-14 items-center justify-between gap-1">
            <span className="text-xs font-medium">时间偏移 {offsetMs}ms</span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7 rounded-lg bg-[#fcfcfc]"
                aria-label="减少偏移"
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
                className="size-7 rounded-lg bg-[#fcfcfc]"
                aria-label="增加偏移"
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
            上传自定义动画
          </button>
        </PopoverContent>
      </Popover>
    </div>
  )
}
