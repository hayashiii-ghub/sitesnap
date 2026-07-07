import { test, expect } from "bun:test";
import { resolveMobileDevices, buildCaptureTasks } from "../src/capture.ts";
import { deviceDescriptorFor } from "../src/devices.ts";
import { SiteSnapError } from "../src/errors.ts";

test("resolveMobileDevices: 通常は iPhone 17 のみ", () => {
  expect(resolveMobileDevices()).toEqual([{ name: "iPhone 17" }]);
});

test("resolveMobileDevices: broad は 3 端末とサブディレクトリ", () => {
  expect(resolveMobileDevices("broad")).toEqual([
    { name: "iPhone 17" },
    { name: "iPhone SE (3rd gen)", variantSubdir: "iphone-se-3rd-gen" },
    { name: "Pixel 10", variantSubdir: "pixel-10" },
  ]);
});

test("buildCaptureTasks: broad は URL あたり desktop + mobile×3", () => {
  const urls = ["https://a.test/", "https://b.test/about"];
  const tasks = buildCaptureTasks(urls, "broad");
  expect(tasks).toHaveLength(8);
  expect(tasks.filter((t) => t.mode === "desktop")).toHaveLength(2);
  expect(tasks.filter((t) => t.mode === "mobile")).toHaveLength(6);
});

test("deviceDescriptorFor: 存在しないデバイス名は UNKNOWN_DEVICE", () => {
  expect(() => deviceDescriptorFor("Not A Real Phone")).toThrow(SiteSnapError);
  try {
    deviceDescriptorFor("Not A Real Phone");
  } catch (e) {
    expect((e as SiteSnapError).code).toBe("UNKNOWN_DEVICE");
  }
});

test("deviceDescriptorFor: broad プロファイルの端末名は Playwright で解決できる", () => {
  for (const { name } of resolveMobileDevices("broad")) {
    expect(deviceDescriptorFor(name).viewport.width).toBeGreaterThan(0);
  }
});
