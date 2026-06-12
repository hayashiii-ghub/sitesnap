import { test, expect } from "bun:test";
import { parseViewport, shotFileFor, shotDirFor } from "../src/shot.ts";

// --- parseViewport ---

test("parseViewport: WxH 形式をパースする", () => {
  expect(parseViewport("1440x900")).toEqual({ width: 1440, height: 900 });
  expect(parseViewport("390x844")).toEqual({ width: 390, height: 844 });
});

test("parseViewport: 不正な形式は INVALID_OPTION で拒否する", () => {
  for (const bad of ["1440", "1440x", "x900", "0x900", "1440x0", "-1x900", "1440×900", "abc"]) {
    expect(() => parseViewport(bad)).toThrow(/--vp/);
  }
});

// --- shotDirFor: localhost のポート違いを別フォルダに分ける ---

test("shotDirFor: ホスト名フォルダの下の shots/ を返す", () => {
  expect(shotDirFor("https://example.com/about", "/abs/sites")).toBe(
    "/abs/sites/example.com/shots"
  );
});

test("shotDirFor: ポート付き URL はポートをフォルダ名に含める", () => {
  expect(shotDirFor("http://localhost:3789/construction", "/abs/sites")).toBe(
    "/abs/sites/localhost_3789/shots"
  );
  expect(shotDirFor("http://localhost:8080/", "/abs/sites")).toBe(
    "/abs/sites/localhost_8080/shots"
  );
});

// --- shotFileFor: バリアントがファイル名で衝突しない ---

test("shotFileFor: デフォルトはビューポートサイズをバリアントにする", () => {
  expect(shotFileFor("https://example.com/about", {})).toBe("about--1440x900.png");
});

test("shotFileFor: --vp 指定はそのサイズ", () => {
  expect(shotFileFor("https://example.com/about", { vp: { width: 800, height: 600 } })).toBe(
    "about--800x600.png"
  );
});

test("shotFileFor: --device はデバイス名スラグ", () => {
  expect(shotFileFor("https://example.com/about", { device: "iPhone 13" })).toBe(
    "about--iphone_13.png"
  );
});

test("shotFileFor: --selector / --full はサフィックスが付く", () => {
  expect(shotFileFor("https://example.com/about", { selector: "footer" })).toBe(
    "about--1440x900--sel-footer.png"
  );
  expect(shotFileFor("https://example.com/about", { full: true })).toBe(
    "about--1440x900--full.png"
  );
  expect(
    shotFileFor("https://example.com/", { selector: ".hero > h1", vp: { width: 800, height: 600 } })
  ).toBe("index--800x600--sel-_hero_h1.png");
});
