/** 页头 — 对照 Figma Logo Container */
export function AppHeader() {
  return (
    <header className="flex items-center py-5 md:py-6">
      <a href="/" className="inline-flex items-center" aria-label="Rive LipSync">
        <img
          src="/brand/logo.svg"
          alt=""
          className="h-auto w-[150px]"
          width={150}
          height={59}
        />
      </a>
    </header>
  )
}
