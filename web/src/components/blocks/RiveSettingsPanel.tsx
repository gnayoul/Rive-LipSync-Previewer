import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RIVE_SETTINGS_FIELDS } from "@/lib/constants"

export type RiveSettingsValues = {
  dataMode: string
  artboardName: string
  stateMachine: string
  mouthInputName: string
  viewModelName: string
  viewModelPath: string
  fit: string
  offset: number
}

type RiveSettingsPanelProps = {
  values: RiveSettingsValues
  onChange: <K extends keyof RiveSettingsValues>(
    key: K,
    value: RiveSettingsValues[K],
  ) => void
}

/** R8 — Settings Card + 数据驱动字段（对照 preferences / field-responsive） */
export function RiveSettingsPanel({ values, onChange }: RiveSettingsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rive 设置</CardTitle>
        <CardDescription>绑定 ViewModel 或 State Machine Number。</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup className="gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {RIVE_SETTINGS_FIELDS.map((field) => {
              const id = `rive-${field.key}`
              if (field.kind === "select") {
                const value = String(values[field.key as keyof RiveSettingsValues])
                return (
                  <Field key={field.key}>
                    <FieldLabel>{field.label}</FieldLabel>
                    <Select
                      value={value}
                      onValueChange={(next) =>
                        next &&
                        onChange(
                          field.key as keyof RiveSettingsValues,
                          next as never,
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )
              }

              if (field.kind === "number") {
                return (
                  <Field key={field.key}>
                    <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                    <Input
                      id={id}
                      type="number"
                      step={field.step}
                      value={values.offset}
                      onChange={(event) =>
                        onChange("offset", Number(event.target.value) || 0)
                      }
                    />
                  </Field>
                )
              }

              const textKey = field.key as Exclude<
                keyof RiveSettingsValues,
                "offset"
              >
              return (
                <Field key={field.key}>
                  <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
                  <Input
                    id={id}
                    value={String(values[textKey] ?? "")}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                      onChange(textKey, event.target.value as never)
                    }
                  />
                </Field>
              )
            })}
          </div>
          <FieldDescription className="text-xs">
            你用 ViewModel2 时，保持第一项为 ViewModel Number。嘴巴慢了试
            -0.05；嘴巴太早试 0.05。
          </FieldDescription>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
