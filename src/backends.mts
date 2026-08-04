import { nextDocumentId } from "./identity.mjs";

const CORNERFILL_SURFACE_SCHEMA = "cornerfill-live-surface@2";

export type SurfaceBackend = "auto" | ConcreteSurfaceBackend;
export type ConcreteSurfaceBackend = "webkit-canvas" | "moz-element" | "static-data-url";
type SelectedSurfaceBackend = SurfaceBackend | "none";

export interface SurfaceCreateOptions {
  readonly allowStatic?: boolean;
  readonly backend?: SurfaceBackend;
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dpr?: number;
  readonly idPrefix?: string;
  readonly maxSurfacePixels?: number;
  readonly maxWebkitPoolEntries?: number;
  readonly maxWebkitPoolPrefixes?: number;
}

interface SurfaceSize {
  readonly backingHeight: number;
  readonly backingWidth: number;
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dpr: number;
}

export interface CornerfillSurface {
  readonly backend: ConcreteSurfaceBackend;
  readonly context: CanvasRenderingContext2D;
  readonly cssImage: string;
  readonly id: string;
  readonly schema: typeof CORNERFILL_SURFACE_SCHEMA;
  readonly size: Readonly<SurfaceSize>;
  commit(): void;
  /** Releases backend resources. Cleanup is best-effort and does not throw. */
  dispose(): void;
  resize(cssWidth: number, cssHeight: number, dpr: number): boolean;
}

export interface SurfaceResourceStats {
  readonly firefox: Readonly<{
    registrations: number;
    unregisterFailures: number;
  }>;
  readonly schema: "cornerfill-surface-resources@1";
  readonly webkit: Readonly<{
    activeCanvases: number;
    pooledCanvases: number;
    pooledPixels: number;
    prefixes: number;
    retainedCanvases: number;
    retainedPixels: number;
    shrinkFailures: number;
  }>;
}

export interface SurfaceCapabilities {
  readonly schema: "cornerfill-surface-capabilities@1";
  readonly webkitCanvas: boolean;
  readonly mozElement: boolean;
  readonly mozRegistration: boolean;
  readonly staticImage: boolean;
  readonly preferredBackend: "webkit-canvas" | "moz-element" | "none";
}

interface ResolvedSurfaceOptions {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dpr: number;
  readonly idPrefix: string;
  readonly maxSurfacePixels: number;
  readonly maxWebkitPoolEntries: number;
  readonly maxWebkitPoolPrefixes: number;
}

interface WebkitPoolEntry {
  readonly id: string;
  readonly pixels: number;
}

interface WebkitPoolState {
  activeCanvases: number;
  pooledCanvases: number;
  pooledPixels: number;
  shrinkFailures: number;
  readonly overflow: WebkitPoolEntry[];
  readonly pools: Map<string, WebkitPoolEntry[]>;
}

interface WebkitReleaseOptions {
  readonly maxPoolEntries: number;
  readonly maxPoolPrefixes: number;
  readonly pixels: number;
  readonly shrunk: boolean;
}

type SurfaceDocument = Document & {
  getCSSCanvasContext?: (
    contextId: "2d",
    name: string,
    width: number,
    height: number,
  ) => CanvasRenderingContext2D | null;
  mozSetImageElement?: (id: string, element: Element | null) => void;
};

const webkitSurfacePools = new WeakMap<Document, WebkitPoolState>();
const mozRegistrationCounts = new WeakMap<Document, number>();
const mozUnregisterFailureCounts = new WeakMap<Document, number>();

const DEFAULT_MAX_WEBKIT_POOL_ENTRIES = 256;
const DEFAULT_MAX_WEBKIT_POOL_PREFIXES = 16;

function nextSurfaceId(document: Document, prefix = "cornerfill"): string {
  return nextDocumentId(document, "surface", prefix);
}

function normalizedPrefix(prefix = "cornerfill"): string {
  return prefix.replace(/[^a-z0-9_-]/giu, "-");
}

function webkitPoolState(document: Document): WebkitPoolState {
  let state = webkitSurfacePools.get(document);
  if (!state) {
    state = {
      overflow: [],
      pools: new Map(),
      activeCanvases: 0,
      pooledCanvases: 0,
      pooledPixels: 0,
      shrinkFailures: 0,
    };
    webkitSurfacePools.set(document, state);
  }
  return state;
}

