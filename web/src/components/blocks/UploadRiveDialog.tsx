import { UploadIcon } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MOUTH_GUIDE_ROWS } from "@/lib/constants"

type UploadRiveDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRiveFile: (file: File | null) => void
}

/** 上传动画弹窗 — 对照 Figma「上传自定义动画」 */
export function UploadRiveDialog({
  open,
  onOpenChange,
  onRiveFile,
}: UploadRiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // 必须给确定高度（不能只用 max-h）：否则 flex 子项 ScrollArea 会随内容撑开，Viewport 无溢出、无法滚动。
        // flex! 覆盖 DialogContent 默认的 grid。
        className="flex! h-[min(90vh,720px)] max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden rounded-[24px]! bg-[#f1f1f1] p-0 sm:max-w-[480px]"
        showCloseButton
      >
        <DialogHeader className="shrink-0 gap-0 bg-[#f1f1f1] px-6 pt-6 pb-4 text-left">
          <DialogTitle className="pr-10 text-lg font-bold">
            上传自定义动画
          </DialogTitle>
          <DialogDescription className="sr-only">
            上传 .riv 文件，并查看嘴型制作要求
          </DialogDescription>
        </DialogHeader>

        {/* basis-0 + min-h-0：占满标题下方剩余高度，强制 Viewport 在定高内滚动 */}
        <ScrollArea className="min-h-0 flex-1 basis-0">
          <div className="flex flex-col gap-6 px-6 pb-6">
            <label className="flex min-h-[126px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-border bg-background/50 px-3 py-4 text-center transition-colors hover:bg-background">
              <UploadIcon className="size-6 text-foreground" />
              <span className="flex flex-col gap-1 text-xs">
                <span className="text-foreground">
                  点击或拖拽上传你的.riv文件
                </span>
                <span className="text-[#aaa]">
                  PS：本工具无法自动生成嘴型，请先在rive中完成嘴型制作
                </span>
              </span>
              <input
                type="file"
                accept=".riv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  if (!file) return
                  onRiveFile(file)
                  onOpenChange(false)
                  event.target.value = ""
                }}
              />
            </label>

            <div className="flex flex-col gap-2.5">
              <p className="text-sm font-medium">Rive嘴型制作要求：</p>
              <div className="flex flex-col gap-0 text-xs leading-6 text-foreground">
                <p>1、请在rive中分别制作如下9个嘴型的Timeline</p>
                <p>
                  2、在Data面板中创建number类型的变量（变量名建议为“mouth”）
                </p>
                <p>
                  3、根据如下对应关系设置状态机：变量在不同数值下触发对应的嘴型Timeline
                </p>
              </div>
            </div>

            <div className="w-full text-xs">
              <div className="grid grid-cols-[28px_80px_1fr] items-center gap-x-8 py-2">
                <span>number</span>
                <span className="text-center">嘴型</span>
                <span>说明</span>
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
                      alt={`嘴型 ${row.shape}`}
                      className="max-h-12 max-w-16 object-contain"
                    />
                  </div>
                  <span className="leading-normal">{row.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
