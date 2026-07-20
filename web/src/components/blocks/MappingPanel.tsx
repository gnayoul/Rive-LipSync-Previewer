import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SHAPE_TO_VALUE } from "@/lib/constants"

/** 映射网格 — 数据驱动（对照 card-small 密度） */
export function MappingPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>映射</CardTitle>
        <CardDescription>mouth Number：X=0 … H=8</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(SHAPE_TO_VALUE).map(([shape, value]) => (
            <div
              key={shape}
              className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
            >
              <strong className="font-semibold">{shape}</strong>
              <span className="text-right font-mono text-xs text-muted-foreground">
                {value}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Rive 里的 mouth 输入应为 Number。让不同数值显示对应嘴型。
        </p>
      </CardContent>
    </Card>
  )
}
