import { VERSION } from "./config.ts"
import { HELP, parseCliArgs } from "./cli-args.ts"
import { buildCommands } from "./commands.ts"
import { formatError } from "./output.ts"

const rawArgv = process.argv.slice(2)
const wantsJson = rawArgv.includes("--json")

if (rawArgv.includes("--version") || rawArgv.includes("-v")) {
  console.log(VERSION)
  process.exit(0)
}

let ctx
try {
  ctx = parseCliArgs(rawArgv)
} catch (e) {
  if (wantsJson) {
    console.log(formatError(e, "json"))
  } else {
    console.error(formatError(e, "text"))
  }
  process.exit(1)
}

if (!ctx.sub || ctx.sub === "help" || ctx.sub === "-h" || ctx.sub === "--help") {
  console.log(HELP)
  process.exit(0)
}

const fn = buildCommands()[ctx.sub]
if (!fn) {
  console.error(`不明なコマンド: ${ctx.sub}`)
  console.error(HELP)
  process.exit(1)
}

try {
  const result = await fn(ctx)
  if (result.stdout) process.stdout.write(`${result.stdout}\n`)
  if (result.stderr) process.stderr.write(`${result.stderr}\n`)
  process.exit(result.exitCode)
} catch (e) {
  // SiteSnapError 含む全エラーを構造化出力
  if (ctx.json) {
    console.log(formatError(e, "json"))
  } else {
    console.error(formatError(e, "text"))
  }
  process.exit(1)
}
