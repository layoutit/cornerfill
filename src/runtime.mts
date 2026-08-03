import {
  captureComputedPaint,
  normalizePaintDescriptor,
  normalizeSideValues,
  paintDescriptorKey,
  resolvePaintForBox,
} from "./background.mjs";
import type {
  BackgroundBoxMetrics,
  BackgroundBoxMetricsInput,
  BackgroundPositionSpec,
  CornerfillRasterSource,
  NormalizedBackgroundLayer,
  NormalizedImageLayer,
  NormalizedPaintDescriptor,
  PaintDescriptorInput,
  PixelPair,
  ResolvedPaintDescriptor,
} from "./background.mjs";
import {
  createSurface,
  detectSurfaceCapabilities,
  getSurfaceResourceStats,
} from "./backends.mjs";
import type {
  ConcreteSurfaceBackend,
  CornerfillSurface,
  SurfaceBackend,
  SurfaceResourceStats,
} from "./backends.mjs";
import {
  buildCornerGeometry,
} from "./geometry.mjs";
import type { CornerGeometry } from "./geometry.mjs";
import { ImageCache } from "./images.mjs";
import type { ImageLease } from "./images.mjs";
import { qualifyNativeCornerShape } from "./native.mjs";
import type { CornerfillNativeQualification } from "./native.mjs";
import {
  AUTHOR_IMPORTANT_OWNERSHIP_REASON,
  LIVE_IMAGE_PROPERTY,
  OWNED_BORDER_ATTRIBUTE,
  OWNED_OUTLINE_ATTRIBUTE,
  OWNED_SHADOW_ATTRIBUTE,
  OWNED_SURFACE_ATTRIBUTE,
  OWNERSHIP_ATTRIBUTE,
  OwnershipManager,
  assertCooperativeOwnership,
  captureOwnershipState,
  restoreOwnershipState,
} from "./ownership.mjs";
import type {
  CornerfillElement,
  OwnershipRoot,
  OwnershipSnapshot,
} from "./ownership.mjs";
export type { CornerfillElement } from "./ownership.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./qualification.mjs";
import {
  ALL_CARRIERS,
  CARRIER,
  NATIVE_OWNED_PROPERTIES,
  NATIVE_RADIUS_PROPERTIES,
  NATIVE_SHAPE_PROPERTIES,
  PAINT_CARRIERS,
  LOGICAL_RADIUS_LONGHANDS,
  LOGICAL_SHAPE_LONGHANDS,
  PHYSICAL_SHAPE_LONGHANDS,
  RADIUS_LONGHANDS,
  captureRadiusCarriers,
  captureShapeCarriers,
  canRefreshDynamicPaint,
  captureBackgroundPosition,
  flowFromComputed,
  isRadiusTuple,
  nativeRadiusDeclarations,
  nativeShapeDeclarations,
  physicalShapeValues,
  readBorderColorCarriers,
  readCarrier,
  readColorCarrier,
  readPaintCarriers,
  readShadowCarrier,
  restoreNativeDeclarationGroup,
  writeNativeDeclarations,
} from "./style.mjs";
import type {
  NativeDeclarationRecord,
  PhysicalRadiusValues,
  RadiusSource,
} from "./style.mjs";
export type { RadiusSource } from "./style.mjs";
import {
  createPreparedOpaqueImageProgram,
  drawPreparedOpaqueImage,
  explainPreparedOpaqueImage,
  isPreparedOpaqueImageEligible,
  paintCornerfill,
  preparePreparedOpaqueImageContext,
  repaintOpaqueCornerfill,
  validateCornerfillTopology,
  validatePreparedOpaqueImagePosition,
} from "./paint.mjs";
import type {
  ContainedOutlinePaintState,
  CornerfillPaintExplanation,
  InsetShadowPaintState,
  OwnedBorderPaintState,
  PreparedOpaqueImageProgram,
} from "./paint.mjs";
import {
  interpolateCornerShape as interpolateCornerShapeValues,
  resolveBorderRadius,
  resolveBorderRadiusDeclarations,
  resolveCornerRadiusLonghands,
  resolveCornerShape,
  splitTopLevelCommas,
  splitTopLevelWhitespace,
} from "./values.mjs";
import { cssDeclarationSignature } from "./css-syntax.mjs";
import type {
  BorderRadiusDeclarations,
  CornerShapeSource,
  CornerWritingOptions,
  Four,
  ResolvedCornerRadius,
} from "./values.mjs";

type RuntimeWindow = Window & typeof globalThis;
type UnknownRecord = Record<string, unknown>;
type Radius = Readonly<ResolvedCornerRadius>;
export type PaintSource = PaintDescriptorInput;
type CornerfillSideValues<T> = T | Four<T> | Readonly<{
  bottom: T;
  left: T;
  right: T;
  top: T;
}>;

export interface CornerfillBorderDescriptor {
  readonly color?: string | undefined;
  readonly style?: "none" | "solid" | undefined;
  readonly width?: CornerfillSideValues<number> | undefined;
}

export interface CornerfillInsetShadowDescriptor {
  readonly color: string;
  readonly spread: number;
}

export interface CornerfillOutlineDescriptor {
  readonly color: string;
  readonly offset?: number | string | undefined;
  readonly style?: "none" | "solid" | undefined;
  readonly width: number | string;
}

export interface CornerfillInstallOptions {
  readonly backend?: SurfaceBackend | undefined;
  readonly document?: Document | undefined;
  readonly forceFallback?: boolean | undefined;
  readonly idPrefix?: string | undefined;
  readonly imageTimeoutMs?: number | undefined;
  readonly maxActiveEntries?: number | undefined;
  readonly maxGeometryCacheEntries?: number | undefined;
  readonly maxImageCacheEntries?: number | undefined;
  readonly maxImageCachePixels?: number | undefined;
  readonly maxSurfacePixels?: number | undefined;
  readonly maxTotalSurfacePixels?: number | undefined;
  readonly maxWebkitPoolEntries?: number | undefined;
  readonly maxWebkitPoolPrefixes?: number | undefined;
  readonly nativeQualification?: Readonly<CornerfillNativeQualification> | undefined;
  readonly nonce?: string | null | undefined;
  readonly observe?: boolean | undefined;
  readonly staticFallback?: boolean | undefined;
}

export interface ResolvedCornerfillOptions {
  readonly backend: SurfaceBackend;
  readonly forceFallback: boolean;
  readonly idPrefix: string;
  readonly imageTimeoutMs: number;
  readonly maxActiveEntries: number;
  readonly maxGeometryCacheEntries: number;
  readonly maxImageCacheEntries: number;
  readonly maxImageCachePixels: number;
  readonly maxSurfacePixels: number;
  readonly maxTotalSurfacePixels: number;
  readonly maxWebkitPoolEntries: number;
  readonly maxWebkitPoolPrefixes: number;
  readonly nonce: string | null;
  readonly observe: boolean;
  readonly staticFallback: boolean;
}

export interface CornerfillAttachConfig {
  readonly border?: Readonly<CornerfillBorderDescriptor> | null | undefined;
  readonly borderRadius?: RadiusSource | undefined;
  readonly cornerShape?: CornerShapeSource | undefined;
  readonly observeBackgroundPosition?: boolean | undefined;
  readonly outline?: Readonly<CornerfillOutlineDescriptor> | null | undefined;
  readonly paint?: PaintSource | undefined;
  readonly rasterIsOpaque?: boolean | undefined;
  readonly shadow?: string | Readonly<CornerfillInsetShadowDescriptor> | null | undefined;
  /** Renderer culling hint. This does not change the element's DOM visibility. */
  readonly paintActive?: boolean | undefined;
}

type CornerfillPreparedBaseConfig = Omit<
  CornerfillAttachConfig,
  "observeBackgroundPosition" | "paint" | "rasterIsOpaque"
> & Readonly<{
  readonly deferInactiveSurface?: boolean | undefined;
  readonly dpr?: number | undefined;
  readonly paint: PaintSource;
  readonly size: PixelPair;
}>;

export type CornerfillPreparedConfig = CornerfillPreparedBaseConfig & (
  | Readonly<{
    readonly geometry: CornerGeometry;
    readonly borderRadius?: RadiusSource | undefined;
    readonly cornerShape?: CornerShapeSource | undefined;
  }>
  | Readonly<{
    readonly geometry?: undefined;
    readonly borderRadius: RadiusSource;
    readonly cornerShape: CornerShapeSource;
  }>
);

export type CornerfillPreparedResizeConfig = Readonly<{
  readonly border?: Readonly<CornerfillBorderDescriptor> | null | undefined;
  readonly borderRadius?: RadiusSource | undefined;
  readonly cornerShape?: CornerShapeSource | undefined;
  readonly dpr?: number | undefined;
  readonly geometry?: CornerGeometry | undefined;
  readonly outline?: Readonly<CornerfillOutlineDescriptor> | null | undefined;
  readonly paint?: PaintSource | undefined;
  readonly shadow?: string | Readonly<CornerfillInsetShadowDescriptor> | null | undefined;
  readonly size?: PixelPair | undefined;
}>;

export interface CornerfillPreparedUpdate {
  readonly backgroundPosition?: PixelPair | undefined;
  readonly element: CornerfillElement;
  readonly paintActive?: boolean | undefined;
}

export type CornerfillHandleUpdate = Omit<
  CornerfillAttachConfig,
  "observeBackgroundPosition" | "rasterIsOpaque"
> & Readonly<{
  readonly backgroundPosition?: PixelPair | undefined;
}>;

const NATIVE_UPDATE_KEYS = new Set(["borderRadius", "cornerShape"]);
const PREPARED_UPDATE_KEYS = new Set(["backgroundPosition", "paintActive"]);
const DYNAMIC_UPDATE_KEYS = new Set([
  "border",
  "borderRadius",
  "cornerShape",
  "outline",
  "paint",
  "shadow",
  "paintActive",
]);

function assertSupportedUpdateKeys(
  update: Readonly<Record<string, unknown>>,
  supported: ReadonlySet<string>,
  mode: string,
): void {
  const unsupported = Object.keys(update).filter((key) => !supported.has(key));
  if (unsupported.length > 0) {
    throw new TypeError(`${unsupported.join(", ")} update${unsupported.length === 1 ? " is" : "s are"} unavailable on a ${mode} handle`);
  }
}

export interface HostComposition {
  readonly filter: "browser-compositor";
  readonly fragmentCount: number;
  readonly opacity: "browser-compositor";
  readonly originalElement: true;
  readonly pseudoElements: "browser-owned-without-shaped-overflow-clip";
  readonly stacking: "browser";
  readonly transform: "browser-compositor";
}

interface EntryCounters {
  paints: number;
  styleChecks: number;
}

interface ControllerCounters extends EntryCounters {
  attachments: number;
  cancelledInitializations: number;
  deferredSurfaceEntries: number;
  detachments: number;
  dynamicPaintUpdates: number;
  fallbackEntries: number;
  geometryBuilds: number;
  geometryCacheHits: number;
  ignoredStyleChanges: number;
  ignoredStyleMutations: number;
  imageCacheEvictions: number;
  imageCacheHits: number;
  imageDecodes: number;
  nativeEntries: number;
  opaqueFastPaints: number;
  ownershipRepairs: number;
  paintOnlyUpdates: number;
  preparedBatches: number;
  preparedEntries: number;
  preparedLayoutUpdates: number;
  preparedPaints: number;
  preparedUpdates: number;
  staleRefreshes: number;
  surfaceResizes: number;
  visibilityUpdates: number;
}

export type CornerfillEntryCounters = Readonly<EntryCounters>;
export type CornerfillControllerCounters = Readonly<ControllerCounters>;

interface EntryWaiter {
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: CornerfillEntryExplanation) => void;
  readonly revision: number;
}

interface EntryDynamicSources {
  readonly border: boolean;
  readonly outline: boolean;
  readonly paint: boolean;
  readonly paintPosition: boolean;
  readonly radius: boolean;
  readonly shadow: boolean;
  readonly shape: boolean;
}

interface InitialSources {
  readonly borderSource: Readonly<OwnedBorderPaintState> | null;
  readonly dynamic: Readonly<EntryDynamicSources>;
  readonly initialBackgroundPosition: string;
  readonly outlineSource: Readonly<ContainedOutlinePaintState> | null;
  readonly paintSource: NormalizedPaintDescriptor;
  readonly radiusCarrierBaseline: PhysicalRadiusValues | null;
  readonly radiusSource: RadiusSource;
  readonly rasterIsOpaque: boolean;
  readonly shadowSource: Readonly<InsetShadowPaintState> | null;
  readonly shapeCarrierBaseline: Readonly<{
    physical: Readonly<Record<string, string>>;
    shorthand: string;
  }>;
  readonly shapeSource: CornerShapeSource;
}

interface EntryState {
  border?: Readonly<OwnedBorderPaintState> | null | undefined;
  borderRadius?: RadiusSource | undefined;
  cornerShape?: CornerShapeSource | undefined;
  outline?: Readonly<ContainedOutlinePaintState> | null | undefined;
  paint?: NormalizedPaintDescriptor | undefined;
  shadow?: Readonly<InsetShadowPaintState> | null | undefined;
}

interface RuntimeEntry {
  backend: ConcreteSurfaceBackend | null;
  border: Readonly<OwnedBorderPaintState> | null;
  borderKey: string | null;
  boxMetrics: Readonly<BackgroundBoxMetrics> | null;
  committedRevision: number;
  composition: Readonly<HostComposition> | null;
  controller: CornerfillController;
  disposed: boolean;
  dpr: number;
  dynamicBackgroundPositionSpec: BackgroundPositionSpec | null;
  dynamicPaintSource: NormalizedPaintDescriptor;
  effectsKey: string | null;
  element: CornerfillElement;
  elementOwnerRegistry?: WeakMap<CornerfillElement, RuntimeEntry> | undefined;
  error: Error | null;
  fullRefreshPending: boolean;
  geometry: CornerGeometry | null;
  geometryKey: string | null;
  height: number;
  imageLease: Readonly<ImageLease> | null;
  imageLeaseUrl: string | null;
  initial: Readonly<InitialSources> | null;
  initialized: boolean;
  inlineBackgroundPositionX: string;
  inlineBackgroundPositionY: string;
  inlineCarrierSignature: string;
  lastError: Error | null;
  lastInvalidationReason: string | null;
  layerImageLeases: Map<string, Readonly<ImageLease>> | null;
  native: boolean;
  needsFullPreparedPaint: boolean;
  needsPaint: boolean;
  outline: Readonly<ContainedOutlinePaintState> | null;
  ownershipRoot: OwnershipRoot;
  ownershipSnapshot: Readonly<OwnershipSnapshot>;
  ownershipToken: string | null;
  ownershipVerified: boolean;
  paintKey: string | null;
  paintCount: number;
  paintResult: Readonly<CornerfillPaintExplanation> | null;
  pendingImageLeases: Set<Readonly<ImageLease>> | null;
  pendingReason: string | null;
  positionX: number;
  positionY: number;
  prepared: boolean;
  preparedBorderRadius: RadiusSource | undefined;
  preparedBorderSource: Readonly<OwnedBorderPaintState> | null;
  preparedCornerShape: CornerShapeSource | undefined;
  preparedLayoutChain: Promise<unknown> | null;
  preparedOutlineSource: Readonly<ContainedOutlinePaintState> | null;
  preparedPaintProgram: Readonly<PreparedOpaqueImageProgram> | null;
  preparedPaintSource: NormalizedPaintDescriptor;
  preparedResolvedPaint: ResolvedPaintDescriptor | null;
  preparedShadowSource: Readonly<InsetShadowPaintState> | null;
  ready: Promise<CornerfillEntryExplanation> | null;
  requestedVisible: boolean;
  resolvedImage: CornerfillRasterSource | null;
  revision: number;
  saved: Map<string, Readonly<NativeDeclarationRecord>> | null;
  savedDeclarationOrder: readonly string[] | null;
  shadow: Readonly<InsetShadowPaintState> | null;
  state: EntryState | null;
  styleVisible: boolean;
  styleCheckCount: number;
  surface: CornerfillSurface | null;
  surfaceWasDeferred: boolean;
  visible: boolean;
  waiters: EntryWaiter[] | null;
  watchCarriers: boolean;
  watchPosition: boolean;
  width: number;
}

export interface CornerfillEntryExplanation {
  readonly backend: ConcreteSurfaceBackend | "native-corner-shape" | "pending";
  readonly border: Readonly<OwnedBorderPaintState> | null;
  readonly composition: Readonly<HostComposition> | Readonly<{
    originalElement: true;
    semantics: "browser-native";
  }> | null;
  readonly counters: CornerfillEntryCounters;
  readonly effects: Readonly<{
    outline: Readonly<ContainedOutlinePaintState> | null;
    shadow: Readonly<InsetShadowPaintState> | null;
  }>;
  readonly error: string | null;
  readonly geometry: Readonly<{
    dpr: number;
    height: number;
    oppositeScale: number;
    radii: Four<Radius>;
    shapeParameters: Four<number>;
    width: number;
  }> | null;
  readonly implementationStatus: "IMPLEMENTED" | "NATIVE";
  readonly lastInvalidationReason: string | null;
  readonly lastError: string | null;
  readonly limitations: Readonly<Partial<typeof CORNERFILL_LIMITATIONS>>;
  readonly oracleQualification: typeof CORNERFILL_ORACLE_QUALIFICATION;
  readonly ownershipVerified: boolean;
  readonly paint: Readonly<CornerfillPaintExplanation> | null;
  /** Whether Cornerfill is currently allowed to paint this entry. This is not DOM visibility. */
  readonly paintActive: boolean | null;
  readonly paintOwnership: "browser-native" | "host-background-border-and-contained-effects";
  readonly prepared: Readonly<{
    backgroundPosition: PixelPair | null;
    directUpdates: true;
    layoutUpdates: "explicit";
    observesStyleMutations: false;
    surfaceDeferred: boolean;
    paintActive: boolean;
  }> | null;
  readonly runtime: typeof CORNERFILL_RUNTIME_SCHEMA;
  readonly schema: "cornerfill-entry-explanation@2";
  readonly status: "active" | "disposed" | "error" | "initializing";
  readonly surface: Readonly<{
    backend: ConcreteSurfaceBackend;
    id: string;
    size: Readonly<CornerfillSurface["size"]>;
  }> | null;
  readonly transformOwnedByCornerfill: false;
}

export interface CornerfillHandle {
  readonly backend: ConcreteSurfaceBackend | "native-corner-shape" | "pending";
  readonly ready: Promise<CornerfillEntryExplanation>;
  dispose(): void;
  explain(): Readonly<CornerfillEntryExplanation>;
  interpolateCornerShape(
    from: CornerShapeSource,
    to: CornerShapeSource,
    progress: number,
    options?: CornerWritingOptions,
  ): Promise<CornerfillEntryExplanation>;
  refresh(): Promise<CornerfillEntryExplanation>;
  resize(next?: CornerfillPreparedResizeConfig): Promise<CornerfillEntryExplanation>;
  update(next?: CornerfillHandleUpdate): Promise<CornerfillEntryExplanation>;
  verify(): Readonly<CornerfillEntryExplanation>;
}

