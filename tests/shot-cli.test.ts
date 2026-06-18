import { test, expect } from "bun:test";
import { parseCliArgs } from "../src/cli-args.ts";

test("parseCliArgs: shot の --vp / --settle をパースする", () => {
  const ctx = parseCliArgs(["shot", "https://example.com/", "--vp", "800x600", "--settle", "1200"]);
  expect(ctx.sub).toBe("shot");
  expect(ctx.args).toEqual(["https://example.com/"]);
  expect(ctx.shotOptions.vp).toEqual({ width: 800, height: 600 });
  expect(ctx.shotOptions.settleMs).toBe(1200);
  expect(ctx.shotOptions.full).toBeFalse();
});

test("parseCliArgs: shot の --device / --selector / --full をパースする", () => {
  const ctx = parseCliArgs(["shot", "https://example.com/", "--device", "iPhone 13", "--selector", "footer"]);
  expect(ctx.shotOptions.device).toBe("iPhone 13");
  expect(ctx.shotOptions.selector).toBe("footer");

  const full = parseCliArgs(["shot", "https://example.com/", "--full"]);
  expect(full.shotOptions.full).toBeTrue();
});

test("parseCliArgs: shot の --label をパースする", () => {
  const ctx = parseCliArgs(["shot", "https://example.com/", "--label", "tab-user"]);
  expect(ctx.shotOptions.label).toBe("tab-user");
});

test("parseCliArgs: --label 未指定は null", () => {
  const ctx = parseCliArgs(["shot", "https://example.com/"]);
  expect(ctx.shotOptions.label).toBeNull();
});

test("parseCliArgs: --click は繰り返し指定で配列になる", () => {
  const ctx = parseCliArgs(["shot", "https://example.com/", "--click", ".tab", "--click", "summary"]);
  expect(ctx.shotOptions.clicks).toEqual([".tab", "summary"]);
});

test("parseCliArgs: --click 未指定は空配列", () => {
  const ctx = parseCliArgs(["shot", "https://example.com/"]);
  expect(ctx.shotOptions.clicks).toEqual([]);
});

test("parseCliArgs: --eval をパースする", () => {
  const ctx = parseCliArgs(["shot", "https://example.com/", "--eval", "document.body.dataset.x = '1'"]);
  expect(ctx.shotOptions.evalJs).toBe("document.body.dataset.x = '1'");
});

test("parseCliArgs: --eval 未指定は null", () => {
  const ctx = parseCliArgs(["shot", "https://example.com/"]);
  expect(ctx.shotOptions.evalJs).toBeNull();
});

test("parseCliArgs: --allow-file をパースする", () => {
  const ctx = parseCliArgs(["shot", "file:///tmp/x.html", "--allow-file"]);
  expect(ctx.captureOptions.allowFile).toBeTrue();
});

test("parseCliArgs: --vp と --device の併用は拒否する", () => {
  expect(() =>
    parseCliArgs(["shot", "https://example.com/", "--vp", "800x600", "--device", "iPhone 13"])
  ).toThrow(/--vp と --device/);
});

test("parseCliArgs: --selector と --full の併用は拒否する", () => {
  expect(() =>
    parseCliArgs(["shot", "https://example.com/", "--selector", "footer", "--full"])
  ).toThrow(/--selector と --full/);
});

test("parseCliArgs: --vp の不正値は INVALID_OPTION", () => {
  expect(() => parseCliArgs(["shot", "https://example.com/", "--vp", "wide"])).toThrow(/--vp/);
});

test("parseCliArgs: shot は位置引数 1 個まで", () => {
  expect(() => parseCliArgs(["shot", "https://example.com/", "extra"])).toThrow(/引数が多すぎます/);
});
