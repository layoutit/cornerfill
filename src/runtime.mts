import {
  captureComputedPaint,
  normalizePaintDescriptor,
  parseBackgroundPosition,
  paintDescriptorKey,
  resolvePaintForBox,
} from "./background.mjs";
import type {
  BackgroundBoxMetrics,
  BackgroundBoxMetricsInput,
  BackgroundPositionComponent,
  BackgroundPositionSpec,
  CornerfillRasterSource,
  NormalizedBackgroundLayer,
  NormalizedImageLayer,
  NormalizedPaintDescriptor,
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
import { nextDocumentId } from "./identity.mjs";
import { qualifyNativeCornerShape } from "./native.mjs";
import type { CornerfillNativeQualification } from "./native.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./qualification.mjs";
import {
  createPreparedOpaqueImageProgram,
  drawPreparedOpaqueImage,
  explainPreparedOpaqueImage,
  isFullyTransparentCssColor,
  paintCornerfill,
  preparePreparedOpaqueImageContext,
  repaintOpaqueCornerfill,
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
  serializeShapeParameter,
  splitTopLevelCommas,
  splitTopLevelWhitespace,
} from "./values.mjs";
import type {
  BorderRadiusDeclarations,
  CornerShapeDeclarations,
  CornerShapeSource,
  CornerWritingOptions,
  Four,
  ResolvedCornerRadius,
} from "./values.mjs";

export type CornerfillElement = Element & ElementCSSInlineStyle & Readonly<{
  offsetHeight: number;
  offsetWidth: number;
}>;
type RuntimeWindow = Window & typeof globalThis;
type OwnershipRoot = Document | ShadowRoot;
type UnknownRecord = Record<string, unknown>;
type Radius = Readonly<ResolvedCornerRadius>;
type PhysicalRadiusValues = NonNullable<BorderRadiusDeclarations["physical"]>;
type PhysicalShapeValues = NonNullable<CornerShapeDeclarations["physical"]>;
export type RadiusSource =
  | string
  | Four<Radius>
  | BorderRadiusDeclarations
  | Readonly<{ kind: "longhands"; values: Four<string> }>;
export type PaintSource = NormalizedPaintDescriptor;
export type CornerfillSideValues<T> = T | Four<T> | Readonly<{
  bottom: T;
  left: T;
  right: T;
  top: T;
}>;

export interface CornerfillBorderDescriptor {
  readonly color?: CornerfillSideValues<string> | undefined;
  readonly colors?: CornerfillSideValues<string> | undefined;
  readonly style?: CornerfillSideValues<string> | undefined;
  readonly styles?: CornerfillSideValues<string> | undefined;
  readonly width?: CornerfillSideValues<number> | null | undefined;
  readonly widths?: CornerfillSideValues<number> | undefined;
}

export interface CornerfillInsetShadowDescriptor {
  readonly blur?: number | undefined;
  readonly color: string;
  readonly inset?: true | undefined;
  readonly kind?: "inset-solid-ring" | undefined;
  readonly offset?: PixelPair | undefined;
  readonly offsetX?: number | undefined;
  readonly offsetY?: number | undefined;
  readonly spread?: number | undefined;
}

export interface CornerfillOutlineDescriptor {
  readonly color: string;
  readonly offset?: number | string | undefined;
  readonly style?: "none" | "solid" | undefined;
  readonly width: number | string;
}

export interface CornerfillFallbackRequirements {
  readonly backdropFilterClip?: boolean | undefined;
  readonly fragmentedBox?: boolean | undefined;
  readonly hitTest?: boolean | undefined;
  readonly overflowClip?: boolean | undefined;
  readonly replacedContent?: boolean | undefined;
}

export interface CornerfillInstallOptions {
  readonly backend?: SurfaceBackend | undefined;
  readonly document?: Document | undefined;
  readonly forceFallback?: boolean | undefined;
  readonly idPrefix?: string | undefined;
  readonly maxGeometryCacheEntries?: number | undefined;
  readonly maxImageCacheEntries?: number | undefined;
  readonly maxImageCachePixels?: number | undefined;
  readonly maxSurfacePixels?: number | undefined;
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
  readonly maxGeometryCacheEntries: number;
  readonly maxImageCacheEntries: number;
  readonly maxImageCachePixels: number;
  readonly maxSurfacePixels: number;
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
  readonly dynamicCarriers?: boolean | undefined;
  readonly mode?: "paint" | undefined;
  readonly observeBackgroundPosition?: boolean | undefined;
  readonly outline?: Readonly<CornerfillOutlineDescriptor> | null | undefined;
  readonly paint?: PaintSource | undefined;
  readonly rasterIsOpaque?: boolean | undefined;
  readonly requirements?: Readonly<CornerfillFallbackRequirements> | undefined;
  readonly shadow?: string | Readonly<CornerfillInsetShadowDescriptor> | null | undefined;
  readonly visible?: boolean | undefined;
}

export interface CornerfillPreparedConfig extends CornerfillAttachConfig {
  readonly deferHiddenSurface?: boolean | undefined;
  readonly dpr?: number | undefined;
  readonly geometry?: CornerGeometry | undefined;
  readonly size?: PixelPair | undefined;
  readonly visibility?: boolean | undefined;
}

export interface CornerfillPreparedUpdate {
  readonly backgroundPosition?: PixelPair | undefined;
  readonly element: CornerfillElement;
  readonly visible?: boolean | undefined;
}

export interface CornerfillHandleUpdate extends CornerfillAttachConfig {
  readonly background?: PixelPair | undefined;
  readonly backgroundPosition?: PixelPair | undefined;
}

interface OwnershipSnapshot {
  readonly borderOwner: string | null;
  readonly owner: string | null;
  readonly surfaceOwner: string | null;
}

interface OwnershipSurface {
  readonly image: string;
  readonly root: OwnershipRoot;
}

interface OwnershipSurfaceRule {
  readonly root: OwnershipRoot;
  readonly rule: CSSStyleRule;
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
  dynamicPaintUpdates: number;
  ignoredStyleChanges: number;
  ignoredStyleMutations: number;
  opaqueFastPaints: number;
  ownershipRepairs: number;
  paintOnlyUpdates: number;
  paints: number;
  preparedLayoutUpdates: number;
  preparedPaints: number;
  preparedScheduledFlushes: number;
  preparedUpdates: number;
  styleChecks: number;
  surfaceResizes: number;
  visibilityUpdates: number;
}

interface ControllerCounters extends EntryCounters {
  attachments: number;
  cancelledInitializations: number;
  deferredSurfaceEntries: number;
  detachments: number;
  fallbackEntries: number;
  geometryBuilds: number;
  geometryCacheHits: number;
  imageCacheEvictions: number;
  imageCacheHits: number;
  imageDecodes: number;
  nativeEntries: number;
  preparedBatches: number;
  preparedEntries: number;
  staleRefreshes: number;
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
  readonly dynamicCarriers: boolean;
  readonly initialBackground: Readonly<{
    backgroundAttachment: string;
    backgroundBlendMode: string;
    backgroundClip: string;
    backgroundColor: string;
    backgroundImage: string;
    backgroundOrigin: string;
    backgroundPosition: string;
    backgroundRepeat: string;
    backgroundSize: string;
    imageRendering: string;
  }>;
  readonly outlineSource: Readonly<ContainedOutlinePaintState> | null;
  readonly paintSource: PaintSource;
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
  border?: Readonly<CornerfillBorderDescriptor> | null | undefined;
  borderRadius?: RadiusSource | undefined;
  cornerShape?: CornerShapeSource | undefined;
  outline?: Readonly<CornerfillOutlineDescriptor> | null | undefined;
  paint?: PaintSource | undefined;
  shadow?: string | Readonly<CornerfillInsetShadowDescriptor> | null | undefined;
}

interface RuntimeEntry {
  backend: ConcreteSurfaceBackend | null;
  border: Readonly<OwnedBorderPaintState> | null;
  borderKey: string | null;
  boxMetrics: Readonly<BackgroundBoxMetrics> | null;
  committedRevision: number;
  composition: Readonly<HostComposition> | null;
  controller: CornerfillController;
  counters: EntryCounters;
  deferHiddenSurface: boolean;
  disposed: boolean;
  dpr: number;
  dynamicBackgroundPositionSpec: BackgroundPositionSpec | null;
  dynamicPaintSource: PaintSource;
  effectsKey: string | null;
  element: CornerfillElement;
  elementOwnerRegistry?: WeakMap<CornerfillElement, RuntimeEntry> | undefined;
  error: Error | null;
  forcePaint: boolean;
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
  layerImageLeases: Map<string, Readonly<ImageLease>>;
  mode: "paint";
  native: boolean;
  needsFullPreparedPaint: boolean;
  needsPaint: boolean;
  outline: Readonly<ContainedOutlinePaintState> | null;
  ownershipLastVerified: number | null;
  ownershipRoot: OwnershipRoot;
  ownershipSnapshot: Readonly<OwnershipSnapshot>;
  ownershipToken: string | null;
  ownershipVerified: boolean;
  paintKey: string | null;
  paintResult: Readonly<CornerfillPaintExplanation> | null;
  pendingReason: string | null;
  positionX: number;
  positionY: number;
  prepared: boolean;
  preparedBorderRadius: RadiusSource | undefined;
  preparedBorderSource: Readonly<CornerfillBorderDescriptor> | null;
  preparedCornerShape: CornerShapeSource | undefined;
  preparedLayoutChain: Promise<unknown> | null;
  preparedOutlineSource: Readonly<CornerfillOutlineDescriptor> | null;
  preparedPaintProgram: Readonly<PreparedOpaqueImageProgram> | null;
  preparedPaintSource: PaintSource;
  preparedResolvedPaint: ResolvedPaintDescriptor | null;
  preparedShadowSource: string | Readonly<CornerfillInsetShadowDescriptor> | null;
  ready: Promise<CornerfillEntryExplanation> | null;
  requestedVisible: boolean;
  resolvedImage: CornerfillRasterSource | null;
  revision: number;
  saved: Map<string, Readonly<{ priority: string; value: string }>>;
  shadow: Readonly<InsetShadowPaintState> | null;
  state: EntryState | null;
  styleVisible: boolean;
  surface: CornerfillSurface | null;
  surfaceWasDeferred: boolean;
  visible: boolean;
  waiters: EntryWaiter[];
  watchCarriers: boolean;
  watchPosition: boolean;
  watchVisibility: boolean;
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
  readonly mode: "paint";
  readonly oracleQualification: typeof CORNERFILL_ORACLE_QUALIFICATION;
  readonly ownershipVerified: boolean;
  readonly paint: Readonly<CornerfillPaintExplanation> | null;
  readonly paintOwnership: "browser-native" | "host-background-border-and-contained-effects";
  readonly prepared: Readonly<{
    backgroundPosition: PixelPair | null;
    directUpdates: true;
    layoutUpdates: "explicit";
    observesStyleMutations: false;
    surfaceDeferred: boolean;
    visible: boolean;
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
  readonly visible: boolean | null;
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
  resize(next?: CornerfillPreparedConfig): Promise<CornerfillEntryExplanation>;
  setVisible(visible: boolean): Promise<CornerfillEntryExplanation>;
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
    config?: Readonly<CornerfillPreparedConfig>,
  ): Readonly<CornerfillHandle>;
  destroy(): void;
  detach(element: CornerfillElement): boolean;
  explain(element: CornerfillElement): Readonly<CornerfillEntryExplanation> | null;
  flushPrepared(): number;
  refresh(): Promise<Readonly<CornerfillEntryExplanation>[]>;
  resizePrepared(
    element: CornerfillElement,
    config?: Readonly<CornerfillPreparedConfig>,
  ): Promise<CornerfillEntryExplanation>;
  setPreparedBackgroundPosition(element: CornerfillElement, x: number, y: number): void;
  setPreparedBackgroundPositionY(element: CornerfillElement, y: number): void;
  setPreparedVisibility(element: CornerfillElement, visible: boolean): void;
  stats(): Readonly<CornerfillControllerStats>;
  updatePreparedBatch(updates: readonly Readonly<CornerfillPreparedUpdate>[]): number;
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
  readonly paintSource: PaintSource;
  readonly shadow: Readonly<InsetShadowPaintState> | null;
  readonly width: number;
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

function createEntryCounters(): EntryCounters {
  return {
    dynamicPaintUpdates: 0,
    ignoredStyleChanges: 0,
    ignoredStyleMutations: 0,
    opaqueFastPaints: 0,
    ownershipRepairs: 0,
    paintOnlyUpdates: 0,
    paints: 0,
    preparedLayoutUpdates: 0,
    preparedPaints: 0,
    preparedScheduledFlushes: 0,
    preparedUpdates: 0,
    styleChecks: 0,
    surfaceResizes: 0,
    visibilityUpdates: 0,
  };
}

const EMPTY_PAINT_SOURCE = Object.freeze({
  clip: "border-box",
  color: "transparent",
  kind: "solid",
}) satisfies NormalizedPaintDescriptor;

type RuntimeEntrySeed = Pick<
  RuntimeEntry,
  "controller" | "element" | "mode" | "native" | "ownershipRoot" | "ownershipSnapshot" | "prepared"
> & Partial<Omit<
  RuntimeEntry,
  "controller" | "element" | "mode" | "native" | "ownershipRoot" | "ownershipSnapshot" | "prepared"
>>;

function createRuntimeEntry(seed: RuntimeEntrySeed): RuntimeEntry {
  return {
    backend: null,
    border: null,
    borderKey: null,
    boxMetrics: null,
    committedRevision: -1,
    composition: null,
    counters: createEntryCounters(),
    deferHiddenSurface: false,
    disposed: false,
    dpr: 1,
    dynamicBackgroundPositionSpec: null,
    dynamicPaintSource: EMPTY_PAINT_SOURCE,
    effectsKey: null,
    error: null,
    forcePaint: false,
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
    layerImageLeases: new Map(),
    needsFullPreparedPaint: false,
    needsPaint: false,
    outline: null,
    ownershipLastVerified: null,
    ownershipToken: null,
    ownershipVerified: false,
    paintKey: null,
    paintResult: null,
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
    saved: new Map(),
    shadow: null,
    state: null,
    styleVisible: true,
    surface: null,
    surfaceWasDeferred: false,
    visible: true,
    waiters: [],
    watchCarriers: false,
    watchPosition: false,
    watchVisibility: false,
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

function isRadius(value: unknown): value is Radius {
  return isRecord(value)
    && typeof value.rx === "number"
    && Number.isFinite(value.rx)
    && value.rx >= 0
    && typeof value.ry === "number"
    && Number.isFinite(value.ry)
    && value.ry >= 0;
}

function isRadiusTuple(value: unknown): value is Four<Radius> {
  return Array.isArray(value) && value.length === 4 && value.every(isRadius);
}

function isShapeTuple(value: unknown): value is Four<number> {
  return Array.isArray(value)
    && value.length === 4
    && value.every((corner): corner is number => (
      typeof corner === "number" && !Number.isNaN(corner)
    ));
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
  authorImportantOwnership: Object.freeze({
    supported: false,
    reason: "Author !important background, border, or radius declarations that outrank Cornerfill ownership are rejected.",
  }),
  preparedLayoutObservation: Object.freeze({
    supported: false,
    reason: "Prepared entries are caller-clocked; size and DPR changes require resizePrepared() or handle.resize().",
  }),
  exceptionalBatchCommit: Object.freeze({
    supported: false,
    reason: "Prepared batches validate transactionally, but an unexpected browser canvas failure can leave already-committed sibling surfaces painted.",
  }),
});

const RADIUS_LONGHANDS = Object.freeze([
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
]);

const LOGICAL_RADIUS_LONGHANDS = Object.freeze([
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-end-radius",
  "border-end-start-radius",
]);

const PHYSICAL_SHAPE_LONGHANDS = Object.freeze([
  "corner-top-left-shape",
  "corner-top-right-shape",
  "corner-bottom-right-shape",
  "corner-bottom-left-shape",
]);

const LOGICAL_SHAPE_LONGHANDS = Object.freeze([
  "corner-start-start-shape",
  "corner-start-end-shape",
  "corner-end-end-shape",
  "corner-end-start-shape",
]);

const PHYSICAL_CORNERS = Object.freeze([
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
] as const);

const COOPERATIVE_OWNERSHIP_PROPERTIES = Object.freeze([
  "background-color",
  "background-image",
  "background-size",
  "background-position",
  "background-position-x",
  "background-position-y",
  "background-repeat",
  "background-origin",
  "background-clip",
  "background-blend-mode",
  "background-attachment",
  ...RADIUS_LONGHANDS,
  ...LOGICAL_RADIUS_LONGHANDS,
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
  "--cornerfill-live-image",
]);

const LIVE_IMAGE_PROPERTY = "--cornerfill-live-image";
const OWNERSHIP_ATTRIBUTE = "data-cornerfill-owned";
const OWNED_BORDER_ATTRIBUTE = "data-cornerfill-owned-border";
const OWNED_SURFACE_ATTRIBUTE = "data-cornerfill-owned-surface";
const ELEMENT_OWNER_REGISTRY = Symbol.for("layoutit.cornerfill.element-owner-registry.v1");

class StaleEntryWorkError extends Error {
  constructor() {
    super("Cornerfill entry work was superseded or cancelled");
    this.name = "StaleEntryWorkError";
  }
}

function nextControllerId(document: Document): string {
  return nextDocumentId(document, "controller", "cornerfill-controller");
}

const CARRIER = Object.freeze({
  radius: "--cornerfill-border-radius",
  shape: "--cornerfill-corner-shape",
  backgroundColor: "--cornerfill-background-color",
  backgroundImage: "--cornerfill-background-image",
  backgroundSize: "--cornerfill-background-size",
  backgroundPosition: "--cornerfill-background-position",
  backgroundRepeat: "--cornerfill-background-repeat",
  backgroundOrigin: "--cornerfill-background-origin",
  backgroundClip: "--cornerfill-background-clip",
  backgroundBlendMode: "--cornerfill-background-blend-mode",
  backgroundAttachment: "--cornerfill-background-attachment",
  imageRendering: "--cornerfill-image-rendering",
  borderColor: "--cornerfill-border-color",
  borderTopColor: "--cornerfill-border-top-color",
  borderRightColor: "--cornerfill-border-right-color",
  borderBottomColor: "--cornerfill-border-bottom-color",
  borderLeftColor: "--cornerfill-border-left-color",
  boxShadow: "--cornerfill-box-shadow",
  outlineWidth: "--cornerfill-outline-width",
  outlineStyle: "--cornerfill-outline-style",
  outlineColor: "--cornerfill-outline-color",
  outlineOffset: "--cornerfill-outline-offset",
});

const RADIUS_PHYSICAL_CARRIERS = Object.freeze({
  "top-left": "--cornerfill-border-top-left-radius",
  "top-right": "--cornerfill-border-top-right-radius",
  "bottom-right": "--cornerfill-border-bottom-right-radius",
  "bottom-left": "--cornerfill-border-bottom-left-radius",
});

const RADIUS_LOGICAL_CARRIERS = Object.freeze({
  "start-start": "--cornerfill-border-start-start-radius",
  "start-end": "--cornerfill-border-start-end-radius",
  "end-end": "--cornerfill-border-end-end-radius",
  "end-start": "--cornerfill-border-end-start-radius",
});

const SHAPE_PHYSICAL_CARRIERS = Object.freeze({
  "top-left": "--cornerfill-corner-top-left-shape",
  "top-right": "--cornerfill-corner-top-right-shape",
  "bottom-right": "--cornerfill-corner-bottom-right-shape",
  "bottom-left": "--cornerfill-corner-bottom-left-shape",
});

const SHAPE_LOGICAL_CARRIERS = Object.freeze({
  "start-start": "--cornerfill-corner-start-start-shape",
  "start-end": "--cornerfill-corner-start-end-shape",
  "end-end": "--cornerfill-corner-end-end-shape",
  "end-start": "--cornerfill-corner-end-start-shape",
});

const PAINT_CARRIERS = Object.freeze([
  CARRIER.backgroundColor,
  CARRIER.backgroundImage,
  CARRIER.backgroundSize,
  CARRIER.backgroundPosition,
  CARRIER.backgroundRepeat,
  CARRIER.backgroundOrigin,
  CARRIER.backgroundClip,
  CARRIER.backgroundBlendMode,
  CARRIER.backgroundAttachment,
  CARRIER.imageRendering,
]);

const ALL_CARRIERS = Object.freeze([
  ...Object.values(CARRIER),
  ...Object.values(RADIUS_PHYSICAL_CARRIERS),
  ...Object.values(RADIUS_LOGICAL_CARRIERS),
  ...Object.values(SHAPE_PHYSICAL_CARRIERS),
  ...Object.values(SHAPE_LOGICAL_CARRIERS),
]);

const NATIVE_RADIUS_PROPERTIES = Object.freeze([
  "border-radius",
  ...RADIUS_LONGHANDS,
  ...LOGICAL_RADIUS_LONGHANDS,
]);

const NATIVE_SHAPE_PROPERTIES = Object.freeze([
  "corner-shape",
  ...PHYSICAL_SHAPE_LONGHANDS,
  ...LOGICAL_SHAPE_LONGHANDS,
]);

const PHYSICAL_RADIUS_PROPERTY_BY_CORNER = Object.freeze(Object.fromEntries(
  ["top-left", "top-right", "bottom-right", "bottom-left"].map((corner, index) => (
    [corner, RADIUS_LONGHANDS[index]]
  )),
)) as Readonly<Record<string, string>>;

const LOGICAL_RADIUS_PROPERTY_BY_CORNER = Object.freeze(Object.fromEntries(
  ["start-start", "start-end", "end-end", "end-start"].map((corner, index) => (
    [corner, LOGICAL_RADIUS_LONGHANDS[index]]
  )),
)) as Readonly<Record<string, string>>;

const PHYSICAL_SHAPE_PROPERTY_BY_CORNER = Object.freeze(Object.fromEntries(
  ["top-left", "top-right", "bottom-right", "bottom-left"].map((corner, index) => (
    [corner, PHYSICAL_SHAPE_LONGHANDS[index]]
  )),
)) as Readonly<Record<string, string>>;

const LOGICAL_SHAPE_PROPERTY_BY_CORNER = Object.freeze(Object.fromEntries(
  ["start-start", "start-end", "end-end", "end-start"].map((corner, index) => (
    [corner, LOGICAL_SHAPE_LONGHANDS[index]]
  )),
)) as Readonly<Record<string, string>>;

function nativeLonghandProperty(
  input: string,
  byCorner: Readonly<Record<string, string>>,
  validProperties: readonly string[],
  label: string,
): string {
  if (Object.hasOwn(byCorner, input)) return byCorner[input]!;
  if (validProperties.includes(input)) return input;
  throw new TypeError(`invalid ${label}: ${input}`);
}

function clearNativeProperties(element: CornerfillElement, properties: readonly string[]): void {
  for (const property of properties) element.style.removeProperty(property);
}

function applyNativeRadiusSource(element: CornerfillElement, source: unknown): void {
  clearNativeProperties(element, NATIVE_RADIUS_PROPERTIES);
  if (typeof source === "string") {
    element.style.setProperty("border-radius", source);
    return;
  }
  if (Array.isArray(source)) {
    if (!isRadiusTuple(source)) {
      throw new TypeError("native resolved radii must contain four finite corners");
    }
    element.style.setProperty("border-radius", `${source.map(({ rx }) => `${rx}px`).join(" ")} / ${source.map(({ ry }) => `${ry}px`).join(" ")}`);
    return;
  }
  if (!isRecord(source)) throw new TypeError("unsupported native border-radius source");
  element.style.setProperty("border-radius", String(source.shorthand ?? "0"));
  const physical = isRecord(source.physical) ? source.physical : {};
  for (const [corner, value] of Object.entries(physical)) {
    element.style.setProperty(nativeLonghandProperty(
      corner,
      PHYSICAL_RADIUS_PROPERTY_BY_CORNER,
      RADIUS_LONGHANDS,
      "physical radius corner",
    ), String(value));
  }
  const logical = isRecord(source.logical) ? source.logical : {};
  for (const [corner, value] of Object.entries(logical)) {
    element.style.setProperty(nativeLonghandProperty(
      corner,
      LOGICAL_RADIUS_PROPERTY_BY_CORNER,
      LOGICAL_RADIUS_LONGHANDS,
      "logical radius corner",
    ), String(value));
  }
}

function applyNativeShapeSource(element: CornerfillElement, source: unknown): void {
  clearNativeProperties(element, NATIVE_SHAPE_PROPERTIES);
  if (typeof source === "string") {
    element.style.setProperty("corner-shape", source);
    return;
  }
  if (Array.isArray(source)) {
    if (!isShapeTuple(source)) throw new TypeError("native resolved shapes must contain four corners");
    element.style.setProperty(
      "corner-shape",
      source.map(serializeShapeParameter).join(" "),
    );
    return;
  }
  if (!isRecord(source)) throw new TypeError("unsupported native corner-shape source");
  element.style.setProperty("corner-shape", String(source.shorthand ?? "round"));
  const physical = isRecord(source.physical) ? source.physical : {};
  for (const [corner, value] of Object.entries(physical)) {
    element.style.setProperty(nativeLonghandProperty(
      corner,
      PHYSICAL_SHAPE_PROPERTY_BY_CORNER,
      PHYSICAL_SHAPE_LONGHANDS,
      "physical shape corner",
    ), String(value));
  }
  const logical = isRecord(source.logical) ? source.logical : {};
  for (const [corner, value] of Object.entries(logical)) {
    element.style.setProperty(nativeLonghandProperty(
      corner,
      LOGICAL_SHAPE_PROPERTY_BY_CORNER,
      LOGICAL_SHAPE_LONGHANDS,
      "logical shape corner",
    ), String(value));
  }
}

function readCarrier(computed: CSSStyleDeclaration, name: string): string {
  const value = computed.getPropertyValue(name).trim();
  return value === "__cornerfill_unset__" || /^(?:initial|unset)$/iu.test(value) ? "" : value;
}

function readColorCarrier(computed: CSSStyleDeclaration, name: string): string {
  const value = readCarrier(computed, name);
  return /^currentcolor$/iu.test(value) ? computed.color : value;
}

function readShadowCarrier(computed: CSSStyleDeclaration): string {
  return readCarrier(computed, CARRIER.boxShadow)
    .replaceAll(/\bcurrentcolor\b/giu, computed.color);
}

function readCarrierMap<const Carriers extends Readonly<Record<string, string>>>(
  computed: CSSStyleDeclaration,
  carriers: Carriers,
): Readonly<Partial<Record<Extract<keyof Carriers, string>, string>>> {
  type Corner = Extract<keyof Carriers, string>;
  const values: Partial<Record<Corner, string>> = {};
  for (const corner of Object.keys(carriers) as Corner[]) {
    const property = carriers[corner];
    const value = readCarrier(computed, property!);
    if (value) values[corner] = value;
  }
  return Object.freeze(values);
}

function readBorderColorCarriers(computed: CSSStyleDeclaration): string | readonly string[] {
  const sides = [
    CARRIER.borderTopColor,
    CARRIER.borderRightColor,
    CARRIER.borderBottomColor,
    CARRIER.borderLeftColor,
  ].map((property) => readColorCarrier(computed, property));
  if (sides.some(Boolean)) return sides;
  return readColorCarrier(computed, CARRIER.borderColor);
}

function flowFromComputed(computed: CSSStyleDeclaration): Required<CornerWritingOptions> {
  return Object.freeze({
    writingMode: (computed.writingMode || "horizontal-tb") as Required<CornerWritingOptions>["writingMode"],
    direction: (computed.direction || "ltr") as Required<CornerWritingOptions>["direction"],
  });
}

function physicalRadiusValues(computed: CSSStyleDeclaration): PhysicalRadiusValues {
  return Object.freeze({
    "top-left": computed.getPropertyValue(RADIUS_LONGHANDS[0]!),
    "top-right": computed.getPropertyValue(RADIUS_LONGHANDS[1]!),
    "bottom-right": computed.getPropertyValue(RADIUS_LONGHANDS[2]!),
    "bottom-left": computed.getPropertyValue(RADIUS_LONGHANDS[3]!),
  });
}

function physicalShapeValues(computed: CSSStyleDeclaration): PhysicalShapeValues {
  const values: Partial<Record<Extract<keyof typeof SHAPE_PHYSICAL_CARRIERS, string>, string>> = {};
  for (let index = 0; index < PHYSICAL_SHAPE_LONGHANDS.length; index += 1) {
    const value = computed.getPropertyValue(PHYSICAL_SHAPE_LONGHANDS[index]!).trim();
    const corner = PHYSICAL_CORNERS[index]!;
    if (value) values[corner] = value;
  }
  return Object.freeze(values);
}

interface RadiusCarrierCapture {
  readonly baseline: PhysicalRadiusValues;
  readonly present: boolean;
  readonly source: RadiusSource;
}

function captureRadiusCarriers(
  computed: CSSStyleDeclaration,
  baselinePhysical: PhysicalRadiusValues | null = null,
): Readonly<RadiusCarrierCapture> | null {
  const shorthand = readCarrier(computed, CARRIER.radius);
  const carrierPhysical = readCarrierMap(computed, RADIUS_PHYSICAL_CARRIERS);
  const logical = readCarrierMap(computed, RADIUS_LOGICAL_CARRIERS);
  const present = Boolean(shorthand)
    || Object.keys(carrierPhysical).length > 0
    || Object.keys(logical).length > 0;
  if (!present && !baselinePhysical) return null;
  const baseline = baselinePhysical ?? physicalRadiusValues(computed);
  return Object.freeze({
    present,
    baseline,
    source: Object.freeze({
      kind: "declarations",
      shorthand: shorthand || "0",
      physical: Object.freeze(shorthand
        ? { ...carrierPhysical }
        : { ...baseline, ...carrierPhysical }),
      logical,
      ...flowFromComputed(computed),
    }),
  });
}

interface ShapeCarrierBaseline {
  readonly physical: PhysicalShapeValues;
  readonly shorthand: string;
}

interface ShapeCarrierCapture {
  readonly baseline: Readonly<ShapeCarrierBaseline>;
  readonly present: boolean;
  readonly source: CornerShapeSource;
}

function captureShapeCarriers(
  computed: CSSStyleDeclaration,
  baseline: Readonly<ShapeCarrierBaseline>,
): Readonly<ShapeCarrierCapture>;
function captureShapeCarriers(
  computed: CSSStyleDeclaration,
  baseline?: null,
): Readonly<ShapeCarrierCapture> | null;
function captureShapeCarriers(
  computed: CSSStyleDeclaration,
  baseline: Readonly<ShapeCarrierBaseline> | null = null,
): Readonly<ShapeCarrierCapture> | null {
  const shorthand = readCarrier(computed, CARRIER.shape);
  const carrierPhysical = readCarrierMap(computed, SHAPE_PHYSICAL_CARRIERS);
  const logical = readCarrierMap(computed, SHAPE_LOGICAL_CARRIERS);
  const present = Boolean(shorthand)
    || Object.keys(carrierPhysical).length > 0
    || Object.keys(logical).length > 0;
  if (!present && !baseline) return null;
  const capturedBaseline: Readonly<ShapeCarrierBaseline> = baseline ?? Object.freeze({
    shorthand: computed.getPropertyValue("corner-shape").trim()
      || "round",
    physical: physicalShapeValues(computed),
  });
  return Object.freeze({
    present,
    baseline: capturedBaseline,
    source: Object.freeze({
      kind: "declarations",
      shorthand: shorthand || capturedBaseline.shorthand,
      physical: Object.freeze(shorthand
        ? { ...carrierPhysical }
        : { ...capturedBaseline.physical, ...carrierPhysical }),
      logical,
      ...flowFromComputed(computed),
    }) as CornerShapeSource,
  });
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

function assertFallbackRequirements(
  requirements: Readonly<CornerfillFallbackRequirements> = {},
): void {
  if (requirements.overflowClip) throw new Error(CORNERFILL_LIMITATIONS.descendantOverflowClipping.reason);
  if (requirements.hitTest) throw new Error(CORNERFILL_LIMITATIONS.shapedHitTesting.reason);
  if (requirements.replacedContent) throw new Error(CORNERFILL_LIMITATIONS.replacedContentClipping.reason);
  if (requirements.fragmentedBox) throw new Error(CORNERFILL_LIMITATIONS.fragmentedBoxes.reason);
  if (requirements.backdropFilterClip) throw new Error(CORNERFILL_LIMITATIONS.backdropFilterClipping.reason);
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

function captureOwnershipState(element: CornerfillElement): Readonly<OwnershipSnapshot> {
  return Object.freeze({
    owner: element.getAttribute(OWNERSHIP_ATTRIBUTE),
    borderOwner: element.getAttribute(OWNED_BORDER_ATTRIBUTE),
    surfaceOwner: element.getAttribute(OWNED_SURFACE_ATTRIBUTE),
  });
}

function restoreOwnershipState(
  element: CornerfillElement,
  snapshot: Readonly<OwnershipSnapshot>,
): void {
  if (snapshot.owner === null) element.removeAttribute(OWNERSHIP_ATTRIBUTE);
  else element.setAttribute(OWNERSHIP_ATTRIBUTE, snapshot.owner);
  if (snapshot.borderOwner === null) element.removeAttribute(OWNED_BORDER_ATTRIBUTE);
  else element.setAttribute(OWNED_BORDER_ATTRIBUTE, snapshot.borderOwner);
  if (snapshot.surfaceOwner === null) element.removeAttribute(OWNED_SURFACE_ATTRIBUTE);
  else element.setAttribute(OWNED_SURFACE_ATTRIBUTE, snapshot.surfaceOwner);
}

function assertCooperativeOwnership(element: CornerfillElement): void {
  const conflicts = COOPERATIVE_OWNERSHIP_PROPERTIES.filter(
    (property) => element.style.getPropertyPriority(property) === "important",
  );
  if (conflicts.length > 0) {
    throw new TypeError(
      `${CORNERFILL_LIMITATIONS.authorImportantOwnership.reason} Conflicts: ${conflicts.join(", ")}`,
    );
  }
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
    widths,
    color: typeof colorOverride === "string" && colorOverride ? colorOverride : paintedColors[0],
  });
}

function isFiniteSideTuple(values: readonly unknown[]): values is Four<number> {
  return values.length === 4 && values.every((value) => (
    typeof value === "number" && Number.isFinite(value) && value >= 0
  ));
}

function borderSides(input: unknown, label: string): Four<number> {
  if (typeof input === "number" && Number.isFinite(input) && input >= 0) {
    return [input, input, input, input];
  }
  const values: unknown[] = Array.isArray(input)
    ? input
    : isRecord(input) ? [input.top, input.right, input.bottom, input.left] : [];
  if (!isFiniteSideTuple(values)) {
    throw new TypeError(`${label} must contain four finite non-negative sides`);
  }
  return frozenFour(values[0], values[1], values[2], values[3]);
}

function normalizeBorder(border: unknown): Readonly<OwnedBorderPaintState> | null {
  if (border === null || border === undefined) return null;
  if (!isRecord(border)) throw new TypeError("border descriptor must be an object");
  const widths = borderSides(border.widths ?? border.width ?? 0, "border widths");
  if (widths.every((width) => width === 0)) return null;
  const styles = border.styles ?? border.style ?? "solid";
  const styleSides = (typeof styles === "string"
    ? [styles, styles, styles, styles]
    : Array.isArray(styles) ? [...styles] : isRecord(styles)
      ? [styles.top, styles.right, styles.bottom, styles.left]
      : [])
    .map((style) => String(style).toLowerCase());
  if (styleSides.length !== 4
    || styleSides.some((style, index) => widths[index]! > 0 && style !== "solid")) {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  const colors = border.colors ?? border.color;
  const colorSides = typeof colors === "string"
    ? [colors, colors, colors, colors]
    : Array.isArray(colors) ? [...colors] : isRecord(colors)
      ? [colors.top, colors.right, colors.bottom, colors.left]
      : [];
  if (colorSides.length !== 4 || colorSides.some((color, index) => widths[index]! > 0 && !color)) {
    throw new TypeError("painted border sides require colors");
  }
  const paintedColors = colorSides.filter((_, index) => widths[index]! > 0).map(String);
  if (!paintedColors.every((color) => color === paintedColors[0])) {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  const color = paintedColors[0];
  if (color === undefined) throw new TypeError("painted border sides require colors");
  const normalizedColors = colorSides.map((sideColor) => String(sideColor ?? color));
  const normalized: Readonly<OwnedBorderPaintState> = Object.freeze({
    widths: Object.freeze(widths),
    width: widths.every((width) => width === widths[0]) ? widths[0] : null,
    color,
    colors: frozenFour(
      normalizedColors[0]!,
      normalizedColors[1]!,
      normalizedColors[2]!,
      normalizedColors[3]!,
    ),
    styles: frozenFour(styleSides[0]!, styleSides[1]!, styleSides[2]!, styleSides[3]!),
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
    shadow = {
      inset,
      offset: lengths.slice(0, 2),
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      color: color.join(" "),
    };
  }
  if (!isRecord(shadow)) {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
  const offset = shadow.offset ?? [shadow.offsetX ?? 0, shadow.offsetY ?? 0];
  const offsetX = Number(Array.isArray(offset) ? offset[0] : undefined);
  const offsetY = Number(Array.isArray(offset) ? offset[1] : undefined);
  const blur = Number(shadow.blur ?? 0);
  const spread = Number(shadow.spread ?? 0);
  const inset = shadow.inset === true || shadow.kind === "inset-solid-ring";
  if (!inset) throw new TypeError(CORNERFILL_LIMITATIONS.outerEffects.reason);
  if (!Array.isArray(offset) || offset.length !== 2
    || ![offsetX, offsetY, blur, spread].every(Number.isFinite)
    || offsetX !== 0 || offsetY !== 0 || blur !== 0 || spread < 0
    || !shadow.color) {
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
): Readonly<InitialSources> {
  const dynamicCarriers = config.dynamicCarriers === true;
  const radiusCapture = captureRadiusCarriers(computed);
  const computedShape = computed.getPropertyValue("corner-shape").trim();
  const shapeAttribute = element.getAttribute("data-cornerfill-shape");
  const shapeBaseline = Object.freeze({
    shorthand: computedShape || shapeAttribute || "round",
    physical: physicalShapeValues(computed),
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
  const radiusSource: RadiusSource = config.borderRadius ?? (dynamicCarriers
    ? computedRadiusSource
    : radiusCapture?.present
    ? radiusCapture.source
    : computedRadiusSource);
  const hasComputedShapeLonghands = Object.keys(shapeBaseline.physical).length > 0;
  const shapeSource = config.cornerShape ?? (shapeCapture.present
    ? shapeCapture.source
    : hasComputedShapeLonghands
      ? shapeCapture.source
      : computedShape || shapeAttribute);
  if (!shapeSource) {
    throw new TypeError(
      "corner-shape did not survive CSS parsing; provide --cornerfill-corner-shape, data-cornerfill-shape, or attach({cornerShape})",
    );
  }
  const initialBackground = Object.freeze({
    backgroundColor: computed.backgroundColor,
    backgroundImage: computed.backgroundImage,
    backgroundSize: computed.backgroundSize,
    backgroundPosition: computed.backgroundPosition,
    backgroundRepeat: computed.backgroundRepeat,
    backgroundOrigin: computed.backgroundOrigin,
    backgroundClip: computed.backgroundClip,
    backgroundBlendMode: computed.backgroundBlendMode,
    backgroundAttachment: computed.backgroundAttachment,
    imageRendering: computed.imageRendering,
  });
  const carrierPaint = PAINT_CARRIERS.some((name) => readCarrier(computed, name));
  const capturedPaintSource = config.paint ?? captureComputedPaint(initialBackground, carrierPaint ? {
    color: readColorCarrier(computed, CARRIER.backgroundColor),
    image: readCarrier(computed, CARRIER.backgroundImage),
    size: readCarrier(computed, CARRIER.backgroundSize),
    position: readCarrier(computed, CARRIER.backgroundPosition),
    repeat: readCarrier(computed, CARRIER.backgroundRepeat),
    origin: readCarrier(computed, CARRIER.backgroundOrigin),
    clip: readCarrier(computed, CARRIER.backgroundClip),
    blendMode: readCarrier(computed, CARRIER.backgroundBlendMode),
    attachment: readCarrier(computed, CARRIER.backgroundAttachment),
    smoothing: readCarrier(computed, CARRIER.imageRendering),
  } : {});
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
  const initial: Readonly<InitialSources> = Object.freeze({
    radiusSource,
    shapeSource,
    paintSource,
    borderSource,
    shadowSource,
    outlineSource,
    radiusCarrierBaseline: dynamicCarriers
      ? Object.freeze({
        "top-left": "0px",
        "top-right": "0px",
        "bottom-right": "0px",
        "bottom-left": "0px",
      })
      : radiusCapture?.baseline ?? null,
    shapeCarrierBaseline: shapeCapture.baseline,
    initialBackground,
    rasterIsOpaque: config.rasterIsOpaque === true,
    dynamicCarriers,
    dynamic: Object.freeze({
      radius: config.borderRadius === undefined,
      shape: config.cornerShape === undefined && (dynamicCarriers || shapeCapture.present === true),
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
  readonly borderSource: unknown;
  readonly outlineSource: unknown;
  readonly paintSource: PaintSource;
  readonly radiusSource: RadiusSource;
  readonly shadowSource: unknown;
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
    radiusSource = initial.dynamicCarriers
      ? Object.freeze({
        kind: "longhands",
        values: Object.freeze([
          computed.borderTopLeftRadius,
          computed.borderTopRightRadius,
          computed.borderBottomRightRadius,
          computed.borderBottomLeftRadius,
        ]) as Four<string>,
      })
      : captureRadiusCarriers(computed, initial.radiusCarrierBaseline)?.source
        ?? Object.freeze({
          kind: "longhands",
          values: Object.freeze([
            computed.borderTopLeftRadius,
            computed.borderTopRightRadius,
            computed.borderBottomRightRadius,
            computed.borderBottomLeftRadius,
          ]) as Four<string>,
        });
  }
  let shapeSource = state.cornerShape ?? initial.shapeSource;
  if (state.cornerShape === undefined && initial.dynamic.shape) {
    shapeSource = captureShapeCarriers(computed, initial.shapeCarrierBaseline)?.source
      ?? initial.shapeSource;
  }
  let paintSource = state.paint ?? initial.paintSource;
  if (state.paint === undefined && initial.dynamic.paint) {
    const paintDefaults = initial.dynamicCarriers ? {
      backgroundColor: "transparent",
      backgroundImage: "none",
      backgroundSize: "auto",
      backgroundPosition: "0% 0%",
      backgroundRepeat: "repeat",
      backgroundOrigin: "padding-box",
      backgroundClip: "border-box",
      backgroundBlendMode: "normal",
      backgroundAttachment: "scroll",
    } : computed;
    paintSource = captureComputedPaint(paintDefaults, {
      color: readColorCarrier(computed, CARRIER.backgroundColor),
      image: readCarrier(computed, CARRIER.backgroundImage),
      size: readCarrier(computed, CARRIER.backgroundSize),
      position: readCarrier(computed, CARRIER.backgroundPosition),
      repeat: readCarrier(computed, CARRIER.backgroundRepeat),
      origin: readCarrier(computed, CARRIER.backgroundOrigin),
      clip: readCarrier(computed, CARRIER.backgroundClip),
      blendMode: readCarrier(computed, CARRIER.backgroundBlendMode),
      attachment: readCarrier(computed, CARRIER.backgroundAttachment),
      smoothing: readCarrier(computed, CARRIER.imageRendering),
    });
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
  let borderSource = state.border ?? initial.borderSource;
  if (state.border === undefined && initial.dynamic.border) {
    let colorCarrier = readBorderColorCarriers(computed);
    if (initial.dynamicCarriers && Array.isArray(colorCarrier)) {
      colorCarrier = colorCarrier.map((color) => color || computed.color);
    }
    borderSource = captureBorder(
      computed,
      colorCarrier
        || (initial.dynamicCarriers
          ? computed.color
          : isRecord(initial.borderSource) && typeof initial.borderSource.color === "string"
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
  for (const [identity, lease] of entry.layerImageLeases ?? []) {
    if (keep?.has(identity)) continue;
    lease.release();
    entry.layerImageLeases.delete(identity);
  }
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
    paint: Object.freeze({
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
    }),
    implementation: Object.freeze({
      status: "IMPLEMENTED",
      scope: "reported paint paths and admitted fallback semantics",
    }),
    oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
    limitations: CORNERFILL_LIMITATIONS,
  });
}

function ownershipStylesheetText(id: string): string {
  const selector = `[${OWNERSHIP_ATTRIBUTE}="${id}"]`;
  return `${selector} {\n`
    + `  background-color: transparent !important;\n`
    + `  background-image: var(${LIVE_IMAGE_PROPERTY}) !important;\n`
    + `  background-size: 100% 100% !important;\n`
    + `  background-position: 0 0 !important;\n`
    + `  background-repeat: no-repeat !important;\n`
    + `  background-origin: border-box !important;\n`
    + `  background-clip: border-box !important;\n`
    + `  background-blend-mode: normal !important;\n`
    + `  background-attachment: scroll !important;\n`
    + `  box-shadow: none !important;\n`
    + `  outline: none !important;\n`
    + `  border-top-left-radius: 0 !important;\n`
    + `  border-top-right-radius: 0 !important;\n`
    + `  border-bottom-right-radius: 0 !important;\n`
    + `  border-bottom-left-radius: 0 !important;\n`
    + `}\n`
    + `${selector}[${OWNED_BORDER_ATTRIBUTE}="${id}"] {\n`
    + `  border-top-color: transparent !important;\n`
    + `  border-right-color: transparent !important;\n`
    + `  border-bottom-color: transparent !important;\n`
    + `  border-left-color: transparent !important;\n`
    + `}\n`;
}

function applyOwnedStyles(entry: RuntimeEntry, verify = true): void {
  const { controller, element, surface } = entry;
  if (!surface) return;
  controller._ensureOwnershipStylesheet(entry.ownershipRoot);
  controller._setOwnershipSurface(entry);
  element.setAttribute(OWNERSHIP_ATTRIBUTE, controller.ownershipId);
  if (entry.border) element.setAttribute(OWNED_BORDER_ATTRIBUTE, controller.ownershipId);
  else element.removeAttribute(OWNED_BORDER_ATTRIBUTE);
  if (verify) controller._assertOwnedStylesApplied(entry);
}

function withAuthoredComputedStyle<T>(
  view: Window,
  entry: RuntimeEntry,
  callback: (computed: CSSStyleDeclaration) => T,
): T {
  const { element, controller } = entry;
  const ownership = element.getAttribute(OWNERSHIP_ATTRIBUTE);
  const ownedBorder = element.getAttribute(OWNED_BORDER_ATTRIBUTE);
  const releaseOwnership = ownership === controller.ownershipId;
  if (!releaseOwnership) return callback(view.getComputedStyle(element));
  element.removeAttribute(OWNERSHIP_ATTRIBUTE);
  element.removeAttribute(OWNED_BORDER_ATTRIBUTE);
  try {
    return callback(view.getComputedStyle(element));
  } finally {
    element.setAttribute(OWNERSHIP_ATTRIBUTE, ownership);
    if (ownedBorder !== null) element.setAttribute(OWNED_BORDER_ATTRIBUTE, ownedBorder);
  }
}

function surfaceTokenIsApplied(entry: RuntimeEntry): boolean {
  return Boolean(entry.surface)
    && entry.controller._ownershipStylesheetIsConnected(entry.ownershipRoot)
    && entry.element.getAttribute(OWNERSHIP_ATTRIBUTE) === entry.controller.ownershipId
    && entry.element.getAttribute(OWNED_SURFACE_ATTRIBUTE) === entry.ownershipToken
    && entry.controller._ownershipSurfaceIsCurrent(entry);
}

function inlineCarrierSignature(element: CornerfillElement): string {
  return ALL_CARRIERS
    .map((property) => `${property}:${element.style.getPropertyValue(property)}`)
    .join("|");
}

function visibilityAffectingInlineSignature(value: unknown): string {
  return String(value ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 0) return false;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      return property === "visibility" || property === "all"
        || (property.startsWith("--") && property !== LIVE_IMAGE_PROPERTY);
    })
    .join(";");
}

function styleMutationMayAffectVisibility(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return visibilityAffectingInlineSignature(record.oldValue)
    !== visibilityAffectingInlineSignature(target?.getAttribute("style"));
}

function paintAffectingInlineSignature(value: unknown, ignorePositionAxes = false): string {
  return String(value ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 0) return false;
      const property = declaration.slice(0, separator).trim().toLowerCase();
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
    })
    .join(";");
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
  return String(value ?? "")
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 0) return false;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      return property === "background-position-x" || property === "background-position-y";
    })
    .join(";");
}

function styleMutationMayAffectPosition(record: MutationRecord): boolean {
  const target = record.target.nodeType === 1 ? record.target as Element : null;
  return positionAffectingInlineSignature(record.oldValue)
    !== positionAffectingInlineSignature(target?.getAttribute("style"));
}

function shadowIncludingContains(ancestor: Node, element: Node): boolean {
  let current: Node | null = element;
  while (current) {
    if (current === ancestor) return true;
    if (current.parentNode) {
      current = current.parentNode;
      continue;
    }
    const root = current.getRootNode?.() as Node & { readonly host?: Element | undefined };
    current = root.host ?? null;
  }
  return false;
}

function positionAxisSpec(axis: "x" | "y", value: string): BackgroundPositionComponent {
  const parsed = parseBackgroundPosition(axis === "x" ? `${value} 0px` : `0px ${value}`);
  if (parsed.kind !== "components") throw new TypeError("background position did not resolve to components");
  return parsed[axis];
}

function captureBackgroundPosition(entry: RuntimeEntry): boolean {
  const { style } = entry.element;
  const initial = entry.initial;
  if (!initial || !initial.dynamic.paintPosition) return false;
  const xValue = style.getPropertyValue("background-position-x").trim();
  const yValue = style.getPropertyValue("background-position-y").trim();
  if (xValue === entry.inlineBackgroundPositionX && yValue === entry.inlineBackgroundPositionY) return false;
  const xChanged = xValue !== entry.inlineBackgroundPositionX;
  const yChanged = yValue !== entry.inlineBackgroundPositionY;
  const previous = entry.dynamicBackgroundPositionSpec;
  const components = previous?.kind === "components"
    ? previous
    : parseBackgroundPosition("0px 0px") as Extract<BackgroundPositionSpec, { kind: "components" }>;
  let x = components.x;
  let y = components.y;
  let authored: Extract<BackgroundPositionSpec, { kind: "components" }> | null = null;
  if ((xChanged && !xValue) || (yChanged && !yValue)) {
    authored = withAuthoredComputedStyle(entry.controller.view, entry, (computed) => (
      parseBackgroundPosition(
        computed.getPropertyValue("background-position").trim()
          || computed.backgroundPosition
          || initial.initialBackground.backgroundPosition
          || "0% 0%",
      ) as Extract<BackgroundPositionSpec, { kind: "components" }>
    ));
  }
  if (xChanged) x = xValue ? positionAxisSpec("x", xValue) : authored!.x;
  if (yChanged) y = yValue ? positionAxisSpec("y", yValue) : authored!.y;
  entry.inlineBackgroundPositionX = xValue;
  entry.inlineBackgroundPositionY = yValue;
  const next = Object.freeze({ kind: "components", x, y });
  const changed = JSON.stringify(next) !== JSON.stringify(previous);
  entry.dynamicBackgroundPositionSpec = next;
  return changed;
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
    mode: entry.mode,
    backend: entry.native ? "native-corner-shape" : surface?.backend ?? "pending",
    paintOwnership: entry.native ? "browser-native" : "host-background-border-and-contained-effects",
    implementationStatus: entry.native ? "NATIVE" : "IMPLEMENTED",
    oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
    ownershipVerified: entry.native ? true : entry.ownershipVerified === true,
    transformOwnedByCornerfill: false,
    visible: entry.native ? null : entry.visible,
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
      visible: entry.visible,
      backgroundPosition: entry.preparedPaintProgram
        ? Object.freeze([entry.positionX, entry.positionY])
        : null,
      layoutUpdates: "explicit",
    }) : null,
    counters: Object.freeze({ ...entry.counters }),
  }) as Readonly<CornerfillEntryExplanation>;
}

class CornerfillController {
  declare readonly document: Document;
  declare readonly view: RuntimeWindow;
  declare readonly options: Readonly<ResolvedCornerfillOptions>;
  declare readonly capabilities: ReturnType<typeof detectCornerfillCapabilities>;
  declare readonly ownershipId: string;
  declare readonly ownershipStylesheets: Map<OwnershipRoot, HTMLStyleElement>;
  declare readonly ownershipSurfaces: Map<RuntimeEntry, Readonly<OwnershipSurface>>;
  declare readonly ownershipSurfaceRules: Map<RuntimeEntry, Readonly<OwnershipSurfaceRule>>;
  declare readonly ownershipFreeRules: Map<OwnershipRoot, CSSStyleRule[]>;
  declare nextOwnershipToken: number;
  declare readonly ownershipRootCounts: Map<OwnershipRoot, number>;
  declare readonly rootObservers: Map<OwnershipRoot, MutationObserver | null>;
  declare readonly attachmentLifecycleObservers: Map<OwnershipRoot, MutationObserver>;
  declare attachmentLifecycleQueued: boolean;
  declare readonly entries: Set<RuntimeEntry>;
  declare readonly entryByElement: WeakMap<CornerfillElement, RuntimeEntry>;
  declare readonly geometryCache: Map<string, CornerGeometry>;
  declare readonly dirty: Set<RuntimeEntry>;
  declare readonly preparedDirty: Set<RuntimeEntry>;
  declare readonly preparedOwnershipVerificationEntries: Set<RuntimeEntry>;
  declare preparedOwnershipVerification: Promise<Map<RuntimeEntry, unknown>> | null;
  declare preparedFlushQueued: boolean;
  declare readonly activeAnimations: Map<RuntimeEntry, Set<string>>;
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
      maxSurfacePixels: options.maxSurfacePixels ?? 16_777_216,
      maxGeometryCacheEntries: options.maxGeometryCacheEntries ?? 2048,
      maxImageCacheEntries: options.maxImageCacheEntries ?? 32,
      maxImageCachePixels: options.maxImageCachePixels ?? 67_108_864,
      maxWebkitPoolEntries: options.maxWebkitPoolEntries ?? 256,
      maxWebkitPoolPrefixes: options.maxWebkitPoolPrefixes ?? 16,
      idPrefix: options.idPrefix ?? "cornerfill",
      nonce: options.nonce ?? null,
    });
    this.capabilities = detectCornerfillCapabilities(this.document, {
      nativeQualification: options.nativeQualification,
    });
    this.ownershipId = nextControllerId(this.document);
    this.ownershipStylesheets = new Map();
    this.ownershipSurfaces = new Map();
    this.ownershipSurfaceRules = new Map();
    this.ownershipFreeRules = new Map();
    this.nextOwnershipToken = 0;
    this.ownershipRootCounts = new Map();
    this.rootObservers = new Map();
    this.attachmentLifecycleObservers = new Map();
    this.attachmentLifecycleQueued = false;
    this.entries = new Set();
    this.entryByElement = new WeakMap();
    this.geometryCache = new Map();
    this.dirty = new Set();
    this.preparedDirty = new Set();
    this.preparedOwnershipVerificationEntries = new Set();
    this.preparedOwnershipVerification = null;
    this.preparedFlushQueued = false;
    this.activeAnimations = new Map();
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
      preparedScheduledFlushes: 0,
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
    });
    this._onMutation = this._onMutation.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onAnimationStart = this._onAnimationStart.bind(this);
    this._onAnimationEnd = this._onAnimationEnd.bind(this);
    this._animationTick = this._animationTick.bind(this);
    this._flushPrepared = this._flushPrepared.bind(this);
    this.observersInstalled = false;
  }

  _ownershipStylesheetIsConnected(root: OwnershipRoot): boolean {
    return Boolean(this.ownershipStylesheets.get(root)?.isConnected);
  }

  _setOwnershipSurface(entry: RuntimeEntry): void {
    const surface = entry.surface;
    if (!surface) throw new Error("Cornerfill surface is unavailable");
    entry.ownershipToken ??= `${this.ownershipId}-surface-${++this.nextOwnershipToken}`;
    const previous = this.ownershipSurfaces.get(entry);
    const next = Object.freeze({ root: entry.ownershipRoot, image: surface.cssImage });
    if (previous?.root === next.root && previous.image === next.image
      && entry.element.getAttribute(OWNED_SURFACE_ATTRIBUTE) === entry.ownershipToken
      && this._ownershipSurfaceRuleIsCurrent(entry, next)) return;
    if (previous && previous.root !== next.root) this._releaseOwnershipSurfaceRule(entry);
    this.ownershipSurfaces.set(entry, next);
    entry.element.setAttribute(OWNED_SURFACE_ATTRIBUTE, entry.ownershipToken);
    this._ensureOwnershipStylesheet(next.root);
    this._assignOwnershipSurfaceRule(entry, next);
  }

  _removeOwnershipSurface(entry: RuntimeEntry): void {
    this._releaseOwnershipSurfaceRule(entry);
    this.ownershipSurfaces.delete(entry);
  }

  _ownershipSurfaceSelector(entry: RuntimeEntry): string {
    return `[${OWNERSHIP_ATTRIBUTE}="${this.ownershipId}"]`
      + `[${OWNED_SURFACE_ATTRIBUTE}="${entry.ownershipToken}"]`;
  }

  _ownershipSurfaceRuleIsCurrent(
    entry: RuntimeEntry,
    surface: Readonly<OwnershipSurface> | undefined = this.ownershipSurfaces.get(entry),
  ): boolean {
    const record = this.ownershipSurfaceRules.get(entry);
    const stylesheet = surface ? this.ownershipStylesheets.get(surface.root) : undefined;
    return Boolean(record && surface && stylesheet?.isConnected
      && record.root === surface.root
      && record.rule.parentStyleSheet === stylesheet.sheet
      && record.rule.selectorText === this._ownershipSurfaceSelector(entry)
      && record.rule.style.getPropertyValue(LIVE_IMAGE_PROPERTY).trim() === surface.image
      && record.rule.style.getPropertyPriority(LIVE_IMAGE_PROPERTY) === "important");
  }

  _assignOwnershipSurfaceRule(entry: RuntimeEntry, surface: Readonly<OwnershipSurface>): void {
    if (this._ownershipSurfaceRuleIsCurrent(entry, surface)) return;
    this._releaseOwnershipSurfaceRule(entry);
    const style = this.ownershipStylesheets.get(surface.root);
    const sheet = style?.sheet;
    if (!style?.isConnected || !sheet) throw new Error("Cornerfill ownership stylesheet is unavailable");
    let free = this.ownershipFreeRules.get(surface.root);
    let rule = free?.pop() ?? null;
    if (free?.length === 0) this.ownershipFreeRules.delete(surface.root);
    const selector = this._ownershipSurfaceSelector(entry);
    if (!rule) {
      const index = sheet.insertRule(`${selector}{${LIVE_IMAGE_PROPERTY}:${surface.image}!important}`);
      rule = sheet.cssRules[index] as CSSStyleRule | undefined ?? null;
    } else {
      rule.selectorText = selector;
      rule.style.setProperty(LIVE_IMAGE_PROPERTY, surface.image, "important");
    }
    if (!rule) throw new Error("Cornerfill ownership rule was not created");
    this.ownershipSurfaceRules.set(entry, Object.freeze({ root: surface.root, rule }));
  }

  _releaseOwnershipSurfaceRule(entry: RuntimeEntry): void {
    const record = this.ownershipSurfaceRules.get(entry);
    if (!record) return;
    this.ownershipSurfaceRules.delete(entry);
    const style = this.ownershipStylesheets.get(record.root);
    if (!style?.isConnected || record.rule.parentStyleSheet !== style.sheet) return;
    record.rule.selectorText = ":not(*)";
    record.rule.style.removeProperty(LIVE_IMAGE_PROPERTY);
    let free = this.ownershipFreeRules.get(record.root);
    if (!free) {
      free = [];
      this.ownershipFreeRules.set(record.root, free);
    }
    free.push(record.rule);
  }

  _ownershipSurfaceIsCurrent(entry: RuntimeEntry): boolean {
    const record = this.ownershipSurfaces.get(entry);
    if (!record) return false;
    return record.root === entry.ownershipRoot
      && record.image === entry.surface?.cssImage
      && this._ownershipSurfaceRuleIsCurrent(entry, record);
  }

  _repairEntryOwnership(entry: RuntimeEntry): boolean {
    if (entry.native || entry.disposed || !entry.surface || surfaceTokenIsApplied(entry)) return false;
    applyOwnedStyles(entry);
    this.counters.ownershipRepairs += 1;
    entry.counters.ownershipRepairs += 1;
    entry.lastInvalidationReason = "ownership-repair-without-repaint";
    return true;
  }

  _ensureOwnershipStylesheet(root: OwnershipRoot): HTMLStyleElement {
    if (this.destroyed) throw new Error("Cornerfill controller is destroyed");
    const existing = this.ownershipStylesheets.get(root);
    if (existing?.isConnected) return existing;
    existing?.remove();
    this.ownershipFreeRules.delete(root);
    for (const [entry, record] of this.ownershipSurfaceRules) {
      if (record.root === root) this.ownershipSurfaceRules.delete(entry);
    }
    const style = this.document.createElement("style");
    style.setAttribute("data-cornerfill-ownership-styles", this.ownershipId);
    if (this.options.nonce) style.setAttribute("nonce", this.options.nonce);
    style.textContent = ownershipStylesheetText(this.ownershipId);
    if (root === this.document) (this.document.head ?? this.document.documentElement).append(style);
    else if (root && typeof root.append === "function") root.append(style);
    else throw new TypeError("Cornerfill ownership requires a Document or ShadowRoot");
    this.ownershipStylesheets.set(root, style);
    for (const [entry, surface] of this.ownershipSurfaces) {
      if (!entry.disposed && surface.root === root) this._assignOwnershipSurfaceRule(entry, surface);
    }
    return style;
  }

  _assertOwnedStylesApplied(entry: RuntimeEntry): void {
    const surface = entry.surface;
    if (!surface) throw new Error("Cornerfill surface is unavailable");
    const computed = this.view.getComputedStyle(entry.element);
    const image = computed.backgroundImage;
    const expectedImage = surface.backend === "static-data-url"
      ? image === surface.cssImage
        || image.includes(surface.cssImage.slice(5, -2))
      : image.includes(surface.id);
    const transparent = isFullyTransparentCssColor(computed.backgroundColor);
    const radiiOwned = RADIUS_LONGHANDS.every((property) => (
      numberFromPx(computed.getPropertyValue(property)) === 0
    ));
    const borderOwned = !entry.border || [
      computed.borderTopColor,
      computed.borderRightColor,
      computed.borderBottomColor,
      computed.borderLeftColor,
    ].every(isFullyTransparentCssColor);
    const layoutOwned = computed.backgroundRepeat === "no-repeat"
      && computed.backgroundOrigin === "border-box"
      && computed.backgroundClip === "border-box"
      && computed.backgroundBlendMode === "normal"
      && computed.backgroundAttachment === "scroll"
      && computed.backgroundSize === "100% 100%"
      && new Set(["0% 0%", "0px 0px"]).has(computed.backgroundPosition);
    const effectsOwned = computed.boxShadow === "none" && computed.outlineStyle === "none";
    if (!expectedImage || !transparent || !radiiOwned || !borderOwned || !layoutOwned || !effectsOwned) {
      throw new TypeError(
        `${CORNERFILL_LIMITATIONS.authorImportantOwnership.reason} `
        + `Computed ownership: image=${image}, color=${computed.backgroundColor}.`,
      );
    }
    entry.ownershipVerified = true;
    entry.ownershipLastVerified = this.view.performance?.now?.() ?? Date.now();
  }

  _verifyPreparedOwnership(entry: RuntimeEntry): Promise<void> {
    this.preparedOwnershipVerificationEntries.add(entry);
    if (!this.preparedOwnershipVerification) {
      this.preparedOwnershipVerification = new Promise<Map<RuntimeEntry, unknown>>((resolve) => {
        this.view.setTimeout(() => {
          const failures = new Map<RuntimeEntry, unknown>();
          const entries = [...this.preparedOwnershipVerificationEntries];
          this.preparedOwnershipVerificationEntries.clear();
          for (const candidate of entries) {
            if (!this._entryIsCurrent(candidate) || !candidate.surface) continue;
            try {
              this._assertOwnedStylesApplied(candidate);
            } catch (error) {
              failures.set(candidate, error);
            }
          }
          resolve(failures);
        }, 0);
      }).finally(() => {
        this.preparedOwnershipVerification = null;
      });
    }
    const verification = this.preparedOwnershipVerification;
    return verification.then((failures) => {
      const failure = failures.get(entry);
      if (failure) throw failure;
    });
  }

  _retainOwnershipRoot(root: OwnershipRoot, observe: boolean): void {
    this.ownershipRootCounts.set(root, (this.ownershipRootCounts.get(root) ?? 0) + 1);
    if (observe) this._installObservers(root);
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
    if (root !== this.document) {
      this.ownershipStylesheets.get(root)?.remove();
      this.ownershipStylesheets.delete(root);
      this.ownershipFreeRules.delete(root);
      for (const [entry, record] of this.ownershipSurfaceRules) {
        if (record.root === root) this.ownershipSurfaceRules.delete(entry);
      }
    }
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
        if (record.attributeName === "class" || record.attributeName === "style") {
          selectorAncestors.add(record.target);
        }
        const entry = record.target.nodeType === 1
          ? this.entryByElement.get(record.target as CornerfillElement)
          : undefined;
        if (!entry || entry.native || entry.prepared || entry.disposed) continue;
        if (record.attributeName !== "style") {
          if ((record.attributeName === OWNERSHIP_ATTRIBUTE
            || record.attributeName === OWNED_BORDER_ATTRIBUTE
            || record.attributeName === OWNED_SURFACE_ATTRIBUTE)
            && surfaceTokenIsApplied(entry)) {
            this.counters.ignoredStyleMutations += 1;
            entry.counters.ignoredStyleMutations += 1;
            continue;
          }
          if (record.attributeName === "class") this._updateEntryStyleVisibility(entry);
          this._markDirty(entry, "style-selector-input", true);
          continue;
        }
        const paintInputChanged = styleMutationMayAffectPaint(record, entry.watchPosition);
        const positionInputChanged = styleMutationMayAffectPosition(record);
        if (!visibilityInputChanged && !paintInputChanged && !positionInputChanged) {
          if (entry.initialized && !surfaceTokenIsApplied(entry)) {
            styleEntries.add(entry);
            continue;
          }
          this.counters.ignoredStyleMutations += 1;
          entry.counters.ignoredStyleMutations += 1;
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
        ? captureBackgroundPosition(entry)
        : false;
      if (positionChanged) {
        this.counters.dynamicPaintUpdates += 1;
        entry.counters.dynamicPaintUpdates += 1;
      }
      const visibilityChanged = entry.watchVisibility && visibilityStyleEntries.has(entry)
        ? this._updateEntryStyleVisibility(entry)
        : false;
      const paintInputChanged = paintStyleEntries.has(entry);
      const nextVisible = entry.visible;
      const ownershipDamaged = entry.initialized && !surfaceTokenIsApplied(entry);
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
        entry.counters.ignoredStyleMutations += 1;
      }
    }
    if (visibilityAncestors.size > 0) {
      for (const entry of this.entries) {
        if (entry.native || entry.prepared || entry.disposed || !entry.watchVisibility
          || visibilityAncestors.has(entry.element)) continue;
        const inheritedVisibilityMayHaveChanged = [...visibilityAncestors].some((ancestor) => (
          shadowIncludingContains(ancestor, entry.element)
        ));
        if (!inheritedVisibilityMayHaveChanged) continue;
        const visibilityChanged = this._updateEntryStyleVisibility(entry);
        if (visibilityChanged && entry.visible) this._markDirty(entry, "visibility", true);
      }
    }
    if (selectorAncestors.size > 0) {
      for (const entry of this.entries) {
        if (entry.native || entry.prepared || entry.disposed
          || selectorAncestors.has(entry.element)) continue;
        const selectorInputMayHaveChanged = [...selectorAncestors].some((ancestor) => (
          shadowIncludingContains(ancestor, entry.element)
        ));
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
    entry.counters.visibilityUpdates += 1;
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
      applyOwnedStyles(entry);
    } catch (error) {
      entry.ownershipRoot = previousRoot;
      this._releaseOwnershipRoot(nextRoot);
      throw error;
    }
    this._releaseOwnershipRoot(previousRoot);
    this.counters.ownershipRepairs += 1;
    entry.counters.ownershipRepairs += 1;
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
          } else if (ownershipRepaired) {
            this._clearError(entry);
          }
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

  _settleWaiters(entry: RuntimeEntry, revision: number, error: unknown = null): void {
    const pending: EntryWaiter[] = [];
    for (const waiter of entry.waiters) {
      if (waiter.revision > revision) {
        pending.push(waiter);
        continue;
      }
      if (error) waiter.reject(error);
      else waiter.resolve(entryExplanation(entry));
    }
    entry.waiters = pending;
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
    return new Promise((resolve, reject) => entry.waiters.push({ resolve, reject, revision }));
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
            const committed = await this._refreshEntry(entry, revision);
            if (committed === false) continue;
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
          this._removeOwnershipSurface(entry);
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

  async _resolvedPaint(
    entry: RuntimeEntry,
    descriptor: NormalizedPaintDescriptor,
    width: number,
    height: number,
    revision: number | null = null,
    boxMetrics: Readonly<BackgroundBoxMetricsInput> | undefined = descriptor.box,
  ): Promise<ResolvedPaintDescriptor> {
    if (descriptor.kind === "layers") {
      if (entry.imageLease) {
        entry.imageLease.release();
        entry.imageLease = null;
        entry.imageLeaseUrl = null;
      }
      const desired = new Set<string>();
      const layers: NormalizedBackgroundLayer[] = [];
      for (const layer of descriptor.layers) {
        if (layer.kind !== "image" || layer.image) {
          layers.push(layer);
          continue;
        }
        const request = imageRequest(this.document, layer);
        desired.add(request.identity);
        let lease = entry.layerImageLeases.get(request.identity);
        if (!lease) {
          lease = this.images.acquire(request.absoluteUrl, { crossOrigin: request.crossOrigin });
          entry.layerImageLeases.set(request.identity, lease);
        }
        let image: CornerfillRasterSource;
        try {
          image = await lease.promise;
        } catch (error) {
          if (!this._entryIsCurrent(entry, revision)
            || entry.layerImageLeases.get(request.identity) !== lease) {
            throw new StaleEntryWorkError();
          }
          throw error;
        }
        if (!this._entryIsCurrent(entry, revision)
          || entry.layerImageLeases.get(request.identity) !== lease) {
          throw new StaleEntryWorkError();
        }
        layers.push(Object.freeze({ ...layer, image }));
      }
      releaseLayerImageLeases(entry, desired);
      entry.resolvedImage = null;
      return resolvePaintForBox(
        Object.freeze({ ...descriptor, layers: Object.freeze(layers) }),
        width,
        height,
        undefined,
        boxMetrics,
      );
    }
    if (descriptor.kind !== "image") {
      if (entry.imageLease) {
        entry.imageLease.release();
        entry.imageLease = null;
        entry.imageLeaseUrl = null;
      }
      releaseLayerImageLeases(entry);
      entry.resolvedImage = null;
      return resolvePaintForBox(descriptor, width, height, undefined, boxMetrics);
    }
    releaseLayerImageLeases(entry);
    let image: CornerfillRasterSource | undefined = descriptor.image;
    if (!image) {
      const request = imageRequest(this.document, descriptor);
      const { absoluteUrl, crossOrigin, identity: leaseIdentity } = request;
      if (!entry.imageLease || entry.imageLeaseUrl !== leaseIdentity) {
        entry.imageLease?.release();
        entry.imageLease = this.images.acquire(absoluteUrl, { crossOrigin });
        entry.imageLeaseUrl = leaseIdentity;
      }
      const lease = entry.imageLease;
      try {
        image = await lease.promise;
      } catch (error) {
        if (!this._entryIsCurrent(entry, revision) || entry.imageLease !== lease) {
          throw new StaleEntryWorkError();
        }
        throw error;
      }
      if (!this._entryIsCurrent(entry, revision) || entry.imageLease !== lease) {
        throw new StaleEntryWorkError();
      }
    } else if (entry.imageLease) {
      entry.imageLease.release();
      entry.imageLease = null;
      entry.imageLeaseUrl = null;
    }
    entry.resolvedImage = image;
    return resolvePaintForBox(descriptor, width, height, image, boxMetrics);
  }

  async _snapshot(
    entry: RuntimeEntry,
    revision: number | null = null,
  ): Promise<Readonly<DynamicSnapshot>> {
    const authored = withAuthoredComputedStyle(this.view, entry, (computed) => {
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
    const paint = await this._resolvedPaint(entry, descriptor, width, height, revision, boxMetrics);
    this._assertEntryCurrent(entry, revision);
    const nextPaintKey = `${width}|${height}|${descriptorKey}|${JSON.stringify(boxMetrics)}`;
    const border = normalizeBorder(sources.borderSource);
    const nextBorderKey = border ? JSON.stringify(border) : "none";
    const shadow = normalizeInsetShadow(sources.shadowSource);
    const outline = normalizeContainedOutline(sources.outlineSource);
    assertOutlineHost(this.view, entry.element, outline);
    const nextEffectsKey = JSON.stringify([shadow, outline]);
    return Object.freeze({
      computed: authored.computed,
      width,
      height,
      dpr,
      geometry,
      geometryKey: nextGeometryKey,
      paint,
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
  }

  async _initializeEntry(entry: RuntimeEntry): Promise<CornerfillEntryExplanation> {
    while (this._entryIsCurrent(entry)) {
      const revision = entry.revision;
      try {
        const snapshot = await this._snapshot(entry, revision);
        this._assertEntryCurrent(entry, revision);
        const surface = createSurface(this.document, {
          cssWidth: snapshot.width,
          cssHeight: snapshot.height,
          dpr: snapshot.dpr,
          allowStatic: this.options.staticFallback,
          backend: this.options.backend,
          idPrefix: this.options.idPrefix,
          maxSurfacePixels: this.options.maxSurfacePixels,
          maxWebkitPoolEntries: this.options.maxWebkitPoolEntries,
          maxWebkitPoolPrefixes: this.options.maxWebkitPoolPrefixes,
        });
        if (!this._entryIsCurrent(entry, revision)) {
          surface.dispose();
          throw new StaleEntryWorkError();
        }
        entry.surface = surface;
        entry.geometry = snapshot.geometry;
        entry.geometryKey = snapshot.geometryKey;
        entry.width = snapshot.width;
        entry.height = snapshot.height;
        entry.dpr = snapshot.dpr;
        entry.dynamicPaintSource = snapshot.paintSource;
        entry.paintKey = snapshot.paintKey;
        entry.borderKey = snapshot.borderKey;
        entry.border = snapshot.border;
        entry.effectsKey = snapshot.effectsKey;
        entry.shadow = snapshot.shadow;
        entry.outline = snapshot.outline;
        entry.composition = snapshot.composition;
        entry.boxMetrics = snapshot.boxMetrics;
        entry.paintResult = paintCornerfill(entry.surface.context, {
          geometry: snapshot.geometry,
          paint: snapshot.paint,
          border: snapshot.border,
          shadow: snapshot.shadow,
          outline: snapshot.outline,
          dpr: snapshot.dpr,
        });
        entry.surface.commit();
        this._assertEntryCurrent(entry, revision);
        applyOwnedStyles(entry);
        entry.counters.paints += 1;
        this.counters.paints += 1;
        entry.initialized = true;
        entry.committedRevision = revision;
        this._clearError(entry);
        entry.lastInvalidationReason = "initial-paint";
        this.resizeObserver?.observe(entry.element);
        return entryExplanation(entry);
      } catch (error) {
        entry.surface?.dispose();
        entry.surface = null;
        if (error instanceof StaleEntryWorkError) {
          if (this._entryIsCurrent(entry)) {
            this.counters.staleRefreshes += 1;
            continue;
          }
          this.counters.cancelledInitializations += 1;
          return entryExplanation(entry);
        }
        this._recordError(entry, error);
        this._removeOwnershipSurface(entry);
        restoreOwnershipState(entry.element, entry.ownershipSnapshot);
        entry.imageLease?.release();
        entry.imageLease = null;
        releaseLayerImageLeases(entry);
        entry.resolvedImage = null;
        throw error;
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
    if (!paintChanged && !entry.needsPaint && !entry.forcePaint) {
      this.counters.ignoredStyleChanges += 1;
      entry.counters.ignoredStyleChanges += 1;
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
      entry.counters.opaqueFastPaints += 1;
      this.counters.opaqueFastPaints += 1;
    }
    surface.commit();
    if (surface.backend === "static-data-url") applyOwnedStyles(entry);
    entry.counters.paints += 1;
    this.counters.paints += 1;
    entry.counters.paintOnlyUpdates += 1;
    this.counters.paintOnlyUpdates += 1;
    entry.needsPaint = false;
    entry.forcePaint = false;
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
    const dynamicPaintOnly = reason === "background-position"
      && initial.dynamic.paintPosition
      && entry.dynamicPaintSource.kind === "image"
      && state.paint === undefined
      && !needsFullRefresh;
    if (dynamicPaintOnly) {
      return this._refreshDynamicPaint(entry, reason);
    }
    return this._refreshEntryFull(entry, reason, revision);
  }

  async _refreshEntryFull(entry: RuntimeEntry, reason: string | null, revision: number): Promise<boolean> {
    this.counters.styleChecks += 1;
    entry.counters.styleChecks += 1;
    const snapshot = await this._snapshot(entry, revision);
    this._assertEntryCurrent(entry, revision);
    const surface = entry.surface;
    if (!surface) throw new Error("full refresh requires an initialized surface");
    this._updateEntryStyleVisibility(entry, snapshot.computed);
    const geometryChanged = snapshot.geometryKey !== entry.geometryKey;
    const paintChanged = snapshot.paintKey !== entry.paintKey;
    const borderChanged = snapshot.borderKey !== entry.borderKey;
    const effectsChanged = snapshot.effectsKey !== entry.effectsKey;
    const resized = surface.resize(snapshot.width, snapshot.height, snapshot.dpr);
    if (resized) {
      this.counters.surfaceResizes += 1;
      entry.counters.surfaceResizes += 1;
    }
    const needsPaint = geometryChanged || paintChanged || borderChanged || effectsChanged
      || resized || entry.needsPaint || entry.forcePaint;
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
      applyOwnedStyles(entry);
      entry.counters.paints += 1;
      this.counters.paints += 1;
      entry.needsPaint = false;
      entry.forcePaint = false;
      entry.lastInvalidationReason = reason || "direct-update";
    } else if (needsPaint) {
      entry.needsPaint = true;
      entry.lastInvalidationReason = "hidden-paint-deferred";
    } else if (!surfaceTokenIsApplied(entry)) {
      applyOwnedStyles(entry);
      this.counters.ownershipRepairs += 1;
      entry.counters.ownershipRepairs += 1;
      entry.lastInvalidationReason = "ownership-repair-without-repaint";
    } else {
      this._assertOwnedStylesApplied(entry);
      this.counters.ignoredStyleChanges += 1;
      entry.counters.ignoredStyleChanges += 1;
      entry.lastInvalidationReason = "style-change-without-paint-input-change";
    }
    this._clearError(entry);
    return true;
  }

  _selectedFallbackBackend(): ConcreteSurfaceBackend | "none" {
    if (this.options.backend !== "auto") return this.options.backend;
    if (this.capabilities.surfaces.webkitCanvas) return "webkit-canvas";
    if (this.capabilities.surfaces.mozElement) return "moz-element";
    if (this.options.staticFallback) return "static-data-url";
    return "none";
  }

  _createPreparedSurface(entry: RuntimeEntry, verifyOwnership = true): boolean {
    if (entry.surface) return false;
    const backend = entry.backend;
    if (!backend) throw new Error("prepared surface backend is unavailable");
    entry.surface = createSurface(this.document, {
      cssWidth: entry.width,
      cssHeight: entry.height,
      dpr: entry.dpr,
      allowStatic: this.options.staticFallback,
      backend,
      idPrefix: this.options.idPrefix,
      maxSurfacePixels: this.options.maxSurfacePixels,
      maxWebkitPoolEntries: this.options.maxWebkitPoolEntries,
      maxWebkitPoolPrefixes: this.options.maxWebkitPoolPrefixes,
    });
    this._paintPreparedFull(entry, verifyOwnership);
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
    applyOwnedStyles(entry, verifyOwnership);
    this._clearError(entry);
    entry.needsPaint = false;
    entry.counters.paints += 1;
    entry.counters.preparedPaints += 1;
    this.counters.paints += 1;
    this.counters.preparedPaints += 1;
    entry.needsFullPreparedPaint = false;
    this._clearError(entry);
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
    if (entry.needsFullPreparedPaint) {
      this._paintPreparedFull(entry);
      entry.lastInvalidationReason = "prepared-layout-repaint";
      return;
    }
    if (!entry.preparedPaintProgram) {
      throw new TypeError("this prepared entry has no allocation-free opaque raster update program");
    }
    const surface = entry.surface;
    if (!surface) throw new Error("prepared update requires an initialized surface");
    drawPreparedOpaqueImage(
      surface.context,
      entry.preparedPaintProgram,
      entry.positionX,
      entry.positionY,
    );
    surface.commit();
    if (surface.backend === "static-data-url" || !surfaceTokenIsApplied(entry)) applyOwnedStyles(entry);
    entry.paintResult = null;
    entry.needsPaint = false;
    entry.counters.paints += 1;
    entry.counters.paintOnlyUpdates += 1;
    entry.counters.opaqueFastPaints += 1;
    entry.counters.preparedPaints += 1;
    this.counters.paints += 1;
    this.counters.paintOnlyUpdates += 1;
    this.counters.opaqueFastPaints += 1;
    this.counters.preparedPaints += 1;
    entry.lastInvalidationReason = "prepared-background-position";
    this._clearError(entry);
  }

  _queuePrepared(entry: RuntimeEntry, schedule = true): void {
    if (!entry.initialized || !entry.visible) {
      entry.needsPaint = true;
      return;
    }
    this.preparedDirty.add(entry);
    if (schedule && !this.preparedFlushQueued) {
      this.preparedFlushQueued = true;
      this.counters.preparedScheduledFlushes += 1;
      entry.counters.preparedScheduledFlushes += 1;
      queueMicrotask(this._flushPrepared);
    }
  }

  _flushPrepared(throwOnError = false): number {
    this.preparedFlushQueued = false;
    if (this.preparedDirty.size === 0) return 0;
    const entries = [...this.preparedDirty];
    this.preparedDirty.clear();
    let painted = 0;
    let firstError = null;
    for (const entry of entries) {
      const before = entry.counters.paints;
      try {
        this._paintPreparedEntry(entry);
      } catch (error) {
        this._recordError(entry, error);
        firstError ??= error;
      }
      painted += entry.counters.paints - before;
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
    schedule = true,
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
    entry.counters.dynamicPaintUpdates += 1;
    entry.counters.preparedUpdates += 1;
    this.counters.dynamicPaintUpdates += 1;
    this.counters.preparedUpdates += 1;
    this._queuePrepared(entry, schedule);
    return true;
  }

  _setPreparedVisibility(entry: RuntimeEntry, visible: boolean, schedule = true): boolean {
    if (!entry.prepared) throw new TypeError("element is not attached through attachPrepared()");
    const next = Boolean(visible);
    if (entry.visible === next) return false;
    entry.visible = next;
    entry.requestedVisible = next;
    entry.counters.visibilityUpdates += 1;
    entry.counters.preparedUpdates += 1;
    this.counters.visibilityUpdates += 1;
    this.counters.preparedUpdates += 1;
    if (!next) {
      this.preparedDirty.delete(entry);
      return true;
    }
    this._queuePrepared(entry, schedule);
    return true;
  }

  setPreparedBackgroundPosition(element: CornerfillElement, x: number, y: number): void {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed) throw new Error("prepared element is not attached");
    this._setPreparedBackgroundPosition(entry, x, y, true);
  }

  setPreparedBackgroundPositionY(element: CornerfillElement, y: number): void {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed) throw new Error("prepared element is not attached");
    this._setPreparedBackgroundPosition(entry, entry.positionX, y, true);
  }

  setPreparedVisibility(element: CornerfillElement, visible: boolean): void {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed) throw new Error("prepared element is not attached");
    this._setPreparedVisibility(entry, visible, true);
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
      if (update.visible !== undefined) candidate.visible = Boolean(update.visible);
    }
    for (const candidate of candidates.values()) {
      if (candidate.positionSpecified
        || candidate.positionX !== candidate.entry.positionX
        || candidate.positionY !== candidate.entry.positionY) {
        this._setPreparedBackgroundPosition(
          candidate.entry,
          candidate.positionX,
          candidate.positionY,
          false,
        );
      }
      this._setPreparedVisibility(candidate.entry, candidate.visible, false);
    }
    this.counters.preparedBatches += 1;
    return this._flushPrepared(true);
  }

  flushPrepared(): number {
    return this._flushPrepared(true);
  }

  async _resolvePreparedLayout(
    entry: RuntimeEntry,
    config: Readonly<CornerfillPreparedConfig>,
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
    let paint = await this._resolvedPaint(entry, descriptor, width, height, revision);
    this._assertEntryCurrent(entry, revision);
    if (!initial && config.paint === undefined && paint.kind === "image") {
      paint = Object.freeze({
        ...paint,
        backgroundPosition: Object.freeze([entry.positionX, entry.positionY]) as PixelPair,
      });
    }
    const borderSource = config.border === undefined ? entry.preparedBorderSource : config.border;
    const border = normalizeBorder(borderSource ?? null);
    const shadowSource = config.shadow === undefined ? entry.preparedShadowSource : config.shadow;
    const outlineSource = config.outline === undefined ? entry.preparedOutlineSource : config.outline;
    const shadow = normalizeInsetShadow(shadowSource ?? null);
    const outline = normalizeContainedOutline(outlineSource ?? null);
    assertOutlineHost(this.view, entry.element, outline);
    const program = paint.kind === "image" && paint.opaque === true && !border && !shadow && !outline
      ? createPreparedOpaqueImageProgram({ geometry, paint, dpr })
      : null;
    return Object.freeze({
      width,
      height,
      dpr,
      geometry,
      paint,
      descriptor,
      border,
      shadow,
      outline,
      composition,
      borderRadius,
      cornerShape,
      program,
    });
  }

  _commitPreparedLayout(
    entry: RuntimeEntry,
    snapshot: Readonly<PreparedLayoutSnapshot>,
    reason: string,
  ): void {
    this._assertEntryCurrent(entry);
    this._reconcileEntryOwnershipRoot(entry);
    const resized = entry.surface?.resize(snapshot.width, snapshot.height, snapshot.dpr) ?? false;
    if (resized) {
      this.counters.surfaceResizes += 1;
      entry.counters.surfaceResizes += 1;
    }
    applyPreparedLayoutSnapshot(entry, snapshot);
    entry.needsPaint = true;
    entry.needsFullPreparedPaint = true;
    if (entry.visible) {
      if (!entry.surface) this._createPreparedSurface(entry);
      else this._paintPreparedFull(entry);
    }
    entry.counters.preparedUpdates += 1;
    entry.counters.preparedLayoutUpdates += 1;
    this.counters.preparedUpdates += 1;
    this.counters.preparedLayoutUpdates += 1;
    entry.lastInvalidationReason = reason;
    this._clearError(entry);
  }

  resizePrepared(
    element: CornerfillElement,
    config: Readonly<CornerfillPreparedConfig> = {},
  ): Promise<CornerfillEntryExplanation> {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed || !entry.prepared) throw new Error("prepared element is not attached");
    const predecessor = entry.preparedLayoutChain ?? entry.ready;
    if (!predecessor) throw new Error("prepared entry initialization has not started");
    const operation = predecessor.then(async () => {
      this._assertEntryCurrent(entry);
      const revision = ++entry.revision;
      try {
        const snapshot = await this._resolvePreparedLayout(entry, config, revision, false);
        this._assertEntryCurrent(entry, revision);
        this._commitPreparedLayout(entry, snapshot, "prepared-layout-update");
        entry.committedRevision = revision;
        return entryExplanation(entry);
      } catch (error) {
        if (error instanceof StaleEntryWorkError && !this._entryIsCurrent(entry)) {
          return entryExplanation(entry);
        }
        this._recordError(entry, error);
        throw error;
      }
    });
    entry.preparedLayoutChain = operation.catch(() => {});
    return operation;
  }

  async _initializePreparedEntry(
    entry: RuntimeEntry,
    config: Readonly<CornerfillPreparedConfig>,
  ): Promise<CornerfillEntryExplanation> {
    try {
      const revision = entry.revision;
      const snapshot = await this._resolvePreparedLayout(entry, config, revision, true);
      this._assertEntryCurrent(entry, revision);
      applyPreparedLayoutSnapshot(entry, snapshot);
      entry.initialized = true;
      if (entry.visible || !entry.deferHiddenSurface) {
        this._createPreparedSurface(entry, false);
        await this._verifyPreparedOwnership(entry);
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
      return entryExplanation(entry);
    } catch (error) {
      entry.surface?.dispose();
      entry.surface = null;
      if (error instanceof StaleEntryWorkError && !this._entryIsCurrent(entry)) {
        this.counters.cancelledInitializations += 1;
        return entryExplanation(entry);
      }
      this._recordError(entry, error);
      this._removeOwnershipSurface(entry);
      restoreOwnershipState(entry.element, entry.ownershipSnapshot);
      entry.imageLease?.release();
      entry.imageLease = null;
      releaseLayerImageLeases(entry);
      entry.resolvedImage = null;
      throw error;
    }
  }

  attachPrepared(
    element: CornerfillElement,
    config: Readonly<CornerfillPreparedConfig> = {},
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
    const requirements = config.requirements ?? {};
    assertFallbackRequirements(requirements);
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
    const visible = config.visibility ?? config.visible ?? true;
    const entry = createRuntimeEntry({
      controller: this,
      element,
      native: false,
      prepared: true,
      backend,
      mode: config.mode ?? "paint",
      initial: null,
      state: null,
      ownershipSnapshot: captureOwnershipState(element),
      ownershipRoot: element.getRootNode() as OwnershipRoot,
      ownershipToken: null,
      surface: null,
      geometry: null,
      geometryKey: null,
      width: config.size[0],
      height: config.size[1],
      dpr: config.dpr ?? this.view.devicePixelRatio ?? 1,
      paintKey: "prepared",
      borderKey: "none",
      border: null,
      effectsKey: "[null,null]",
      shadow: null,
      outline: null,
      composition,
      boxMetrics: null,
      paintResult: null,
      preparedResolvedPaint: null,
      preparedPaintProgram: null,
      preparedPaintSource: config.paint,
      preparedBorderSource: config.border ?? null,
      preparedShadowSource: config.shadow ?? null,
      preparedOutlineSource: config.outline ?? null,
      preparedBorderRadius: config.borderRadius,
      preparedCornerShape: config.cornerShape,
      positionX: 0,
      positionY: 0,
      imageLease: null,
      imageLeaseUrl: null,
      layerImageLeases: new Map(),
      resolvedImage: null,
      requestedVisible: Boolean(visible),
      styleVisible: true,
      visible: Boolean(visible),
      deferHiddenSurface: config.deferHiddenSurface !== false,
      surfaceWasDeferred: false,
      needsPaint: false,
      needsFullPreparedPaint: false,
      forcePaint: false,
      initialized: false,
      disposed: false,
      error: null,
      lastError: null,
      revision: 0,
      committedRevision: -1,
      pendingReason: null,
      fullRefreshPending: false,
      waiters: [],
      lastInvalidationReason: "prepared-attach",
      counters: createEntryCounters(),
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
    const saved = new Map([...NATIVE_RADIUS_PROPERTIES, ...NATIVE_SHAPE_PROPERTIES].map((property) => (
      [property, Object.freeze({
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property),
      })]
    )));
    if (shape !== null) applyNativeShapeSource(element, shape);
    if (radius !== null) applyNativeRadiusSource(element, radius);
    const entry = createRuntimeEntry({
      controller: this,
      element,
      native: true,
      prepared: false,
      mode: config.mode ?? "paint",
      ownershipSnapshot: Object.freeze({ borderOwner: null, owner: null, surfaceOwner: null }),
      ownershipRoot: this.document,
      disposed: false,
      initialized: true,
      error: null,
      lastError: null,
      revision: 0,
      committedRevision: 0,
      waiters: [],
      saved,
      lastInvalidationReason: "native-qualified",
      counters: createEntryCounters(),
    });
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
          if (next.cornerShape !== undefined) applyNativeShapeSource(entry.element, next.cornerShape);
          if (next.borderRadius !== undefined) applyNativeRadiusSource(entry.element, next.borderRadius);
          return Promise.resolve(entryExplanation(entry));
        }
        if (entry.prepared) {
          const backgroundPosition = next.backgroundPosition ?? next.background;
          if (backgroundPosition !== undefined) {
            if (!Array.isArray(backgroundPosition) || backgroundPosition.length !== 2) {
              throw new TypeError("prepared background update requires [x, y]");
            }
            controller._setPreparedBackgroundPosition(
              entry,
              backgroundPosition[0],
              backgroundPosition[1],
              false,
            );
          }
          if (next.visible !== undefined) controller._setPreparedVisibility(entry, next.visible, false);
          controller._flushPrepared(true);
          return Promise.resolve(entryExplanation(entry));
        }
        const state = entry.state;
        if (!state) throw new TypeError("dynamic update requires a dynamic Cornerfill entry");
        let changed = false;
        if (next.borderRadius !== undefined) {
          state.borderRadius = next.borderRadius;
          changed = true;
        }
        if (next.cornerShape !== undefined) {
          const nextCornerShape = next.cornerShape;
          state.cornerShape = nextCornerShape;
          const sameResolvedShape = Array.isArray(nextCornerShape)
            && entry.geometry?.shapeParameters?.every((value, index) => Object.is(value, nextCornerShape[index]));
          if (!sameResolvedShape) changed = true;
        }
        if (next.paint !== undefined) {
          state.paint = next.paint;
          entry.forcePaint = true;
          changed = true;
        }
        if (next.border !== undefined) {
          state.border = next.border;
          entry.forcePaint = true;
          changed = true;
        }
        if (next.shadow !== undefined) {
          state.shadow = next.shadow;
          entry.forcePaint = true;
          changed = true;
        }
        if (next.outline !== undefined) {
          state.outline = next.outline;
          entry.forcePaint = true;
          changed = true;
        }
        if (next.visible !== undefined) {
          const previousVisible = entry.visible;
          entry.requestedVisible = Boolean(next.visible);
          entry.visible = entry.requestedVisible && entry.styleVisible;
          if (entry.visible !== previousVisible) changed = true;
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
          applyNativeShapeSource(entry.element, cornerShape);
          return Promise.resolve(entryExplanation(entry));
        }
        if (entry.prepared) {
          if (entry.geometry?.shapeParameters?.every((value, index) => Object.is(value, cornerShape[index]))) {
            entry.preparedCornerShape = cornerShape;
            return Promise.resolve(entryExplanation(entry));
          }
          return controller.resizePrepared(entry.element, { cornerShape });
        }
        const state = entry.state;
        if (!state) throw new TypeError("corner-shape interpolation requires a dynamic Cornerfill entry");
        state.cornerShape = cornerShape;
        if (entry.geometry?.shapeParameters?.every((value, index) => Object.is(value, cornerShape[index]))) {
          return Promise.resolve(entryExplanation(entry));
        }
        return controller._scheduleAndWait(entry, "corner-shape-interpolation", true);
      },
      setVisible(visible: boolean) {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        if (entry.native) return Promise.resolve(entryExplanation(entry));
        if (entry.prepared) {
          controller._setPreparedVisibility(entry, visible, false);
          controller._flushPrepared(true);
          return Promise.resolve(entryExplanation(entry));
        }
        const next = Boolean(visible);
        if (entry.requestedVisible === next) return Promise.resolve(entryExplanation(entry));
        entry.requestedVisible = next;
        entry.visible = entry.requestedVisible && entry.styleVisible;
        if (entry.visible) entry.needsPaint = true;
        return controller._scheduleAndWait(entry, entry.visible ? "visible" : "hidden", true);
      },
      refresh() {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        if (entry.native) return Promise.resolve(entryExplanation(entry));
        if (entry.prepared) {
          entry.needsPaint = true;
          controller._queuePrepared(entry, false);
          controller._flushPrepared(true);
          return Promise.resolve(entryExplanation(entry));
        }
        return controller._scheduleAndWait(entry, "explicit-refresh", true);
      },
      resize(next: CornerfillPreparedConfig = {}) {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        if (entry.native) return Promise.resolve(entryExplanation(entry));
        if (!entry.prepared) throw new TypeError("resize() is available only for attachPrepared() handles");
        return controller.resizePrepared(entry.element, next);
      },
      verify() {
        if (!controller._entryIsCurrent(entry)) throw new Error("Cornerfill handle is disposed");
        if (!entry.native) {
          const computed = controller.view.getComputedStyle(entry.element);
          inspectFallbackHost(controller.view, entry.element, computed);
          assertOutlineHost(controller.view, entry.element, entry.outline);
          if (controller._reconcileEntryOwnershipRoot(entry) && !entry.prepared) {
            controller._markDirty(entry, "attachment-root-migration", true);
          }
          controller._repairEntryOwnership(entry);
          controller._assertOwnedStylesApplied(entry);
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
    const requirements = config.requirements ?? {};
    const useNative = this._shouldUseNative(config);
    if (!useNative) assertFallbackRequirements(requirements);
    if (useNative) return this._attachNative(element, config);

    assertCooperativeOwnership(element);
    const computed = this.view.getComputedStyle(element);
    const composition = inspectFallbackHost(this.view, element, computed);
    const initial = captureInitialSources(element, config, computed);
    const watchCarriers = initial.dynamic.radius || initial.dynamic.shape || initial.dynamic.paint
      || (initial.dynamic.border && Boolean(initial.borderSource))
      || initial.dynamic.shadow || initial.dynamic.outline;
    const entry = createRuntimeEntry({
      controller: this,
      element,
      native: false,
      prepared: false,
      backend: null,
      mode: config.mode ?? "paint",
      state: {},
      initial,
      dynamicPaintSource: initial.paintSource,
      dynamicBackgroundPositionSpec: initial.paintSource.kind === "image"
        ? initial.paintSource.backgroundPositionSpec
        : null,
      watchCarriers,
      watchPosition: initial.dynamic.paintPosition,
      watchVisibility: true,
      inlineCarrierSignature: watchCarriers ? inlineCarrierSignature(element) : "",
      inlineBackgroundPositionX: element.style.getPropertyValue("background-position-x").trim(),
      inlineBackgroundPositionY: element.style.getPropertyValue("background-position-y").trim(),
      ownershipSnapshot: captureOwnershipState(element),
      ownershipRoot: element.getRootNode() as OwnershipRoot,
      ownershipToken: null,
      surface: null,
      geometry: null,
      geometryKey: null,
      width: 0,
      height: 0,
      dpr: 1,
      paintKey: null,
      borderKey: null,
      border: null,
      effectsKey: null,
      shadow: null,
      outline: null,
      composition,
      boxMetrics: null,
      paintResult: null,
      imageLease: null,
      imageLeaseUrl: null,
      layerImageLeases: new Map(),
      resolvedImage: null,
      requestedVisible: config.visible !== false,
      styleVisible: computed.visibility !== "hidden",
      visible: config.visible !== false && computed.visibility !== "hidden",
      needsPaint: false,
      forcePaint: false,
      initialized: false,
      disposed: false,
      error: null,
      lastError: null,
      revision: 0,
      committedRevision: -1,
      pendingReason: null,
      fullRefreshPending: false,
      waiters: [],
      lastInvalidationReason: "attach",
      counters: createEntryCounters(),
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
      for (const [property, saved] of entry.saved) {
        element.style.removeProperty(property);
        if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
      }
      this.counters.nativeEntries -= 1;
    } else {
      this._removeOwnershipSurface(entry);
      restoreOwnershipState(element, entry.ownershipSnapshot);
      try { entry.surface?.dispose(); } catch (error) { cleanupError = error; }
      entry.surface = null;
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
    const waiters = entry.waiters.splice(0);
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
    const surfacePixels = [...this.entries].reduce((total, entry) => {
      const size = entry.surface?.size;
      return total + (size ? size.backingWidth * size.backingHeight : 0);
    }, 0);
    return Object.freeze({
      schema: "cornerfill-controller-stats@2",
      runtime: CORNERFILL_RUNTIME_SCHEMA,
      entries: this.entries.size,
      surfaces: [...this.entries].filter((entry) => Boolean(entry.surface)).length,
      activeFallbackEntries: this.counters.fallbackEntries,
      activeNativeEntries: this.counters.nativeEntries,
      surfacePixels,
      surfaceResources: getSurfaceResourceStats(this.document),
      geometryCacheEntries: this.geometryCache.size,
      imageCache: this.images.stats(),
      counters: Object.freeze({ ...this.counters }),
    }) as Readonly<CornerfillControllerStats>;
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
    for (const stylesheet of this.ownershipStylesheets.values()) stylesheet.remove();
    this.ownershipStylesheets.clear();
    this.ownershipSurfaces.clear();
    this.ownershipSurfaceRules.clear();
    this.ownershipFreeRules.clear();
    this.ownershipRootCounts.clear();
    this.preparedDirty.clear();
    this.preparedOwnershipVerificationEntries.clear();
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
