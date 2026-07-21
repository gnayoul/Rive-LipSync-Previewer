import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useLocale } from "@/lib/i18n/locale-context"

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
  const { t } = useLocale()
  const rows = [
    { label: t("statusPanel.shapeNow"), value: shapeNow },
    { label: t("statusPanel.valueNow"), value: valueNow },
    { label: t("statusPanel.cueCount"), value: String(cueCount) },
    { label: t("statusPanel.stateMachines"), value: machineNames },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("statusPanel.title")}</CardTitle>
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
