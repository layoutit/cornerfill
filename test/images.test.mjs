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

  addEventListener() {}
  removeEventListener() {}
}

function document() {
  return {
    baseURI: "https://cornerfill.test/",
    defaultView: { Image: FakeImage, clearTimeout, setTimeout },
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

test("image cache cancels a pending load when its last lease is released", async () => {
  class PendingImage extends FakeImage {
    decode() { return new Promise(() => {}); }
  }
  const cache = new ImageCache({
    baseURI: "https://cornerfill.test/",
    defaultView: { Image: PendingImage, clearTimeout, setTimeout },
  });
  const lease = cache.acquire("pending.webp");
  const rejected = assert.rejects(lease.promise, /released before decode completed/u);
  lease.release();
  const replacement = cache.acquire("pending.webp");
  assert.notEqual(replacement.promise, lease.promise);
  const replacementRejected = assert.rejects(replacement.promise, /released before decode completed/u);
  replacement.release();
  await Promise.all([rejected, replacementRejected]);
  assert.equal(cache.stats().entries, 0);
  assert.equal(cache.stats().loading, 0);
});

test("image cache times out and aborts an active pending load", async () => {
  class PendingImage extends FakeImage {
    decode() { return new Promise(() => {}); }
  }
  const cache = new ImageCache({
    baseURI: "https://cornerfill.test/",
    defaultView: { Image: PendingImage, clearTimeout, setTimeout },
  }, { timeoutMs: 5 });
  const lease = cache.acquire("hanging.webp");
  await assert.rejects(lease.promise, /timed out after 5ms/u);
  assert.equal(cache.stats().entries, 0);
  assert.equal(cache.stats().loading, 0);
});

test("image cache waits for load when decode rejects before loading completes", async () => {
  class DecodeFallbackImage extends FakeImage {
    static current;

    constructor() {
      super();
      this.complete = false;
      this.listeners = new Map();
      DecodeFallbackImage.current = this;
    }

    decode() { return Promise.reject(new DOMException("Loading was canceled.", "EncodingError")); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    removeEventListener(type) { this.listeners.delete(type); }
    emit(type) { this.listeners.get(type)?.(); }
  }
  const cache = new ImageCache({
    baseURI: "https://cornerfill.test/",
    defaultView: { Image: DecodeFallbackImage, clearTimeout, setTimeout },
  });
  const lease = cache.acquire("eventually-loaded.webp");
  await Promise.resolve();
  await Promise.resolve();
  DecodeFallbackImage.current.complete = true;
  DecodeFallbackImage.current.emit("load");
  assert.equal(await lease.promise, DecodeFallbackImage.current);
  lease.release();
});
