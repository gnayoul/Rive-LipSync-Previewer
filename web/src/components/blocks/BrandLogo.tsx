import { useEffect, useRef, useState } from "react"

import { LOGO_RIVE_URL } from "@/lib/constants"
import { appUrl } from "@/lib/app-url"
import {
  getFit,
  loadRiveRuntime,
  waitForRiveReveal,
} from "@/lib/rive-loader"
import type { Theme } from "@/lib/theme/theme-context"

const LOGO_SRC = LOGO_RIVE_URL
/** 用户提供的矢量 SVG 占位（非 PNG），避免位图放大发糊 */
const LOGO_CACHE_BUST = "v=20260721t2350"
const LOGO_LIGHT_SVG = appUrl(`brand/logo-light.svg?${LOGO_CACHE_BUST}`)
const LOGO_DARK_SVG = appUrl(`brand/logo-dark.svg?${LOGO_CACHE_BUST}`)
/** 与原先 h-16（64px）一致；SVG 为矢量，Retina 仍清晰 */
const LOGO_WIDTH_CSS = 160
const LOGO_HEIGHT_CSS = 64
const PREFERRED_COLOR_NAMES = ["logocolor", "logoColor", "logo_color", "color"]
/** 默认状态机名；onLoad 后会用 stateMachineNames 校正为文件里真实存在的那个 */
const LOGO_STATE_MACHINE_NAME = "State Machine 1"

const LOGO_FRAME_CLASS =
  "h-16 w-40 max-w-full object-contain object-left"

type ColorProp = {
  name?: string
  value?: number
}

type RiveInstance = {
  cleanup: () => void
  resizeDrawingSurfaceToCanvas: () => void
  stateMachineNames?: string[]
  stateMachineInputs?: (name: string) => unknown[] | undefined
  viewModelInstance?: {
    color?: (path: string) => ColorProp | null
    properties?: Array<{ name?: string; type?: string }>
  } | null
}

function setLogoColor(r: RiveInstance, hex: string) {
  const vmi = r.viewModelInstance
  if (!vmi?.color) return

  const trySet = (path: string) => {
    try {
      const prop = vmi.color?.(path)
      if (prop && typeof prop.value === "number") {
        prop.value = Number.parseInt(hex.replace("#", "0xFF"), 16)
        return true
      }
    } catch {
      /* ignore */
    }
    return false
  }

  for (const name of PREFERRED_COLOR_NAMES) {
    if (trySet(name)) return
  }

  const colorProps =
    vmi.properties?.filter((p) => String(p.type ?? "").toLowerCase() === "color") ??
    []
  for (const prop of colorProps) {
    if (prop.name && trySet(prop.name)) return
  }
}

type BrandLogoProps = {
  theme: Theme
}

