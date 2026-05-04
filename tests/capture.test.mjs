import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, domainOf } from '../src/capture.mjs';

test('slugify: simple path', () => {
  assert.equal(slugify('https://example.com/about'), 'about');
});

test('slugify: root path becomes index', () => {
  assert.equal(slugify('https://example.com/'), 'index');
});

test('slugify: removes consecutive dots to prevent path tricks', () => {
  assert.equal(slugify('https://example.com/..'), 'index');
  assert.equal(slugify('https://example.com/../foo'), 'foo');
});

test('slugify: strips leading and trailing punctuation', () => {
  assert.equal(slugify('https://example.com/.hidden'), 'hidden');
  assert.equal(slugify('https://example.com/foo.'), 'foo');
});

test('slugify: replaces unsafe characters with underscore', () => {
  assert.equal(slugify('https://example.com/a/b/path'), 'a_b_path');
});

test('slugify: caps length at 120 chars', () => {
  const long = 'a'.repeat(200);
  const result = slugify(`https://example.com/${long}`);
  assert.ok(result.length <= 120);
});

test('domainOf returns hostname', () => {
  assert.equal(domainOf('https://example.com/foo'), 'example.com');
});
