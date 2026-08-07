import { validateTimerDelay } from "./timing.mjs";

const CORNERFILL_IMAGE_CACHE_SCHEMA = "cornerfill-image-cache@3";
export const DEFAULT_MAX_DECODED_IMAGE_PIXELS = 4_096 ** 2;

type ImageCacheRecordState = "loading" | "ready" | "error";

export interface ImageCacheRecord {
  absoluteUrl: string;
  cancel: (reason?: unknown) => void;
  error: unknown;
  image: HTMLImageElement;
  key: string;
  promise: Promise<HTMLImageElement>;
  refs: number;
  state: ImageCacheRecordState;
}

export interface ImageCacheOptions {
  maxDecodedPixels?: number;
  maxZeroReferenceEntries?: number;
  onDecode?: ((record: ImageCacheRecord) => void) | null;
  onEvict?: ((record: ImageCacheRecord) => void) | null;
  onHit?: ((record: ImageCacheRecord) => void) | null;
  timeoutMs?: number;
}

export interface ImageLease {
  readonly key: string;
  readonly promise: Promise<HTMLImageElement>;
  readonly release: () => void;
  readonly url: string;
}

function clearImageSource(image: HTMLImageElement): void {
  image.src = "";
}

function waitForImage(
  image: HTMLImageElement,
  view: Window & typeof globalThis,
  timeoutMs: number,
  absoluteUrl: string,
): Readonly<{ cancel: (reason?: unknown) => void; promise: Promise<void> }> {
  let cancel = (_reason?: unknown): void => {};
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer = 0;
    const cleanup = () => {
      view.clearTimeout(timer);
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
    };
    const finish = (error: unknown = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error !== null) reject(error);
      else resolve();
    };
    const loaded = () => finish();
    const failed = () => finish(new Error(`image failed to load: ${absoluteUrl}`));
    cancel = (reason = new Error(`image load was cancelled: ${absoluteUrl}`)) => {
      if (settled) return;
      finish(reason);
      clearImageSource(image);
    };
    timer = view.setTimeout(() => cancel(
      new Error(`image load timed out after ${timeoutMs}ms: ${absoluteUrl}`),
    ), timeoutMs);
    image.addEventListener("error", failed, { once: true });
    const decodeFailed = () => {
      if (settled) return;
      if (image.naturalWidth > 0) {
        finish();
        return;
      }
      image.addEventListener("load", loaded, { once: true });
      if (image.naturalWidth > 0) finish();
      else if (image.complete) failed();
    };
    if (typeof image.decode === "function") {
      try {
        image.decode().then(() => finish()).catch(decodeFailed);
      } catch {
        decodeFailed();
      }
    } else {
      image.addEventListener("load", loaded, { once: true });
      if (image.complete && image.naturalWidth > 0) finish();
      else if (image.complete) failed();
    }
  });
  return Object.freeze({ promise, cancel: (reason?: unknown) => cancel(reason) });
}

export class ImageCache {
  declare readonly document: Document;
  declare readonly records: Map<string, ImageCacheRecord>;
  private readonly zeroReferenceRecords: Map<string, ImageCacheRecord>;
  declare readonly onDecode: ((record: ImageCacheRecord) => void) | null;
  declare readonly onHit: ((record: ImageCacheRecord) => void) | null;
  declare readonly onEvict: ((record: ImageCacheRecord) => void) | null;
  declare readonly maxZeroReferenceEntries: number;
  declare readonly maxDecodedPixels: number;
  declare readonly timeoutMs: number;
  declare evictions: number;
  declare destroyed: boolean;
  private decodedPixels: number;

  constructor(document: Document, {
    onDecode = null,
    onHit = null,
    onEvict = null,
    maxZeroReferenceEntries = 32,
    maxDecodedPixels = DEFAULT_MAX_DECODED_IMAGE_PIXELS,
    timeoutMs = 10_000,
  }: ImageCacheOptions = {}) {
    if (!document?.defaultView?.Image) throw new TypeError("ImageCache requires a browser document");
    if (!Number.isSafeInteger(maxZeroReferenceEntries) || maxZeroReferenceEntries < 0) {
      throw new TypeError("maxZeroReferenceEntries must be a non-negative integer");
    }
    if (!Number.isSafeInteger(maxDecodedPixels) || maxDecodedPixels < 0) {
      throw new TypeError("maxDecodedPixels must be a non-negative safe integer");
    }
    validateTimerDelay(timeoutMs, "timeoutMs");
    this.document = document;
    this.records = new Map();
    this.zeroReferenceRecords = new Map();
    this.onDecode = onDecode;
    this.onHit = onHit;
    this.onEvict = onEvict;
    this.maxZeroReferenceEntries = maxZeroReferenceEntries;
    this.maxDecodedPixels = maxDecodedPixels;
    this.timeoutMs = timeoutMs;
    this.evictions = 0;
    this.destroyed = false;
    this.decodedPixels = 0;
  }

