export const CORNERFILL_IMAGE_CACHE_SCHEMA = "cornerfill-image-cache@2";

function waitForImage(image) {
  if (typeof image.decode === "function") {
    return image.decode().catch((error) => {
      if (image.complete && image.naturalWidth > 0) return;
      throw error;
    });
  }
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error(`image failed to load: ${image.src}`)), { once: true });
  });
}

export class ImageCache {
  constructor(document, {
    onDecode = null,
    onHit = null,
    onEvict = null,
    maxZeroReferenceEntries = 32,
    maxEstimatedPixels = 67_108_864,
  } = {}) {
    if (!document?.defaultView?.Image) throw new TypeError("ImageCache requires a browser document");
    if (!Number.isSafeInteger(maxZeroReferenceEntries) || maxZeroReferenceEntries < 0) {
      throw new TypeError("maxZeroReferenceEntries must be a non-negative integer");
    }
    if (!Number.isFinite(maxEstimatedPixels) || maxEstimatedPixels < 0) {
      throw new TypeError("maxEstimatedPixels must be finite and non-negative");
    }
    this.document = document;
    this.records = new Map();
    this.onDecode = onDecode;
    this.onHit = onHit;
    this.onEvict = onEvict;
    this.maxZeroReferenceEntries = maxZeroReferenceEntries;
    this.maxEstimatedPixels = maxEstimatedPixels;
    this.evictions = 0;
    this.destroyed = false;
  }

  _touch(record) {
    if (this.records.get(record.key) !== record) return;
    this.records.delete(record.key);
    this.records.set(record.key, record);
  }

  _estimatedPixels(record) {
    return record.state === "ready"
      ? Math.max(0, record.image.naturalWidth * record.image.naturalHeight)
      : 0;
  }

  _evict() {
    if (this.destroyed) return;
    const records = [...this.records.values()];
    let zeroReferenceEntries = records.filter(({ refs, state }) => refs === 0 && state === "ready").length;
    let estimatedPixels = records.reduce((total, record) => total + this._estimatedPixels(record), 0);
    for (const record of records) {
      if (zeroReferenceEntries <= this.maxZeroReferenceEntries
        && estimatedPixels <= this.maxEstimatedPixels) break;
      if (record.refs !== 0 || record.state !== "ready" || this.records.get(record.key) !== record) continue;
      const pixels = this._estimatedPixels(record);
      this.records.delete(record.key);
      record.image.src = "";
      zeroReferenceEntries -= 1;
      estimatedPixels -= pixels;
      this.evictions += 1;
      this.onEvict?.(record);
    }
  }

  acquire(url, { crossOrigin = null } = {}) {
    if (this.destroyed) throw new Error("image cache is destroyed");
    const absoluteUrl = new URL(url, this.document.baseURI).href;
    const key = `${crossOrigin ?? "same-origin-default"}\n${absoluteUrl}`;
    let record = this.records.get(key);
    if (!record) {
      const image = new this.document.defaultView.Image();
      image.decoding = "async";
      if (crossOrigin !== null) image.crossOrigin = crossOrigin;
      record = {
        key,
        absoluteUrl,
        image,
        refs: 0,
        state: "loading",
        error: null,
        promise: null,
      };
      record.promise = (async () => {
        image.src = absoluteUrl;
        await waitForImage(image);
        if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
          throw new Error(`decoded image has no intrinsic dimensions: ${absoluteUrl}`);
        }
        record.state = "ready";
        this.onDecode?.(record);
        this._evict();
        return image;
      })().catch((error) => {
        record.state = "error";
        record.error = error;
        this.records.delete(key);
        throw error;
      });
      this.records.set(key, record);
    } else {
      this._touch(record);
      this.onHit?.(record);
    }
    record.refs += 1;
    let released = false;
    return Object.freeze({
      key,
      url: absoluteUrl,
      promise: record.promise,
      release: () => {
        if (released) return;
        released = true;
        record.refs = Math.max(0, record.refs - 1);
        this._touch(record);
        this._evict();
      },
    });
  }

  stats() {
    const records = [...this.records.values()];
    return Object.freeze({
      schema: CORNERFILL_IMAGE_CACHE_SCHEMA,
      entries: records.length,
      loading: records.filter(({ state }) => state === "loading").length,
      ready: records.filter(({ state }) => state === "ready").length,
      errors: records.filter(({ state }) => state === "error").length,
      references: records.reduce((total, { refs }) => total + refs, 0),
      zeroReferenceEntries: records.filter(({ refs }) => refs === 0).length,
      estimatedPixels: records.reduce((total, record) => total + this._estimatedPixels(record), 0),
      evictions: this.evictions,
      limits: Object.freeze({
        zeroReferenceEntries: this.maxZeroReferenceEntries,
        estimatedPixels: this.maxEstimatedPixels,
      }),
    });
  }

  destroy() {
    if (this.destroyed) return;
    for (const record of this.records.values()) {
      if (record.refs === 0) record.image.src = "";
    }
    this.records.clear();
    this.destroyed = true;
  }
}
