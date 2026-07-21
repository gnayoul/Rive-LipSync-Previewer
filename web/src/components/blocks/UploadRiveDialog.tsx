import { useRef } from "react"

import { UploadedFileCard, UploadEmptyCard } from "@/components/blocks/UploadedFileCard"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MOUTH_GUIDE_ROWS } from "@/lib/constants"
import { MOUTH_DESC_KEYS } from "@/lib/i18n/messages"
import { useLocale } from "@/lib/i18n/locale-context"

type UploadRiveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRiveFile: (file: File | null) => void
  riveFileName: string | null
}

/** 上传动画弹窗 — 对照 Figma「上传自定义动画」 */
export function UploadRiveDialog({
  open,
  onOpenChange,
  onRiveFile,
  riveFileName,
}: UploadRiveDialogProps) {
  const { t } = useLocale()
  const riveInputRef = useRef<HTMLInputElement>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // 必须给确定高度（不能只用 max-h）：否则 flex 子项 ScrollArea 会随内容撑开，Viewport 无溢出、无法滚动。
        // flex! 覆盖 DialogContent 默认的 grid。
        className="flex! h-[min(90vh,720px)] max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden rounded-[24px]! bg-muted p-0 sm:max-w-[480px]"
        showCloseButton
      >
        <DialogHeader className="shrink-0 gap-0 bg-muted px-6 pt-6 pb-4 text-left">
          <DialogTitle className="pr-10 text-lg font-bold">
            {t("dialog.uploadTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("dialog.uploadDesc")}
          </DialogDescription>
        </DialogHeader>

        {/* basis-0 + min-h-0：占满标题下方剩余高度，强制 Viewport 在定高内滚动 */}
        <ScrollArea className="min-h-0 flex-1 basis-0">
          <div className="flex flex-col gap-6 px-6 pb-6">
            <input
              ref={riveInputRef}
              id="riveFile"
              type="file"
              accept=".riv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                if (!file) return
                onRiveFile(file)
                event.target.value = ""
              }}
            />
            {riveFileName ? (
              <UploadedFileCard
                fileName={riveFileName}
                onReplace={() => riveInputRef.current?.click()}
                onClear={() => onRiveFile(null)}
              />
            ) : (
              <UploadEmptyCard
                htmlFor="riveFile"
                title={t("dialog.uploadRivTitle")}
                description={t("dialog.uploadRivDesc")}
                className="min-h-[126px]"
              />
            )}

            <div className="flex flex-col gap-2.5">
              <p className="text-sm font-medium">{t("dialog.requirementsTitle")}</p>
              <div className="flex flex-col gap-0 text-xs leading-6 text-foreground">
                <p>{t("dialog.req1")}</p>
                <p>{t("dialog.req2")}</p>
                <p>{t("dialog.req3")}</p>
              </div>
            </div>

            <div className="w-full text-xs">
              <div className="grid grid-cols-[28px_80px_1fr] items-center gap-x-8 py-2">
                <span>number</span>
                <span className="text-center">{t("dialog.colShape")}</span>
                <span>{t("dialog.colDesc")}</span>
              </div>
              {MOUTH_GUIDE_ROWS.map((row) => (
                <div
                  key={row.value}
                  className="grid h-[60px] grid-cols-[28px_80px_1fr] items-center gap-x-8 border-t border-border"
                >
                  <span>{row.value}</span>
                  <div className="flex items-center justify-center">
                    <img
                      src={row.image}
                      alt={t("dialog.shapeAlt", { shape: row.shape })}
                      className="max-h-12 max-w-16 overflow-hidden rounded-[16px] object-contain"
                    />
                  </div>
                  <span className="leading-normal">
                    {t(MOUTH_DESC_KEYS[row.shape] ?? "mouth.x")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
