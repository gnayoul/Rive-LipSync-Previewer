import type { RefObject } from "react"

import { TransportBar } from "@/components/blocks/TransportBar"

type PreviewStageProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>
  transport: React.ComponentProps<typeof TransportBar>
}

/** 预览主区 — 对照 Figma「预览舞台」 */
export function PreviewStage({ canvasRef, transport }: PreviewStageProps) {
  return (
    <section
      aria-label="预览舞台"
      className="overflow-hidden rounded-[24px] bg-[#f1f1f1]"
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
