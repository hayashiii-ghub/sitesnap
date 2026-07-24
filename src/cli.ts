import { VERSION } from "./config.ts"
import { HELP, parseCliArgs } from "./cli-args.ts"
import { buildCommands } from "./commands.ts"
import { formatError } from "./output.ts"

const argv = process.argv.slice(2)

if (argv.includes("--version") || argv.includes("-v")) {
  console.log(VERSION)
  process.exit(0)
}
if (argv.includes("--help") || argv.includes("-h") || argv[0] === "help" || argv.length === 0) {
  console.log(HELP)
  process.exit(0)
}

try {
  const context = parseCliArgs(argv)
  const handler = context.sub ? buildCommands()[context.sub] : undefined
  if (!handler) throw new Error(`不明なコマンドです: ${context.sub ?? ""}`)
  const result = await handler(context)
  if (result.stdout) process.stdout.write(`${result.stdout}\n`)
  if (result.stderr) process.stderr.write(`${result.stderr}\n`)
  process.exit(result.exitCode)
} catch (error) {
  process.stdout.write(`${formatError(error)}\n`)
  process.exit(1)
}
