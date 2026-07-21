import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "./App.tsx"
import { TooltipProvider } from "@/components/ui/tooltip"
import { LocaleProvider } from "@/lib/i18n/locale-context"
import { ThemeProvider } from "@/lib/theme/theme-context"
import "./index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <LocaleProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </LocaleProvider>
    </ThemeProvider>
  </StrictMode>,
)