  private _decodedPixels(record: ImageCacheRecord): number {
    return record.state === "ready"
      ? Math.max(0, record.image.naturalWidth * record.image.naturalHeight)
      : 0;
  }

  private _evict(requiredPixels = 0): void {
    if (this.destroyed) return;
    while (this.zeroReferenceRecords.size > 0
      && (this.zeroReferenceRecords.size > this.maxZeroReferenceEntries
        || this.decodedPixels + requiredPixels > this.maxDecodedPixels)) {
      const record = this.zeroReferenceRecords.values().next().value;
      if (!record) break;
      this.zeroReferenceRecords.delete(record.key);
      if (record.refs !== 0 || this.records.get(record.key) !== record) continue;
      const pixels = this._decodedPixels(record);
      this.records.delete(record.key);
      if (record.state === "loading") {
        record.cancel(new Error(`image load was evicted before decode completed: ${record.absoluteUrl}`));
      } else {
        clearImageSource(record.image);
      }
      this.decodedPixels -= pixels;
      this.evictions += 1;
      this.onEvict?.(record);
    }
  }

  acquire(
    url: string | URL,
    { crossOrigin = null }: { crossOrigin?: string | null } = {},
  ): Readonly<ImageLease> {
    if (this.destroyed) throw new Error("image cache is destroyed");
    const absoluteUrl = new URL(url, this.document.baseURI).href;
    const key = `${crossOrigin ?? "same-origin-default"}\n${absoluteUrl}`;
    let record = this.records.get(key);
    if (!record) {
      const image = new this.document.defaultView!.Image();
      image.decoding = "async";
      if (crossOrigin !== null) image.crossOrigin = crossOrigin;
      let created!: ImageCacheRecord;
      image.src = absoluteUrl;
      const wait = waitForImage(
        image,
        this.document.defaultView as Window & typeof globalThis,
        this.timeoutMs,
        absoluteUrl,
      );
      const promise = (async () => {
        await wait.promise;
        if (this.records.get(key) !== created) {
          throw new Error(`image load was evicted before decode completed: ${absoluteUrl}`);
        }
        if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
          throw new Error(`decoded image has no intrinsic dimensions: ${absoluteUrl}`);
        }
        const decodedPixels = image.naturalWidth * image.naturalHeight;
        this._evict(decodedPixels);
        if (this.decodedPixels + decodedPixels > this.maxDecodedPixels) {
          throw new RangeError(
            `decoded image allocation ${this.decodedPixels + decodedPixels} exceeds `
            + `${this.maxDecodedPixels} cached pixels: ${absoluteUrl}`,
          );
        }
        created.state = "ready";
        this.decodedPixels += decodedPixels;
        this.onDecode?.(created);
        this._evict();
        return image;
      })().catch((error) => {
        if (created.state === "ready") {
          this.decodedPixels -= this._decodedPixels(created);
        }
        this.zeroReferenceRecords.delete(key);
        created.state = "error";
        created.error = error;
        if (this.records.get(key) === created) this.records.delete(key);
        clearImageSource(image);
        throw error;
      });
      created = {
        key,
        absoluteUrl,
        cancel: wait.cancel,
        image,
        refs: 0,
        state: "loading",
        error: null,
        promise,
      };
      this.records.set(key, created);
      record = created;
    } else {
      this.zeroReferenceRecords.delete(record.key);
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
        if (record.refs === 0 && record.state === "loading") {
          if (this.records.get(record.key) === record) this.records.delete(record.key);
          record.cancel(new Error(`image load was released before decode completed: ${record.absoluteUrl}`));
          return;
        }
        if (record.refs === 0 && this.records.get(record.key) === record) {
          this.zeroReferenceRecords.set(record.key, record);
          this._evict();
        }
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
      zeroReferenceEntries: this.zeroReferenceRecords.size,
      decodedPixels: this.decodedPixels,
      evictions: this.evictions,
      limits: Object.freeze({
        zeroReferenceEntries: this.maxZeroReferenceEntries,
        decodedPixels: this.maxDecodedPixels,
        timeoutMs: this.timeoutMs,
      }),
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    for (const record of this.records.values()) {
      if (record.state === "loading") {
        record.cancel(new Error(`image cache was destroyed before decode completed: ${record.absoluteUrl}`));
      } else {
        clearImageSource(record.image);
      }
    }
    this.records.clear();
    this.zeroReferenceRecords.clear();
    this.decodedPixels = 0;
    this.destroyed = true;
  }
}
