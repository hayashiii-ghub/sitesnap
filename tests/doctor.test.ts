import { test, expect } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeTmpDir, cleanupTmpDir } from "./helpers";
import { analyzeRunDirectory, buildAgentTaskMarkdown } from "../src/doctor";

test("doctor: summarizes failed captures and suggests a retry command", async () => {
  const dir = await makeTmpDir("sitesnap-doctor-");
  try {
    await mkdir(path.join(dir, "screenshots", "mobile"), { recursive: true });
    await writeFile(
      path.join(dir, "result.json"),
      JSON.stringify(
        {
          domain: "example.com",
          captures: [
            {
              url: "https://example.com/about",
              viewport: "mobile",
              status: "failed",
              reason: "blank_screenshot",
              screenshotPath: "screenshots/mobile/about.png",
              httpStatus: 200,
              durationMs: 4210,
            },
            {
              url: "https://example.com/works",
              viewport: "desktop",
              status: "failed",
              reason: "timeout",
              screenshotPath: "screenshots/desktop/works.png",
              httpStatus: 200,
              durationMs: 30000,
            },
          ],
        },
        null,
        2
      )
    );

    const report = await analyzeRunDirectory(dir);

    expect(report.domain).toBe("example.com");
    expect(report.totalCaptures).toBe(2);
    expect(report.failedCaptures).toBe(2);
    expect(report.blankCaptures).toBe(1);
    expect(report.timeoutCaptures).toBe(1);
    expect(report.suggestedRetry).toBe(
      "sitesnap retry example.com --wait-ms 2500 --pre-scroll full-page --force-visible"
    );
  } finally {
    await cleanupTmpDir(dir);
  }
});

test("doctor: builds an agent task constrained to sitesnap config output", async () => {
  const task = buildAgentTaskMarkdown({
    runDir: "/tmp/sites/example.com/runs/latest",
    domain: "example.com",
    totalCaptures: 2,
    failedCaptures: 1,
    blankCaptures: 1,
    timeoutCaptures: 0,
    httpErrorCaptures: 0,
    failed: [
      {
        url: "https://example.com/about",
        viewport: "mobile",
        status: "failed",
        reason: "blank_screenshot",
        screenshotPath: "screenshots/mobile/about.png",
      },
    ],
    suggestedRetry: "sitesnap retry example.com --wait-ms 2500 --pre-scroll full-page --force-visible",
  });

  expect(task).toContain("Produce a stable sitesnap.config.json patch");
  expect(task).toContain("https://example.com/about mobile: blank_screenshot");
  expect(task).toContain("waitMs");
  expect(task).toContain("dismissSelectors");
  expect(task).not.toContain("Install Webwright");
});
