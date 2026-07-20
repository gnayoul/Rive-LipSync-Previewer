import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type StatusPanelProps = {
  shapeNow: string
  valueNow: string
  cueCount: number
  machineNames: string
}

/** R6 — 状态行数据驱动（对照 item-group） */
export function StatusPanel({
  shapeNow,
  valueNow,
  cueCount,
  machineNames,
}: StatusPanelProps) {
  const rows = [
    { label: "当前嘴型", value: shapeNow },
    { label: "当前数值", value: valueNow },
    { label: "嘴型片段数量", value: String(cueCount) },
    { label: "检测到的 State Machine", value: machineNames },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>当前状态</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 pt-0">
        {rows.map((row, index) => (
          <div
            key={row.label}
            className={`flex items-center justify-between py-2.5 text-sm ${
              index < rows.length - 1 ? "border-b border-border" : ""
            }`}
          >
            <span>{row.label}</span>
            <Badge variant="secondary" className="font-mono text-xs">
              {row.value}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
