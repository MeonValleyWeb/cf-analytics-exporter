import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectRobotsTxt, isValidZoneHostname } from '../src/lib/server/robots-inspector.js';

test('isValidZoneHostname accepts public zones and rejects unsafe hosts', () => {
  assert.equal(isValidZoneHostname('example.com'), true);
  assert.equal(isValidZoneHostname('sub-domain.example.co.uk'), true);
  assert.equal(isValidZoneHostname('localhost'), false);
  assert.equal(isValidZoneHostname('127.0.0.1'), false);
  assert.equal(isValidZoneHostname('example.com/path'), false);
});

test('inspectRobotsTxt returns a bounded public robots response', async () => {
  const result = await inspectRobotsTxt('example.com', {
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'manual');
      assert.match(options.headers['User-Agent'], /Crawler-Guard/);
      return new Response('User-agent: *\nAllow: /', {
        headers: { 'Content-Type': 'text/plain' }
      });
    },
    now: () => new Date('2026-09-08T12:00:00Z')
  });

  assert.equal(result.status, 'available');
  assert.equal(result.body, 'User-agent: *\nAllow: /');
  assert.equal(result.fetchedAt, '2026-09-08T12:00:00.000Z');
});

test('inspectRobotsTxt does not follow redirects', async () => {
  const result = await inspectRobotsTxt('example.com', {
    fetchImpl: async () =>
      new Response(null, {
        status: 302,
        headers: { Location: 'https://www.example.com/robots.txt' }
      })
  });

  assert.equal(result.status, 'redirected');
  assert.equal(result.location, 'https://www.example.com/robots.txt');
});

test('inspectRobotsTxt rejects declared oversized responses', async () => {
  const result = await inspectRobotsTxt('example.com', {
    maxBytes: 10,
    fetchImpl: async () =>
      new Response('User-agent: *', {
        headers: { 'Content-Length': '100' }
      })
  });

  assert.equal(result.status, 'too_large');
  assert.equal(result.body, null);
});
