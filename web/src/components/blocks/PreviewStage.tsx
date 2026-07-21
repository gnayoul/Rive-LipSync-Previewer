import type { RefObject } from "react"

import { TransportBar } from "@/components/blocks/TransportBar"
import { useLocale } from "@/lib/i18n/locale-context"

type PreviewStageProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  transport: React.ComponentProps<typeof TransportBar>
}

/** 预览主区 — 对照 Figma「预览舞台」 */
export function PreviewStage({ canvasRef, transport }: PreviewStageProps) {
  const { t } = useLocale()

  return (
    <section
      aria-label={t("preview.aria")}
      className="overflow-hidden rounded-[24px] bg-muted"
    >
      <div className="relative min-h-[400px] md:min-h-[540px]">
        <canvas
          ref={canvasRef}
          className="relative z-[1] block h-full min-h-[400px] w-full md:min-h-[540px]"
        />
      </div>
      <TransportBar {...transport} />
    </section>
  )
}
