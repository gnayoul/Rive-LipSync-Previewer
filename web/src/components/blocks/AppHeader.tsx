import { useEffect, useState } from "react"
import { GlobeIcon, MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useLocale } from "@/lib/i18n/locale-context"
import { useTheme } from "@/lib/theme/theme-context"
import { isRestrictedPreviewBrowser } from "@/lib/asr/env"

/** 页头 — 对照 Figma Logo Container */
export function AppHeader() {
  const [showChromeTip, setShowChromeTip] = useState(false)
  const { t, toggleLocale } = useLocale()
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    setShowChromeTip(isRestrictedPreviewBrowser())
  }, [])

  return (
    <header className="flex items-center justify-between gap-4 py-5 md:py-6">
      <a href="/" className="inline-flex items-center" aria-label="Rive LipSync">
        <img
          src="/brand/logo.png"
          alt=""
          className="h-16 w-auto object-contain object-left dark:hidden"
          width={320}
          height={128}
        />
        <img
          src="/brand/logo-dark.png"
          alt=""
          className="hidden h-16 w-auto object-contain object-left dark:block"
          width={320}
          height={128}
        />
      </a>

      <div className="flex items-center gap-1 sm:gap-2">
        {showChromeTip ? (
          <p className="mr-1 hidden max-w-[11.5rem] text-right text-[11px] leading-snug text-muted-foreground sm:mr-2 sm:block sm:max-w-xs">
            {t("header.chromeTip")}{" "}
            <span className="font-mono">http://localhost:5173</span>
          </p>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={t("header.toggleLocale")}
          aria-label={t("header.toggleLocale")}
          onClick={toggleLocale}
        >
          <GlobeIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={
            theme === "dark"
              ? t("header.toggleThemeLight")
              : t("header.toggleThemeDark")
          }
          aria-label={
            theme === "dark"
              ? t("header.toggleThemeLight")
              : t("header.toggleThemeDark")
          }
          onClick={toggleTheme}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </Button>
      </div>
    </header>
  )
}
