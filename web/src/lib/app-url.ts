const baseUrl = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`

/** Build an app-relative URL that works at both the Render origin and a subpath proxy. */
export function appUrl(path = "") {
  return `${baseUrl}${path.replace(/^\/+/, "")}`
}

export const APP_HOME_URL = appUrl()
