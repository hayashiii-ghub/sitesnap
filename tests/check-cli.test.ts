import { test, expect } from "bun:test";
import { buildCommands } from "../src/commands.ts";
import type { CliContext } from "../src/cli-args.ts";

const BAD_HTML = `<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>bad</title></head>
<body style="margin:0"><div style="width:2000px;height:10px">wide</div></body></html>`;

function ctxFor(url: string, strict: boolean): CliContext {
  return {
    sub: "check",
    args: [url],
    json: true,
    strict,
    agentTask: false,
    outDir: "/tmp/sitesnap-check-cli",
    captureOptions: { allowPrivate: true },
    shotOptions: { vp: null, device: null, selector: null, settleMs: null, full: false, props: null },
    limit: null,
    exclude: null,
    minInterval: null,
  };
}

test(
  "check: 失敗があってもデフォルトは exit 0、--strict で exit 1",
  async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(BAD_HTML, { headers: { "content-type": "text/html" } }),
    });
    try {
      const url = `http://127.0.0.1:${server.port}/`;

      const lenient = await buildCommands().check!(ctxFor(url, false));
      expect(lenient.exitCode).toBe(0);
      const data = JSON.parse(lenient.stdout);
      expect(data.pass).toBeFalse();
      expect(data.checks.overflow.pass).toBeFalse();

      const strict = await buildCommands().check!(ctxFor(url, true));
      expect(strict.exitCode).toBe(1);
    } finally {
      server.stop();
    }
  },
  120000
);
