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
