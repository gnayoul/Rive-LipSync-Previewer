import path from "node:path"
import { fileURLToPath } from "node:url"

import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const dirname =
  typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: "/rive-lipsync/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@huggingface/transformers"],
  },
  worker: {
    format: "es",
  },
  server: {
    port: 5173,
    // Intentionally no COOP/COEP: crossOriginIsolated would help WASM threads /
    // SharedArrayBuffer, but breaks Vite HMR + Rive CDN scripts in this app.
    // ASR falls back to single-thread WASM when SAB is unavailable.
    proxy: {
      "/rive-lipsync/api": {
        target: "http://127.0.0.1:3921",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/rive-lipsync/, ""),
      },
      "/rive-lipsync/vendor": {
        target: "http://127.0.0.1:3921",
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/rive-lipsync/, ""),
      },
    },
  },
})
