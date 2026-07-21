/**
 * Install web deps (including Vite/tsc) and build web/dist.
 * Used by Render buildCommand and root postinstall so a dashboard
 * still set to plain `npm install` still produces index.html.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repoRoot, "web");
const indexHtml = path.join(webRoot, "dist", "index.html");
const invokedAsPostinstall = process.env.npm_lifecycle_event === "postinstall";
const onRender = process.env.RENDER === "true";
const forceBuild = process.env.FORCE_WEB_BUILD === "1";

// Local `npm install` should stay fast; Render dashboard builds that only run
// `npm install` still need this postinstall. Explicit `node scripts/build-web.mjs`
// (render.yaml buildCommand / `npm run build`) always builds.
if (invokedAsPostinstall && !onRender && !forceBuild) {
  console.log(
    "[build-web] skip local postinstall (Render/FORCE_WEB_BUILD=1 will build)",
  );
  process.exit(0);
}

function run(command, args, cwd) {
  console.log(`[build-web] ${command} ${args.join(" ")}`);
  const env = { ...process.env };
  // Ensure Vite/TypeScript (devDependencies) are installed on Render.
  delete env.NPM_CONFIG_PRODUCTION;
  delete env.npm_config_production;
  if (env.NODE_ENV === "production") delete env.NODE_ENV;

  const npmCmd =
    command === "npm" && process.platform === "win32" ? "npm.cmd" : command;
  const result = spawnSync(npmCmd, args, {
    cwd,
    stdio: "inherit",
    env,
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(path.join(webRoot, "package.json"))) {
  console.error(`[build-web] FATAL: missing ${path.join(webRoot, "package.json")}`);
  process.exit(1);
}

const viteJs = path.join(webRoot, "node_modules", "vite", "bin", "vite.js");
const needInstall =
  onRender ||
  process.env.FORCE_WEB_CI === "1" ||
  !fs.existsSync(viteJs);

if (needInstall) {
  run("npm", ["ci", "--include=dev"], webRoot);
} else {
  console.log("[build-web] reuse existing web/node_modules (set FORCE_WEB_CI=1 to reinstall)");
}

run("npm", ["run", "build"], webRoot);

if (!fs.existsSync(indexHtml)) {
  console.error(`[build-web] FATAL: build finished but missing ${indexHtml}`);
  process.exit(1);
}

console.log(`[build-web] OK ${indexHtml}`);
