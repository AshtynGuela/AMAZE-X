import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import express from 'express';
import { staticAssets } from '../server/static-assets.mjs';
import { createJsonFetch } from '../src/json-fetch.mjs';

test('production assets negotiate compression, validate caches and preserve binary files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'amaze-loading-'));
  const app = express();
  const source = Buffer.from('export const answer = 42;\n'.repeat(200));
  await fs.mkdir(path.join(root, 'assets'));
  const script = path.join(root, 'assets/scene-abcdefgh.js');
  await Promise.all([
    fs.writeFile(script, source), fs.writeFile(script + '.br', brotliCompressSync(source)),
    fs.writeFile(script + '.gz', gzipSync(source)), fs.writeFile(path.join(root, 'index.html'), '<html>hello</html>'),
    fs.writeFile(path.join(root, 'orientation.bin'), Buffer.from([31, 139, 0, 255])),
  ]);
  app.use(staticAssets(root));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const encoding of ['br', 'gzip', 'identity', 'br;q=0, gzip;q=0, identity']) {
      const response = await fetch(url + '/assets/scene-abcdefgh.js', { headers: { 'Accept-Encoding': encoding } });
      assert.equal(await response.text(), source.toString());
      assert.match(response.headers.get('content-type'), /javascript/);
      assert.equal(response.headers.get('content-encoding'), ['br', 'gzip'].includes(encoding) ? encoding : null);
      assert.match(response.headers.get('cache-control'), /immutable/);
      assert.match(response.headers.get('vary'), /Accept-Encoding/);
      const unchanged = await fetch(url + '/assets/scene-abcdefgh.js', {
        headers: { 'Accept-Encoding': encoding, 'If-None-Match': response.headers.get('etag'), 'Cache-Control': 'max-age=0' },
      });
      assert.equal(unchanged.status, 304);
    }
    const html = await fetch(url + '/index.html');
    assert.equal(html.headers.get('cache-control'), 'no-cache');
    const binary = await fetch(url + '/orientation.bin');
    assert.equal(binary.headers.get('content-encoding'), null);
    assert.deepEqual(Buffer.from(await binary.arrayBuffer()), Buffer.from([31, 139, 0, 255]));
    assert.match(binary.headers.get('cache-control'), /max-age=3600/);
    const traversal = await fetch(url + '/%2e%2e%2fpackage.json');
    assert.equal(traversal.status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('identical GETs share only pending work; failures can retry and signals remain independent', async () => {
  let calls = 0, finish;
  const jsonFetch = createJsonFetch(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const a = jsonFetch('/packet'), b = jsonFetch('/packet');
  assert.equal(a, b);
  assert.equal(calls, 1);
  finish({ ok: true, json: async () => ({ value: 1 }) });
  assert.deepEqual(await a, { value: 1 });
  const failed = jsonFetch('/packet');
  assert.equal(calls, 2);
  finish({ ok: false, status: 502, json: async () => ({ error: 'upstream' }) });
  await assert.rejects(failed, /upstream/);
  const retry = jsonFetch('/packet');
  finish({ ok: true, json: async () => ({ value: 2 }) });
  await retry;
  const independent = createJsonFetch(async (_url, options) => {
    assert.ok(options.signal);
    calls++;
    return { ok: true, json: async () => ({}) };
  });
  const count = calls;
  await Promise.all([independent('/packet', { signal: new AbortController().signal }),
    independent('/packet', { signal: new AbortController().signal })]);
  assert.equal(calls, count + 2);
});