function acquireWebkitSurfaceId(document: Document, prefix: string): string {
  const key = normalizedPrefix(prefix);
  const state = webkitPoolState(document);
  const available = state.pools.get(key);
  let retained = available?.pop() ?? state.overflow.pop();
  if (!retained) {
    for (const [otherKey, otherPool] of state.pools) {
      retained = otherPool.pop();
      if (otherPool.length === 0) state.pools.delete(otherKey);
      if (retained) break;
    }
  }
  if (retained) {
    state.pooledCanvases -= 1;
    state.pooledPixels -= retained.pixels;
    if (available?.length === 0) state.pools.delete(key);
    state.activeCanvases += 1;
    return retained.id;
  }
  state.activeCanvases += 1;
  return nextSurfaceId(document, key);
}

function releaseWebkitSurfaceId(document: Document, prefix: string, id: string, {
  pixels,
  shrunk,
  maxPoolEntries,
  maxPoolPrefixes,
}: WebkitReleaseOptions): void {
  const key = normalizedPrefix(prefix);
  const state = webkitPoolState(document);
  state.activeCanvases = Math.max(0, state.activeCanvases - 1);
  if (!shrunk) state.shrinkFailures += 1;
  const retainedPixels = shrunk ? 1 : Math.max(1, pixels);
  let available = state.pools.get(key);
  const canCreatePool = Boolean(available) || state.pools.size < maxPoolPrefixes;
  if (canCreatePool && (available?.length ?? 0) < maxPoolEntries) {
    if (!available) {
      available = [];
      state.pools.set(key, available);
    }
    available.push({ id, pixels: retainedPixels });
    state.pooledCanvases += 1;
    state.pooledPixels += retainedPixels;
    return;
  }
  // WebKit cannot unregister named CSS canvases. Every released ID therefore
  // stays reusable, bounding retained browser resources at peak concurrency.
  state.overflow.push({ id, pixels: retainedPixels });
  state.pooledCanvases += 1;
  state.pooledPixels += retainedPixels;
}