export interface CornerfillControllerStats {
  readonly activeFallbackEntries: number;
  readonly activeNativeEntries: number;
  readonly counters: CornerfillControllerCounters;
  readonly entries: number;
  readonly geometryCacheEntries: number;
  readonly imageCache: ReturnType<ImageCache["stats"]>;
  readonly runtime: typeof CORNERFILL_RUNTIME_SCHEMA;
  readonly schema: "cornerfill-controller-stats@2";
  readonly surfacePixels: number;
  readonly surfaceResources: Readonly<SurfaceResourceStats>;
  readonly surfaces: number;
}

export interface CornerfillAuthoredStyleInspection {
  readonly requiresFallback: boolean;
  readonly values: Readonly<Record<string, string>>;
}

export interface CornerfillControllerHandle {
  readonly capabilities: ReturnType<typeof detectCornerfillCapabilities>;
  readonly document: Document;
  readonly options: Readonly<ResolvedCornerfillOptions>;
  attach(
    element: CornerfillElement,
    config?: Readonly<CornerfillAttachConfig>,
  ): Readonly<CornerfillHandle>;
  attachPrepared(
    element: CornerfillElement,
    config: Readonly<CornerfillPreparedConfig>,
  ): Readonly<CornerfillHandle>;
  destroy(): void;
  detach(element: CornerfillElement): boolean;
  explain(element: CornerfillElement): Readonly<CornerfillEntryExplanation> | null;
  inspectAuthoredStyle(
    element: CornerfillElement,
    properties: readonly string[],
  ): Readonly<CornerfillAuthoredStyleInspection>;
  refresh(): Promise<Readonly<CornerfillEntryExplanation>[]>;
  stats(): Readonly<CornerfillControllerStats>;
  updatePreparedBatch(updates: readonly Readonly<CornerfillPreparedUpdate>[]): number;
}

interface PaintLeaseTransaction {
  readonly commit: () => void;
  readonly paint: ResolvedPaintDescriptor;
  readonly rollback: () => void;
}

interface DynamicSnapshot {
  readonly border: Readonly<OwnedBorderPaintState> | null;
  readonly borderKey: string;
  readonly boxMetrics: Readonly<BackgroundBoxMetrics>;
  readonly composition: Readonly<HostComposition>;
  readonly computed: Readonly<{ visibility: string }>;
  readonly dpr: number;
  readonly effectsKey: string;
  readonly geometry: CornerGeometry;
  readonly geometryKey: string;
  readonly height: number;
  readonly outline: Readonly<ContainedOutlinePaintState> | null;
  readonly paint: ResolvedPaintDescriptor;
  readonly paintKey: string;
  readonly paintLeases: Readonly<PaintLeaseTransaction>;
  readonly paintSource: NormalizedPaintDescriptor;
  readonly shadow: Readonly<InsetShadowPaintState> | null;
  readonly width: number;
}

function applyDynamicSnapshot(entry: RuntimeEntry, snapshot: Readonly<DynamicSnapshot>): void {
  entry.geometry = snapshot.geometry;
  entry.geometryKey = snapshot.geometryKey;
  entry.width = snapshot.width;
  entry.height = snapshot.height;
  entry.dpr = snapshot.dpr;
  entry.dynamicPaintSource = snapshot.paintSource;
  if (snapshot.paintSource.kind === "image") {
    entry.dynamicBackgroundPositionSpec = snapshot.paintSource.backgroundPositionSpec;
  }
  entry.paintKey = snapshot.paintKey;
  entry.borderKey = snapshot.borderKey;
  entry.border = snapshot.border;
  entry.effectsKey = snapshot.effectsKey;
  entry.shadow = snapshot.shadow;
  entry.outline = snapshot.outline;
  entry.composition = snapshot.composition;
  entry.boxMetrics = snapshot.boxMetrics;
}

interface PreparedLayoutSnapshot {
  readonly border: Readonly<OwnedBorderPaintState> | null;
  readonly borderRadius: RadiusSource | undefined;
  readonly composition: Readonly<HostComposition>;
  readonly cornerShape: CornerShapeSource | undefined;
  readonly descriptor: NormalizedPaintDescriptor;
  readonly dpr: number;
  readonly geometry: CornerGeometry;
  readonly height: number;
  readonly outline: Readonly<ContainedOutlinePaintState> | null;
  readonly paint: ResolvedPaintDescriptor;
  readonly paintLeases: Readonly<PaintLeaseTransaction>;
  readonly program: Readonly<PreparedOpaqueImageProgram> | null;
  readonly shadow: Readonly<InsetShadowPaintState> | null;
  readonly width: number;
}

function applyPreparedLayoutSnapshot(
  entry: RuntimeEntry,
  snapshot: Readonly<PreparedLayoutSnapshot>,
): void {
  entry.width = snapshot.width;
  entry.height = snapshot.height;
  entry.dpr = snapshot.dpr;
  entry.geometry = snapshot.geometry;
  entry.geometryKey = "prepared";
  entry.border = snapshot.border;
  entry.borderKey = snapshot.border ? JSON.stringify(snapshot.border) : "none";
  entry.shadow = snapshot.shadow;
  entry.outline = snapshot.outline;
  entry.effectsKey = JSON.stringify([snapshot.shadow, snapshot.outline]);
  entry.composition = snapshot.composition;
  entry.preparedResolvedPaint = snapshot.paint;
  entry.preparedPaintSource = snapshot.descriptor;
  entry.preparedBorderSource = snapshot.border;
  entry.preparedShadowSource = snapshot.shadow;
  entry.preparedOutlineSource = snapshot.outline;
  entry.preparedBorderRadius = snapshot.borderRadius;
  entry.preparedCornerShape = snapshot.cornerShape;
  entry.positionX = snapshot.paint.kind === "image" ? snapshot.paint.backgroundPosition[0] : 0;
  entry.positionY = snapshot.paint.kind === "image" ? snapshot.paint.backgroundPosition[1] : 0;
  entry.preparedPaintProgram = snapshot.program;
}

const EMPTY_PAINT_SOURCE = Object.freeze({
  clip: "border-box",
  color: "transparent",
  kind: "solid",
}) satisfies NormalizedPaintDescriptor;

type RuntimeEntrySeed = Pick<
  RuntimeEntry,
  "controller" | "element" | "native" | "ownershipRoot" | "ownershipSnapshot" | "prepared"
> & Partial<Omit<
  RuntimeEntry,
  "controller" | "element" | "native" | "ownershipRoot" | "ownershipSnapshot" | "prepared"
>>;

function createRuntimeEntry(seed: RuntimeEntrySeed): RuntimeEntry {
  return {
    backend: null,
    border: null,
    borderKey: null,
    boxMetrics: null,
    committedRevision: -1,
    composition: null,
    disposed: false,
    dpr: 1,
    dynamicBackgroundPositionSpec: null,
    dynamicPaintSource: EMPTY_PAINT_SOURCE,
    effectsKey: null,
    error: null,
    fullRefreshPending: false,
    geometry: null,
    geometryKey: null,
    height: 0,
    imageLease: null,
    imageLeaseUrl: null,
    initial: null,
    initialized: false,
    inlineBackgroundPositionX: "",
    inlineBackgroundPositionY: "",
    inlineCarrierSignature: "",
    lastError: null,
    lastInvalidationReason: null,
    layerImageLeases: null,
    needsFullPreparedPaint: false,
    needsPaint: false,
    outline: null,
    ownershipToken: null,
    ownershipVerified: false,
    paintKey: null,
    paintCount: 0,
    paintResult: null,
    pendingImageLeases: null,
    pendingReason: null,
    positionX: 0,
    positionY: 0,
    preparedBorderRadius: undefined,
    preparedBorderSource: null,
    preparedCornerShape: undefined,
    preparedLayoutChain: null,
    preparedOutlineSource: null,
    preparedPaintProgram: null,
    preparedPaintSource: EMPTY_PAINT_SOURCE,
    preparedResolvedPaint: null,
    preparedShadowSource: null,
    ready: null,
    requestedVisible: true,
    resolvedImage: null,
    revision: 0,
    saved: null,
    savedDeclarationOrder: null,
    shadow: null,
    state: null,
    styleVisible: true,
    styleCheckCount: 0,
    surface: null,
    surfaceWasDeferred: false,
    visible: true,
    waiters: null,
    watchCarriers: false,
    watchPosition: false,
    width: 0,
    ...seed,
  };
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object";
}

function frozenFour<T>(first: T, second: T, third: T, fourth: T): Four<T> {
  return Object.freeze([first, second, third, fourth]);
}

function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export const CORNERFILL_RUNTIME_SCHEMA = "cornerfill-runtime@2";

export const CORNERFILL_LIMITATIONS = Object.freeze({
  descendantOverflowClipping: Object.freeze({
    supported: false,
    reason: "A CSS image cannot install the browser's descendant overflow clip.",
  }),
  shapedHitTesting: Object.freeze({
    supported: false,
    reason: "Fallback elements retain their rectangular DOM hit-test box.",
  }),
  replacedContentClipping: Object.freeze({
    supported: false,
    reason: "The paint backend does not own replaced-element pixels.",
  }),
  fragmentedBoxes: Object.freeze({
    supported: false,
    reason: "One live image maps to one border box and cannot represent a multi-fragment element.",
  }),
  backdropFilterClipping: Object.freeze({
    supported: false,
    reason: "A background image cannot install the shaped clip required by backdrop-filter.",
  }),
  gradientGrammar: Object.freeze({
    supported: false,
    reason: "Repeating gradient functions, interpolation hints/spaces, and out-of-range or non-zero length stops are outside the supported gradient grammar.",
  }),
  gradientColorParity: Object.freeze({
    supported: false,
    reason: "Canvas gradients do not reproduce default CSS gradient color interpolation; the implemented gradient path remains UNQUALIFIED.",
  }),
  crossOriginNoCorsRaster: Object.freeze({
    supported: false,
    reason: "Raster URLs must be same-origin or CORS-enabled; native CSS cross-origin no-CORS image loading is not preserved.",
  }),
  rasterRepeatOriginParity: Object.freeze({
    supported: false,
    reason: "Repeat/origin geometry is implemented, but native CSS and Canvas raster sampling differ; focused native parity remains UNQUALIFIED.",
  }),
  backgroundBlendModes: Object.freeze({
    supported: false,
    reason: "General background blending is unsupported; only one explicitly opaque scroll-attached raster with multiply over an opaque rgb()/hex color is admitted.",
  }),
  outerEffects: Object.freeze({
    supported: false,
    reason: "A host background image cannot paint beyond the border box, so outer box shadows and outlines with external outsets are unavailable.",
  }),
  shadowAndOutlineGrammar: Object.freeze({
    supported: false,
    reason: "Fallback effects are limited to one zero-offset, zero-blur inset shadow with non-negative spread and one fully contained solid outline.",
  }),
  perSideBorderPaint: Object.freeze({
    supported: false,
    reason: "Borders require one solid color; per-side colors and non-solid styles need corner-region partitioning not provided by this slice.",
  }),
  insetContourTopology: Object.freeze({
    supported: false,
    reason: "Fallback painting refuses clipped inner border contours that self-intersect and require multiple boolean components.",
  }),
  borderImagePaint: Object.freeze({
    supported: false,
    reason: "Fallback mode cannot combine a native border-image with the shaped border pixels it owns.",
  }),
  specialHostPainting: Object.freeze({
    supported: false,
    reason: "Fallback mode does not own root/body propagation, native appearance, or collapsed-table border painting.",
  }),
  authorImportantOwnership: Object.freeze({
    supported: false,
    reason: AUTHOR_IMPORTANT_OWNERSHIP_REASON,
  }),
  explicitCascadeObservation: Object.freeze({
    supported: false,
    reason: "The explicit runtime observes host class, inline style, content, and size; other cascade inputs require handle.refresh() or controller.refresh().",
  }),
  preparedLayoutObservation: Object.freeze({
    supported: false,
    reason: "Prepared entries are caller-clocked; size and DPR changes require handle.resize().",
  }),
  exceptionalBatchCommit: Object.freeze({
    supported: false,
    reason: "Prepared batches validate transactionally, but an unexpected browser canvas failure can leave already-committed sibling surfaces painted.",
  }),
});


const ELEMENT_OWNER_REGISTRY = Symbol.for("layoutit.cornerfill.element-owner-registry.v1");

class StaleEntryWorkError extends Error {
  constructor() {
    super("Cornerfill entry work was superseded or cancelled");
    this.name = "StaleEntryWorkError";
  }
}


