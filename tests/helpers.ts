import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CliContext } from '../src/cli-args.ts';

export async function makeTmpDir(prefix = 'sitesnap-test-') {
  return await mkdtemp(path.join(tmpdir(), prefix));
}

export async function cleanupTmpDir(dir: string) {
  await rm(dir, { recursive: true, force: true });
}

// テスト用 CliContext ファクトリ。parseCliArgs の既定に近い値を返し、over で
// 必要な差分だけ上書きする。nested の captureOptions / shotOptions は丸ごと置換
// ではなくマージする (将来 captureOptions に必須項目が増えても各テストが古い形
// のまま素通りする事故を防ぐ)。shotDir は未指定なら outDir に揃える。
// captureOptions / shotOptions は部分指定できる (差分だけ渡せば残りは既定)。
type CtxOverrides = Partial<Omit<CliContext, "captureOptions" | "shotOptions">> & {
  captureOptions?: Partial<CliContext["captureOptions"]>;
  shotOptions?: Partial<CliContext["shotOptions"]>;
};
export function makeCtx(over: CtxOverrides = {}): CliContext {
  const outDir = over.outDir ?? '/tmp/sitesnap-test';
  const base: CliContext = {
    sub: 'list',
    args: [],
    json: true,
    strict: false,
    agentTask: false,
    outDir,
    outDirExplicit: true,
    shotDir: outDir,
    outFile: null,
    captureOptions: { outDir, allowPrivate: false },
    shotOptions: { vp: null, device: null, selector: null, settleMs: null, full: false, props: null, label: null, clicks: [], evalJs: null },
    limit: null,
    exclude: null,
    minInterval: null,
    dryRun: false,
    olderThan: null,
    shots: false,
  };
  return {
    ...base,
    ...over,
    captureOptions: { ...base.captureOptions, ...over.captureOptions },
    shotOptions: { ...base.shotOptions, ...over.shotOptions },
  };
}

export const FIXTURE_URLSET = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about</loc></url>
</urlset>`;

export const FIXTURE_SITEMAPINDEX = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;

export const FIXTURE_CYCLIC_INDEX = `<?xml version="1.0"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-cycle.xml</loc></sitemap>
</sitemapindex>`;