function backingDimensions(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  maxSurfacePixels: number,
): Readonly<{ width: number; height: number }> {
  if (![cssWidth, cssHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new TypeError("surface CSS dimensions must be finite and positive");
  }
  if (!Number.isFinite(dpr) || dpr <= 0) throw new TypeError("surface DPR must be finite and positive");
  const width = Math.max(1, Math.ceil(cssWidth * dpr));
  const height = Math.max(1, Math.ceil(cssHeight * dpr));
  if (width * height > maxSurfacePixels) {
    throw new RangeError(`surface allocation ${width}x${height} exceeds ${maxSurfacePixels} pixels`);
  }
  return Object.freeze({ width, height });
}

export function detectSurfaceCapabilities(document: Document): Readonly<SurfaceCapabilities> {
  const webkitCanvas = typeof (document as SurfaceDocument)?.getCSSCanvasContext === "function";
  const mozRegistration = typeof (document as SurfaceDocument)?.mozSetImageElement === "function";
  // Syntax support cannot expose a Canvas by ID; registration is the actual backend capability.
  const mozElement = mozRegistration;
  return Object.freeze({
    schema: "cornerfill-surface-capabilities@1",
    webkitCanvas,
    mozElement,
    mozRegistration,
    staticImage: typeof document?.createElement === "function",
    preferredBackend: webkitCanvas ? "webkit-canvas" : mozElement ? "moz-element" : "none",
  });
}

export function getSurfaceResourceStats(document: Document): Readonly<SurfaceResourceStats> {
  const webkit = webkitSurfacePools.get(document);
  return Object.freeze({
    schema: "cornerfill-surface-resources@1",
    webkit: Object.freeze({
      activeCanvases: webkit?.activeCanvases ?? 0,
      pooledCanvases: webkit?.pooledCanvases ?? 0,
      pooledPixels: webkit?.pooledPixels ?? 0,
      retainedCanvases: webkit?.pooledCanvases ?? 0,
      retainedPixels: webkit?.pooledPixels ?? 0,
      prefixes: webkit?.pools.size ?? 0,
      shrinkFailures: webkit?.shrinkFailures ?? 0,
    }),
    firefox: Object.freeze({
      registrations: mozRegistrationCounts.get(document) ?? 0,
      unregisterFailures: mozUnregisterFailureCounts.get(document) ?? 0,
    }),
  });
}

function createWebkitSurface(
  document: SurfaceDocument,
  options: Readonly<ResolvedSurfaceOptions>,
): CornerfillSurface {
  const id = acquireWebkitSurfaceId(document, options.idPrefix);
  let context: CanvasRenderingContext2D | null = null;
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let backingWidth = 0;
  let backingHeight = 0;
  let disposed = false;
  const surface: CornerfillSurface = {
    schema: CORNERFILL_SURFACE_SCHEMA,
    backend: "webkit-canvas",
    id,
    get cssImage() { return `-webkit-canvas(${id})`; },
    get context() {
      if (!context || disposed) throw new Error("WebKit surface is unavailable");
      return context;
    },
    get size() {
      return Object.freeze({ cssWidth, cssHeight, dpr, backingWidth, backingHeight });
    },
    resize(nextWidth, nextHeight, nextDpr) {
      if (disposed) throw new Error("cannot resize a disposed WebKit surface");
      const backing = backingDimensions(nextWidth, nextHeight, nextDpr, options.maxSurfacePixels);
      if (backing.width === backingWidth && backing.height === backingHeight
        && nextWidth === cssWidth && nextHeight === cssHeight && nextDpr === dpr) return false;
      const nextContext = document.getCSSCanvasContext!("2d", id, backing.width, backing.height);
      if (!nextContext) throw new Error("document.getCSSCanvasContext() did not return a 2D context");
      if (nextContext.canvas
        && (nextContext.canvas.width !== backing.width || nextContext.canvas.height !== backing.height)) {
        throw new Error(
          `WebKit CSS canvas backing size mismatch: requested ${backing.width}x${backing.height}, `
          + `got ${nextContext.canvas.width}x${nextContext.canvas.height}`,
        );
      }
      context = nextContext;
      cssWidth = nextWidth;
      cssHeight = nextHeight;
      dpr = nextDpr;
      backingWidth = backing.width;
      backingHeight = backing.height;
      return true;
    },
    commit() {},
    dispose() {
      if (disposed) return;
      const previousPixels = Math.max(1, backingWidth * backingHeight);
      let shrunk = false;
      try {
        const releaseContext = document.getCSSCanvasContext!("2d", id, 1, 1);
        if (releaseContext) {
          releaseContext.save();
          try {
            releaseContext.setTransform(1, 0, 0, 1, 0, 0);
            releaseContext.clearRect(0, 0, 1, 1);
          } finally {
            releaseContext.restore();
          }
          shrunk = !releaseContext.canvas
            || (releaseContext.canvas.width === 1 && releaseContext.canvas.height === 1);
        }
      } catch {
        shrunk = false;
      }
      context = null;
      cssWidth = 1;
      cssHeight = 1;
      dpr = 1;
      backingWidth = 1;
      backingHeight = 1;
      disposed = true;
      releaseWebkitSurfaceId(document, options.idPrefix, id, {
        pixels: previousPixels,
        shrunk,
        maxPoolEntries: options.maxWebkitPoolEntries,
        maxPoolPrefixes: options.maxWebkitPoolPrefixes,
      });
    },
  };
  try {
    surface.resize(options.cssWidth, options.cssHeight, options.dpr);
  } catch (error) {
    surface.dispose();
    throw error;
  }
  return surface;
}

function createMozSurface(
  document: SurfaceDocument,
  options: Readonly<ResolvedSurfaceOptions>,
): CornerfillSurface {
  const id = nextSurfaceId(document, options.idPrefix);
  const canvas = document.createElement("canvas");
  canvas.id = id;
  canvas.setAttribute("aria-hidden", "true");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("could not create the Firefox live canvas context");
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let disposed = false;
  let registered = false;
  const surface: CornerfillSurface = {
    schema: CORNERFILL_SURFACE_SCHEMA,
    backend: "moz-element",
    id,
    get cssImage() { return `-moz-element(#${id})`; },
    get context() {
      if (disposed) throw new Error("Firefox surface is unavailable");
      return context;
    },
    get size() {
      return Object.freeze({
        cssWidth,
        cssHeight,
        dpr,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
      });
    },
    resize(nextWidth, nextHeight, nextDpr) {
      if (disposed) throw new Error("cannot resize a disposed Firefox surface");
      const backing = backingDimensions(nextWidth, nextHeight, nextDpr, options.maxSurfacePixels);
      if (canvas.width === backing.width && canvas.height === backing.height
        && nextWidth === cssWidth && nextHeight === cssHeight && nextDpr === dpr) return false;
      canvas.width = backing.width;
      canvas.height = backing.height;
      cssWidth = nextWidth;
      cssHeight = nextHeight;
      dpr = nextDpr;
      return true;
    },
    commit() {},
    dispose() {
      if (disposed) return;
      if (registered) {
        try {
          document.mozSetImageElement!(id, null);
          mozRegistrationCounts.set(document, Math.max(0, (mozRegistrationCounts.get(document) ?? 1) - 1));
        } catch {
          mozUnregisterFailureCounts.set(document, (mozUnregisterFailureCounts.get(document) ?? 0) + 1);
        }
      }
      registered = false;
      canvas.remove();
      canvas.width = 1;
      canvas.height = 1;
      disposed = true;
    },
  };
  try {
    surface.resize(options.cssWidth, options.cssHeight, options.dpr);
    document.mozSetImageElement!(id, canvas);
    registered = true;
    mozRegistrationCounts.set(document, (mozRegistrationCounts.get(document) ?? 0) + 1);
  } catch (error) {
    try { document.mozSetImageElement!(id, null); } catch {
      mozUnregisterFailureCounts.set(document, (mozUnregisterFailureCounts.get(document) ?? 0) + 1);
    }
    registered = false;
    canvas.remove();
    canvas.width = 1;
    canvas.height = 1;
    disposed = true;
    throw error;
  }
  return surface;
}

function createStaticSurface(
  document: Document,
  options: Readonly<ResolvedSurfaceOptions>,
): CornerfillSurface {
  const id = nextSurfaceId(document, options.idPrefix);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("could not create a static canvas context");
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let cssImage = "none";
  let disposed = false;
  const surface: CornerfillSurface = {
    schema: CORNERFILL_SURFACE_SCHEMA,
    backend: "static-data-url",
    id,
    get cssImage() { return cssImage; },
    get context() {
      if (disposed) throw new Error("static surface is unavailable");
      return context;
    },
    get size() {
      return Object.freeze({
        cssWidth,
        cssHeight,
        dpr,
        backingWidth: canvas.width,
        backingHeight: canvas.height,
      });
    },
    resize(nextWidth, nextHeight, nextDpr) {
      if (disposed) throw new Error("cannot resize a disposed static surface");
      const backing = backingDimensions(nextWidth, nextHeight, nextDpr, options.maxSurfacePixels);
      if (canvas.width === backing.width && canvas.height === backing.height
        && nextWidth === cssWidth && nextHeight === cssHeight && nextDpr === dpr) return false;
      canvas.width = backing.width;
      canvas.height = backing.height;
      cssWidth = nextWidth;
      cssHeight = nextHeight;
      dpr = nextDpr;
      return true;
    },
    commit() {
      if (disposed) throw new Error("cannot commit a disposed static surface");
      cssImage = `url(${JSON.stringify(canvas.toDataURL("image/png"))})`;
    },
    dispose() {
      if (disposed) return;
      canvas.width = 1;
      canvas.height = 1;
      cssImage = "none";
      disposed = true;
    },
  };
  surface.resize(options.cssWidth, options.cssHeight, options.dpr);
  return surface;
}

export function createSurface(document: Document, {
  cssWidth,
  cssHeight,
  dpr = document.defaultView?.devicePixelRatio ?? 1,
  allowStatic = false,
  backend = "auto",
  idPrefix = "cornerfill",
  maxSurfacePixels = 16_777_216,
  maxWebkitPoolEntries = DEFAULT_MAX_WEBKIT_POOL_ENTRIES,
  maxWebkitPoolPrefixes = DEFAULT_MAX_WEBKIT_POOL_PREFIXES,
}: Readonly<SurfaceCreateOptions>): CornerfillSurface {
  const capabilities = detectSurfaceCapabilities(document);
  let selected: SelectedSurfaceBackend = backend;
  if (selected === "auto") {
    selected = capabilities.webkitCanvas
      ? "webkit-canvas"
      : capabilities.mozElement
        ? "moz-element"
        : allowStatic
          ? "static-data-url"
          : "none";
  }
  if (selected === "webkit-canvas" && !capabilities.webkitCanvas) {
    throw new Error("WebKit live CSS canvas is unavailable");
  }
  if (selected === "moz-element" && !capabilities.mozElement) {
    throw new Error("Firefox -moz-element() is unavailable");
  }
  if (selected === "static-data-url" && !allowStatic) {
    throw new Error("static fallback is disabled");
  }
  if (selected === "none") {
    throw new Error("no live Cornerfill surface backend is available and static fallback is disabled");
  }
  backingDimensions(cssWidth, cssHeight, dpr, maxSurfacePixels);
  if (!Number.isSafeInteger(maxWebkitPoolEntries) || maxWebkitPoolEntries < 0) {
    throw new TypeError("maxWebkitPoolEntries must be a non-negative integer");
  }
  if (!Number.isSafeInteger(maxWebkitPoolPrefixes) || maxWebkitPoolPrefixes < 0) {
    throw new TypeError("maxWebkitPoolPrefixes must be a non-negative integer");
  }
  const options: ResolvedSurfaceOptions = {
    cssWidth,
    cssHeight,
    dpr,
    idPrefix,
    maxSurfacePixels,
    maxWebkitPoolEntries,
    maxWebkitPoolPrefixes,
  };
  if (selected === "webkit-canvas") return createWebkitSurface(document, options);
  if (selected === "moz-element") return createMozSurface(document, options);
  if (selected === "static-data-url") return createStaticSurface(document, options);
  throw new TypeError(`unknown Cornerfill surface backend: ${selected}`);
}
