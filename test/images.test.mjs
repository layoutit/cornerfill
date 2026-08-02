import test from "node:test";
import assert from "node:assert/strict";
import { ImageCache } from "../dist/images.mjs";

class FakeImage {
  constructor() {
    this.naturalWidth = 10;
    this.naturalHeight = 10;
    this.complete = true;
    this.src = "";
  }

  decode() {
    return Promise.resolve();
  }
}

function document() {
  return {
    baseURI: "https://cornerfill.test/",
    defaultView: { Image: FakeImage },
  };
}

test("decoded image cache shares active atlas leases", async () => {
  const cache = new ImageCache(document());
  const first = cache.acquire("atlas.webp");
  const second = cache.acquire("atlas.webp");
  assert.equal(await first.promise, await second.promise);
  assert.equal(cache.stats().entries, 1);
  assert.equal(cache.stats().references, 2);
  first.release();
  second.release();
  assert.equal(cache.stats().references, 0);
  assert.equal(cache.stats().entries, 1);
});

test("decoded image cache evicts zero-reference records to its configured bound", async () => {
  const cache = new ImageCache(document(), { maxZeroReferenceEntries: 1 });
  const first = cache.acquire("first.webp");
  await first.promise;
  first.release();
  const second = cache.acquire("second.webp");
  await second.promise;
  second.release();
  const stats = cache.stats();
  assert.equal(stats.entries, 1);
  assert.equal(stats.zeroReferenceEntries, 1);
  assert.equal(stats.evictions, 1);
});

test("decoded image cache enforces its retained pixel budget", async () => {
  const cache = new ImageCache(document(), {
    maxZeroReferenceEntries: 10,
    maxEstimatedPixels: 0,
  });
  const lease = cache.acquire("large.webp");
  await lease.promise;
  lease.release();
  assert.equal(cache.stats().entries, 0);
  assert.equal(cache.stats().estimatedPixels, 0);
  assert.equal(cache.stats().evictions, 1);
});
