import { chromium } from "playwright"
import "../src/capture.ts"

// テストスイート全体で 1 つの browser を共有する。
// Bun では同一プロセス内で chromium.launch を繰り返すと CDP パイプが
// 無応答・切断になることがある (src/capture.ts の launchChromium 参照)。
// browser は bun test プロセス終了時に Playwright の exit handler が回収する。
globalThis.__sitesnapSharedBrowser = await chromium.launch()