function numberFromPx(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function measureBorderBox(element: CornerfillElement, computed: CSSStyleDeclaration) {
  const horizontalExtras = numberFromPx(computed.paddingLeft) + numberFromPx(computed.paddingRight)
    + numberFromPx(computed.borderLeftWidth) + numberFromPx(computed.borderRightWidth);
  const verticalExtras = numberFromPx(computed.paddingTop) + numberFromPx(computed.paddingBottom)
    + numberFromPx(computed.borderTopWidth) + numberFromPx(computed.borderBottomWidth);
  let width = numberFromPx(computed.width);
  let height = numberFromPx(computed.height);
  if (computed.boxSizing !== "border-box") {
    width += horizontalExtras;
    height += verticalExtras;
  }
  if (!(width > 0)) width = element.offsetWidth;
  if (!(height > 0)) height = element.offsetHeight;
  if (!(width > 0 && height > 0)) {
    throw new RangeError("Cornerfill requires a measurable non-zero border box");
  }
  return Object.freeze({ width, height });
}

const REPLACED_HOST_TAGS = new Set([
  "AUDIO",
  "CANVAS",
  "EMBED",
  "IFRAME",
  "IMG",
  "INPUT",
  "OBJECT",
  "SELECT",
  "SVG",
  "TEXTAREA",
  "VIDEO",
]);

const COLLAPSED_BORDER_DISPLAY_TYPES = new Set([
  "inline-table",
  "table",
  "table-cell",
  "table-column",
  "table-column-group",
  "table-footer-group",
  "table-header-group",
  "table-row",
  "table-row-group",
]);

function hasPaintedPseudo(view: Window, element: Element, pseudo: string): boolean {
  const computed = view.getComputedStyle(element, pseudo);
  return computed.display !== "none" && !new Set(["", "none", "normal"]).has(computed.content);
}

function hasHostForeground(
  view: Window,
  element: Element,
  computed: CSSStyleDeclaration = view.getComputedStyle(element),
): boolean {
  const childContent = [...element.childNodes].some((node) => (
    node.nodeType === 1 || (node.nodeType === 3 && node.textContent?.trim() !== "")
  ));
  const shadowContent = [...(element.shadowRoot?.childNodes ?? [])].some((node) => (
    node.nodeType === 1 || (node.nodeType === 3 && node.textContent?.trim() !== "")
  ));
  const listMarker = computed.display === "list-item"
    && (computed.listStyleType !== "none" || computed.listStyleImage !== "none");
  return childContent
    || shadowContent
    || listMarker
    || hasPaintedPseudo(view, element, "::before")
    || hasPaintedPseudo(view, element, "::after");
}

function inspectFallbackHost(
  view: Window,
  element: CornerfillElement,
  computed: CSSStyleDeclaration,
): Readonly<HostComposition> {
  if (REPLACED_HOST_TAGS.has(element.tagName)) {
    throw new TypeError(CORNERFILL_LIMITATIONS.replacedContentClipping.reason);
  }
  if (element === element.ownerDocument.documentElement || element === element.ownerDocument.body) {
    throw new TypeError(CORNERFILL_LIMITATIONS.specialHostPainting.reason);
  }
  const appearance = computed.appearance || computed.getPropertyValue("-webkit-appearance") || "none";
  if (appearance !== "none") throw new TypeError(CORNERFILL_LIMITATIONS.specialHostPainting.reason);
  if (computed.borderCollapse === "collapse" && COLLAPSED_BORDER_DISPLAY_TYPES.has(computed.display)) {
    throw new TypeError(CORNERFILL_LIMITATIONS.specialHostPainting.reason);
  }
  const fragmentCount = element.getClientRects().length;
  if (fragmentCount > 1) throw new TypeError(CORNERFILL_LIMITATIONS.fragmentedBoxes.reason);
  const standardBackdropFilter = computed.backdropFilter || computed.getPropertyValue("backdrop-filter");
  const prefixedBackdropFilter = computed.getPropertyValue("-webkit-backdrop-filter");
  const backdropFilter = standardBackdropFilter && standardBackdropFilter !== "none"
    ? standardBackdropFilter
    : prefixedBackdropFilter || standardBackdropFilter || "none";
  if (backdropFilter !== "none") {
    throw new TypeError(CORNERFILL_LIMITATIONS.backdropFilterClipping.reason);
  }
  const borderImageSource = computed.borderImageSource
    || computed.getPropertyValue("border-image-source")
    || "none";
  if (borderImageSource !== "none") {
    throw new TypeError(CORNERFILL_LIMITATIONS.borderImagePaint.reason);
  }
  const clipsOverflow = [computed.overflowX, computed.overflowY].some((value) => value !== "visible");
  if (clipsOverflow && hasHostForeground(view, element, computed)) {
    throw new TypeError(CORNERFILL_LIMITATIONS.descendantOverflowClipping.reason);
  }
  return Object.freeze({
    originalElement: true,
    transform: "browser-compositor",
    opacity: "browser-compositor",
    filter: "browser-compositor",
    stacking: "browser",
    pseudoElements: "browser-owned-without-shaped-overflow-clip",
    fragmentCount,
  });
}

function assertOutlineHost(
  view: Window,
  element: CornerfillElement,
  outline: Readonly<ContainedOutlinePaintState> | null,
): void {
  if (outline && hasHostForeground(view, element)) {
    throw new TypeError(
      "A contained outline can be painted only on an empty, paint-owned host without foreground or pseudo-element content.",
    );
  }
}

function backgroundBoxMetrics(computed: CSSStyleDeclaration): Readonly<BackgroundBoxMetrics> {
  return Object.freeze({
    border: Object.freeze([
      numberFromPx(computed.borderTopWidth),
      numberFromPx(computed.borderRightWidth),
      numberFromPx(computed.borderBottomWidth),
      numberFromPx(computed.borderLeftWidth),
    ]),
    padding: Object.freeze([
      numberFromPx(computed.paddingTop),
      numberFromPx(computed.paddingRight),
      numberFromPx(computed.paddingBottom),
      numberFromPx(computed.paddingLeft),
    ]),
  }) as Readonly<BackgroundBoxMetrics>;
}

function elementOwnerRegistry(element: CornerfillElement): WeakMap<CornerfillElement, RuntimeEntry> {
  const ownerDocument = element.ownerDocument as Document & {
    [ELEMENT_OWNER_REGISTRY]?: WeakMap<CornerfillElement, RuntimeEntry>;
  };
  let registry = ownerDocument[ELEMENT_OWNER_REGISTRY];
  if (registry) return registry;
  registry = new WeakMap<CornerfillElement, RuntimeEntry>();
  Object.defineProperty(ownerDocument, ELEMENT_OWNER_REGISTRY, { value: registry });
  return registry;
}

function claimElement(entry: RuntimeEntry): void {
  const registry = elementOwnerRegistry(entry.element);
  const existing = registry.get(entry.element);
  if (existing && existing !== entry && !existing.disposed) {
    throw new Error("element is already attached to another Cornerfill controller");
  }
  registry.set(entry.element, entry);
  entry.elementOwnerRegistry = registry;
}

function assertElementAvailable(element: CornerfillElement): void {
  const existing = elementOwnerRegistry(element).get(element);
  if (existing && !existing.disposed) {
    throw new Error("element is already attached to another Cornerfill controller");
  }
}

function releaseElement(entry: RuntimeEntry): void {
  if (entry.elementOwnerRegistry?.get(entry.element) === entry) {
    entry.elementOwnerRegistry.delete(entry.element);
  }
}

function captureBorder(
  computed: CSSStyleDeclaration,
  colorOverride: string | readonly string[] = "",
): Readonly<OwnedBorderPaintState> | null {
  const widths = [
    numberFromPx(computed.borderTopWidth),
    numberFromPx(computed.borderRightWidth),
    numberFromPx(computed.borderBottomWidth),
    numberFromPx(computed.borderLeftWidth),
  ];
  if (widths.every((width) => width === 0)) return null;
  const styles = [
    computed.borderTopStyle,
    computed.borderRightStyle,
    computed.borderBottomStyle,
    computed.borderLeftStyle,
  ];
  if (styles.some((style, index) => widths[index]! > 0 && style !== "solid")) {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  const computedColors = [
    computed.borderTopColor,
    computed.borderRightColor,
    computed.borderBottomColor,
    computed.borderLeftColor,
  ];
  const colors = Array.isArray(colorOverride)
    ? colorOverride.map((color, index) => color || computedColors[index]!)
    : computedColors;
  const paintedColors = colors.filter((_, index) => widths[index]! > 0);
  if (!paintedColors.every((color) => color === paintedColors[0])) {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  return normalizeBorder({
    width: widths,
    color: typeof colorOverride === "string" && colorOverride ? colorOverride : paintedColors[0],
  });
}

function normalizeBorder(border: unknown): Readonly<OwnedBorderPaintState> | null {
  if (border === null || border === undefined) return null;
  if (!isRecord(border)) throw new TypeError("border descriptor must be an object");
  const widths = normalizeSideValues(border.width ?? 0, "border width");
  if (widths.every((width) => width === 0)) return null;
  const style = border.style ?? "solid";
  if (typeof style !== "string" || style.toLowerCase() !== "solid") {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  if (typeof border.color !== "string") {
    if (Array.isArray(border.color) || isRecord(border.color)) {
      throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
    }
    throw new TypeError("painted border requires a color");
  }
  const color = border.color;
  if (!color) {
    throw new TypeError("painted border requires a color");
  }
  const normalized: Readonly<OwnedBorderPaintState> = Object.freeze({
    widths: Object.freeze(widths),
    width: widths.every((width) => width === widths[0]) ? widths[0] : null,
    color,
    colors: frozenFour(color, color, color, color),
    styles: frozenFour("solid", "solid", "solid", "solid"),
  });
  return normalized;
}

function effectLength(token: unknown): number | null {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px)?$/iu.exec(String(token).trim());
  if (!match) return null;
  const value = Number(match[1]!);
  if (!match[2] && value !== 0) return null;
  return value;
}

function normalizeInsetShadow(shadow: unknown): Readonly<InsetShadowPaintState> | null {
  if (shadow === null || shadow === undefined || shadow === "none") return null;
  if (typeof shadow === "string") {
    const layers = splitTopLevelCommas(shadow);
    if (layers.length !== 1) throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
    const tokens = splitTopLevelWhitespace(layers[0]!);
    const lengths: number[] = [];
    const color: string[] = [];
    let inset = false;
    for (const token of tokens) {
      if (token.toLowerCase() === "inset") {
        if (inset) throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
        inset = true;
        continue;
      }
      const length = effectLength(token);
      if (length === null) color.push(token);
      else lengths.push(length);
    }
    if (!inset) throw new TypeError(CORNERFILL_LIMITATIONS.outerEffects.reason);
    if (lengths.length < 2 || lengths.length > 4 || color.length === 0) {
      throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
    }
    const [offsetX, offsetY, blur = 0, spread = 0] = lengths;
    if (offsetX !== 0 || offsetY !== 0 || blur !== 0 || spread < 0) {
      throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
    }
    if (spread === 0) return null;
    return Object.freeze({
      kind: "inset-solid-ring",
      spread,
      color: color.join(" "),
    });
  }
  if (!isRecord(shadow)) {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
  const spread = Number(shadow.spread);
  if (!Number.isFinite(spread) || spread < 0 || !shadow.color) {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
  if (spread === 0) return null;
  return Object.freeze({
    kind: "inset-solid-ring",
    spread,
    color: String(shadow.color),
  });
}

function normalizeContainedOutline(outline: unknown): Readonly<ContainedOutlinePaintState> | null {
  if (outline === null || outline === undefined) return null;
  if (!isRecord(outline)) {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
  if (outline.style === "none") return null;
  const width = typeof outline.width === "string" ? effectLength(outline.width) : Number(outline.width);
  const offset = typeof outline.offset === "string" ? effectLength(outline.offset) : Number(outline.offset ?? 0);
  const style = String(outline.style ?? "solid").toLowerCase();
  if (width === null || offset === null || !Number.isFinite(width) || !Number.isFinite(offset)
    || width < 0 || style !== "solid" || !outline.color) {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
  if (width === 0) return null;
  if (offset + width > 0) throw new TypeError(CORNERFILL_LIMITATIONS.outerEffects.reason);
  return Object.freeze({
    kind: "contained-solid-ring",
    width,
    offset,
    color: String(outline.color),
  });
}

type ExplicitColorValidator = (value: string, label: string) => void;

function validateNormalizedColors(
  validate: ExplicitColorValidator,
  paint: Readonly<NormalizedPaintDescriptor> | null = null,
  border: Readonly<OwnedBorderPaintState> | null = null,
  shadow: Readonly<InsetShadowPaintState> | null = null,
  outline: Readonly<ContainedOutlinePaintState> | null = null,
): void {
  if (paint) {
    validate(paint.color, "background color");
    const layers = paint.kind === "layers" ? paint.layers : [paint];
    for (const layer of layers) {
      if (layer.kind !== "linear-gradient"
        && layer.kind !== "radial-gradient"
        && layer.kind !== "conic-gradient") continue;
      for (const [, color] of layer.stops) validate(color, `${layer.kind} stop color`);
    }
  }
  if (border) validate(border.color, "border color");
  if (shadow) validate(shadow.color, "inset shadow color");
  if (outline) validate(outline.color, "outline color");
}

interface OutlineOverrides {
  readonly color?: string | undefined;
  readonly offset?: string | undefined;
  readonly style?: string | undefined;
  readonly width?: string | undefined;
}

function captureOutline(
  computed: CSSStyleDeclaration,
  overrides: Readonly<OutlineOverrides> = {},
): Readonly<ContainedOutlinePaintState> | null {
  return normalizeContainedOutline({
    width: overrides.width || computed.outlineWidth,
    style: overrides.style || computed.outlineStyle,
    color: overrides.color || computed.outlineColor,
    offset: overrides.offset || computed.outlineOffset,
  });
}

function captureInitialSources(
  element: CornerfillElement,
  config: Readonly<CornerfillAttachConfig>,
  computed: CSSStyleDeclaration,
  validateColor: ExplicitColorValidator,
): Readonly<InitialSources> {
  const radiusCapture = captureRadiusCarriers(computed);
  const computedShape = computed.getPropertyValue("corner-shape").trim();
  const shapeAttribute = element.getAttribute("data-cornerfill-shape");
  const shapeBaseline = Object.freeze({
    shorthand: shapeAttribute || computedShape || "round",
    physical: shapeAttribute ? Object.freeze({}) : physicalShapeValues(computed),
  });
  const shapeCapture = captureShapeCarriers(computed, shapeBaseline);
  const computedRadiusSource = Object.freeze({
    kind: "longhands" as const,
    values: frozenFour(
      computed.borderTopLeftRadius,
      computed.borderTopRightRadius,
      computed.borderBottomRightRadius,
      computed.borderBottomLeftRadius,
    ),
  });
  const radiusSource: RadiusSource = config.borderRadius ?? (radiusCapture?.present
    ? radiusCapture.source
    : computedRadiusSource);
  const hasComputedShapeLonghands = Object.keys(shapeBaseline.physical).length > 0;
  const shapeSource = config.cornerShape ?? (shapeCapture.present
    ? shapeCapture.source
    : hasComputedShapeLonghands
      ? shapeCapture.source
      : shapeAttribute || computedShape);
  if (!shapeSource) {
    throw new TypeError(
      "corner-shape did not survive CSS parsing; provide --cornerfill-corner-shape, data-cornerfill-shape, or attach({cornerShape})",
    );
  }
  const carrierPaint = PAINT_CARRIERS.some((name) => readCarrier(computed, name));
  const capturedPaintSource = config.paint === undefined
    ? captureComputedPaint(computed, carrierPaint ? readPaintCarriers(computed) : {})
    : normalizePaintDescriptor(config.paint);
  const paintSource = config.rasterIsOpaque === true && capturedPaintSource.kind === "image"
    ? Object.freeze({ ...capturedPaintSource, opaque: true })
    : capturedPaintSource;
  const borderColorCarrier = readBorderColorCarriers(computed);
  const borderSource = config.border === undefined
    ? captureBorder(computed, borderColorCarrier)
    : normalizeBorder(config.border);
  const shadowCarrier = readShadowCarrier(computed);
  const shadowSource = config.shadow === undefined
    ? normalizeInsetShadow(shadowCarrier || computed.boxShadow)
    : normalizeInsetShadow(config.shadow);
  const outlineCarrierValues = Object.freeze({
    width: readCarrier(computed, CARRIER.outlineWidth),
    style: readCarrier(computed, CARRIER.outlineStyle),
    color: readColorCarrier(computed, CARRIER.outlineColor),
    offset: readCarrier(computed, CARRIER.outlineOffset),
  });
  const outlineSource = config.outline === undefined
    ? captureOutline(computed, outlineCarrierValues)
    : normalizeContainedOutline(config.outline);
  validateNormalizedColors(
    validateColor,
    config.paint === undefined ? null : paintSource,
    config.border === undefined ? null : borderSource,
    config.shadow === undefined ? null : shadowSource,
    config.outline === undefined ? null : outlineSource,
  );
  const initial: Readonly<InitialSources> = Object.freeze({
    radiusSource,
    shapeSource,
    paintSource,
    borderSource,
    shadowSource,
    outlineSource,
    radiusCarrierBaseline: radiusCapture?.baseline ?? null,
    shapeCarrierBaseline: shapeCapture.baseline,
    initialBackgroundPosition: computed.backgroundPosition,
    rasterIsOpaque: config.rasterIsOpaque === true,
    dynamic: Object.freeze({
      radius: config.borderRadius === undefined,
      shape: config.cornerShape === undefined,
      paint: config.paint === undefined,
      paintPosition: config.paint === undefined
        && config.observeBackgroundPosition !== false
        && paintSource.kind === "image",
      border: config.border === undefined,
      shadow: config.shadow === undefined,
      outline: config.outline === undefined,
    }),
  });
  return initial;
}

interface CurrentSources {
  readonly borderSource: Readonly<OwnedBorderPaintState> | null;
  readonly outlineSource: Readonly<ContainedOutlinePaintState> | null;
  readonly paintSource: NormalizedPaintDescriptor;
  readonly radiusSource: RadiusSource;
  readonly shadowSource: Readonly<InsetShadowPaintState> | null;
  readonly shapeSource: CornerShapeSource;
}

function currentSources(
  entry: RuntimeEntry,
  computed: CSSStyleDeclaration,
): Readonly<CurrentSources> {
  const { initial, state } = entry;
  if (!initial || !state) throw new TypeError("current sources require a dynamic Cornerfill entry");
  let radiusSource = state.borderRadius ?? initial.radiusSource;
  if (state.borderRadius === undefined && initial.dynamic.radius) {
    radiusSource = captureRadiusCarriers(computed, initial.radiusCarrierBaseline)?.source
      ?? Object.freeze({
        kind: "longhands",
        values: frozenFour(
          computed.borderTopLeftRadius,
          computed.borderTopRightRadius,
          computed.borderBottomRightRadius,
          computed.borderBottomLeftRadius,
        ),
      });
  }
  let shapeSource = state.cornerShape ?? initial.shapeSource;
  if (state.cornerShape === undefined && initial.dynamic.shape) {
    const capture = captureShapeCarriers(computed, initial.shapeCarrierBaseline);
    shapeSource = capture?.present
      ? capture.source
      : entry.element.getAttribute("data-cornerfill-shape")
        || computed.getPropertyValue("corner-shape").trim()
        || "round";
  }
  let paintSource = state.paint ?? initial.paintSource;
  if (state.paint === undefined && initial.dynamic.paint) {
    paintSource = captureComputedPaint(computed, readPaintCarriers(computed));
  } else if (state.paint === undefined && initial.dynamic.paintPosition
    && entry.dynamicBackgroundPositionSpec) {
    paintSource = Object.freeze({
      ...initial.paintSource,
      backgroundPositionSpec: entry.dynamicBackgroundPositionSpec,
    });
  }
  if (initial.rasterIsOpaque && paintSource.kind === "image" && paintSource.opaque !== true) {
    paintSource = Object.freeze({ ...paintSource, opaque: true });
  }
  let borderSource = state.border !== undefined ? state.border : initial.borderSource;
  if (state.border === undefined && initial.dynamic.border) {
    const colorCarrier = readBorderColorCarriers(computed);
    borderSource = captureBorder(
      computed,
      colorCarrier
        || (isRecord(initial.borderSource) && typeof initial.borderSource.color === "string"
          ? initial.borderSource.color
          : ""),
    );
  }
  let shadowSource = state.shadow !== undefined ? state.shadow : initial.shadowSource;
  if (state.shadow === undefined && initial.dynamic.shadow) {
    shadowSource = normalizeInsetShadow(readShadowCarrier(computed) || computed.boxShadow);
  }
  let outlineSource = state.outline !== undefined ? state.outline : initial.outlineSource;
  if (state.outline === undefined && initial.dynamic.outline) {
    const outlineCarrier = {
      width: readCarrier(computed, CARRIER.outlineWidth),
      style: readCarrier(computed, CARRIER.outlineStyle),
      color: readColorCarrier(computed, CARRIER.outlineColor),
      offset: readCarrier(computed, CARRIER.outlineOffset),
    };
    outlineSource = captureOutline(
      computed,
      Object.values(outlineCarrier).some(Boolean) ? outlineCarrier : {},
    );
  }
  return Object.freeze({
    radiusSource,
    shapeSource,
    paintSource,
    borderSource,
    shadowSource,
    outlineSource,
  });
}

function resolveRadiusSource(
  source: RadiusSource,
  width: number,
  height: number,
  flow: CornerWritingOptions = {},
): Four<Radius> {
  if (typeof source === "string") return resolveBorderRadius(source, width, height);
  if (isRadiusTuple(source)) {
    return frozenFour(
      Object.freeze({ ...source[0] }),
      Object.freeze({ ...source[1] }),
      Object.freeze({ ...source[2] }),
      Object.freeze({ ...source[3] }),
    );
  }
  if (isRecord(source)) {
    const record: UnknownRecord = source;
    if (record.kind === "longhands") {
      return resolveCornerRadiusLonghands(record.values as Four<string>, width, height);
    }
    if (record.kind === "declarations" || record.shorthand || record.physical || record.logical) {
      const declarations: BorderRadiusDeclarations = {
        ...(typeof record.shorthand === "string" ? { shorthand: record.shorthand } : {}),
        ...(isRecord(record.physical)
          ? { physical: record.physical as NonNullable<BorderRadiusDeclarations["physical"]> }
          : {}),
        ...(isRecord(record.logical)
          ? { logical: record.logical as NonNullable<BorderRadiusDeclarations["logical"]> }
          : {}),
        ...(record.writingMode ?? flow.writingMode
          ? { writingMode: (record.writingMode ?? flow.writingMode) as NonNullable<BorderRadiusDeclarations["writingMode"]> }
          : {}),
        ...(record.direction ?? flow.direction
          ? { direction: (record.direction ?? flow.direction) as NonNullable<BorderRadiusDeclarations["direction"]> }
          : {}),
      };
      return resolveBorderRadiusDeclarations(declarations, width, height);
    }
  }
  throw new TypeError("unsupported border-radius source");
}

function authoredCornerRequiresFallback(
  element: CornerfillElement,
  computed: CSSStyleDeclaration,
): boolean {
  const flow = flowFromComputed(computed);
  const shapeCapture = captureShapeCarriers(computed);
  const shapeSource: CornerShapeSource = shapeCapture?.present
    ? shapeCapture.source
    : computed.getPropertyValue("corner-shape").trim() || "round";
  const shapes = resolveCornerShape(shapeSource, flow);
  if (shapes.every((shape) => shape === 1)) return false;
  const { width, height } = measureBorderBox(element, computed);
  const radiusCapture = captureRadiusCarriers(computed);
  const radiusSource: RadiusSource = radiusCapture?.present
    ? radiusCapture.source
    : Object.freeze({
      kind: "longhands",
      values: frozenFour(
        computed.getPropertyValue(RADIUS_LONGHANDS[0]!),
        computed.getPropertyValue(RADIUS_LONGHANDS[1]!),
        computed.getPropertyValue(RADIUS_LONGHANDS[2]!),
        computed.getPropertyValue(RADIUS_LONGHANDS[3]!),
      ),
    });
  const radii = resolveRadiusSource(radiusSource, width, height, flow);
  return shapes.some((shape, index) => (
    shape !== 1 && radii[index]!.rx > 0 && radii[index]!.ry > 0
  ));
}

function shapeKey(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return "+inf";
  if (value === Number.NEGATIVE_INFINITY) return "-inf";
  return String(value);
}

function geometryKey(
  width: number,
  height: number,
  dpr: number,
  radii: Four<Radius>,
  shapes: Four<number>,
): string {
  return [
    width,
    height,
    dpr,
    ...radii.flatMap(({ rx, ry }) => [rx, ry]),
    ...shapes.map(shapeKey),
  ].join("|");
}

function imageRequest(
  document: Document,
  descriptor: NormalizedImageLayer,
): Readonly<{ absoluteUrl: string; crossOrigin: string | null; identity: string }> {
  const parsedUrl = new URL(descriptor.url!, document.baseURI);
  const documentUrl = new URL(document.baseURI);
  const crossOrigin = descriptor.crossOrigin ?? (
    /^https?:$/u.test(parsedUrl.protocol) && parsedUrl.origin !== documentUrl.origin
      ? "anonymous"
      : null
  );
  if (![null, "anonymous", "use-credentials"].includes(crossOrigin)) {
    throw new TypeError(`unsupported image crossOrigin mode: ${crossOrigin}`);
  }
  const absoluteUrl = parsedUrl.href;
  return Object.freeze({
    absoluteUrl,
    crossOrigin,
    identity: `${crossOrigin ?? "same-origin-default"}\n${absoluteUrl}`,
  });
}

function releaseLayerImageLeases(entry: RuntimeEntry, keep: ReadonlySet<string> | null = null): void {
  const leases = entry.layerImageLeases;
  if (!leases) return;
  for (const [identity, lease] of leases) {
    if (keep?.has(identity)) continue;
    lease.release();
    leases.delete(identity);
  }
  if (leases.size === 0) entry.layerImageLeases = null;
}

export function detectCornerfillCapabilities(
  document: Document | undefined = globalThis.document,
  options: Readonly<Pick<CornerfillInstallOptions, "nativeQualification">> = {},
) {
  if (!document?.defaultView) throw new TypeError("a browser document is required");
  const surfaces = detectSurfaceCapabilities(document);
  const native = options.nativeQualification ?? qualifyNativeCornerShape(document);
  return Object.freeze({
    schema: "cornerfill-capabilities@2",
    native,
    surfaces,
    implementedPaintPaths: Object.freeze({
      solidColor: true,
      oneNoRepeatRaster: true,
      oneRasterBackground: true,
      rasterRepeatModes: true,
      rasterSizeAndPosition: true,
      backgroundOriginAndClip: true,
      oneOpaqueRasterOpaqueColorMultiply: true,
      normalizedLinearGradient: true,
      cssLinearGradient: true,
      cssRadialGradient: true,
      cssConicGradient: true,
      multipleBackgroundLayers: true,
      uniformSolidRoundBorder: true,
      solidShapedBorder: true,
      unequalBorderWidths: true,
      zeroBlurInsetShadowRing: true,
      containedSolidOutline: true,
      transformCompositorOwned: true,
    }),
    paintInputConstraints: Object.freeze({
      animatedImageTiming: false,
      cssGradientColorParity: false,
      rasterUrls: "same-origin-or-cors",
    }),
    fallbackSemantics: Object.freeze({
      hostBackgroundAndBorderPaint: true,
      containedEffectsPaint: true,
      originalElementTransformOpacityFilterAndStacking: true,
      pseudoElementsRetained: true,
      descendantOverflowClipping: false,
      shapedHitTesting: false,
      replacedContentClipping: false,
      fragmentedBoxes: false,
      backdropFilterClipping: false,
      specialHostPainting: false,
    }),
    implementation: Object.freeze({
      status: "IMPLEMENTED",
      scope: "reported paint paths and admitted fallback semantics",
    }),
    oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
    limitations: CORNERFILL_LIMITATIONS,
  });
}

function inlineCarrierSignature(element: CornerfillElement): string {
  return ALL_CARRIERS
    .map((property) => `${property}:${element.style.getPropertyValue(property)}`)
    .join("|");
}

function visibilityAffectingInlineSignature(value: unknown): string {
  return cssDeclarationSignature(value, (property) => (
    property === "visibility" || property === "all"
      || (property.startsWith("--") && property !== LIVE_IMAGE_PROPERTY)
  ));
}

function styleMutationMayAffectVisibility(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return visibilityAffectingInlineSignature(record.oldValue)
    !== visibilityAffectingInlineSignature(target?.getAttribute("style"));
}

function paintAffectingInlineSignature(value: unknown, ignorePositionAxes = false): string {
  return cssDeclarationSignature(value, (property) => {
    if (property === LIVE_IMAGE_PROPERTY
      || property === "visibility"
      || (ignorePositionAxes && property === "background-position-x")
      || (ignorePositionAxes && property === "background-position-y")
      || property === "opacity"
      || property === "filter"
      || property === "will-change"
      || property === "translate"
      || property === "rotate"
      || property === "scale"
      || property === "perspective"
      || property === "perspective-origin") return false;
    return property !== "transform" && !property.startsWith("transform-")
      && property !== "-webkit-transform" && !property.startsWith("-webkit-transform-");
  });
}

function styleMutationMayAffectPaint(record: MutationRecord, ignorePositionAxes = false): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return paintAffectingInlineSignature(record.oldValue, ignorePositionAxes)
    !== paintAffectingInlineSignature(target?.getAttribute("style"), ignorePositionAxes);
}

function nodeContainsStylesheetSource(node: Node): boolean {
  const element = node.nodeType === 1 ? node as Element : null;
  return Boolean(element) && (
    /^(?:style|link)$/u.test(element!.localName)
    || Boolean(element!.querySelector("style,link[rel~=stylesheet]"))
  );
}

function mutationStylesheetRoot(record: MutationRecord): Node | null {
  if (record.type === "characterData") {
    const style = record.target.parentElement;
    return style?.localName === "style" ? style.getRootNode() : null;
  }
  if (record.type === "attributes") {
    const target = record.target as Element;
    return /^(?:style|link)$/u.test(target.localName) ? target.getRootNode() : null;
  }
  const target = record.target as Element;
  if (target.localName === "style"
    || [...record.addedNodes, ...record.removedNodes].some(nodeContainsStylesheetSource)) {
    return target.getRootNode();
  }
  return null;
}

function positionAffectingInlineSignature(value: unknown): string {
  return cssDeclarationSignature(value, (property) => (
    property === "background-position-x" || property === "background-position-y"
  ));
}

function styleMutationMayAffectPosition(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return positionAffectingInlineSignature(record.oldValue)
    !== positionAffectingInlineSignature(target?.getAttribute("style"));
}

function hasShadowIncludingAncestor(ancestors: ReadonlySet<Node>, element: Node): boolean {
  let current: Node | null = element;
  while (current) {
    if (ancestors.has(current)) return true;
    if (current.parentNode) {
      current = current.parentNode;
      continue;
    }
    const root = current.getRootNode?.() as Node & { readonly host?: Element | undefined };
    current = root.host ?? null;
  }
  return false;
}


const ANIMATED_PAINT_PROPERTIES = new Set([
  "background",
  "background-color",
  "background-image",
  "background-position",
  "background-position-x",
  "background-position-y",
  "background-size",
  "background-repeat",
  "background-origin",
  "background-clip",
  "border-color",
  "border-radius",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "box-shadow",
  "outline",
  "outline-color",
  "outline-offset",
  "outline-style",
  "outline-width",
  ...RADIUS_LONGHANDS,
  ...LOGICAL_RADIUS_LONGHANDS,
  "corner-shape",
  ...PHYSICAL_SHAPE_LONGHANDS,
  ...LOGICAL_SHAPE_LONGHANDS,
  "visibility",
  ...ALL_CARRIERS,
]);

interface RuntimeAnimationEvent extends Event {
  readonly animationName: string;
  readonly propertyName: string;
}

interface RuntimeAnimation extends Animation {
  readonly animationName?: string | undefined;
  readonly effect: (AnimationEffect & {
    getKeyframes?: (() => readonly Record<string, unknown>[]) | undefined;
  }) | null;
}

function animationToken(event: RuntimeAnimationEvent): string {
  if (event.type.startsWith("transition")) return `transition:${event.propertyName}`;
  return `animation:${event.animationName}`;
}

function normalizeAnimatedProperty(property: string): string {
  if (property.startsWith("--")) return property;
  return property.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
}

function animationAffectsPaint(entry: RuntimeEntry, event: RuntimeAnimationEvent): boolean {
  if (entry.prepared) return false;
  if (event.type.startsWith("transition")) {
    return ANIMATED_PAINT_PROPERTIES.has(event.propertyName);
  }
  const animations = (entry.element.getAnimations?.() ?? []) as RuntimeAnimation[];
  const matching = animations.filter((animation) => (
    !event.animationName || animation.animationName === event.animationName
  ));
  if (matching.length === 0) return true;
  return matching.some((animation) => {
    const keyframes = animation.effect?.getKeyframes?.();
    if (!keyframes) return true;
    return keyframes.some((keyframe) => (
      Object.keys(keyframe).some((property) => (
        ANIMATED_PAINT_PROPERTIES.has(normalizeAnimatedProperty(property))
      ))
    ));
  });
}

function entryExplanation(entry: RuntimeEntry): Readonly<CornerfillEntryExplanation> {
  const surface = entry.surface;
  const paintResult = entry.paintResult ?? (entry.preparedPaintProgram
    ? explainPreparedOpaqueImage(entry.preparedPaintProgram, entry.positionX, entry.positionY)
    : null);
  return Object.freeze({
    schema: "cornerfill-entry-explanation@2",
    runtime: CORNERFILL_RUNTIME_SCHEMA,
    status: entry.disposed ? "disposed" : entry.error ? "error" : entry.initialized ? "active" : "initializing",
    backend: entry.native ? "native-corner-shape" : surface?.backend ?? "pending",
    paintOwnership: entry.native ? "browser-native" : "host-background-border-and-contained-effects",
    implementationStatus: entry.native ? "NATIVE" : "IMPLEMENTED",
    oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
    ownershipVerified: entry.native ? true : entry.ownershipVerified === true,
    transformOwnedByCornerfill: false,
    paintActive: entry.native ? null : entry.visible,
    limitations: entry.native ? Object.freeze({}) : CORNERFILL_LIMITATIONS,
    lastInvalidationReason: entry.lastInvalidationReason,
    error: entry.error ? `${entry.error.name}: ${entry.error.message}` : null,
    lastError: entry.lastError ? `${entry.lastError.name}: ${entry.lastError.message}` : null,
    geometry: entry.geometry ? Object.freeze({
      width: entry.geometry.width,
      height: entry.geometry.height,
      dpr: entry.geometry.dpr,
      oppositeScale: entry.geometry.oppositeScale,
      shapeParameters: entry.geometry.shapeParameters,
      radii: entry.geometry.radii,
    }) : null,
    paint: paintResult,
    border: entry.border ?? null,
    effects: Object.freeze({
      shadow: entry.shadow ?? null,
      outline: entry.outline ?? null,
    }),
    composition: entry.native
      ? Object.freeze({ originalElement: true, semantics: "browser-native" })
      : entry.composition ?? null,
    surface: surface ? Object.freeze({ id: surface.id, backend: surface.backend, size: surface.size }) : null,
    prepared: entry.prepared ? Object.freeze({
      directUpdates: true,
      observesStyleMutations: false,
      surfaceDeferred: surface === null,
      paintActive: entry.visible,
      backgroundPosition: entry.preparedPaintProgram
        ? Object.freeze([entry.positionX, entry.positionY])
        : null,
      layoutUpdates: "explicit",
    }) : null,
    counters: Object.freeze({
      paints: entry.paintCount,
      styleChecks: entry.styleCheckCount,
    }),
  }) as Readonly<CornerfillEntryExplanation>;
}

class CornerfillController {
  declare readonly document: Document;
  declare readonly view: RuntimeWindow;
  declare readonly options: Readonly<ResolvedCornerfillOptions>;
  declare readonly capabilities: ReturnType<typeof detectCornerfillCapabilities>;
  declare readonly ownership: OwnershipManager<RuntimeEntry>;
  declare readonly ownershipRootCounts: Map<OwnershipRoot, number>;
  declare readonly rootObservers: Map<OwnershipRoot, MutationObserver | null>;
  declare readonly attachmentLifecycleObservers: Map<OwnershipRoot, MutationObserver>;
  declare attachmentLifecycleQueued: boolean;
  declare readonly entries: Set<RuntimeEntry>;
  declare readonly entryByElement: WeakMap<CornerfillElement, RuntimeEntry>;
  declare readonly geometryCache: Map<string, CornerGeometry>;
  declare surfaceCount: number;
  declare surfacePixels: number;
  declare readonly dirty: Set<RuntimeEntry>;
  declare readonly preparedDirty: Set<RuntimeEntry>;
  declare readonly activeAnimations: Map<RuntimeEntry, Set<string>>;
  declare colorValidationContext: CanvasRenderingContext2D | null;
  declare readonly validatedColors: Set<string>;
  declare flushHandle: number | null;
  declare flushRunning: boolean;
  declare destroyed: boolean;
  declare readonly counters: ControllerCounters;
  declare readonly images: ImageCache;
  declare observersInstalled: boolean;
  declare resizeObserver: ResizeObserver | undefined;
  declare animationHandle: number | undefined;
  declare _onWindowResize: (() => void) | undefined;

  constructor(options: Readonly<CornerfillInstallOptions> = {}) {
    this.document = options.document ?? globalThis.document;
    if (!this.document?.defaultView) throw new TypeError("installCornerfill() requires a browser document");
    this.view = this.document.defaultView as RuntimeWindow;
    this.options = Object.freeze({
      forceFallback: options.forceFallback === true,
      staticFallback: options.staticFallback === true,
      backend: options.backend ?? "auto",
      observe: options.observe !== false,
      maxActiveEntries: options.maxActiveEntries ?? 2048,
      maxSurfacePixels: options.maxSurfacePixels ?? 16_777_216,
      maxTotalSurfacePixels: options.maxTotalSurfacePixels ?? 67_108_864,
      maxGeometryCacheEntries: options.maxGeometryCacheEntries ?? 2048,
      maxImageCacheEntries: options.maxImageCacheEntries ?? 32,
      maxImageCachePixels: options.maxImageCachePixels ?? 67_108_864,
      imageTimeoutMs: options.imageTimeoutMs ?? 10_000,
      maxWebkitPoolEntries: options.maxWebkitPoolEntries ?? 256,
      maxWebkitPoolPrefixes: options.maxWebkitPoolPrefixes ?? 16,
      idPrefix: options.idPrefix ?? "cornerfill",
      nonce: options.nonce ?? null,
    });
    if (!Number.isInteger(this.options.maxActiveEntries) || this.options.maxActiveEntries < 1) {
      throw new TypeError("maxActiveEntries must be a positive integer");
    }
    if (!Number.isFinite(this.options.maxTotalSurfacePixels)
      || this.options.maxTotalSurfacePixels < 1) {
      throw new TypeError("maxTotalSurfacePixels must be finite and positive");
    }
    if (!Number.isFinite(this.options.imageTimeoutMs) || this.options.imageTimeoutMs <= 0) {
      throw new TypeError("imageTimeoutMs must be finite and positive");
    }
    this.capabilities = detectCornerfillCapabilities(this.document, {
      nativeQualification: options.nativeQualification,
    });
    this.ownership = new OwnershipManager<RuntimeEntry>(this.document, this.options.nonce);
    this.ownershipRootCounts = new Map();
    this.rootObservers = new Map();
    this.attachmentLifecycleObservers = new Map();
    this.attachmentLifecycleQueued = false;
    this.entries = new Set();
    this.entryByElement = new WeakMap();
    this.geometryCache = new Map();
    this.surfaceCount = 0;
    this.surfacePixels = 0;
    this.dirty = new Set();
    this.preparedDirty = new Set();
    this.activeAnimations = new Map();
    this.colorValidationContext = null;
    this.validatedColors = new Set();
    this.flushHandle = null;
    this.flushRunning = false;
    this.destroyed = false;
    this.counters = {
      attachments: 0,
      detachments: 0,
      nativeEntries: 0,
      fallbackEntries: 0,
      paints: 0,
      geometryBuilds: 0,
      geometryCacheHits: 0,
      surfaceResizes: 0,
      styleChecks: 0,
      ignoredStyleChanges: 0,
      ignoredStyleMutations: 0,
      dynamicPaintUpdates: 0,
      paintOnlyUpdates: 0,
      opaqueFastPaints: 0,
      visibilityUpdates: 0,
      ownershipRepairs: 0,
      imageDecodes: 0,
      imageCacheHits: 0,
      imageCacheEvictions: 0,
      preparedEntries: 0,
      preparedUpdates: 0,
      preparedBatches: 0,
      preparedPaints: 0,
      deferredSurfaceEntries: 0,
      cancelledInitializations: 0,
      staleRefreshes: 0,
      preparedLayoutUpdates: 0,
    };
    this.images = new ImageCache(this.document, {
      onDecode: () => { this.counters.imageDecodes += 1; },
      onHit: () => { this.counters.imageCacheHits += 1; },
      onEvict: () => { this.counters.imageCacheEvictions += 1; },
      maxZeroReferenceEntries: this.options.maxImageCacheEntries,
      maxEstimatedPixels: this.options.maxImageCachePixels,
      timeoutMs: this.options.imageTimeoutMs,
    });
    this._onMutation = this._onMutation.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onAnimationStart = this._onAnimationStart.bind(this);
    this._onAnimationEnd = this._onAnimationEnd.bind(this);
    this._animationTick = this._animationTick.bind(this);
    this.observersInstalled = false;
  }

  _validateExplicitColor(value: string, label: string): void {
    const color = String(value).trim();
    if (!color) throw new SyntaxError(`${label} must be a valid CSS color`);
    if (this.validatedColors.has(color)) return;
    const context = this.colorValidationContext
      ?? this.document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("CSS color validation requires a 2D Canvas context");
    this.colorValidationContext = context;
    context.fillStyle = "#010203";
    context.fillStyle = color;
    const first = String(context.fillStyle);
    context.fillStyle = "#fefdfc";
    context.fillStyle = color;
    const second = String(context.fillStyle);
    if (first !== second) throw new SyntaxError(`invalid ${label}: ${value}`);
    this.validatedColors.add(color);
  }

  _repairEntryOwnership(entry: RuntimeEntry): boolean {
    if (entry.native || entry.disposed || entry.error || !entry.surface || this.ownership.isApplied(entry)) return false;
    this.ownership.apply(entry);
    this.counters.ownershipRepairs += 1;
    entry.lastInvalidationReason = "ownership-repair-without-repaint";
    return true;
  }

  _retainOwnershipRoot(root: OwnershipRoot, observe: boolean): void {
    this.ownershipRootCounts.set(root, (this.ownershipRootCounts.get(root) ?? 0) + 1);
    try {
      if (observe) this._installObservers(root);
    } catch (error) {
      this._releaseOwnershipRoot(root);
      throw error;
    }
  }

  _releaseOwnershipRoot(root: OwnershipRoot): void {
    const next = Math.max(0, (this.ownershipRootCounts.get(root) ?? 1) - 1);
    if (next > 0) {
      this.ownershipRootCounts.set(root, next);
      return;
    }
    this.ownershipRootCounts.delete(root);
    // Keep the document-scoped rule warm for selector-driven detach/reattach.
    // Shadow-root rules are released because their hosts can disappear.
    if (root !== this.document) this.ownership.releaseRoot(root);
    const observer = this.rootObservers.get(root);
    observer?.disconnect();
    this.rootObservers.delete(root);
    const eventRoot = root === this.document ? this.document : root;
    for (const event of ["animationstart", "transitionrun"]) {
      eventRoot?.removeEventListener?.(event, this._onAnimationStart, true);
    }
    for (const event of ["animationend", "animationcancel", "transitionend", "transitioncancel"]) {
      eventRoot?.removeEventListener?.(event, this._onAnimationEnd, true);
    }
    this._updateAttachmentLifecycleObservers();
  }

  _updateAttachmentLifecycleObservers() {
    if (!this.options.observe || !this.view.MutationObserver || this.destroyed) {
      for (const observer of this.attachmentLifecycleObservers.values()) observer.disconnect();
      this.attachmentLifecycleObservers.clear();
      return;
    }
    const desiredRoots = new Set<OwnershipRoot>();
    for (const [ownershipRoot, observer] of this.rootObservers) {
      if (!observer || ownershipRoot === this.document) continue;
      let containingRoot = (ownershipRoot as ShadowRoot).host?.getRootNode?.() as OwnershipRoot | null;
      while (containingRoot) {
        const containingDocument = containingRoot === this.document
          ? this.document
          : containingRoot.ownerDocument;
        if (containingDocument !== this.document
          || (containingRoot !== this.document && !(containingRoot as ShadowRoot).host)) break;
        if (!this.rootObservers.has(containingRoot)) desiredRoots.add(containingRoot);
        if (containingRoot === this.document) break;
        containingRoot = (containingRoot as ShadowRoot).host?.getRootNode?.() as OwnershipRoot | null;
      }
    }
    for (const [root, observer] of this.attachmentLifecycleObservers) {
      if (desiredRoots.has(root)) continue;
      observer.disconnect();
      this.attachmentLifecycleObservers.delete(root);
    }
    for (const root of desiredRoots) {
      if (this.attachmentLifecycleObservers.has(root)) continue;
      const target = root === this.document ? this.document.documentElement : root;
      if (!target) continue;
      const observer = new this.view.MutationObserver(this._onMutation);
      observer.observe(target, {
        attributes: true,
        attributeFilter: ["class", "style"],
        attributeOldValue: true,
        childList: true,
        subtree: true,
      });
      this.attachmentLifecycleObservers.set(root, observer);
    }
  }

  _installObservers(root: OwnershipRoot): void {
    if (!this.options.observe || this.rootObservers.has(root)) return;
    if (this.view.MutationObserver) {
      const mutationObserver = new this.view.MutationObserver(this._onMutation);
      const target = root === this.document ? this.document.documentElement : root;
      if (!target) throw new TypeError("Cornerfill could not observe the attachment root");
      mutationObserver.observe(target, {
        attributes: true,
        attributeFilter: [
          "class",
          "style",
          "data-cornerfill-shape",
          OWNERSHIP_ATTRIBUTE,
          OWNED_BORDER_ATTRIBUTE,
          OWNED_OUTLINE_ATTRIBUTE,
          OWNED_SHADOW_ATTRIBUTE,
          OWNED_SURFACE_ATTRIBUTE,
        ],
        attributeOldValue: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
      this.rootObservers.set(root, mutationObserver);
    }
    if (!this.rootObservers.has(root)) this.rootObservers.set(root, null);
    this._updateAttachmentLifecycleObservers();
    const eventRoot = root === this.document ? this.document : root;
    for (const event of ["animationstart", "transitionrun"]) {
      eventRoot.addEventListener(event, this._onAnimationStart, true);
    }
    for (const event of ["animationend", "animationcancel", "transitionend", "transitioncancel"]) {
      eventRoot.addEventListener(event, this._onAnimationEnd, true);
    }
    if (!this.resizeObserver && this.view.ResizeObserver) this.resizeObserver = new this.view.ResizeObserver(this._onResize);
    if (this.observersInstalled) return;
    this.observersInstalled = true;
    this._onWindowResize = () => {
      for (const entry of this.entries) {
        if (!entry.native && !entry.prepared) this._markDirty(entry, "viewport-or-dpr", true);
      }
    };
    this.view.addEventListener("resize", this._onWindowResize, { passive: true });
  }

  _onMutation(records: readonly MutationRecord[]): void {
    let childListChanged = false;
    const stylesheetRoots = new Set<Node>();
    const styleEntries = new Set<RuntimeEntry>();
    const visibilityStyleEntries = new Set<RuntimeEntry>();
    const paintStyleEntries = new Set<RuntimeEntry>();
    const visibilityAncestors = new Set<Node>();
    const selectorAncestors = new Set<Node>();
    const semanticEntries = new Set<RuntimeEntry>();
    for (const record of records) {
      const stylesheetRoot = mutationStylesheetRoot(record);
      if (stylesheetRoot) stylesheetRoots.add(stylesheetRoot);
      if (record.type === "childList" || record.type === "characterData") {
        if (record.type === "childList") childListChanged = true;
        const target = record.type === "characterData" ? record.target.parentNode : record.target;
        const entry = target?.nodeType === 1
          ? this.entryByElement.get(target as CornerfillElement)
          : undefined;
        if (entry && !entry.native && !entry.prepared && !entry.disposed) semanticEntries.add(entry);
      } else {
        const visibilityInputChanged = record.attributeName === "class"
          || (record.attributeName === "style" && styleMutationMayAffectVisibility(record));
        if (visibilityInputChanged) {
          visibilityAncestors.add(record.target);
        }
        if (record.attributeName === "class"
          || (record.attributeName === "style"
            && (styleMutationMayAffectPaint(record) || visibilityInputChanged))) {
          selectorAncestors.add(record.target);
        }
        const entry = record.target.nodeType === 1
          ? this.entryByElement.get(record.target as CornerfillElement)
          : undefined;
        if (!entry || entry.native || entry.prepared || entry.disposed) continue;
        if (record.attributeName !== "style") {
          if ((record.attributeName === OWNERSHIP_ATTRIBUTE
            || record.attributeName === OWNED_BORDER_ATTRIBUTE
            || record.attributeName === OWNED_OUTLINE_ATTRIBUTE
            || record.attributeName === OWNED_SHADOW_ATTRIBUTE
            || record.attributeName === OWNED_SURFACE_ATTRIBUTE)
            && this.ownership.isApplied(entry)) {
            this.counters.ignoredStyleMutations += 1;
            continue;
          }
          if (record.attributeName === "class") this._updateEntryStyleVisibility(entry);
          this._markDirty(entry, "style-selector-input", true);
          continue;
        }
        const paintInputChanged = styleMutationMayAffectPaint(record, entry.watchPosition);
        const positionInputChanged = styleMutationMayAffectPosition(record);
        if (!visibilityInputChanged && !paintInputChanged && !positionInputChanged) {
          if (entry.initialized && !this.ownership.isApplied(entry)) {
            styleEntries.add(entry);
            continue;
          }
          this.counters.ignoredStyleMutations += 1;
          continue;
        }
        if (visibilityInputChanged) visibilityStyleEntries.add(entry);
        if (paintInputChanged) paintStyleEntries.add(entry);
        styleEntries.add(entry);
      }
    }
    for (const entry of semanticEntries) {
      this._markDirty(entry, "host-content-semantics", true);
    }
    if (stylesheetRoots.size > 0) {
      for (const entry of this.entries) {
        if (entry.native || entry.prepared || entry.disposed
          || !stylesheetRoots.has(entry.ownershipRoot)) continue;
        this._markDirty(entry, "stylesheet-source", true);
      }
    }
    for (const entry of styleEntries) {
      let carrierChanged = false;
      if (entry.watchCarriers) {
        const nextCarrierSignature = inlineCarrierSignature(entry.element);
        carrierChanged = nextCarrierSignature !== entry.inlineCarrierSignature;
        entry.inlineCarrierSignature = nextCarrierSignature;
      }
      const positionChanged = entry.watchPosition && entry.initialized
        ? captureBackgroundPosition(
          entry,
          (callback) => this.ownership.withAuthoredComputedStyle(entry, callback),
        )
        : false;
      if (positionChanged) {
        this.counters.dynamicPaintUpdates += 1;
      }
      const visibilityChanged = visibilityStyleEntries.has(entry)
        ? this._updateEntryStyleVisibility(entry)
        : false;
      const paintInputChanged = paintStyleEntries.has(entry);
      const nextVisible = entry.visible;
      const ownershipDamaged = entry.initialized && !this.ownership.isApplied(entry);
      if (positionChanged && !entry.visible) entry.needsPaint = true;
      if (carrierChanged || ownershipDamaged || paintInputChanged || (positionChanged && entry.visible)
        || (visibilityChanged && nextVisible)) {
        this._markDirty(
          entry,
          positionChanged ? "background-position" : visibilityChanged ? "visibility" : "style",
          carrierChanged || ownershipDamaged || paintInputChanged,
        );
      } else {
        this.counters.ignoredStyleMutations += 1;
      }
    }
    if (visibilityAncestors.size > 0) {
      for (const entry of this.entries) {
        if (entry.native || entry.prepared || entry.disposed
          || visibilityAncestors.has(entry.element)) continue;
        const inheritedVisibilityMayHaveChanged = hasShadowIncludingAncestor(
          visibilityAncestors,
          entry.element,
        );
        if (!inheritedVisibilityMayHaveChanged) continue;
        const visibilityChanged = this._updateEntryStyleVisibility(entry);
        if (visibilityChanged && entry.visible) this._markDirty(entry, "visibility", true);
      }
    }
    if (selectorAncestors.size > 0) {
      for (const entry of this.entries) {
        if (entry.native || entry.prepared || entry.disposed
          || selectorAncestors.has(entry.element)) continue;
        const selectorInputMayHaveChanged = hasShadowIncludingAncestor(
          selectorAncestors,
          entry.element,
        );
        if (selectorInputMayHaveChanged) {
          this._markDirty(entry, "ancestor-style-selector-input", true);
        }
      }
    }
    if (childListChanged) {
      this._queueAttachmentLifecycleCheck();
    }
  }

  _updateEntryStyleVisibility(
    entry: RuntimeEntry,
    computed: Pick<CSSStyleDeclaration, "visibility"> | null = null,
  ): boolean {
    const nextStyleVisible = (computed ?? this.view.getComputedStyle(entry.element)).visibility !== "hidden";
    const nextVisible = entry.requestedVisible && nextStyleVisible;
    const changed = nextVisible !== entry.visible;
    entry.styleVisible = nextStyleVisible;
    if (!changed) return false;
    entry.visible = nextVisible;
    if (nextVisible) entry.needsPaint = true;
    this.counters.visibilityUpdates += 1;
    return true;
  }

  _reconcileEntryOwnershipRoot(entry: RuntimeEntry): boolean {
    if (entry.native || entry.disposed) return false;
    if (entry.element.ownerDocument !== this.document) {
      throw new Error(
        "Cornerfill cannot migrate an attached element to another document; dispose it and attach it with that document's controller",
      );
    }
    const nextRoot = entry.element.getRootNode() as OwnershipRoot;
    if (nextRoot === entry.ownershipRoot) return false;
    const previousRoot = entry.ownershipRoot;
    this._retainOwnershipRoot(nextRoot, !entry.prepared);
    entry.ownershipRoot = nextRoot;
    try {
      this.ownership.apply(entry);
    } catch (error) {
      entry.ownershipRoot = previousRoot;
      this._releaseOwnershipRoot(nextRoot);
      throw error;
    }
    this._releaseOwnershipRoot(previousRoot);
    this.counters.ownershipRepairs += 1;
    entry.lastInvalidationReason = "attachment-root-migration";
    return true;
  }

  _queueAttachmentLifecycleCheck() {
    if (this.attachmentLifecycleQueued || this.destroyed) return;
    this.attachmentLifecycleQueued = true;
    queueMicrotask(() => {
      this.attachmentLifecycleQueued = false;
      if (this.destroyed) return;
      this._updateAttachmentLifecycleObservers();
      for (const entry of [...this.entries]) {
        if (entry.native || entry.prepared || entry.disposed) continue;
        if (!entry.element.isConnected) {
          this.detach(entry.element);
          continue;
        }
        try {
          const rootChanged = this._reconcileEntryOwnershipRoot(entry);
          const visibilityChanged = this._updateEntryStyleVisibility(entry);
          const ownershipRepaired = !rootChanged && this._repairEntryOwnership(entry);
          if (rootChanged || (visibilityChanged && entry.visible)) {
            this._markDirty(entry, rootChanged ? "attachment-root-migration" : "visibility", true);
          } else if (ownershipRepaired) entry.lastInvalidationReason = "ownership-repair-without-repaint";
        } catch (error) {
          this._recordError(entry, error);
          entry.lastInvalidationReason = "attachment-root-migration-error";
          let reported = error;
          try {
            this.detach(entry.element);
          } catch (cleanupError) {
            reported = new AggregateError([error, cleanupError], "Cornerfill attachment migration failed");
          }
          if (typeof this.view.reportError === "function") this.view.reportError(reported);
          else queueMicrotask(() => { throw reported; });
        }
      }
    });
  }

  _onResize(records: readonly ResizeObserverEntry[]): void {
    for (const record of records) {
      const entry = this.entryByElement.get(record.target as CornerfillElement);
      if (entry && !entry.native && !entry.prepared && !entry.disposed) {
        this._markDirty(entry, "resize", true);
      }
    }
  }

  _onAnimationStart(event: Event): void {
    const runtimeEvent = event as RuntimeAnimationEvent;
    const entry = this.entryByElement.get(runtimeEvent.target as CornerfillElement);
    if (!entry || entry.native || entry.prepared || entry.disposed
      || !animationAffectsPaint(entry, runtimeEvent)) return;
    let tokens = this.activeAnimations.get(entry);
    if (!tokens) {
      tokens = new Set();
      this.activeAnimations.set(entry, tokens);
    }
    tokens.add(animationToken(runtimeEvent));
    if (this.animationHandle === undefined) this.animationHandle = this.view.requestAnimationFrame(this._animationTick);
  }

  _onAnimationEnd(event: Event): void {
    const runtimeEvent = event as RuntimeAnimationEvent;
    const entry = this.entryByElement.get(runtimeEvent.target as CornerfillElement);
    if (!entry) return;
    const tokens = this.activeAnimations.get(entry);
    if (!tokens?.delete(animationToken(runtimeEvent))) return;
    if (tokens.size === 0) this.activeAnimations.delete(entry);
    if (!entry.native && !entry.prepared && !entry.disposed) {
      this._markDirty(entry, "animation-final", true);
    }
  }

  _animationTick(): void {
    this.animationHandle = undefined;
    for (const entry of this.activeAnimations.keys()) {
      if (!entry.disposed && entry.visible) this._markDirty(entry, "animation-sample", true);
    }
    if (this.activeAnimations.size > 0) {
      this.animationHandle = this.view.requestAnimationFrame(this._animationTick);
    }
  }

  _entryIsCurrent(entry: RuntimeEntry, revision: number | null = null): boolean {
    return !this.destroyed
      && !entry.disposed
      && this.entryByElement.get(entry.element) === entry
      && entry.elementOwnerRegistry?.get(entry.element) === entry
      && (revision === null || entry.revision === revision);
  }

  _assertEntryCurrent(entry: RuntimeEntry, revision: number | null = null): void {
    if (!this._entryIsCurrent(entry, revision)) throw new StaleEntryWorkError();
  }

  _recordError(entry: RuntimeEntry, error: unknown): void {
    const recorded = errorFrom(error);
    entry.error = recorded;
    entry.lastError = recorded;
  }

  _clearError(entry: RuntimeEntry): void {
    entry.error = null;
  }

  _failInitialization(entry: RuntimeEntry, error: unknown): never {
    this._recordError(entry, error);
    this.ownership.remove(entry);
    restoreOwnershipState(entry.element, entry.ownershipSnapshot);
    entry.imageLease?.release();
    entry.imageLease = null;
    releaseLayerImageLeases(entry);
    entry.resolvedImage = null;
    throw error;
  }

  _settleWaiters(entry: RuntimeEntry, revision: number, error: unknown = null): void {
    if (!entry.waiters) return;
    const pending: EntryWaiter[] = [];
    for (const waiter of entry.waiters) {
      if (waiter.revision > revision) {
        pending.push(waiter);
        continue;
      }
      if (error) waiter.reject(error);
      else waiter.resolve(entryExplanation(entry));
    }
    entry.waiters = pending.length > 0 ? pending : null;
  }

  _markDirty(entry: RuntimeEntry, reason: string, needsFullRefresh: boolean): number {
    if (entry.disposed) return entry.revision;
    entry.revision += 1;
    entry.pendingReason = reason;
    if (needsFullRefresh) entry.fullRefreshPending = true;
    this.dirty.add(entry);
    if (this.flushHandle === null && !this.flushRunning) {
      this.flushHandle = this.view.requestAnimationFrame(() => this._flush());
    }
    return entry.revision;
  }

  _scheduleAndWait(
    entry: RuntimeEntry,
    reason: string,
    needsFullRefresh: boolean,
  ): Promise<CornerfillEntryExplanation> {
    if (entry.disposed) return Promise.resolve(entryExplanation(entry));
    const revision = this._markDirty(entry, reason, needsFullRefresh);
    return new Promise((resolve, reject) => (
      (entry.waiters ??= []).push({ resolve, reject, revision })
    ));
  }

  async _flush() {
    if (this.flushRunning || this.destroyed) return;
    this.flushHandle = null;
    this.flushRunning = true;
    const entries = [...this.dirty];
    this.dirty.clear();
    try {
      for (const entry of entries) {
        if (entry.disposed) continue;
        const revision = entry.revision;
        try {
          if (!entry.initialized && entry.ready) await entry.ready;
          if (!this._entryIsCurrent(entry)) continue;
          if (revision > entry.committedRevision) {
            await this._refreshEntry(entry, revision);
            this._assertEntryCurrent(entry, revision);
            entry.committedRevision = revision;
          }
          this._clearError(entry);
          this._settleWaiters(entry, revision);
        } catch (error) {
          if (error instanceof StaleEntryWorkError) {
            this.counters.staleRefreshes += 1;
            if (this._entryIsCurrent(entry)) this.dirty.add(entry);
            continue;
          }
          this._recordError(entry, error);
          this.ownership.remove(entry);
          restoreOwnershipState(entry.element, entry.ownershipSnapshot);
          entry.ownershipVerified = false;
          this._settleWaiters(entry, revision, error);
        }
      }
    } finally {
      this.flushRunning = false;
    }
    if (!this.destroyed && this.dirty.size > 0 && this.flushHandle === null) {
      this.flushHandle = this.view.requestAnimationFrame(() => this._flush());
    }
  }

  _geometry(
    width: number,
    height: number,
    dpr: number,
    radii: Four<Radius>,
    shapes: Four<number>,
  ): Readonly<{ geometry: CornerGeometry; key: string }> {
    const key = geometryKey(width, height, dpr, radii, shapes);
    let geometry = this.geometryCache.get(key);
    if (geometry) {
      this.counters.geometryCacheHits += 1;
      this.geometryCache.delete(key);
      this.geometryCache.set(key, geometry);
      return { key, geometry };
    }
    geometry = buildCornerGeometry({
      width,
      height,
      borderRadius: radii,
      cornerShape: shapes,
      dpr,
      tolerance: 0.125 / Math.max(1, dpr),
    });
    this.geometryCache.set(key, geometry);
    this.counters.geometryBuilds += 1;
    if (this.geometryCache.size > this.options.maxGeometryCacheEntries) {
      const oldestKey = this.geometryCache.keys().next().value;
      if (oldestKey !== undefined) this.geometryCache.delete(oldestKey);
    }
    return { key, geometry };
  }

  async _resolvePaintTransaction(
    entry: RuntimeEntry,
    descriptor: NormalizedPaintDescriptor,
    width: number,
    height: number,
    revision: number | null = null,
    boxMetrics: Readonly<BackgroundBoxMetricsInput> | undefined = descriptor.box,
  ): Promise<Readonly<PaintLeaseTransaction>> {
    const acquired = new Set<Readonly<ImageLease>>();
    let desiredImageLease: Readonly<ImageLease> | null = null;
    let desiredImageLeaseUrl: string | null = null;
    const desiredLayerLeases = new Map<string, Readonly<ImageLease>>();
    let desiredResolvedImage: CornerfillRasterSource | null = null;
    let settled = false;

    const trackAcquired = (lease: Readonly<ImageLease>): void => {
      acquired.add(lease);
      (entry.pendingImageLeases ??= new Set()).add(lease);
    };

    const rollback = () => {
      if (settled) return;
      settled = true;
      for (const lease of acquired) {
        entry.pendingImageLeases?.delete(lease);
        lease.release();
      }
      if (entry.pendingImageLeases?.size === 0) entry.pendingImageLeases = null;
      acquired.clear();
    };
    const discardRejectedLease = (lease: Readonly<ImageLease>, identity: string): void => {
      if (entry.imageLease === lease) {
        entry.imageLease.release();
        entry.imageLease = null;
        entry.imageLeaseUrl = null;
      }
      if (entry.layerImageLeases?.get(identity) === lease) {
        lease.release();
        entry.layerImageLeases.delete(identity);
        if (entry.layerImageLeases.size === 0) entry.layerImageLeases = null;
      }
    };
    let paint: ResolvedPaintDescriptor;
    try {
      if (descriptor.kind === "layers") {
        const layers: NormalizedBackgroundLayer[] = [];
        for (const layer of descriptor.layers) {
          if (layer.kind !== "image" || layer.image) {
            layers.push(layer);
            continue;
          }
          const request = imageRequest(this.document, layer);
          let lease = desiredLayerLeases.get(request.identity)
            ?? entry.layerImageLeases?.get(request.identity)
            ?? (entry.imageLeaseUrl === request.identity ? entry.imageLease : null);
          if (!lease) {
            lease = this.images.acquire(request.absoluteUrl, { crossOrigin: request.crossOrigin });
            trackAcquired(lease);
          }
          desiredLayerLeases.set(request.identity, lease);
          let image: CornerfillRasterSource;
          try {
            image = await lease.promise;
          } catch (error) {
            discardRejectedLease(lease, request.identity);
            if (!this._entryIsCurrent(entry, revision)) throw new StaleEntryWorkError();
            throw error;
          }
          this._assertEntryCurrent(entry, revision);
          layers.push(Object.freeze({ ...layer, image }));
        }
        paint = resolvePaintForBox(
          Object.freeze({ ...descriptor, layers: Object.freeze(layers) }),
          width,
          height,
          undefined,
          boxMetrics,
        );
      } else if (descriptor.kind === "image") {
        let image: CornerfillRasterSource | undefined = descriptor.image;
        if (!image) {
          const request = imageRequest(this.document, descriptor);
          desiredImageLeaseUrl = request.identity;
          let lease = entry.imageLeaseUrl === request.identity
            ? entry.imageLease
            : entry.layerImageLeases?.get(request.identity) ?? null;
          if (!lease) {
            lease = this.images.acquire(request.absoluteUrl, { crossOrigin: request.crossOrigin });
            trackAcquired(lease);
          }
          desiredImageLease = lease;
          try {
            image = await lease.promise;
          } catch (error) {
            discardRejectedLease(lease, request.identity);
            if (!this._entryIsCurrent(entry, revision)) throw new StaleEntryWorkError();
            throw error;
          }
          this._assertEntryCurrent(entry, revision);
        }
        desiredResolvedImage = image;
        paint = resolvePaintForBox(descriptor, width, height, image, boxMetrics);
      } else {
        paint = resolvePaintForBox(descriptor, width, height, undefined, boxMetrics);
      }
      this._assertEntryCurrent(entry, revision);
    } catch (error) {
      rollback();
      throw error;
    }

    const retained = new Set<Readonly<ImageLease>>([
      ...(desiredImageLease ? [desiredImageLease] : []),
      ...desiredLayerLeases.values(),
    ]);
    const commit = () => {
      if (settled) return;
      settled = true;
      if (entry.imageLease && !retained.has(entry.imageLease)) entry.imageLease.release();
      for (const lease of entry.layerImageLeases?.values() ?? []) {
        if (!retained.has(lease)) lease.release();
      }
      entry.imageLease = desiredImageLease;
      entry.imageLeaseUrl = desiredImageLeaseUrl;
      entry.layerImageLeases = desiredLayerLeases.size > 0 ? desiredLayerLeases : null;
      entry.resolvedImage = desiredResolvedImage;
      for (const lease of acquired) entry.pendingImageLeases?.delete(lease);
      if (entry.pendingImageLeases?.size === 0) entry.pendingImageLeases = null;
      acquired.clear();
    };
    return Object.freeze({ paint, commit, rollback });
  }

  async _snapshot(
    entry: RuntimeEntry,
    revision: number | null = null,
  ): Promise<Readonly<DynamicSnapshot>> {
    const authored = this.ownership.withAuthoredComputedStyle(entry, (computed) => {
      const composition = inspectFallbackHost(this.view, entry.element, computed);
      const size = measureBorderBox(entry.element, computed);
      return Object.freeze({
        computed: Object.freeze({ visibility: computed.visibility }),
        composition,
        size,
        sources: currentSources(entry, computed),
        flow: flowFromComputed(computed),
        boxMetrics: backgroundBoxMetrics(computed),
      });
    });
    const { width, height } = authored.size;
    const dpr = this.view.devicePixelRatio || 1;
    const { sources, flow, boxMetrics } = authored;
    const radii = resolveRadiusSource(sources.radiusSource, width, height, flow);
    const shapes = resolveCornerShape(sources.shapeSource, flow);
    const { key: nextGeometryKey, geometry } = this._geometry(width, height, dpr, radii, shapes);
    const descriptor = normalizePaintDescriptor(sources.paintSource);
    const descriptorKey = paintDescriptorKey(descriptor);
    const nextPaintKey = `${width}|${height}|${descriptorKey}|${JSON.stringify(boxMetrics)}`;
    const border = sources.borderSource;
    const nextBorderKey = border ? JSON.stringify(border) : "none";
    const shadow = sources.shadowSource;
    const outline = sources.outlineSource;
    assertOutlineHost(this.view, entry.element, outline);
    const nextEffectsKey = JSON.stringify([shadow, outline]);
    const paintLeases = await this._resolvePaintTransaction(
      entry,
      descriptor,
      width,
      height,
      revision,
      boxMetrics,
    );
    try {
      this._assertEntryCurrent(entry, revision);
      return Object.freeze({
        computed: authored.computed,
        width,
        height,
        dpr,
        geometry,
        geometryKey: nextGeometryKey,
        paint: paintLeases.paint,
        paintLeases,
        paintSource: sources.paintSource,
        paintKey: nextPaintKey,
        border,
        borderKey: nextBorderKey,
        shadow,
        outline,
        effectsKey: nextEffectsKey,
        boxMetrics,
        composition: authored.composition,
      });
    } catch (error) {
      paintLeases.rollback();
      throw error;
    }
  }

  async _initializeEntry(entry: RuntimeEntry): Promise<CornerfillEntryExplanation> {
    while (this._entryIsCurrent(entry)) {
      const revision = entry.revision;
      let snapshot: Readonly<DynamicSnapshot> | null = null;
      try {
        snapshot = await this._snapshot(entry, revision);
        this._assertEntryCurrent(entry, revision);
        this._assertSurfaceBudget(snapshot.width, snapshot.height, snapshot.dpr, entry);
        const surface = this._createSurface(snapshot.width, snapshot.height, snapshot.dpr);
        if (!this._entryIsCurrent(entry, revision)) {
          surface.dispose();
          throw new StaleEntryWorkError();
        }
        this._setSurface(entry, surface);
        applyDynamicSnapshot(entry, snapshot);
        entry.paintResult = paintCornerfill(surface.context, {
          geometry: snapshot.geometry,
          paint: snapshot.paint,
          border: snapshot.border,
          shadow: snapshot.shadow,
          outline: snapshot.outline,
          dpr: snapshot.dpr,
        });
        surface.commit();
        this._assertEntryCurrent(entry, revision);
        this.ownership.apply(entry);
        entry.paintCount += 1;
        this.counters.paints += 1;
        entry.initialized = true;
        entry.committedRevision = revision;
        this._clearError(entry);
        entry.lastInvalidationReason = "initial-paint";
        this.resizeObserver?.observe(entry.element);
        snapshot.paintLeases.commit();
        return entryExplanation(entry);
      } catch (error) {
        snapshot?.paintLeases.rollback();
        this._disposeSurface(entry);
        if (error instanceof StaleEntryWorkError) {
          if (this._entryIsCurrent(entry)) {
            this.counters.staleRefreshes += 1;
            continue;
          }
          this.counters.cancelledInitializations += 1;
          return entryExplanation(entry);
        }
        this._failInitialization(entry, error);
      }
    }
    this.counters.cancelledInitializations += 1;
    return entryExplanation(entry);
  }

  _refreshDynamicPaint(entry: RuntimeEntry, reason: string | null): boolean {
    const position = entry.dynamicBackgroundPositionSpec;
    const surface = entry.surface;
    const geometry = entry.geometry;
    if (entry.dynamicPaintSource.kind !== "image" || !position) {
      throw new TypeError("paint-only refresh requires a positioned raster descriptor");
    }
    if (!surface || !geometry) throw new Error("paint-only refresh requires an initialized surface and geometry");
    const paintSource = Object.freeze({
      ...entry.dynamicPaintSource,
      backgroundPositionSpec: position,
      image: entry.resolvedImage,
    });
    const descriptor = normalizePaintDescriptor(paintSource);
    const descriptorKey = paintDescriptorKey(descriptor);
    const nextPaintKey = `${entry.width}|${entry.height}|${descriptorKey}|${JSON.stringify(entry.boxMetrics)}`;
    const paintChanged = nextPaintKey !== entry.paintKey;
    if (!paintChanged && !entry.needsPaint) {
      this.counters.ignoredStyleChanges += 1;
      entry.lastInvalidationReason = "dynamic-position-without-paint-input-change";
      return true;
    }
    entry.paintKey = nextPaintKey;
    if (!entry.visible) {
      entry.needsPaint = true;
      entry.lastInvalidationReason = "hidden-paint-deferred";
      return true;
    }
    if (!entry.resolvedImage) throw new Error("decoded raster is unavailable for paint-only update");
    const paint = resolvePaintForBox(
      descriptor,
      entry.width,
      entry.height,
      entry.resolvedImage,
      entry.boxMetrics ?? undefined,
    );
    const fastPaint = repaintOpaqueCornerfill(surface.context, {
      geometry,
      paint,
      border: entry.border,
      shadow: entry.shadow,
      outline: entry.outline,
      dpr: entry.dpr,
    });
    entry.paintResult = fastPaint ?? paintCornerfill(surface.context, {
      geometry,
      paint,
      border: entry.border,
      shadow: entry.shadow,
      outline: entry.outline,
      dpr: entry.dpr,
    });
    if (fastPaint) {
      this.counters.opaqueFastPaints += 1;
    }
    surface.commit();
    if (surface.backend === "static-data-url") this.ownership.apply(entry);
    entry.paintCount += 1;
    this.counters.paints += 1;
    this.counters.paintOnlyUpdates += 1;
    entry.needsPaint = false;
    entry.lastInvalidationReason = reason || "dynamic-background-position";
    this._clearError(entry);
    return true;
  }

  _refreshEntry(entry: RuntimeEntry, revision: number): boolean | Promise<boolean> {
    const reason = entry.pendingReason;
    const initial = entry.initial;
    const state = entry.state;
    if (!initial || !state) throw new TypeError("refresh requires a dynamic Cornerfill entry");
    const rootChanged = this._reconcileEntryOwnershipRoot(entry);
    const needsFullRefresh = entry.fullRefreshPending || rootChanged;
    entry.pendingReason = null;
    entry.fullRefreshPending = false;
    const dynamicPaintOnly = canRefreshDynamicPaint({
      explicitPaint: state.paint !== undefined,
      fullRefresh: needsFullRefresh,
      paintKind: entry.dynamicPaintSource.kind,
      paintPosition: initial.dynamic.paintPosition,
      reason,
    });
    if (dynamicPaintOnly) {
      return this._refreshDynamicPaint(entry, reason);
    }
    return this._refreshEntryFull(entry, reason, revision);
  }

  async _refreshEntryFull(entry: RuntimeEntry, reason: string | null, revision: number): Promise<boolean> {
    this.counters.styleChecks += 1;
    entry.styleCheckCount += 1;
    const snapshot = await this._snapshot(entry, revision);
    try {
      this._assertEntryCurrent(entry, revision);
      const surface = entry.surface;
      if (!surface) throw new Error("full refresh requires an initialized surface");
      this._updateEntryStyleVisibility(entry, snapshot.computed);
      const geometryChanged = snapshot.geometryKey !== entry.geometryKey;
      const paintChanged = snapshot.paintKey !== entry.paintKey;
      const borderChanged = snapshot.borderKey !== entry.borderKey;
      const effectsChanged = snapshot.effectsKey !== entry.effectsKey;
      const resized = this._resizeSurface(entry, snapshot.width, snapshot.height, snapshot.dpr);
      if (resized) this.counters.surfaceResizes += 1;
      const needsPaint = geometryChanged || paintChanged || borderChanged || effectsChanged
        || resized || entry.needsPaint;
      applyDynamicSnapshot(entry, snapshot);
      if (needsPaint && entry.visible) {
        entry.paintResult = paintCornerfill(surface.context, {
          geometry: snapshot.geometry,
          paint: snapshot.paint,
          border: snapshot.border,
          shadow: snapshot.shadow,
          outline: snapshot.outline,
          dpr: snapshot.dpr,
        });
        surface.commit();
        this.ownership.apply(entry);
        entry.paintCount += 1;
        this.counters.paints += 1;
        entry.needsPaint = false;
        entry.lastInvalidationReason = reason || "direct-update";
      } else if (needsPaint) {
        entry.needsPaint = true;
        entry.lastInvalidationReason = "hidden-paint-deferred";
      } else if (!this.ownership.isApplied(entry)) {
        this.ownership.apply(entry);
        this.counters.ownershipRepairs += 1;
        entry.lastInvalidationReason = "ownership-repair-without-repaint";
      } else {
        this.ownership.assertStylesApplied(entry);
        this.counters.ignoredStyleChanges += 1;
        entry.lastInvalidationReason = "style-change-without-paint-input-change";
      }
      snapshot.paintLeases.commit();
      this._clearError(entry);
      return true;
    } catch (error) {
      snapshot.paintLeases.rollback();
      throw error;
    }
  }

  _assertFallbackEntryBudget(): void {
    if (this.counters.fallbackEntries >= this.options.maxActiveEntries) {
      throw new RangeError(
        `active fallback entry budget ${this.options.maxActiveEntries} is exhausted`,
      );
    }
  }

  _assertSurfaceBudget(
    width: number,
    height: number,
    dpr: number,
    replaced: RuntimeEntry | null = null,
  ): void {
    const backingWidth = Math.max(1, Math.ceil(width * dpr));
    const backingHeight = Math.max(1, Math.ceil(height * dpr));
    const retained = this.surfacePixels - this._surfacePixels(replaced?.surface ?? null);
    const requested = backingWidth * backingHeight;
    if (retained + requested > this.options.maxTotalSurfacePixels) {
      throw new RangeError(
        `aggregate surface allocation ${retained + requested} exceeds ${this.options.maxTotalSurfacePixels} pixels`,
      );
    }
  }

  _surfacePixels(surface: CornerfillSurface | null): number {
    return surface ? surface.size.backingWidth * surface.size.backingHeight : 0;
  }

  _setSurface(entry: RuntimeEntry, surface: CornerfillSurface | null): void {
    const previous = entry.surface;
    if (previous === surface) return;
    if (previous) {
      this.surfaceCount -= 1;
      this.surfacePixels -= this._surfacePixels(previous);
    }
    entry.surface = surface;
    if (surface) {
      this.surfaceCount += 1;
      this.surfacePixels += this._surfacePixels(surface);
    }
  }

  _resizeSurface(entry: RuntimeEntry, width: number, height: number, dpr: number): boolean {
    const surface = entry.surface;
    if (!surface) throw new Error("cannot resize an unavailable Cornerfill surface");
    this._assertSurfaceBudget(width, height, dpr, entry);
    const previousPixels = this._surfacePixels(surface);
    const resized = surface.resize(width, height, dpr);
    if (resized) this.surfacePixels += this._surfacePixels(surface) - previousPixels;
    return resized;
  }

  _disposeSurface(entry: RuntimeEntry): void {
    const surface = entry.surface;
    this._setSurface(entry, null);
    surface?.dispose();
  }

  _selectedFallbackBackend(): ConcreteSurfaceBackend | "none" {
    if (this.options.backend !== "auto") return this.options.backend;
    if (this.capabilities.surfaces.webkitCanvas) return "webkit-canvas";
    if (this.capabilities.surfaces.mozElement) return "moz-element";
    if (this.options.staticFallback) return "static-data-url";
    return "none";
  }

  _createSurface(
    width: number,
    height: number,
    dpr: number,
    backend: SurfaceBackend = this.options.backend,
  ): CornerfillSurface {
    return createSurface(this.document, {
      cssWidth: width,
      cssHeight: height,
      dpr,
      allowStatic: this.options.staticFallback,
      backend,
      idPrefix: this.options.idPrefix,
      maxSurfacePixels: this.options.maxSurfacePixels,
      maxWebkitPoolEntries: this.options.maxWebkitPoolEntries,
      maxWebkitPoolPrefixes: this.options.maxWebkitPoolPrefixes,
    });
  }

  _createPreparedSurface(entry: RuntimeEntry, verifyOwnership = true): boolean {
    if (entry.surface) return false;
    const backend = entry.backend;
    if (!backend) throw new Error("prepared surface backend is unavailable");
    this._assertSurfaceBudget(entry.width, entry.height, entry.dpr, entry);
    this._setSurface(entry, this._createSurface(entry.width, entry.height, entry.dpr, backend));
    try {
      this._paintPreparedFull(entry, verifyOwnership);
    } catch (error) {
      this._disposeSurface(entry);
      throw error;
    }
    if (entry.surfaceWasDeferred) {
      entry.surfaceWasDeferred = false;
      this.counters.deferredSurfaceEntries -= 1;
    }
    return true;
  }

  _paintPreparedFull(entry: RuntimeEntry, verifyOwnership = true): void {
    const surface = entry.surface;
    const geometry = entry.geometry;
    const resolvedPaint = entry.preparedResolvedPaint;
    if (!surface || !geometry || !resolvedPaint) {
      throw new Error("prepared paint requires an initialized surface, geometry, and paint");
    }
    const paint: ResolvedPaintDescriptor = resolvedPaint.kind === "image"
      ? Object.freeze({
        ...resolvedPaint,
        backgroundPosition: Object.freeze([entry.positionX, entry.positionY]) as PixelPair,
      })
      : resolvedPaint;
    entry.paintResult = paintCornerfill(surface.context, {
      geometry,
      paint,
      border: entry.border,
      shadow: entry.shadow,
      outline: entry.outline,
      dpr: entry.dpr,
    });
    if (entry.preparedPaintProgram) {
      preparePreparedOpaqueImageContext(surface.context, entry.preparedPaintProgram);
    }
    surface.commit();
    this.ownership.apply(entry, verifyOwnership);
    this._clearError(entry);
    entry.needsPaint = false;
    entry.paintCount += 1;
    this.counters.paints += 1;
    this.counters.preparedPaints += 1;
    entry.needsFullPreparedPaint = false;
  }

  _paintPreparedEntry(entry: RuntimeEntry): void {
    if (entry.disposed || !entry.initialized) return;
    this._reconcileEntryOwnershipRoot(entry);
    if (!entry.visible) return;
    if (this._createPreparedSurface(entry)) {
      entry.lastInvalidationReason = "prepared-first-visible-paint";
      return;
    }
    if (!entry.needsPaint) return;
    const surface = entry.surface;
    if (!surface) throw new Error("prepared update requires an initialized surface");
    if (entry.needsFullPreparedPaint) {
      if (this._resizeSurface(entry, entry.width, entry.height, entry.dpr)) {
        this.counters.surfaceResizes += 1;
      }
      this._paintPreparedFull(entry);
      entry.lastInvalidationReason = "prepared-layout-repaint";
      return;
    }
    if (!entry.preparedPaintProgram) {
      throw new TypeError("this prepared entry has no allocation-free opaque raster update program");
    }
    drawPreparedOpaqueImage(
      surface.context,
      entry.preparedPaintProgram,
      entry.positionX,
      entry.positionY,
    );
    surface.commit();
    if (surface.backend === "static-data-url" || !this.ownership.isApplied(entry)) {
      this.ownership.apply(entry);
    }
    entry.paintResult = null;
    entry.needsPaint = false;
    entry.paintCount += 1;
    this.counters.paints += 1;
    this.counters.paintOnlyUpdates += 1;
    this.counters.opaqueFastPaints += 1;
    this.counters.preparedPaints += 1;
    entry.lastInvalidationReason = "prepared-background-position";
    this._clearError(entry);
  }

  _queuePrepared(entry: RuntimeEntry): void {
    if (!entry.initialized || !entry.visible) {
      entry.needsPaint = true;
      return;
    }
    this.preparedDirty.add(entry);
  }

  _flushPrepared(throwOnError = false): number {
    if (this.preparedDirty.size === 0) return 0;
    const entries = [...this.preparedDirty];
    this.preparedDirty.clear();
    let painted = 0;
    let firstError = null;
    for (const entry of entries) {
      const before = entry.paintCount;
      try {
        this._paintPreparedEntry(entry);
      } catch (error) {
        this._recordError(entry, error);
        firstError ??= error;
      }
      painted += entry.paintCount - before;
    }
    if (firstError) {
      if (throwOnError) throw firstError;
      if (typeof this.view.reportError === "function") this.view.reportError(firstError);
      else queueMicrotask(() => { throw firstError; });
    }
    return painted;
  }

  _setPreparedBackgroundPosition(
    entry: RuntimeEntry,
    x: number,
    y: number,
  ): boolean {
    if (!entry.prepared) throw new TypeError("element is not attached through attachPrepared()");
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("prepared background position must contain two finite pixels");
    }
    if (!entry.preparedPaintProgram) {
      throw new TypeError("prepared background-position updates require an opaque no-border raster paint");
    }
    validatePreparedOpaqueImagePosition(entry.preparedPaintProgram, x, y);
    if (entry.positionX === x && entry.positionY === y) return false;
    entry.positionX = x;
    entry.positionY = y;
    entry.paintResult = null;
    entry.needsPaint = true;
    this.counters.dynamicPaintUpdates += 1;
    this.counters.preparedUpdates += 1;
    this._queuePrepared(entry);
    return true;
  }

  _setPreparedVisibility(entry: RuntimeEntry, visible: boolean): boolean {
    if (!entry.prepared) throw new TypeError("element is not attached through attachPrepared()");
    const next = Boolean(visible);
    if (entry.visible === next) return false;
    entry.visible = next;
    entry.requestedVisible = next;
    this.counters.visibilityUpdates += 1;
    this.counters.preparedUpdates += 1;
    if (!next) {
      this.preparedDirty.delete(entry);
      return true;
    }
    this._queuePrepared(entry);
    return true;
  }

  updatePreparedBatch(updates: readonly CornerfillPreparedUpdate[]): number {
    if (!Array.isArray(updates)) throw new TypeError("prepared batch must be an array");
    const candidates = new Map();
    for (const update of updates) {
      const entry = this.entryByElement.get(update?.element);
      if (!entry || entry.disposed || !entry.prepared) {
        throw new Error("prepared batch contains an element that is not attached");
      }
      let candidate = candidates.get(entry);
      if (!candidate) {
        candidate = {
          entry,
          positionX: entry.positionX,
          positionY: entry.positionY,
          visible: entry.visible,
          positionSpecified: false,
        };
        candidates.set(entry, candidate);
      }
      if (update.backgroundPosition !== undefined) {
        if (!Array.isArray(update.backgroundPosition) || update.backgroundPosition.length !== 2) {
          throw new TypeError("prepared batch background position must be [x, y]");
        }
        const [x, y] = update.backgroundPosition;
        if (!entry.preparedPaintProgram) {
          throw new TypeError("prepared background-position updates require an opaque no-border raster paint");
        }
        validatePreparedOpaqueImagePosition(entry.preparedPaintProgram, x, y);
        candidate.positionX = x;
        candidate.positionY = y;
        candidate.positionSpecified = true;
      }
      if (update.paintActive !== undefined) candidate.visible = Boolean(update.paintActive);
    }
    for (const candidate of candidates.values()) {
      if (candidate.positionSpecified
        || candidate.positionX !== candidate.entry.positionX
        || candidate.positionY !== candidate.entry.positionY) {
        this._setPreparedBackgroundPosition(
          candidate.entry,
          candidate.positionX,
          candidate.positionY,
        );
      }
      this._setPreparedVisibility(candidate.entry, candidate.visible);
    }
    this.counters.preparedBatches += 1;
    return this._flushPrepared(true);
  }

  async _resolvePreparedLayout(
    entry: RuntimeEntry,
    config: Readonly<CornerfillPreparedConfig | CornerfillPreparedResizeConfig>,
    revision: number,
    initial = false,
  ): Promise<Readonly<PreparedLayoutSnapshot>> {
    const computed = this.view.getComputedStyle(entry.element);
    const composition = inspectFallbackHost(this.view, entry.element, computed);
    const size = config.size ?? [entry.width, entry.height];
    if (!Array.isArray(size) || size.length !== 2
      || !size.every((value) => Number.isFinite(value) && value > 0)) {
      throw new TypeError("prepared layout requires size: [positiveWidth, positiveHeight]");
    }
    const [width, height] = size;
    const dpr = config.dpr ?? entry.dpr ?? this.view.devicePixelRatio ?? 1;
    if (!Number.isFinite(dpr) || dpr <= 0) throw new TypeError("prepared layout DPR must be positive");
    const borderRadius = config.borderRadius ?? entry.preparedBorderRadius;
    const cornerShape = config.cornerShape ?? entry.preparedCornerShape;
    let geometry = config.geometry ?? null;
    if (!geometry) {
      if (borderRadius === undefined || cornerShape === undefined) {
        if (!initial && width === entry.width && height === entry.height && dpr === entry.dpr) geometry = entry.geometry;
        else throw new TypeError("resizing explicit prepared geometry requires new geometry or reusable radius and shape sources");
      } else {
        geometry = this._geometry(
          width,
          height,
          dpr,
          resolveRadiusSource(borderRadius, width, height),
          resolveCornerShape(cornerShape),
        ).geometry;
      }
    }
    if (!geometry) throw new TypeError("prepared layout geometry is unavailable");
    if (geometry.width !== width || geometry.height !== height || geometry.dpr !== dpr) {
      throw new RangeError("prepared geometry dimensions or DPR do not match prepared layout");
    }
    const paintSource = config.paint ?? entry.preparedPaintSource;
    const descriptor = normalizePaintDescriptor(paintSource);
    if (descriptor.kind !== "solid" && descriptor.kind !== "layers"
      && descriptor.blendMode === "multiply") {
      throw new TypeError("prepared paint requires normal background blending");
    }
    const border = config.border === undefined
      ? initial ? captureBorder(computed) : entry.preparedBorderSource
      : normalizeBorder(config.border);
    const shadow = config.shadow === undefined
      ? entry.preparedShadowSource
      : normalizeInsetShadow(config.shadow);
    const outline = config.outline === undefined
      ? entry.preparedOutlineSource
      : normalizeContainedOutline(config.outline);
    validateNormalizedColors(
      (color, label) => this._validateExplicitColor(color, label),
      descriptor,
      border,
      shadow,
      outline,
    );
    assertOutlineHost(this.view, entry.element, outline);
    const paintLeases = await this._resolvePaintTransaction(
      entry,
      descriptor,
      width,
      height,
      revision,
    );
    try {
      this._assertEntryCurrent(entry, revision);
      const paint = !initial && config.paint === undefined && paintLeases.paint.kind === "image"
        ? Object.freeze({
          ...paintLeases.paint,
          backgroundPosition: Object.freeze([entry.positionX, entry.positionY]) as PixelPair,
        })
        : paintLeases.paint;
      validateCornerfillTopology({ geometry, paint, border, shadow, outline, dpr });
      const program = !border && !shadow && !outline
        && isPreparedOpaqueImageEligible(paint, geometry.width, geometry.height)
        ? createPreparedOpaqueImageProgram({ geometry, paint, dpr })
        : null;
      return Object.freeze({
        width,
        height,
        dpr,
        geometry,
        paint,
        paintLeases,
        descriptor,
        border,
        shadow,
        outline,
        composition,
        borderRadius,
        cornerShape,
        program,
      });
    } catch (error) {
      paintLeases.rollback();
      throw error;
    }
  }

  _commitPreparedLayout(
    entry: RuntimeEntry,
    snapshot: Readonly<PreparedLayoutSnapshot>,
    reason: string,
  ): void {
    this._assertEntryCurrent(entry);
    this._reconcileEntryOwnershipRoot(entry);
    const previousSurface = entry.surface;
    const resized = Boolean(previousSurface && (
      previousSurface.size.cssWidth !== snapshot.width
      || previousSurface.size.cssHeight !== snapshot.height
      || previousSurface.size.dpr !== snapshot.dpr
    ));
    let replacement: CornerfillSurface | null = null;
    let replacementPaint: Readonly<CornerfillPaintExplanation> | null = null;
    if (entry.visible) {
      const backend = entry.backend;
      if (!backend) throw new Error("prepared surface backend is unavailable");
      this._assertSurfaceBudget(snapshot.width, snapshot.height, snapshot.dpr, entry);
      replacement = this._createSurface(snapshot.width, snapshot.height, snapshot.dpr, backend);
      try {
        replacementPaint = paintCornerfill(replacement.context, {
          geometry: snapshot.geometry,
          paint: snapshot.paint,
          border: snapshot.border,
          shadow: snapshot.shadow,
          outline: snapshot.outline,
          dpr: snapshot.dpr,
        });
        if (snapshot.program) preparePreparedOpaqueImageContext(replacement.context, snapshot.program);
        replacement.commit();
      } catch (error) {
        replacement.dispose();
        throw error;
      }
    }
    const previous = Object.freeze({
      border: entry.border,
      borderKey: entry.borderKey,
      composition: entry.composition,
      dpr: entry.dpr,
      effectsKey: entry.effectsKey,
      geometry: entry.geometry,
      geometryKey: entry.geometryKey,
      height: entry.height,
      needsFullPreparedPaint: entry.needsFullPreparedPaint,
      needsPaint: entry.needsPaint,
      outline: entry.outline,
      ownershipVerified: entry.ownershipVerified,
      paintResult: entry.paintResult,
      positionX: entry.positionX,
      positionY: entry.positionY,
      preparedBorderRadius: entry.preparedBorderRadius,
      preparedBorderSource: entry.preparedBorderSource,
      preparedCornerShape: entry.preparedCornerShape,
      preparedOutlineSource: entry.preparedOutlineSource,
      preparedPaintProgram: entry.preparedPaintProgram,
      preparedPaintSource: entry.preparedPaintSource,
      preparedResolvedPaint: entry.preparedResolvedPaint,
      preparedShadowSource: entry.preparedShadowSource,
      shadow: entry.shadow,
      width: entry.width,
    });
    try {
      applyPreparedLayoutSnapshot(entry, snapshot);
      entry.needsPaint = !entry.visible;
      entry.needsFullPreparedPaint = !entry.visible;
      if (replacement) {
        this._setSurface(entry, replacement);
        entry.paintResult = replacementPaint;
        this.ownership.apply(entry);
      }
    } catch (error) {
      try {
        Object.assign(entry, previous);
        this._setSurface(entry, previousSurface);
        if (previousSurface) this.ownership.apply(entry, false);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "Cornerfill prepared layout rollback failed",
        );
      } finally {
        replacement?.dispose();
      }
      throw error;
    }
    if (replacement) {
      previousSurface?.dispose();
      entry.paintCount += 1;
      this.counters.paints += 1;
      this.counters.preparedPaints += 1;
    }
    if (resized && replacement) this.counters.surfaceResizes += 1;
    this.counters.preparedUpdates += 1;
    this.counters.preparedLayoutUpdates += 1;
    entry.lastInvalidationReason = reason;
    snapshot.paintLeases.commit();
    this._clearError(entry);
  }

  async _runPreparedLayout(
    entry: RuntimeEntry,
    config: Readonly<CornerfillPreparedResizeConfig>,
  ): Promise<CornerfillEntryExplanation> {
    this._assertEntryCurrent(entry);
    const revision = ++entry.revision;
    let snapshot: Readonly<PreparedLayoutSnapshot> | null = null;
    try {
      snapshot = await this._resolvePreparedLayout(entry, config, revision, false);
      this._assertEntryCurrent(entry, revision);
      this._commitPreparedLayout(entry, snapshot, "prepared-layout-update");
      entry.committedRevision = revision;
      return entryExplanation(entry);
    } catch (error) {
      snapshot?.paintLeases.rollback();
      if (error instanceof StaleEntryWorkError && !this._entryIsCurrent(entry)) {
        return entryExplanation(entry);
      }
      this._recordError(entry, error);
      throw error;
    }
  }

  _queuePreparedLayout(
    entry: RuntimeEntry,
    operation: () => Promise<CornerfillEntryExplanation>,
  ): Promise<CornerfillEntryExplanation> {
    const predecessor = entry.preparedLayoutChain ?? entry.ready;
    if (!predecessor) throw new Error("prepared entry initialization has not started");
    const queued = predecessor.then(operation);
    entry.preparedLayoutChain = queued.catch(() => {});
    return queued;
  }

  _resizePrepared(
    element: CornerfillElement,
    config: Readonly<CornerfillPreparedResizeConfig> = {},
  ): Promise<CornerfillEntryExplanation> {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed || !entry.prepared) throw new Error("prepared element is not attached");
    return this._queuePreparedLayout(entry, () => this._runPreparedLayout(entry, config));
  }

  _setPreparedCornerShape(
    entry: RuntimeEntry,
    cornerShape: CornerShapeSource,
  ): Promise<CornerfillEntryExplanation> {
    return this._queuePreparedLayout(entry, async () => {
      this._assertEntryCurrent(entry);
      const resolved = resolveCornerShape(cornerShape);
      if (entry.geometry?.shapeParameters.every((value, index) => Object.is(value, resolved[index]))) {
        entry.preparedCornerShape = cornerShape;
        return entryExplanation(entry);
      }
      return this._runPreparedLayout(entry, { cornerShape });
    });
  }

  async _initializePreparedEntry(
    entry: RuntimeEntry,
    config: Readonly<CornerfillPreparedConfig>,
  ): Promise<CornerfillEntryExplanation> {
    let snapshot: Readonly<PreparedLayoutSnapshot> | null = null;
    try {
      const revision = entry.revision;
      snapshot = await this._resolvePreparedLayout(entry, config, revision, true);
      this._assertEntryCurrent(entry, revision);
      applyPreparedLayoutSnapshot(entry, snapshot);
      entry.initialized = true;
      if (entry.visible || config.deferInactiveSurface !== true) {
        this._createPreparedSurface(entry, false);
        await this.ownership.verifyPrepared(entry, () => this._entryIsCurrent(entry));
        this._assertEntryCurrent(entry, revision);
      }
      else {
        entry.surfaceWasDeferred = true;
        entry.needsPaint = true;
        this.counters.deferredSurfaceEntries += 1;
      }
      entry.committedRevision = revision;
      this._clearError(entry);
      entry.lastInvalidationReason = entry.surface ? "prepared-initial-paint" : "prepared-hidden-deferred";
      snapshot.paintLeases.commit();
      return entryExplanation(entry);
    } catch (error) {
      snapshot?.paintLeases.rollback();
      this._disposeSurface(entry);
      if (error instanceof StaleEntryWorkError && !this._entryIsCurrent(entry)) {
        this.counters.cancelledInitializations += 1;
        return entryExplanation(entry);
      }
      this._failInitialization(entry, error);
    }
  }

  attachPrepared(
    element: CornerfillElement,
    config: Readonly<CornerfillPreparedConfig>,
  ): Readonly<CornerfillHandle> {
    if (this.destroyed) throw new Error("Cornerfill controller is destroyed");
    if (!(element instanceof this.view.Element)) throw new TypeError("attachPrepared() requires an Element from this document");
    const existing = this.entryByElement.get(element);
    if (existing && !existing.disposed) throw new Error("element is already attached to this Cornerfill controller");
    assertElementAvailable(element);
    if (!Array.isArray(config.size) || config.size.length !== 2
      || !config.size.every((value) => Number.isFinite(value) && value > 0)) {
      throw new TypeError("attachPrepared() requires size: [positiveWidth, positiveHeight]");
    }
    if (!config.geometry && (config.borderRadius === undefined || config.cornerShape === undefined)) {
      throw new TypeError("attachPrepared() requires prepared geometry or explicit borderRadius and cornerShape");
    }
    if (!config.paint) throw new TypeError("attachPrepared() requires normalized paint state");
    assertCooperativeOwnership(element);
    const composition = inspectFallbackHost(this.view, element, this.view.getComputedStyle(element));
    const backend = this._selectedFallbackBackend();
    if (backend === "none") throw new Error("no live Cornerfill surface backend is available");
    if (backend === "webkit-canvas" && !this.capabilities.surfaces.webkitCanvas) {
      throw new Error("WebKit live CSS canvas is unavailable");
    }
    if (backend === "moz-element" && !this.capabilities.surfaces.mozElement) {
      throw new Error("Firefox -moz-element() is unavailable");
    }
    if (backend === "static-data-url" && !this.options.staticFallback) {
      throw new Error("static fallback is disabled");
    }
    this._assertFallbackEntryBudget();
    const paintActive = config.paintActive ?? true;
    const entry = createRuntimeEntry({
      controller: this,
      element,
      native: false,
      prepared: true,
      backend,
      ownershipSnapshot: captureOwnershipState(element),
      ownershipRoot: element.getRootNode() as OwnershipRoot,
      width: config.size[0],
      height: config.size[1],
      dpr: config.dpr ?? this.view.devicePixelRatio ?? 1,
      paintKey: "prepared",
      borderKey: "none",
      effectsKey: "[null,null]",
      composition,
      preparedPaintSource: normalizePaintDescriptor(config.paint),
      preparedBorderRadius: config.borderRadius,
      preparedCornerShape: config.cornerShape,
      requestedVisible: Boolean(paintActive),
      visible: Boolean(paintActive),
      lastInvalidationReason: "prepared-attach",
    });
    claimElement(entry);
    this._retainOwnershipRoot(entry.ownershipRoot, false);
    this.entries.add(entry);
    this.entryByElement.set(element, entry);
    this.counters.attachments += 1;
    this.counters.fallbackEntries += 1;
    this.counters.preparedEntries += 1;
    entry.ready = this._initializePreparedEntry(entry, config);
    return this._handle(entry);
  }

  _shouldUseNative(config: Readonly<CornerfillAttachConfig>): boolean {
    if (this.options.forceFallback || !this.capabilities.native.qualified) return false;
    if (config.paint !== undefined || config.border !== undefined
      || config.shadow !== undefined || config.outline !== undefined) return false;
    return true;
  }

  _attachNative(
    element: CornerfillElement,
    config: Readonly<CornerfillAttachConfig>,
  ): Readonly<CornerfillHandle> {
    assertElementAvailable(element);
    const computed = this.view.getComputedStyle(element);
    const radiusCapture = captureRadiusCarriers(computed);
    const shapeCapture = captureShapeCarriers(computed);
    const shape = config.cornerShape ?? (shapeCapture?.present ? shapeCapture.source : null);
    const radius = config.borderRadius ?? (radiusCapture?.present ? radiusCapture.source : null);
    const shapeDeclarations = shape === null ? null : nativeShapeDeclarations(element, shape);
    const radiusDeclarations = radius === null ? null : nativeRadiusDeclarations(element, radius);
    const saved = new Map();
    const savedDeclarationOrder = Object.freeze(Array.from(
      { length: element.style.length },
      (_value, index) => element.style.item(index),
    ));
    const entry = createRuntimeEntry({
      controller: this,
      element,
      native: true,
      prepared: false,
      ownershipSnapshot: Object.freeze({
        borderOwner: null,
        outlineOwner: null,
        owner: null,
        shadowOwner: null,
        surfaceOwner: null,
      }),
      ownershipRoot: this.document,
      initialized: true,
      committedRevision: 0,
      saved,
      savedDeclarationOrder,
      lastInvalidationReason: "native-qualified",
    });
    if (shapeDeclarations) writeNativeDeclarations(entry, NATIVE_SHAPE_PROPERTIES, shapeDeclarations);
    if (radiusDeclarations) writeNativeDeclarations(entry, NATIVE_RADIUS_PROPERTIES, radiusDeclarations);
    entry.ready = Promise.resolve(entryExplanation(entry));
    claimElement(entry);
    this.entries.add(entry);
    this.entryByElement.set(element, entry);
    this.counters.attachments += 1;
    this.counters.nativeEntries += 1;
    return this._handle(entry);
  }

  _handle(entry: RuntimeEntry): Readonly<CornerfillHandle> {
    const controller = this;
    return Object.freeze({
      get ready() {
        if (!entry.ready) throw new Error("Cornerfill entry initialization has not started");
        return entry.ready;
      },
      get backend() {
        return entry.native ? "native-corner-shape" : entry.surface?.backend ?? entry.backend ?? "pending";
      },
      update(next: CornerfillHandleUpdate = {}) {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        if (entry.native) {
          assertSupportedUpdateKeys(next as Readonly<Record<string, unknown>>, NATIVE_UPDATE_KEYS, "native");
          const shapeDeclarations = next.cornerShape === undefined
            ? null
            : nativeShapeDeclarations(entry.element, next.cornerShape);
          const radiusDeclarations = next.borderRadius === undefined
            ? null
            : nativeRadiusDeclarations(entry.element, next.borderRadius);
          if (shapeDeclarations) writeNativeDeclarations(entry, NATIVE_SHAPE_PROPERTIES, shapeDeclarations);
          if (radiusDeclarations) writeNativeDeclarations(entry, NATIVE_RADIUS_PROPERTIES, radiusDeclarations);
          return Promise.resolve(entryExplanation(entry));
        }
        if (entry.prepared) {
          assertSupportedUpdateKeys(next as Readonly<Record<string, unknown>>, PREPARED_UPDATE_KEYS, "prepared");
          const backgroundPosition = next.backgroundPosition;
          if (backgroundPosition !== undefined) {
            if (!Array.isArray(backgroundPosition) || backgroundPosition.length !== 2) {
              throw new TypeError("prepared background update requires [x, y]");
            }
            controller._setPreparedBackgroundPosition(
              entry,
              backgroundPosition[0],
              backgroundPosition[1],
            );
          }
          if (next.paintActive !== undefined) controller._setPreparedVisibility(entry, next.paintActive);
          controller._flushPrepared(true);
          return Promise.resolve(entryExplanation(entry));
        }
        const state = entry.state;
        if (!state) throw new TypeError("dynamic update requires a dynamic Cornerfill entry");
        assertSupportedUpdateKeys(next as Readonly<Record<string, unknown>>, DYNAMIC_UPDATE_KEYS, "dynamic fallback");
        const paint = next.paint === undefined ? undefined : normalizePaintDescriptor(next.paint);
        const border = next.border === undefined ? undefined : normalizeBorder(next.border);
        const shadow = next.shadow === undefined ? undefined : normalizeInsetShadow(next.shadow);
        const outline = next.outline === undefined ? undefined : normalizeContainedOutline(next.outline);
        validateNormalizedColors(
          (color, label) => controller._validateExplicitColor(color, label),
          paint ?? null,
          border ?? null,
          shadow ?? null,
          outline ?? null,
        );
        if (outline !== undefined) assertOutlineHost(controller.view, entry.element, outline);
        const updatesGeometry = next.borderRadius !== undefined || next.cornerShape !== undefined;
        const flow = updatesGeometry
          ? controller.ownership.withAuthoredComputedStyle(entry, (computed) => flowFromComputed(computed))
          : undefined;
        if (next.borderRadius !== undefined) {
          resolveRadiusSource(next.borderRadius, entry.width, entry.height, flow);
        }
        const resolvedShape = next.cornerShape === undefined
          ? null
          : resolveCornerShape(next.cornerShape, flow);
        let changed = false;
        if (next.borderRadius !== undefined) {
          state.borderRadius = next.borderRadius;
          changed = true;
        }
        if (next.cornerShape !== undefined) {
          state.cornerShape = next.cornerShape;
          const sameResolvedShape = entry.geometry?.shapeParameters?.every(
            (value, index) => Object.is(value, resolvedShape![index]),
          );
          if (!sameResolvedShape) changed = true;
        }
        if (paint !== undefined) {
          state.paint = paint;
          entry.needsPaint = true;
          changed = true;
        }
        if (border !== undefined) {
          state.border = border;
          entry.needsPaint = true;
          changed = true;
        }
        if (shadow !== undefined) {
          state.shadow = shadow;
          entry.needsPaint = true;
          changed = true;
        }
        if (outline !== undefined) {
          state.outline = outline;
          entry.needsPaint = true;
          changed = true;
        }
        if (next.paintActive !== undefined) {
          const previousVisible = entry.visible;
          entry.requestedVisible = Boolean(next.paintActive);
          entry.visible = entry.requestedVisible && entry.styleVisible;
          if (entry.visible !== previousVisible) {
            if (entry.visible) entry.needsPaint = true;
            changed = true;
          }
        }
        if (!changed) return Promise.resolve(entryExplanation(entry));
        return controller._scheduleAndWait(entry, "direct-update", true);
      },
      interpolateCornerShape(
        from: CornerShapeSource,
        to: CornerShapeSource,
        progress: number,
        options: CornerWritingOptions = {},
      ) {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        const cornerShape = interpolateCornerShapeValues(from, to, progress, options);
        if (entry.native) {
          const declarations = nativeShapeDeclarations(entry.element, cornerShape);
          writeNativeDeclarations(entry, NATIVE_SHAPE_PROPERTIES, declarations);
          return Promise.resolve(entryExplanation(entry));
        }
        if (entry.prepared) {
          return controller._setPreparedCornerShape(entry, cornerShape);
        }
        const state = entry.state;
        if (!state) throw new TypeError("corner-shape interpolation requires a dynamic Cornerfill entry");
        state.cornerShape = cornerShape;
        if (entry.geometry?.shapeParameters?.every((value, index) => Object.is(value, cornerShape[index]))) {
          return Promise.resolve(entryExplanation(entry));
        }
        return controller._scheduleAndWait(entry, "corner-shape-interpolation", true);
      },
      refresh() {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        if (entry.native) return Promise.resolve(entryExplanation(entry));
        if (entry.prepared) {
          entry.needsPaint = true;
          entry.needsFullPreparedPaint = true;
          controller._queuePrepared(entry);
          controller._flushPrepared(true);
          return Promise.resolve(entryExplanation(entry));
        }
        return controller._scheduleAndWait(entry, "explicit-refresh", true);
      },
      resize(next: CornerfillPreparedResizeConfig = {}) {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        if (entry.native) throw new TypeError("resize() is available only for attachPrepared() handles");
        if (!entry.prepared) throw new TypeError("resize() is available only for attachPrepared() handles");
        return controller._resizePrepared(entry.element, next);
      },
      verify() {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        if (entry.error) throw entry.error;
        if (!entry.native) {
          const computed = controller.view.getComputedStyle(entry.element);
          inspectFallbackHost(controller.view, entry.element, computed);
          assertOutlineHost(controller.view, entry.element, entry.outline);
          if (controller._reconcileEntryOwnershipRoot(entry) && !entry.prepared) {
            controller._markDirty(entry, "attachment-root-migration", true);
          }
          controller._repairEntryOwnership(entry);
          controller.ownership.assertStylesApplied(entry);
        }
        return entryExplanation(entry);
      },
      explain() { return entryExplanation(entry); },
      dispose() {
        if (controller.entryByElement.get(entry.element) === entry) controller.detach(entry.element);
      },
    });
  }

  attach(
    element: CornerfillElement,
    config: Readonly<CornerfillAttachConfig> = {},
  ): Readonly<CornerfillHandle> {
    if (this.destroyed) throw new Error("Cornerfill controller is destroyed");
    if (!(element instanceof this.view.Element)) throw new TypeError("attach() requires an Element from this document");
    const existing = this.entryByElement.get(element);
    if (existing && !existing.disposed) throw new Error("element is already attached to this Cornerfill controller");
    assertElementAvailable(element);
    const useNative = this._shouldUseNative(config);
    if (useNative) return this._attachNative(element, config);

    this._assertFallbackEntryBudget();
    assertCooperativeOwnership(element);
    const computed = this.view.getComputedStyle(element);
    const composition = inspectFallbackHost(this.view, element, computed);
    const initial = captureInitialSources(
      element,
      config,
      computed,
      (color, label) => this._validateExplicitColor(color, label),
    );
    const watchCarriers = initial.dynamic.radius || initial.dynamic.shape || initial.dynamic.paint
      || (initial.dynamic.border && Boolean(initial.borderSource))
      || initial.dynamic.shadow || initial.dynamic.outline;
    const entry = createRuntimeEntry({
      controller: this,
      element,
      native: false,
      prepared: false,
      state: {},
      initial,
      dynamicPaintSource: initial.paintSource,
      dynamicBackgroundPositionSpec: initial.paintSource.kind === "image"
        ? initial.paintSource.backgroundPositionSpec
        : null,
      watchCarriers,
      watchPosition: initial.dynamic.paintPosition,
      inlineCarrierSignature: watchCarriers ? inlineCarrierSignature(element) : "",
      inlineBackgroundPositionX: element.style.getPropertyValue("background-position-x").trim(),
      inlineBackgroundPositionY: element.style.getPropertyValue("background-position-y").trim(),
      ownershipSnapshot: captureOwnershipState(element),
      ownershipRoot: element.getRootNode() as OwnershipRoot,
      composition,
      requestedVisible: config.paintActive !== false,
      styleVisible: computed.visibility !== "hidden",
      visible: config.paintActive !== false && computed.visibility !== "hidden",
      lastInvalidationReason: "attach",
    });
    claimElement(entry);
    try {
      this._retainOwnershipRoot(entry.ownershipRoot, true);
    } catch (error) {
      releaseElement(entry);
      throw error;
    }
    this.entries.add(entry);
    this.entryByElement.set(element, entry);
    this.counters.attachments += 1;
    this.counters.fallbackEntries += 1;
    entry.ready = this._initializeEntry(entry);
    return this._handle(entry);
  }

  detach(element: CornerfillElement): boolean {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed) return false;
    let cleanupError = null;
    entry.disposed = true;
    this.entryByElement.delete(element);
    this.entries.delete(entry);
    this.dirty.delete(entry);
    this.preparedDirty.delete(entry);
    this.activeAnimations.delete(entry);
    this.resizeObserver?.unobserve(element);
    if (entry.native) {
      restoreNativeDeclarationGroup(entry, NATIVE_OWNED_PROPERTIES);
      this.counters.nativeEntries -= 1;
    } else {
      this.ownership.remove(entry);
      restoreOwnershipState(element, entry.ownershipSnapshot);
      try { this._disposeSurface(entry); } catch (error) { cleanupError = error; }
      for (const lease of entry.pendingImageLeases ?? []) lease.release();
      entry.pendingImageLeases = null;
      entry.imageLease?.release();
      entry.imageLease = null;
      releaseLayerImageLeases(entry);
      entry.resolvedImage = null;
      this.counters.fallbackEntries -= 1;
      if (entry.prepared) {
        this.counters.preparedEntries -= 1;
        if (entry.surfaceWasDeferred) {
          entry.surfaceWasDeferred = false;
          this.counters.deferredSurfaceEntries -= 1;
        }
      }
      this._releaseOwnershipRoot(entry.ownershipRoot);
    }
    releaseElement(entry);
    const waiters = entry.waiters?.splice(0) ?? [];
    entry.waiters = null;
    if (waiters.length > 0) {
      const explanation = entryExplanation(entry);
      for (const waiter of waiters) waiter.resolve(explanation);
    }
    this.counters.detachments += 1;
    if (cleanupError) throw cleanupError;
    return true;
  }

  refresh() {
    return Promise.all([...this.entries].map((entry) => (
      entry.native || entry.prepared
        ? Promise.resolve(entryExplanation(entry))
        : this._scheduleAndWait(entry, "controller-refresh", true)
    )));
  }

  stats(): Readonly<CornerfillControllerStats> {
    return Object.freeze({
      schema: "cornerfill-controller-stats@2",
      runtime: CORNERFILL_RUNTIME_SCHEMA,
      entries: this.entries.size,
      surfaces: this.surfaceCount,
      activeFallbackEntries: this.counters.fallbackEntries,
      activeNativeEntries: this.counters.nativeEntries,
      surfacePixels: this.surfacePixels,
      surfaceResources: getSurfaceResourceStats(this.document),
      geometryCacheEntries: this.geometryCache.size,
      imageCache: this.images.stats(),
      counters: Object.freeze({ ...this.counters }),
    }) as Readonly<CornerfillControllerStats>;
  }

  inspectAuthoredStyle(
    element: CornerfillElement,
    properties: readonly string[],
  ): Readonly<CornerfillAuthoredStyleInspection> {
    if (element.ownerDocument !== this.document) {
      throw new TypeError("Cornerfill cannot inspect an element from another document");
    }
    const inspect = (computed: CSSStyleDeclaration) => Object.freeze({
      requiresFallback: authoredCornerRequiresFallback(element, computed),
      values: Object.freeze(Object.fromEntries(properties.map((property) => (
        [property, computed.getPropertyValue(property)]
      )))),
    });
    const entry = this.entryByElement.get(element);
    return entry
      ? this.ownership.withAuthoredComputedStyle(entry, inspect)
      : inspect(this.view.getComputedStyle(element));
  }

  explain(element: CornerfillElement): Readonly<CornerfillEntryExplanation> | null {
    const entry = this.entryByElement.get(element);
    return entry ? entryExplanation(entry) : null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const errors = [];
    for (const entry of [...this.entries]) {
      try { this.detach(entry.element); } catch (error) { errors.push(error); }
    }
    for (const observer of this.rootObservers.values()) observer?.disconnect();
    this.rootObservers.clear();
    for (const observer of this.attachmentLifecycleObservers.values()) observer.disconnect();
    this.attachmentLifecycleObservers.clear();
    this.resizeObserver?.disconnect();
    if (this._onWindowResize) this.view.removeEventListener("resize", this._onWindowResize);
    if (this.flushHandle !== null) this.view.cancelAnimationFrame(this.flushHandle);
    if (this.animationHandle !== undefined) this.view.cancelAnimationFrame(this.animationHandle);
    this.ownership.destroy();
    this.ownershipRootCounts.clear();
    this.preparedDirty.clear();
    try { this.images.destroy(); } catch (error) { errors.push(error); }
    this.geometryCache.clear();
    if (errors.length > 0) throw new AggregateError(errors, "Cornerfill teardown encountered backend errors");
  }
}

export function installCornerfill(
  options: Readonly<CornerfillInstallOptions> = {},
): CornerfillControllerHandle {
  return new CornerfillController(options);
}
