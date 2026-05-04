import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl, isPrivateHost } from '../src/url-guard.mjs';

test('isPrivateHost: loopback names', () => {
  assert.equal(isPrivateHost('localhost'), true);
  assert.equal(isPrivateHost('::1'), true);
});

test('isPrivateHost: IPv4 private/loopback ranges', () => {
  assert.equal(isPrivateHost('127.0.0.1'), true);
  assert.equal(isPrivateHost('10.0.0.5'), true);
  assert.equal(isPrivateHost('192.168.1.1'), true);
  assert.equal(isPrivateHost('169.254.169.254'), true);
  assert.equal(isPrivateHost('172.16.0.1'), true);
  assert.equal(isPrivateHost('172.31.255.255'), true);
});

test('isPrivateHost: IPv4 ranges that are NOT private', () => {
  assert.equal(isPrivateHost('8.8.8.8'), false);
  assert.equal(isPrivateHost('172.15.0.1'), false);
  assert.equal(isPrivateHost('172.32.0.1'), false);
  assert.equal(isPrivateHost('example.com'), false);
});

test('assertPublicUrl: rejects non-http(s) protocols', () => {
  assert.throws(() => assertPublicUrl('file:///etc/passwd'), /protocol/i);
  assert.throws(() => assertPublicUrl('ftp://example.com/'), /protocol/i);
  assert.throws(() => assertPublicUrl('data:text/plain,hello'), /protocol/i);
});

test('assertPublicUrl: rejects private hosts by default', () => {
  assert.throws(() => assertPublicUrl('http://localhost/'), /private|loopback/i);
  assert.throws(() => assertPublicUrl('http://169.254.169.254/latest/meta-data/'), /private|loopback/i);
});

test('assertPublicUrl: allows public URLs', () => {
  assert.doesNotThrow(() => assertPublicUrl('https://example.com/'));
  assert.doesNotThrow(() => assertPublicUrl('http://example.com/foo'));
});

test('assertPublicUrl: allowPrivate=true bypasses host check but keeps protocol check', () => {
  assert.doesNotThrow(() => assertPublicUrl('http://localhost:3000/', { allowPrivate: true }));
  assert.throws(() => assertPublicUrl('file:///etc/passwd', { allowPrivate: true }), /protocol/i);
});

test('isPrivateHost: bracketed IPv6 (URL.hostname returns brackets)', () => {
  assert.equal(isPrivateHost('[::1]'), true);
});

test('isPrivateHost: IPv6 link-local fe80::/10', () => {
  assert.equal(isPrivateHost('fe80::1'), true);
  assert.equal(isPrivateHost('feb0::abcd'), true);
});

test('isPrivateHost: IPv6 unique-local fc00::/7', () => {
  assert.equal(isPrivateHost('fc00::1'), true);
  assert.equal(isPrivateHost('fd12:3456:789a::1'), true);
});

test('isPrivateHost: IPv4-mapped IPv6 unwraps to private IPv4', () => {
  // ::ffff:7f00:1 == 127.0.0.1
  assert.equal(isPrivateHost('::ffff:7f00:1'), true);
  // ::ffff:c0a8:101 == 192.168.1.1
  assert.equal(isPrivateHost('::ffff:c0a8:101'), true);
  // ::ffff:0808:0808 == 8.8.8.8 (public)
  assert.equal(isPrivateHost('::ffff:0808:0808'), false);
});

test('assertPublicUrl: rejects bracketed IPv6 loopback URL', () => {
  assert.throws(() => assertPublicUrl('http://[::1]/'), /private|loopback/i);
  assert.throws(() => assertPublicUrl('http://[fe80::1]/'), /private|loopback/i);
});