export function BrandLogo({ theme }: BrandLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const riveRef = useRef<RiveInstance | null>(null)
  const stateMachineNameRef = useRef<string>(LOGO_STATE_MACHINE_NAME)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  const placeholderSrc = theme === "dark" ? LOGO_DARK_SVG : LOGO_LIGHT_SVG
  const logoColor = theme === "dark" ? "#ffffff" : "#000000"
  const removeReloadSplash = () => {
    document.getElementById("reload-splash")?.remove()
  }

  useEffect(() => {
    // 用对象包一层，避免闭包里改写的布尔值被跨 await 收窄成常量。
    // 实例本身也不用局部 let 变量持有——统一读写 riveRef.current，
    // 避免“变量在自己的初始化表达式里被内层闭包引用”这种自指模式
    // 让 TS 的控制流分析在 await 之后把类型错误地收窄成 never。
    const cancelledBox = { value: false }
    let resizeObserver: ResizeObserver | null = null
    let onResize: (() => void) | null = null

    const canvas = canvasRef.current
    if (!canvas) return

    setReady(false)
    setFailed(false)
    riveRef.current = null

    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const riveRuntime: any = await loadRiveRuntime()
        const { Rive, Layout, Alignment } = riveRuntime
        if (cancelledBox.value || !canvasRef.current) return

        const alignment = Alignment?.CenterLeft ?? Alignment?.Center

        await new Promise<void>((resolve, reject) => {
          const instance: RiveInstance = new Rive({
            src: LOGO_SRC,
            canvas: canvasRef.current!,
            autoplay: true,
            autoBind: true,
            stateMachines: LOGO_STATE_MACHINE_NAME,
            layout: new Layout({
              fit: getFit(riveRuntime, "contain"),
              ...(alignment ? { alignment } : {}),
            }),
            onLoad: () => {
              try {
                const loaded = riveRef.current
                loaded?.resizeDrawingSurfaceToCanvas()
                if (loaded) setLogoColor(loaded, logoColor)

                const names = loaded?.stateMachineNames ?? []
                if (names.length > 0) {
                  stateMachineNameRef.current = names.includes(
                    LOGO_STATE_MACHINE_NAME,
                  )
                    ? LOGO_STATE_MACHINE_NAME
                    : names[0]
                }

                void waitForRiveReveal(2).then(() => {
                  if (!cancelledBox.value) setReady(true)
                })
                resolve()
              } catch (error) {
                reject(error instanceof Error ? error : new Error(String(error)))
              }
            },
            onLoadError: (error: unknown) => {
              reject(error instanceof Error ? error : new Error(String(error)))
            },
          })
          riveRef.current = instance
        })

        if (cancelledBox.value) {
          riveRef.current?.cleanup()
          riveRef.current = null
          return
        }

        onResize = () => {
          try {
            riveRef.current?.resizeDrawingSurfaceToCanvas()
          } catch {
            /* ignore */
          }
        }
        window.addEventListener("resize", onResize)
        resizeObserver = new ResizeObserver(onResize)
        if (canvas.parentElement) resizeObserver.observe(canvas.parentElement)
      } catch {
        if (!cancelledBox.value) {
          setFailed(true)
          setReady(false)
        }
      }
    })()

    return () => {
      cancelledBox.value = true
      if (onResize) window.removeEventListener("resize", onResize)
      resizeObserver?.disconnect()
      try {
        riveRef.current?.cleanup()
      } catch {
        /* ignore */
      }
      riveRef.current = null
    }
  }, [logoColor])

  useEffect(() => {
    const r = riveRef.current
    if (!r || !ready) return
    setLogoColor(r, logoColor)
  }, [logoColor, ready])

  const showCanvas = ready && !failed

  return (
    <div
      className="relative inline-flex h-16 w-40 max-w-full items-center overflow-visible"
      style={{ width: LOGO_WIDTH_CSS, height: LOGO_HEIGHT_CSS }}
      onPointerEnter={() => {
        const r = riveRef.current
        if (!r?.stateMachineInputs) return
        try {
          const inputs = r.stateMachineInputs(stateMachineNameRef.current) ?? []
          for (const input of inputs as Array<{ name?: string; fire?: () => void }>) {
            if (String(input.name ?? "").toLowerCase().includes("pointer")) {
              input.fire?.()
            }
          }
        } catch {
          /* ignore */
        }
      }}
    >
      {/* 矢量 SVG 占位：亮/暗各一份，永不走 PNG */}
      <img
        src={placeholderSrc}
        alt="Rive LipSync"
        width={160}
        height={64}
        decoding="async"
        draggable={false}
        onLoad={removeReloadSplash}
        onError={removeReloadSplash}
        className={LOGO_FRAME_CLASS}
        style={{
          height: LOGO_HEIGHT_CSS,
          width: LOGO_WIDTH_CSS,
          opacity: showCanvas ? 0 : 1,
          pointerEvents: showCanvas ? "none" : "auto",
          transition: "opacity 120ms ease",
        }}
      />
      <canvas
        ref={canvasRef}
        width={LOGO_WIDTH_CSS}
        height={LOGO_HEIGHT_CSS}
        className={`absolute inset-y-0 left-0 ${LOGO_FRAME_CLASS}`}
        style={{
          height: LOGO_HEIGHT_CSS,
          width: LOGO_WIDTH_CSS,
          opacity: showCanvas ? 1 : 0,
          pointerEvents: showCanvas ? "auto" : "none",
          transition: "opacity 120ms ease",
        }}
        aria-hidden={!showCanvas}
      />
    </div>
  )
}
