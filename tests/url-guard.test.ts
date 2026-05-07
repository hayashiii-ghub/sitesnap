import { test, expect } from "bun:test";
import { assertPublicUrl, isPrivateHost } from "../src/url-guard.ts";

test("isPrivateHost: loopback names", () => {
  expect(isPrivateHost("localhost")).toBe(true);
  expect(isPrivateHost("::1")).toBe(true);
});

test("isPrivateHost: IPv4 private/loopback ranges", () => {
  expect(isPrivateHost("127.0.0.1")).toBe(true);
  expect(isPrivateHost("10.0.0.5")).toBe(true);
  expect(isPrivateHost("192.168.1.1")).toBe(true);
  expect(isPrivateHost("169.254.169.254")).toBe(true);
  expect(isPrivateHost("172.16.0.1")).toBe(true);
  expect(isPrivateHost("172.31.255.255")).toBe(true);
});

test("isPrivateHost: IPv4 ranges that are NOT private", () => {
  expect(isPrivateHost("8.8.8.8")).toBe(false);
  expect(isPrivateHost("172.15.0.1")).toBe(false);
  expect(isPrivateHost("172.32.0.1")).toBe(false);
  expect(isPrivateHost("example.com")).toBe(false);
});

test("assertPublicUrl: rejects non-http(s) protocols", () => {
  expect(() => assertPublicUrl("file:///etc/passwd")).toThrow(/プロトコル/);
  expect(() => assertPublicUrl("ftp://example.com/")).toThrow(/プロトコル/);
  expect(() => assertPublicUrl("data:text/plain,hello")).toThrow(/プロトコル/);
});

test("assertPublicUrl: rejects private hosts by default", () => {
  expect(() => assertPublicUrl("http://localhost/")).toThrow(/プライベート|ループバック/);
  expect(() => assertPublicUrl("http://169.254.169.254/latest/meta-data/")).toThrow(
    /プライベート|ループバック/
  );
});

test("assertPublicUrl: allows public URLs", () => {
  expect(() => assertPublicUrl("https://example.com/")).not.toThrow();
  expect(() => assertPublicUrl("http://example.com/foo")).not.toThrow();
});

test("assertPublicUrl: allowPrivate=true bypasses host check but keeps protocol check", () => {
  expect(() => assertPublicUrl("http://localhost:3000/", { allowPrivate: true })).not.toThrow();
  expect(() => assertPublicUrl("file:///etc/passwd", { allowPrivate: true })).toThrow(
    /プロトコル/
  );
});

test("isPrivateHost: bracketed IPv6 (URL.hostname returns brackets)", () => {
  expect(isPrivateHost("[::1]")).toBe(true);
});

test("isPrivateHost: IPv6 link-local fe80::/10", () => {
  expect(isPrivateHost("fe80::1")).toBe(true);
  expect(isPrivateHost("feb0::abcd")).toBe(true);
});

test("isPrivateHost: IPv6 unique-local fc00::/7", () => {
  expect(isPrivateHost("fc00::1")).toBe(true);
  expect(isPrivateHost("fd12:3456:789a::1")).toBe(true);
});

test("isPrivateHost: IPv4-mapped IPv6 unwraps to private IPv4", () => {
  // ::ffff:7f00:1 == 127.0.0.1
  expect(isPrivateHost("::ffff:7f00:1")).toBe(true);
  // ::ffff:c0a8:101 == 192.168.1.1
  expect(isPrivateHost("::ffff:c0a8:101")).toBe(true);
  // ::ffff:0808:0808 == 8.8.8.8 (public)
  expect(isPrivateHost("::ffff:0808:0808")).toBe(false);
});

test("assertPublicUrl: rejects bracketed IPv6 loopback URL", () => {
  expect(() => assertPublicUrl("http://[::1]/")).toThrow(/プライベート|ループバック/);
  expect(() => assertPublicUrl("http://[fe80::1]/")).toThrow(/プライベート|ループバック/);
});
