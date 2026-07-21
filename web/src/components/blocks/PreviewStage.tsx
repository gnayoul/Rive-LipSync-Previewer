import type { RefObject } from "react"

import { TransportBar } from "@/components/blocks/TransportBar"
import { useLocale } from "@/lib/i18n/locale-context"

type PreviewStageProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** Rive 已 onLoad（或超时揭开）；未就绪时用同色硬遮罩盖住 canvas */
  canvasReady: boolean
  transport: React.ComponentProps<typeof TransportBar>
}

/** 预览主区 — 对照 Figma「预览舞台」 */
export function PreviewStage({
  canvasRef,
  canvasReady,
  transport,
}: PreviewStageProps) {
  const { t } = useLocale()

  return (
    <section
      aria-label={t("preview.aria")}
      className="overflow-hidden rounded-[24px] bg-muted"
    >
      <div className="relative min-h-[400px] md:min-h-[540px]">
        {/* CSS 底色防闪即可；禁止对 canvas getContext("2d")，否则 WebGL2 建不起来 */}
        <canvas
          ref={canvasRef}
          className="relative z-[1] block h-full min-h-[400px] w-full bg-muted md:min-h-[540px]"
          style={{ backgroundColor: "var(--muted)" }}
        />
        {!canvasReady ? (
          <div
            className="pointer-events-none absolute inset-0 z-[2] bg-muted"
            style={{ backgroundColor: "var(--muted)" }}
            aria-hidden
          />
        ) : null}
      </div>
      <TransportBar {...transport} />
    </section>
  )
}
