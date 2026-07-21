import { CircleCheckIcon, UploadIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { useLocale } from "@/lib/i18n/locale-context"
import { cn } from "@/lib/utils"

type UploadedFileCardProps = {
  fileName: string
  description?: string
  onReplace: () => void
  onClear?: () => void
}

/** 上传成功态 — shadcn Item（outline + 勾选图标） */
export function UploadedFileCard({
  fileName,
  description,
  onReplace,
  onClear,
}: UploadedFileCardProps) {
  const { t } = useLocale()

  return (
    <Item
      variant="outline"
      size="sm"
      className="w-full rounded-[16px]! border-border bg-background/50"
    >
      <ItemMedia variant="icon">
        <CircleCheckIcon className="text-[#4a9830]" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="max-w-full truncate">{fileName}</ItemTitle>
        {description ? (
          <ItemDescription className="text-xs text-muted-foreground">
            {description}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-[14px]! text-xs hover:bg-muted"
          onClick={onReplace}
        >
          {t("file.replace")}
        </Button>
        {onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-[14px]! hover:bg-muted"
            aria-label={t("file.clear")}
            onClick={onClear}
          >
            <XIcon />
          </Button>
        ) : null}
      </ItemActions>
    </Item>
  )
}

type UploadEmptyCardProps = {
  htmlFor: string
  title: string
  description?: string
  className?: string
}

/** 未上传态 — shadcn Empty（虚线边框，与成功态同一套视觉语言） */
export function UploadEmptyCard({
  htmlFor,
  title,
  description,
  className,
}: UploadEmptyCardProps) {
  return (
    <label htmlFor={htmlFor} className="block w-full cursor-pointer">
      <Empty
        className={cn(
          "min-h-[96px] gap-0 rounded-[16px]! border border-dashed border-border bg-background/50 p-6 transition-colors hover:bg-background",
          className,
        )}
      >
        <EmptyHeader className="gap-2">
          <EmptyMedia variant="icon" className="bg-muted">
            <UploadIcon />
          </EmptyMedia>
          <EmptyTitle className="font-sans text-sm font-medium tracking-normal">
            {title}
          </EmptyTitle>
          {description ? (
            <EmptyDescription className="text-xs text-muted-foreground">
              {description}
            </EmptyDescription>
          ) : null}
        </EmptyHeader>
      </Empty>
    </label>
  )
}
