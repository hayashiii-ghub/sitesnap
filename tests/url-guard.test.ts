import { expect, test } from "bun:test"
import { assertPublicUrl, assertPublicUrlResolved, isPrivateHost } from "../src/url-guard.ts"

test("private/special IPv4 ranges are blocked", () => {
  for (const address of [
    "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
    "172.16.0.1", "192.168.0.1", "192.0.2.1", "198.18.0.1", "198.51.100.1",
    "203.0.113.1", "224.0.0.1", "255.255.255.255",
  ]) expect(isPrivateHost(address)).toBeTrue()
  expect(isPrivateHost("8.8.8.8")).toBeFalse()
})

test("private/special IPv6 and mapped addresses are blocked", () => {
  for (const address of ["::", "::1", "fe80::1", "fec0::1", "fc00::1", "fd12::1", "ff02::1", "2001:db8::1", "::ffff:7f00:1", "::ffff:127.0.0.1"]) {
    expect(isPrivateHost(address)).toBeTrue()
  }
  expect(isPrivateHost("::ffff:0808:0808")).toBeFalse()
})

test("URL guard rejects non-http, private literals, and dot hosts", () => {
  for (const url of ["file:///etc/passwd", "ftp://example.com", "http://127.0.0.1", "http://[::1]/", "http://%2e%2e/"]) {
    expect(() => assertPublicUrl(url)).toThrow()
  }
  expect(() => assertPublicUrl("https://example.com/")).not.toThrow()
  expect(() => assertPublicUrl("http://127.0.0.1/", { allowPrivate: true })).not.toThrow()
})

test("resolved URL guard rejects any private DNS answer and fails closed", async () => {
  await expect(assertPublicUrlResolved("https://public.example/", {
    lookup: async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.2", family: 4 },
    ],
  })).rejects.toMatchObject({ code: "PRIVATE_URL_BLOCKED" })
  await expect(assertPublicUrlResolved("https://missing.example/", {
    lookup: async () => [],
  })).rejects.toMatchObject({ code: "URL_RESOLUTION_FAILED" })
})

test("allow-private bypasses both literal and DNS checks but never protocol checks", async () => {
  await expect(assertPublicUrlResolved("http://localhost/", { allowPrivate: true })).resolves.toBeUndefined()
  await expect(assertPublicUrlResolved("file:///tmp/page.html", { allowPrivate: true })).rejects.toMatchObject({ code: "INVALID_URL" })
})
