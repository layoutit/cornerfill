import {
  captureComputedPaint,
  normalizePaintDescriptor,
  normalizeSideValues,
  paintDescriptorKey,
  resolvePaintForBox,
} from "./background.mjs";
import {
  captureElementColorContext,
  colorProbeMutation,
  withElementColorResolver,
} from "./colors.mjs";
import type { ContextualColorResolver } from "./colors.mjs";
import type {
  BackgroundBoxMetrics,
  BackgroundBoxMetricsInput,
  CornerfillRasterSource,
  NormalizedBackgroundLayer,
  NormalizedImageLayer,
  NormalizedPaintDescriptor,
  PaintDescriptorInput,
  PixelPair,
  ResolvedPaintDescriptor,
} from "./background.mjs";
import {
  DEFAULT_MAX_SURFACE_PIXELS,
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
  snapshotCornerGeometry,
} from "./geometry.mjs";
import type { CornerGeometry } from "./geometry.mjs";
import { DEFAULT_MAX_DECODED_IMAGE_PIXELS, ImageCache } from "./images.mjs";
import type { ImageLease } from "./images.mjs";
import { qualifyNativeCornerShape, snapshotNativeQualification } from "./native.mjs";
import type { CornerfillNativeQualification } from "./native.mjs";
import {
  AUTHOR_IMPORTANT_OWNERSHIP_REASON,
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
} from "./ownership.mjs";
export type { CornerfillElement } from "./ownership.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION } from "./qualification.mjs";
import {
  CARRIER,
  NATIVE_OWNED_PROPERTIES,
  NATIVE_RADIUS_PROPERTIES,
  NATIVE_SHAPE_PROPERTIES,
  PAINT_CARRIERS,
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
  writeNativeDeclarationGroups,
  writeNativeDeclarations,
} from "./style.mjs";
import type {
  RadiusSource,
} from "./style.mjs";
export type { RadiusSource } from "./style.mjs";
import { validateTimerDelay } from "./timing.mjs";
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
import {
  animationAffectsPaint,
  animationToken,
  hasShadowIncludingAncestor,
  inlineCarrierSignature,
  mutationStylesheetRoot,
  styleMutationMayAffectPaint,
  styleMutationMayAffectPosition,
  styleMutationMayAffectVisibility,
} from "./runtime-observation.mjs";
import {
  createDynamicEntry,
  createNativeEntry,
  createPreparedEntry,
} from "./runtime-entry.mjs";
import type {
  DynamicEntry as RuntimeDynamicEntry,
  EntryWaiter as RuntimeEntryWaiter,
  FallbackEntry as RuntimeFallbackEntry,
  HostComposition,
  InitialSources,
  NativeEntry as RuntimeNativeEntry,
  PreparedEntry as RuntimePreparedEntry,
  RuntimeEntry as RuntimeEntryState,
} from "./runtime-entry.mjs";
export type { HostComposition } from "./runtime-entry.mjs";
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
  readonly imageTimeoutMs?: number | undefined;
  readonly maxActiveFallbackEntries?: number | undefined;
  readonly maxGeometryCacheEntries?: number | undefined;
  readonly maxImageCacheEntries?: number | undefined;
  readonly maxImageCachePixels?: number | undefined;
  readonly maxSurfacePixels?: number | undefined;
  readonly maxTotalSurfacePixels?: number | undefined;
  readonly nativeQualification?: Readonly<CornerfillNativeQualification> | undefined;
  readonly nonce?: string | null | undefined;
  readonly observe?: boolean | undefined;
  readonly staticFallback?: boolean | undefined;
}

export interface ResolvedCornerfillOptions {
  readonly backend: SurfaceBackend;
  readonly forceFallback: boolean;
  readonly imageTimeoutMs: number;
  readonly maxActiveFallbackEntries: number;
  readonly maxGeometryCacheEntries: number;
  readonly maxImageCacheEntries: number;
  readonly maxImageCachePixels: number;
  readonly maxSurfacePixels: number;
  readonly maxTotalSurfacePixels: number;
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

export type CornerfillNativeHandleUpdate = Readonly<Pick<
  CornerfillAttachConfig,
  "borderRadius" | "cornerShape"
>> & Readonly<{
  readonly backgroundPosition?: never;
  readonly border?: never;
  readonly outline?: never;
  readonly paint?: never;
  readonly paintActive?: never;
  readonly shadow?: never;
}>;

export type CornerfillDynamicHandleUpdate = Readonly<Pick<
  CornerfillAttachConfig,
  "border" | "borderRadius" | "cornerShape" | "outline" | "paint" | "paintActive" | "shadow"
>> & Readonly<{
  readonly backgroundPosition?: never;
}>;

export type CornerfillPreparedHandleUpdate = Omit<CornerfillPreparedUpdate, "element"> & Readonly<{
  readonly border?: never;
  readonly borderRadius?: never;
  readonly cornerShape?: never;
  readonly outline?: never;
  readonly paint?: never;
  readonly shadow?: never;
}>;

type CornerfillInternalHandleUpdate = CornerfillNativeHandleUpdate
  | CornerfillDynamicHandleUpdate
  | CornerfillPreparedHandleUpdate;

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

const OBSERVED_STYLESHEET_ATTRIBUTES = Object.freeze([
  "crossorigin",
  "href",
  "integrity",
  "media",
  "nonce",
  "referrerpolicy",
  "rel",
  "title",
  "type",
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

type DynamicEntry = RuntimeDynamicEntry<CornerfillEntryExplanation>;
type EntryWaiter = RuntimeEntryWaiter<CornerfillEntryExplanation>;
type FallbackEntry = RuntimeFallbackEntry<CornerfillEntryExplanation>;
type NativeEntry = RuntimeNativeEntry<CornerfillEntryExplanation>;
type PreparedEntry = RuntimePreparedEntry<CornerfillEntryExplanation>;
type RuntimeEntry = RuntimeEntryState<CornerfillEntryExplanation>;

interface RuntimeMutationEffects {
  childListChanged: boolean;
  readonly paintStyleEntries: Set<DynamicEntry>;
  readonly selectorAncestors: Set<Node>;
  readonly semanticEntries: Set<DynamicEntry>;
  readonly styleEntries: Set<DynamicEntry>;
  readonly stylesheetRoots: Set<Node>;
  readonly visibilityAncestors: Set<Node>;
  readonly visibilityStyleEntries: Set<DynamicEntry>;
}

interface ResolvedDynamicEntryUpdate {
  readonly border: Readonly<OwnedBorderPaintState> | null | undefined;
  readonly outline: Readonly<ContainedOutlinePaintState> | null | undefined;
  readonly paint: NormalizedPaintDescriptor | undefined;
  readonly paintActive: boolean | undefined;
  readonly radiusSource: RadiusSource | undefined;
  readonly resolvedShape: Four<number> | null;
  readonly shapeSource: CornerShapeSource | undefined;
  readonly shadow: Readonly<InsetShadowPaintState> | null | undefined;
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

interface CornerfillHandleBase {
  readonly backend: ConcreteSurfaceBackend | "native-corner-shape" | "pending";
  readonly ready: Promise<CornerfillEntryExplanation>;
  dispose(): void;
  explain(): Readonly<CornerfillEntryExplanation>;
  refresh(): Promise<CornerfillEntryExplanation>;
  verify(): Readonly<CornerfillEntryExplanation>;
}

export interface CornerfillNativeHandle extends CornerfillHandleBase {
  readonly mode: "native";
  interpolateCornerShape(
    from: CornerShapeSource,
    to: CornerShapeSource,
    progress: number,
    options?: CornerWritingOptions,
  ): Promise<CornerfillEntryExplanation>;
  readonly update: (next?: CornerfillNativeHandleUpdate) => Promise<CornerfillEntryExplanation>;
}

export interface CornerfillDynamicHandle extends CornerfillHandleBase {
  readonly mode: "dynamic";
  interpolateCornerShape(
    from: CornerShapeSource,
    to: CornerShapeSource,
    progress: number,
    options?: CornerWritingOptions,
  ): Promise<CornerfillEntryExplanation>;
  readonly update: (next?: CornerfillDynamicHandleUpdate) => Promise<CornerfillEntryExplanation>;
}

export interface CornerfillPreparedHandle extends CornerfillHandleBase {
  readonly mode: "prepared";
  interpolateCornerShape(
    from: CornerShapeSource,
    to: CornerShapeSource,
    progress: number,
    options?: CornerWritingOptions,
  ): Promise<CornerfillEntryExplanation>;
  resize(next?: CornerfillPreparedResizeConfig): Promise<CornerfillEntryExplanation>;
  readonly update: (next?: CornerfillPreparedHandleUpdate) => Promise<CornerfillEntryExplanation>;
}

export type CornerfillHandle = CornerfillNativeHandle | CornerfillDynamicHandle | CornerfillPreparedHandle;

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
  readonly fallbackProblem: string | null;
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
  ): Readonly<CornerfillNativeHandle | CornerfillDynamicHandle>;
  attachPrepared(
    element: CornerfillElement,
    config: Readonly<CornerfillPreparedConfig>,
  ): Readonly<CornerfillPreparedHandle>;
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

function applyDynamicSnapshot(entry: DynamicEntry, snapshot: Readonly<DynamicSnapshot>): void {
  entry.geometry = snapshot.geometry;
  entry.geometryKey = snapshot.geometryKey;
  entry.width = snapshot.width;
  entry.height = snapshot.height;
  entry.dpr = snapshot.dpr;
  entry.paintSource = snapshot.paintSource;
  if (snapshot.paintSource.kind === "image") {
    entry.backgroundPositionSpec = snapshot.paintSource.backgroundPositionSpec;
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
  readonly borderSource: Readonly<OwnedBorderPaintState> | null;
  readonly borderRadius: RadiusSource | undefined;
  readonly composition: Readonly<HostComposition>;
  readonly cornerShape: CornerShapeSource | undefined;
  readonly descriptor: NormalizedPaintDescriptor;
  readonly dpr: number;
  readonly geometry: CornerGeometry;
  readonly height: number;
  readonly outline: Readonly<ContainedOutlinePaintState> | null;
  readonly outlineSource: Readonly<ContainedOutlinePaintState> | null;
  readonly paint: ResolvedPaintDescriptor;
  readonly paintLeases: Readonly<PaintLeaseTransaction>;
  readonly program: Readonly<PreparedOpaqueImageProgram> | null;
  readonly shadow: Readonly<InsetShadowPaintState> | null;
  readonly shadowSource: Readonly<InsetShadowPaintState> | null;
  readonly width: number;
  readonly writingFlow: Required<CornerWritingOptions>;
}

interface PreparedLayoutConfigSnapshot {
  readonly border?: Readonly<OwnedBorderPaintState> | null;
  readonly borderRadius?: RadiusSource;
  readonly cornerShape?: CornerShapeSource;
  readonly deferInactiveSurface?: boolean;
  readonly dpr?: number;
  readonly geometry?: CornerGeometry;
  readonly outline?: Readonly<ContainedOutlinePaintState> | null;
  readonly paint?: NormalizedPaintDescriptor;
  readonly paintActive?: boolean;
  readonly shadow?: Readonly<InsetShadowPaintState> | null;
  readonly size?: PixelPair;
}

function applyPreparedLayoutSnapshot(
  entry: PreparedEntry,
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
  entry.resolvedPaint = snapshot.paint;
  entry.paintSource = snapshot.descriptor;
  entry.borderSource = snapshot.borderSource;
  entry.shadowSource = snapshot.shadowSource;
  entry.outlineSource = snapshot.outlineSource;
  entry.radiusSource = snapshot.borderRadius;
  entry.shapeSource = snapshot.cornerShape;
  entry.writingFlow = snapshot.writingFlow;
  entry.positionX = snapshot.paint.kind === "image" ? snapshot.paint.backgroundPosition[0] : 0;
  entry.positionY = snapshot.paint.kind === "image" ? snapshot.paint.backgroundPosition[1] : 0;
  entry.paintProgram = snapshot.program;
}

function sameWritingFlow(
  first: Readonly<Required<CornerWritingOptions>> | null,
  second: Readonly<Required<CornerWritingOptions>>,
): boolean {
  return Boolean(first
    && first.writingMode === second.writingMode
    && first.direction === second.direction
    && first.textOrientation === second.textOrientation);
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
const DEFAULT_MAX_TOTAL_SURFACE_PIXELS = 4_096 ** 2;

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
  attributeDependentColors: Object.freeze({
    supported: false,
    reason: "Explicit attr() colors are rejected because a detached color probe cannot preserve host-attribute evaluation.",
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

export class CornerfillDetachedError extends Error {
  constructor(message = "Cornerfill handle is disposed") {
    super(message);
    this.name = "CornerfillDetachedError";
  }
}

class StaleEntryWorkError extends Error {
  constructor() {
    super("Cornerfill entry work was superseded or cancelled");
    this.name = "StaleEntryWorkError";
  }
}

function positiveSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
}

function nonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
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
  const shadowContent = element.shadowRoot !== null;
  const listMarker = computed.display === "list-item"
    && (computed.listStyleType !== "none" || computed.listStyleImage !== "none");
  return childContent
    || shadowContent
    || listMarker
    || hasPaintedPseudo(view, element, "::before")
    || hasPaintedPseudo(view, element, "::after");
}

function inspectFallbackHost(
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
  if (clipsOverflow) {
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
  if (existing && existing !== entry) {
    throw new Error("element is already attached to another Cornerfill controller");
  }
  registry.set(entry.element, entry);
  entry.elementOwnerRegistry = registry;
}

function assertElementAvailable(element: CornerfillElement): void {
  const existing = elementOwnerRegistry(element).get(element);
  if (existing) {
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
  const source = String(token).trim();
  if (/^(?:calc|min|max|clamp)\(/iu.test(source)) {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([a-z%]+)?$/iu.exec(source);
  if (!match) return null;
  const value = Number(match[1]!);
  const unit = match[2]?.toLowerCase();
  if ((unit && unit !== "px") || (!unit && value !== 0)) {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
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

function resolveLayerColors(
  layer: Readonly<NormalizedBackgroundLayer>,
  resolve: ContextualColorResolver,
): Readonly<NormalizedBackgroundLayer> {
  if (layer.kind !== "linear-gradient"
    && layer.kind !== "radial-gradient"
    && layer.kind !== "conic-gradient") return layer;
  return Object.freeze({
    ...layer,
    stops: Object.freeze(layer.stops.map(([offset, color]) => Object.freeze([
      offset,
      resolve(color, `${layer.kind} stop color`),
    ] as const))),
  });
}

function layerColorInputs(layer: Readonly<NormalizedBackgroundLayer>): readonly string[] {
  return layer.kind === "linear-gradient"
    || layer.kind === "radial-gradient"
    || layer.kind === "conic-gradient"
    ? layer.stops.map(([, color]) => color)
    : Object.freeze([]);
}

function paintColorInputs(paint: Readonly<NormalizedPaintDescriptor>): readonly string[] {
  return Object.freeze([
    paint.color,
    ...(paint.kind === "layers"
      ? paint.layers.flatMap((layer) => layerColorInputs(layer))
      : paint.kind === "solid" ? [] : layerColorInputs(paint)),
  ]);
}

function ownedColorInputs({
  borderSource,
  outlineSource,
  paintSource,
  shadowSource,
}: Readonly<CurrentSources>): readonly string[] {
  return Object.freeze([
    ...paintColorInputs(paintSource),
    ...(borderSource ? [borderSource.color] : []),
    ...(shadowSource ? [shadowSource.color] : []),
    ...(outlineSource ? [outlineSource.color] : []),
  ]);
}

function resolvePaintColors(
  paint: Readonly<NormalizedPaintDescriptor>,
  resolve: ContextualColorResolver,
): Readonly<NormalizedPaintDescriptor> {
  const color = resolve(paint.color, "background color");
  if (paint.kind === "solid") return Object.freeze({ ...paint, color });
  if (paint.kind === "layers") {
    return Object.freeze({
      ...paint,
      color,
      layers: Object.freeze(paint.layers.map((layer) => resolveLayerColors(layer, resolve))),
    });
  }
  return Object.freeze({ ...resolveLayerColors(paint, resolve), color }) as NormalizedPaintDescriptor;
}

function resolveBorderColor(
  border: Readonly<OwnedBorderPaintState> | null,
  resolve: ContextualColorResolver,
): Readonly<OwnedBorderPaintState> | null {
  if (!border) return null;
  const color = resolve(border.color, "border color");
  return Object.freeze({ ...border, color, colors: frozenFour(color, color, color, color) });
}

function resolveShadowColor(
  shadow: Readonly<InsetShadowPaintState> | null,
  resolve: ContextualColorResolver,
): Readonly<InsetShadowPaintState> | null {
  if (!shadow) return null;
  const color = resolve(shadow.color, "inset shadow color");
  return shadow.spread === 0 ? null : Object.freeze({ ...shadow, color });
}

function resolveOutlineColor(
  outline: Readonly<ContainedOutlinePaintState> | null,
  resolve: ContextualColorResolver,
): Readonly<ContainedOutlinePaintState> | null {
  return outline ? Object.freeze({
    ...outline,
    color: resolve(outline.color, "outline color"),
  }) : null;
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
  config: Readonly<AttachConfigSnapshot>,
  computed: CSSStyleDeclaration,
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
  const radiusSource: RadiusSource = config.borderRadius === undefined
    ? (radiusCapture?.present ? radiusCapture.source : computedRadiusSource)
    : config.borderRadius;
  const hasComputedShapeLonghands = Object.keys(shapeBaseline.physical).length > 0;
  const shapeSource = config.cornerShape === undefined
    ? (shapeCapture.present
      ? shapeCapture.source
      : hasComputedShapeLonghands
        ? shapeCapture.source
        : shapeAttribute || computedShape)
    : config.cornerShape;
  if (!shapeSource) {
    throw new TypeError(
      "corner-shape did not survive CSS parsing; provide --cornerfill-corner-shape, data-cornerfill-shape, or attach({cornerShape})",
    );
  }
  const carrierPaint = PAINT_CARRIERS.some((name) => readCarrier(computed, name));
  const capturedPaintSource = config.paint === undefined
    ? captureComputedPaint(
      computed,
      carrierPaint ? readPaintCarriers(computed) : {},
      { rasterIsOpaque: config.rasterIsOpaque },
    )
    : config.paint;
  const paintSource = capturedPaintSource;
  const borderColorCarrier = readBorderColorCarriers(computed);
  const capturedBorderSource = config.border === undefined
    ? captureBorder(computed, borderColorCarrier)
    : config.border;
  const borderSource = capturedBorderSource;
  const shadowCarrier = readShadowCarrier(computed);
  const capturedShadowSource = config.shadow === undefined
    ? normalizeInsetShadow(shadowCarrier || computed.boxShadow)
    : config.shadow;
  const shadowSource = capturedShadowSource;
  const outlineCarrierValues = Object.freeze({
    width: readCarrier(computed, CARRIER.outlineWidth),
    style: readCarrier(computed, CARRIER.outlineStyle),
    color: readColorCarrier(computed, CARRIER.outlineColor),
    offset: readCarrier(computed, CARRIER.outlineOffset),
  });
  const capturedOutlineSource = config.outline === undefined
    ? captureOutline(computed, outlineCarrierValues)
    : config.outline;
  const outlineSource = capturedOutlineSource;
  const initial: Readonly<InitialSources> = Object.freeze({
    radiusSource,
    shapeSource,
    paintSource,
    borderSource,
    shadowSource,
    outlineSource,
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
  entry: DynamicEntry,
  computed: CSSStyleDeclaration,
): Readonly<CurrentSources> {
  const { initial, overrides } = entry;
  let radiusSource = overrides.borderRadius ?? initial.radiusSource;
  if (overrides.borderRadius === undefined && initial.dynamic.radius) {
    radiusSource = captureRadiusCarriers(computed)?.source
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
  let shapeSource = overrides.cornerShape ?? initial.shapeSource;
  if (overrides.cornerShape === undefined && initial.dynamic.shape) {
    const capture = captureShapeCarriers(computed);
    shapeSource = capture?.present
      ? capture.source
      : entry.element.getAttribute("data-cornerfill-shape")
        || computed.getPropertyValue("corner-shape").trim()
        || "round";
  }
  let paintSource = overrides.paint ?? initial.paintSource;
  if (overrides.paint === undefined && initial.dynamic.paint) {
    paintSource = captureComputedPaint(
      computed,
      readPaintCarriers(computed),
      { rasterIsOpaque: initial.rasterIsOpaque },
    );
  } else if (overrides.paint === undefined && initial.dynamic.paintPosition
    && entry.backgroundPositionSpec) {
    paintSource = Object.freeze({
      ...initial.paintSource,
      backgroundPositionSpec: entry.backgroundPositionSpec,
    });
  }
  if (initial.rasterIsOpaque && paintSource.kind === "image" && paintSource.opaque !== true) {
    paintSource = Object.freeze({ ...paintSource, opaque: true });
  }
  let borderSource = overrides.border !== undefined ? overrides.border : initial.borderSource;
  if (overrides.border === undefined && initial.dynamic.border) {
    const colorCarrier = readBorderColorCarriers(computed);
    borderSource = captureBorder(
      computed,
      colorCarrier
        || (isRecord(initial.borderSource) && typeof initial.borderSource.color === "string"
          ? initial.borderSource.color
          : ""),
    );
  }
  let shadowSource = overrides.shadow !== undefined ? overrides.shadow : initial.shadowSource;
  if (overrides.shadow === undefined && initial.dynamic.shadow) {
    shadowSource = normalizeInsetShadow(readShadowCarrier(computed) || computed.boxShadow);
  }
  let outlineSource = overrides.outline !== undefined ? overrides.outline : initial.outlineSource;
  if (overrides.outline === undefined && initial.dynamic.outline) {
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

function resolveCurrentSourceColors(
  sources: Readonly<CurrentSources>,
  resolve: ContextualColorResolver,
): Readonly<CurrentSources> {
  return Object.freeze({
    ...sources,
    paintSource: resolvePaintColors(sources.paintSource, resolve),
    borderSource: resolveBorderColor(sources.borderSource, resolve),
    shadowSource: resolveShadowColor(sources.shadowSource, resolve),
    outlineSource: resolveOutlineColor(sources.outlineSource, resolve),
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
        ...(record.textOrientation ?? flow.textOrientation
          ? { textOrientation: (record.textOrientation ?? flow.textOrientation) as NonNullable<BorderRadiusDeclarations["textOrientation"]> }
          : {}),
      };
      return resolveBorderRadiusDeclarations(declarations, width, height);
    }
  }
  throw new TypeError("unsupported border-radius source");
}

function snapshotDeclarationMap(value: unknown, label: string): Readonly<Record<string, string>> {
  if (!isRecord(value) || Array.isArray(value)) {
    throw new TypeError(`${label} must be a declaration map`);
  }
  const snapshot: Record<string, string> = {};
  for (const [property, declaration] of Object.entries(value)) {
    if (typeof declaration !== "string") {
      throw new TypeError(`${label} declarations must be strings`);
    }
    snapshot[property] = declaration;
  }
  return Object.freeze(snapshot);
}

function snapshotWritingOptions(record: UnknownRecord): Readonly<CornerWritingOptions> {
  for (const property of ["writingMode", "direction", "textOrientation"] as const) {
    if (record[property] !== undefined && typeof record[property] !== "string") {
      throw new TypeError(`${property} must be a string`);
    }
  }
  return Object.freeze({
    ...(record.writingMode === undefined ? {} : {
      writingMode: record.writingMode as NonNullable<CornerWritingOptions["writingMode"]>,
    }),
    ...(record.direction === undefined ? {} : {
      direction: record.direction as NonNullable<CornerWritingOptions["direction"]>,
    }),
    ...(record.textOrientation === undefined ? {} : {
      textOrientation: record.textOrientation as NonNullable<CornerWritingOptions["textOrientation"]>,
    }),
  });
}

function snapshotRadiusSource(source: RadiusSource): RadiusSource {
  if (typeof source === "string") return source;
  if (isRadiusTuple(source)) {
    return frozenFour(
      Object.freeze({ ...source[0] }),
      Object.freeze({ ...source[1] }),
      Object.freeze({ ...source[2] }),
      Object.freeze({ ...source[3] }),
    );
  }
  if (!isRecord(source)) throw new TypeError("unsupported border-radius source");
  if (source.kind === "longhands") {
    if (!Array.isArray(source.values) || source.values.length !== 4
      || typeof source.values[0] !== "string" || typeof source.values[1] !== "string"
      || typeof source.values[2] !== "string" || typeof source.values[3] !== "string") {
      throw new TypeError("border-radius longhands must contain four values");
    }
    return Object.freeze({
      kind: "longhands",
      values: frozenFour(
        String(source.values[0]),
        String(source.values[1]),
        String(source.values[2]),
        String(source.values[3]),
      ),
    });
  }
  const record = source as UnknownRecord;
  if (record.kind !== undefined && record.kind !== "declarations") {
    throw new TypeError("unsupported border-radius source kind");
  }
  if (record.shorthand !== undefined && typeof record.shorthand !== "string") {
    throw new TypeError("border-radius shorthand must be a string");
  }
  return Object.freeze({
    ...(record.kind === "declarations" ? { kind: "declarations" as const } : {}),
    ...(record.shorthand === undefined ? {} : { shorthand: record.shorthand }),
    ...(record.physical === undefined ? {} : {
      physical: snapshotDeclarationMap(record.physical, "physical border-radius"),
    }),
    ...(record.logical === undefined ? {} : {
      logical: snapshotDeclarationMap(record.logical, "logical border-radius"),
    }),
    ...snapshotWritingOptions(record),
  }) as RadiusSource;
}

function snapshotCornerShapeSource(source: CornerShapeSource): CornerShapeSource {
  if (typeof source === "string") return source;
  if (Array.isArray(source)) {
    const values = [source[0], source[1], source[2], source[3]];
    if (source.length !== 4
      || values.some((value) => typeof value !== "number" || Number.isNaN(value))) {
      throw new TypeError("resolved corner shapes must contain four numeric parameters");
    }
    return frozenFour(values[0]!, values[1]!, values[2]!, values[3]!);
  }
  if (!isRecord(source)) throw new TypeError("unsupported corner-shape source");
  if (source.shorthand !== undefined && typeof source.shorthand !== "string") {
    throw new TypeError("corner-shape shorthand must be a string");
  }
  return Object.freeze({
    ...(source.shorthand === undefined ? {} : { shorthand: source.shorthand }),
    ...(source.physical === undefined ? {} : {
      physical: snapshotDeclarationMap(source.physical, "physical corner-shape"),
    }),
    ...(source.logical === undefined ? {} : {
      logical: snapshotDeclarationMap(source.logical, "logical corner-shape"),
    }),
    ...snapshotWritingOptions(source),
  }) as CornerShapeSource;
}

interface AttachConfigSnapshot {
  readonly border?: Readonly<OwnedBorderPaintState> | null;
  readonly borderRadius?: RadiusSource;
  readonly cornerShape?: CornerShapeSource;
  readonly observeBackgroundPosition?: boolean;
  readonly outline?: Readonly<ContainedOutlinePaintState> | null;
  readonly paint?: NormalizedPaintDescriptor;
  readonly paintActive?: boolean;
  readonly rasterIsOpaque?: boolean;
  readonly shadow?: Readonly<InsetShadowPaintState> | null;
}

const EMPTY_ATTACH_CONFIG: Readonly<AttachConfigSnapshot> = Object.freeze({});

function snapshotAttachConfig(config: unknown): Readonly<AttachConfigSnapshot> {
  if (!isRecord(config) || Array.isArray(config)) {
    throw new TypeError("attach configuration must be an object");
  }
  const border = config.border;
  const borderRadius = config.borderRadius;
  const cornerShape = config.cornerShape;
  const observeBackgroundPosition = config.observeBackgroundPosition;
  const outline = config.outline;
  const paint = config.paint;
  const paintActive = config.paintActive;
  const rasterIsOpaque = config.rasterIsOpaque;
  const shadow = config.shadow;
  for (const [name, value] of [
    ["observeBackgroundPosition", observeBackgroundPosition],
    ["paintActive", paintActive],
    ["rasterIsOpaque", rasterIsOpaque],
  ] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      throw new TypeError(`${name} must be a boolean`);
    }
  }
  const observedPosition = observeBackgroundPosition as boolean | undefined;
  const activePaint = paintActive as boolean | undefined;
  const opaqueRaster = rasterIsOpaque as boolean | undefined;
  return Object.freeze({
    ...(border === undefined ? {} : { border: normalizeBorder(border) }),
    ...(borderRadius === undefined ? {} : {
      borderRadius: snapshotRadiusSource(borderRadius as RadiusSource),
    }),
    ...(cornerShape === undefined ? {} : {
      cornerShape: snapshotCornerShapeSource(cornerShape as CornerShapeSource),
    }),
    ...(observedPosition === undefined ? {} : {
      observeBackgroundPosition: observedPosition,
    }),
    ...(outline === undefined ? {} : { outline: normalizeContainedOutline(outline) }),
    ...(paint === undefined ? {} : { paint: normalizePaintDescriptor(paint) }),
    ...(activePaint === undefined ? {} : { paintActive: activePaint }),
    ...(opaqueRaster === undefined ? {} : { rasterIsOpaque: opaqueRaster }),
    ...(shadow === undefined ? {} : { shadow: normalizeInsetShadow(shadow) }),
  });
}

function isPositivePixelPair(value: unknown): value is PixelPair {
  return Array.isArray(value) && value.length === 2
    && typeof value[0] === "number" && Number.isFinite(value[0]) && value[0] > 0
    && typeof value[1] === "number" && Number.isFinite(value[1]) && value[1] > 0;
}

function snapshotPreparedLayoutConfig(
  config: Readonly<CornerfillPreparedConfig | CornerfillPreparedResizeConfig>,
): Readonly<PreparedLayoutConfigSnapshot> {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("prepared layout configuration must be an object");
  }
  const snapshot: Record<string, unknown> = {};
  const size = config.size;
  if (size !== undefined) {
    if (!isPositivePixelPair(size)) {
      throw new TypeError("prepared layout size must contain two finite positive values");
    }
    snapshot.size = Object.freeze([size[0], size[1]]);
  }
  const geometry = config.geometry;
  if (geometry !== undefined) snapshot.geometry = snapshotCornerGeometry(geometry);
  const borderRadius = config.borderRadius;
  if (borderRadius !== undefined) snapshot.borderRadius = snapshotRadiusSource(borderRadius);
  const cornerShape = config.cornerShape;
  if (cornerShape !== undefined) snapshot.cornerShape = snapshotCornerShapeSource(cornerShape);
  const paint = config.paint;
  if (paint !== undefined) snapshot.paint = normalizePaintDescriptor(paint);
  const border = config.border;
  if (border !== undefined) snapshot.border = normalizeBorder(border);
  const shadow = config.shadow;
  if (shadow !== undefined) snapshot.shadow = normalizeInsetShadow(shadow);
  const outline = config.outline;
  if (outline !== undefined) snapshot.outline = normalizeContainedOutline(outline);
  const dpr = config.dpr;
  if (dpr !== undefined) {
    if (!Number.isFinite(dpr) || dpr <= 0) throw new TypeError("prepared layout DPR must be positive");
    snapshot.dpr = dpr;
  }
  const record = config as UnknownRecord;
  const paintActive = record.paintActive;
  if (paintActive !== undefined) {
    if (typeof paintActive !== "boolean") throw new TypeError("paintActive must be a boolean");
    snapshot.paintActive = paintActive;
  }
  if ("deferInactiveSurface" in record) {
    const deferInactiveSurface = record.deferInactiveSurface;
    if (deferInactiveSurface !== undefined) {
      if (typeof deferInactiveSurface !== "boolean") {
        throw new TypeError("deferInactiveSurface must be a boolean");
      }
      snapshot.deferInactiveSurface = deferInactiveSurface;
    }
  }
  return Object.freeze(snapshot) as Readonly<PreparedLayoutConfigSnapshot>;
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
  const crossOrigin = descriptor.crossOrigin ?? (
    /^https?:$/u.test(parsedUrl.protocol) ? "anonymous" : null
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

export function detectCornerfillCapabilities(
  document: Document | undefined = globalThis.document,
  options: Readonly<Pick<CornerfillInstallOptions, "nativeQualification">> = {},
) {
  if (!document?.defaultView) throw new TypeError("a browser document is required");
  const surfaces = detectSurfaceCapabilities(document);
  const native = snapshotNativeQualification(
    options.nativeQualification ?? qualifyNativeCornerShape(document),
  );
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
      attributeDependentColors: false,
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

function entryExplanation(entry: RuntimeEntry): Readonly<CornerfillEntryExplanation> {
  const common = {
    schema: "cornerfill-entry-explanation@2" as const,
    runtime: CORNERFILL_RUNTIME_SCHEMA,
    status: entry.disposed ? "disposed" as const : entry.error ? "error" as const : entry.initialized ? "active" as const : "initializing" as const,
    oracleQualification: CORNERFILL_ORACLE_QUALIFICATION,
    transformOwnedByCornerfill: false as const,
    lastInvalidationReason: entry.lastInvalidationReason,
    error: entry.error ? `${entry.error.name}: ${entry.error.message}` : null,
    lastError: entry.lastError ? `${entry.lastError.name}: ${entry.lastError.message}` : null,
    counters: Object.freeze({
      paints: entry.paintCount,
      styleChecks: entry.styleCheckCount,
    }),
  };
  if (entry.mode === "native") {
    return Object.freeze({
      ...common,
      backend: "native-corner-shape",
      border: null,
      composition: Object.freeze({ originalElement: true as const, semantics: "browser-native" as const }),
      effects: Object.freeze({ shadow: null, outline: null }),
      geometry: null,
      implementationStatus: "NATIVE",
      limitations: Object.freeze({}),
      ownershipVerified: true,
      paint: null,
      paintActive: null,
      paintOwnership: "browser-native",
      prepared: null,
      surface: null,
    }) as Readonly<CornerfillEntryExplanation>;
  }
  const surface = entry.surface;
  const paintResult = entry.paintResult ?? (
    entry.mode === "prepared" && entry.paintProgram
      ? explainPreparedOpaqueImage(entry.paintProgram, entry.positionX, entry.positionY)
      : null
  );
  return Object.freeze({
    ...common,
    backend: surface?.backend ?? "pending",
    paintOwnership: "host-background-border-and-contained-effects",
    implementationStatus: "IMPLEMENTED",
    ownershipVerified: entry.ownershipVerified === true,
    paintActive: entry.visible,
    limitations: CORNERFILL_LIMITATIONS,
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
    composition: entry.composition ?? null,
    surface: surface ? Object.freeze({ id: surface.id, backend: surface.backend, size: surface.size }) : null,
    prepared: entry.mode === "prepared" ? Object.freeze({
      directUpdates: true,
      observesStyleMutations: false,
      surfaceDeferred: surface === null,
      paintActive: entry.visible,
      backgroundPosition: entry.paintProgram
        ? Object.freeze([entry.positionX, entry.positionY])
        : null,
      layoutUpdates: "explicit",
    }) : null,
  }) as Readonly<CornerfillEntryExplanation>;
}

class CornerfillController {
  declare readonly document: Document;
  declare readonly view: RuntimeWindow;
  declare readonly options: Readonly<ResolvedCornerfillOptions>;
  declare readonly capabilities: ReturnType<typeof detectCornerfillCapabilities>;
  declare readonly ownership: OwnershipManager<FallbackEntry>;
  declare readonly ownershipRootCounts: Map<OwnershipRoot, number>;
  declare readonly observedRootCounts: Map<OwnershipRoot, number>;
  declare readonly rootObservers: Map<OwnershipRoot, MutationObserver | null>;
  declare readonly attachmentLifecycleObservers: Map<OwnershipRoot, MutationObserver>;
  declare attachmentLifecycleQueued: boolean;
  declare readonly entries: Set<RuntimeEntry>;
  declare readonly entryByElement: WeakMap<CornerfillElement, RuntimeEntry>;
  declare readonly geometryCache: Map<string, CornerGeometry>;
  declare surfaceCount: number;
  declare surfacePixels: number;
  declare readonly dirty: Set<DynamicEntry>;
  declare readonly preparedDirty: Set<PreparedEntry>;
  declare readonly activeAnimations: Map<DynamicEntry, Map<string, number>>;
  declare readonly ignoredAnimations: Map<DynamicEntry, Map<string, number>>;
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
    if (!options || typeof options !== "object" || Array.isArray(options)) {
      throw new TypeError("installCornerfill() options must be an object");
    }
    options = Object.freeze({ ...options });
    this.document = options.document ?? globalThis.document;
    if (!this.document?.defaultView) throw new TypeError("installCornerfill() requires a browser document");
    this.view = this.document.defaultView as RuntimeWindow;
    if (options.nonce !== undefined && options.nonce !== null && typeof options.nonce !== "string") {
      throw new TypeError("nonce must be a string or null");
    }
    for (const name of ["forceFallback", "observe", "staticFallback"] as const) {
      if (options[name] !== undefined && typeof options[name] !== "boolean") {
        throw new TypeError(`${name} must be a boolean`);
      }
    }
    this.options = Object.freeze({
      forceFallback: options.forceFallback === true,
      staticFallback: options.staticFallback === true,
      backend: options.backend ?? "auto",
      observe: options.observe !== false,
      maxActiveFallbackEntries: options.maxActiveFallbackEntries ?? 2048,
      maxSurfacePixels: options.maxSurfacePixels ?? DEFAULT_MAX_SURFACE_PIXELS,
      maxTotalSurfacePixels: options.maxTotalSurfacePixels ?? DEFAULT_MAX_TOTAL_SURFACE_PIXELS,
      maxGeometryCacheEntries: options.maxGeometryCacheEntries ?? 2048,
      maxImageCacheEntries: options.maxImageCacheEntries ?? 32,
      maxImageCachePixels: options.maxImageCachePixels ?? DEFAULT_MAX_DECODED_IMAGE_PIXELS,
      imageTimeoutMs: options.imageTimeoutMs ?? 10_000,
      nonce: options.nonce ?? null,
    });
    if (!["auto", "webkit-canvas", "moz-element", "static-data-url"].includes(this.options.backend)) {
      throw new TypeError(`unknown Cornerfill surface backend: ${this.options.backend}`);
    }
    positiveSafeInteger(this.options.maxActiveFallbackEntries, "maxActiveFallbackEntries");
    positiveSafeInteger(this.options.maxSurfacePixels, "maxSurfacePixels");
    positiveSafeInteger(this.options.maxTotalSurfacePixels, "maxTotalSurfacePixels");
    nonNegativeSafeInteger(this.options.maxGeometryCacheEntries, "maxGeometryCacheEntries");
    nonNegativeSafeInteger(this.options.maxImageCacheEntries, "maxImageCacheEntries");
    nonNegativeSafeInteger(this.options.maxImageCachePixels, "maxImageCachePixels");
    validateTimerDelay(this.options.imageTimeoutMs, "imageTimeoutMs");
    this.capabilities = detectCornerfillCapabilities(this.document, {
      nativeQualification: options.nativeQualification,
    });
    this.ownership = new OwnershipManager<FallbackEntry>(this.document, this.options.nonce);
    this.ownershipRootCounts = new Map();
    this.observedRootCounts = new Map();
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
    this.ignoredAnimations = new Map();
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
      maxDecodedPixels: this.options.maxImageCachePixels,
      timeoutMs: this.options.imageTimeoutMs,
    });
    this._onMutation = this._onMutation.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onAnimationStart = this._onAnimationStart.bind(this);
    this._onAnimationEnd = this._onAnimationEnd.bind(this);
    this._animationTick = this._animationTick.bind(this);
    this.observersInstalled = false;
  }

  _repairEntryOwnership(entry: FallbackEntry): boolean {
    if (entry.disposed || entry.error || !entry.surface || this.ownership.isApplied(entry)) return false;
    this.ownership.apply(entry);
    this.counters.ownershipRepairs += 1;
    entry.lastInvalidationReason = "ownership-repair-without-repaint";
    return true;
  }

  _retainOwnershipRoot(root: OwnershipRoot, observe: boolean): void {
    this.ownershipRootCounts.set(root, (this.ownershipRootCounts.get(root) ?? 0) + 1);
    if (observe) this.observedRootCounts.set(root, (this.observedRootCounts.get(root) ?? 0) + 1);
    try {
      if (observe) this._installObservers(root);
    } catch (error) {
      this._releaseOwnershipRoot(root, observe);
      throw error;
    }
  }

  _releaseOwnershipRoot(root: OwnershipRoot, observe: boolean): void {
    if (observe) {
      const observed = Math.max(0, (this.observedRootCounts.get(root) ?? 1) - 1);
      if (observed > 0) {
        this.observedRootCounts.set(root, observed);
      } else {
        this.observedRootCounts.delete(root);
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
        if (this.observedRootCounts.size === 0 && this.observersInstalled) {
          this.resizeObserver?.disconnect();
          if (this._onWindowResize) this.view.removeEventListener("resize", this._onWindowResize);
          this._onWindowResize = undefined;
          this.observersInstalled = false;
          this.activeAnimations.clear();
          this.ignoredAnimations.clear();
          if (this.animationHandle !== undefined) {
            this.view.cancelAnimationFrame(this.animationHandle);
            this.animationHandle = undefined;
          }
        }
      }
    }
    const next = Math.max(0, (this.ownershipRootCounts.get(root) ?? 1) - 1);
    if (next > 0) {
      this.ownershipRootCounts.set(root, next);
      return;
    }
    this.ownershipRootCounts.delete(root);
    // Keep the document-scoped rule warm for selector-driven detach/reattach.
    // Shadow-root rules are released because their hosts can disappear.
    if (root !== this.document) this.ownership.releaseRoot(root);
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
        attributeFilter: ["class", "dir", "style", ...OBSERVED_STYLESHEET_ATTRIBUTES],
        attributeOldValue: true,
        childList: true,
        characterData: true,
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
          "dir",
          "style",
          ...OBSERVED_STYLESHEET_ATTRIBUTES,
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
        if (entry.mode === "dynamic") this._markDirty(entry, "viewport-or-dpr", true);
      }
    };
    this.view.addEventListener("resize", this._onWindowResize, { passive: true });
  }

  _onMutation(records: readonly MutationRecord[]): void {
    const effects: RuntimeMutationEffects = {
      childListChanged: false,
      paintStyleEntries: new Set(),
      selectorAncestors: new Set(),
      semanticEntries: new Set(),
      styleEntries: new Set(),
      stylesheetRoots: new Set(),
      visibilityAncestors: new Set(),
      visibilityStyleEntries: new Set(),
    };
    for (const record of records) this._collectMutationEffects(record, effects);
    for (const entry of effects.semanticEntries) this._markDirty(entry, "host-content-semantics", true);
    if (effects.stylesheetRoots.size > 0) {
      for (const entry of this.entries) {
        if (entry.mode !== "dynamic" || entry.disposed
          || !hasShadowIncludingAncestor(effects.stylesheetRoots, entry.element)) continue;
        this._markDirty(entry, "stylesheet-source", true);
      }
    }
    for (const entry of effects.styleEntries) this._applyStyleMutationEffects(entry, effects);
    this._applyAncestorMutationEffects(effects);
    if (effects.childListChanged) this._queueAttachmentLifecycleCheck();
  }

  _collectMutationEffects(record: MutationRecord, effects: RuntimeMutationEffects): void {
    if (colorProbeMutation(record)) return;
    const stylesheetRoot = mutationStylesheetRoot(record);
    if (stylesheetRoot) effects.stylesheetRoots.add(stylesheetRoot);
    if (record.type === "childList" || record.type === "characterData") {
      if (record.type === "childList") effects.childListChanged = true;
      const target = record.type === "characterData" ? record.target.parentNode : record.target;
      const entry = target?.nodeType === 1
        ? this.entryByElement.get(target as CornerfillElement)
        : undefined;
      if (entry?.mode === "dynamic" && !entry.disposed) effects.semanticEntries.add(entry);
      return;
    }

    const visibilityInputChanged = record.attributeName === "class"
      || (record.attributeName === "style" && styleMutationMayAffectVisibility(record));
    if (visibilityInputChanged) effects.visibilityAncestors.add(record.target);
    if (record.attributeName === "class"
      || record.attributeName === "dir"
      || (record.attributeName === "style"
        && (styleMutationMayAffectPaint(record) || visibilityInputChanged))) {
      effects.selectorAncestors.add(record.target);
    }
    const entry = record.target.nodeType === 1
      ? this.entryByElement.get(record.target as CornerfillElement)
      : undefined;
    if (!entry || entry.mode !== "dynamic" || entry.disposed) return;
    if (record.attributeName !== "style") {
      const ownershipAttribute = record.attributeName === OWNERSHIP_ATTRIBUTE
        || record.attributeName === OWNED_BORDER_ATTRIBUTE
        || record.attributeName === OWNED_OUTLINE_ATTRIBUTE
        || record.attributeName === OWNED_SHADOW_ATTRIBUTE
        || record.attributeName === OWNED_SURFACE_ATTRIBUTE;
      if (ownershipAttribute && this.ownership.isApplied(entry)) {
        this.counters.ignoredStyleMutations += 1;
        return;
      }
      if (record.attributeName === "class") this._updateEntryStyleVisibility(entry);
      this._markDirty(entry, "style-selector-input", true);
      return;
    }
    const paintInputChanged = styleMutationMayAffectPaint(record, entry.watchPosition);
    const positionInputChanged = styleMutationMayAffectPosition(record);
    if (!visibilityInputChanged && !paintInputChanged && !positionInputChanged) {
      if (entry.initialized && !this.ownership.isApplied(entry)) {
        effects.styleEntries.add(entry);
        return;
      }
      this.counters.ignoredStyleMutations += 1;
      return;
    }
    if (visibilityInputChanged) effects.visibilityStyleEntries.add(entry);
    if (paintInputChanged) effects.paintStyleEntries.add(entry);
    effects.styleEntries.add(entry);
  }

  _applyStyleMutationEffects(entry: DynamicEntry, effects: RuntimeMutationEffects): void {
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
    if (positionChanged) this.counters.dynamicPaintUpdates += 1;
    const visibilityChanged = effects.visibilityStyleEntries.has(entry)
      ? this._updateEntryStyleVisibility(entry)
      : false;
    const paintInputChanged = effects.paintStyleEntries.has(entry);
    const ownershipDamaged = entry.initialized && !this.ownership.isApplied(entry);
    if (positionChanged && !entry.visible) entry.needsPaint = true;
    if (carrierChanged || ownershipDamaged || paintInputChanged || (positionChanged && entry.visible)
      || (visibilityChanged && entry.visible)) {
      this._markDirty(
        entry,
        positionChanged ? "background-position" : visibilityChanged ? "visibility" : "style",
        carrierChanged || ownershipDamaged || paintInputChanged,
      );
    } else {
      this.counters.ignoredStyleMutations += 1;
    }
  }

  _applyAncestorMutationEffects(effects: RuntimeMutationEffects): void {
    for (const entry of this.entries) {
      if (entry.mode !== "dynamic" || entry.disposed) continue;
      if (effects.visibilityAncestors.size > 0 && !effects.visibilityAncestors.has(entry.element)
        && hasShadowIncludingAncestor(effects.visibilityAncestors, entry.element)) {
        const visibilityChanged = this._updateEntryStyleVisibility(entry);
        if (visibilityChanged && entry.visible) this._markDirty(entry, "visibility", true);
      }
      if (effects.selectorAncestors.size > 0 && !effects.selectorAncestors.has(entry.element)
        && hasShadowIncludingAncestor(effects.selectorAncestors, entry.element)) {
        this._markDirty(entry, "ancestor-style-selector-input", true);
      }
    }
  }

  _updateEntryStyleVisibility(
    entry: FallbackEntry,
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

  _reconcileEntryOwnershipRoot(entry: FallbackEntry): boolean {
    if (entry.disposed) return false;
    if (entry.element.ownerDocument !== this.document) {
      throw new Error(
        "Cornerfill cannot migrate an attached element to another document; dispose it and attach it with that document's controller",
      );
    }
    const nextRoot = entry.element.getRootNode() as OwnershipRoot;
    if (nextRoot === entry.ownershipRoot) return false;
    const previousRoot = entry.ownershipRoot;
    const observed = entry.mode !== "prepared";
    this._retainOwnershipRoot(nextRoot, observed);
    entry.ownershipRoot = nextRoot;
    try {
      this.ownership.apply(entry);
    } catch (error) {
      entry.ownershipRoot = previousRoot;
      this._releaseOwnershipRoot(nextRoot, observed);
      throw error;
    }
    this._releaseOwnershipRoot(previousRoot, observed);
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
        if (entry.mode !== "dynamic" || entry.disposed) continue;
        try {
          if (!entry.element.isConnected) {
            this.detach(entry.element);
            continue;
          }
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
      if (entry?.mode === "dynamic" && !entry.disposed) {
        this._markDirty(entry, "resize", true);
      }
    }
  }

  _onAnimationStart(event: Event): void {
    const entry = this.entryByElement.get(event.target as CornerfillElement);
    if (!entry || entry.mode !== "dynamic" || entry.disposed) return;
    const token = animationToken(event);
    if (!animationAffectsPaint(entry.element, event)) {
      let ignored = this.ignoredAnimations.get(entry);
      if (!ignored) {
        ignored = new Map();
        this.ignoredAnimations.set(entry, ignored);
      }
      ignored.set(token, (ignored.get(token) ?? 0) + 1);
      return;
    }
    let tokens = this.activeAnimations.get(entry);
    if (!tokens) {
      tokens = new Map();
      this.activeAnimations.set(entry, tokens);
    }
    tokens.set(token, (tokens.get(token) ?? 0) + 1);
    if (this.animationHandle === undefined) this.animationHandle = this.view.requestAnimationFrame(this._animationTick);
  }

  _onAnimationEnd(event: Event): void {
    const entry = this.entryByElement.get(event.target as CornerfillElement);
    if (!entry || entry.mode !== "dynamic" || entry.disposed) return;
    const token = animationToken(event);
    const ignored = this.ignoredAnimations.get(entry);
    const ignoredCount = ignored?.get(token) ?? 0;
    if (ignoredCount > 0) {
      if (ignoredCount === 1) ignored!.delete(token);
      else ignored!.set(token, ignoredCount - 1);
      if (ignored!.size === 0) this.ignoredAnimations.delete(entry);
      return;
    }
    const tokens = this.activeAnimations.get(entry);
    const count = tokens?.get(token) ?? 0;
    if (tokens && count > 0) {
      if (count === 1) tokens.delete(token);
      else tokens.set(token, count - 1);
      if (tokens.size === 0) this.activeAnimations.delete(entry);
      this._markDirty(entry, "animation-final", true);
      return;
    }
    if (!animationAffectsPaint(entry.element, event)) return;
    this._markDirty(entry, "animation-final", true);
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

  _failInitialization(entry: FallbackEntry, error: unknown): never {
    this._recordError(entry, error);
    try {
      this.detach(entry.element);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Cornerfill initialization and teardown failed");
    }
    throw error;
  }

  _settleWaiters(entry: DynamicEntry, revision: number, error: unknown = null): void {
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

  _markDirty(entry: DynamicEntry, reason: string, needsFullRefresh: boolean): number {
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
    entry: DynamicEntry,
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
      await Promise.all(entries.map(async (entry) => {
        if (entry.disposed) return;
        const revision = entry.revision;
        try {
          if (!entry.initialized && entry.ready) await entry.ready;
          if (!this._entryIsCurrent(entry)) return;
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
            return;
          }
          entry.needsPaint = true;
          entry.fullRefreshPending = true;
          const cleanupErrors: unknown[] = [];
          try { this.ownership.remove(entry); } catch (cleanupError) { cleanupErrors.push(cleanupError); }
          try {
            restoreOwnershipState(entry.element, entry.ownershipSnapshot);
          } catch (cleanupError) {
            cleanupErrors.push(cleanupError);
          }
          const failure = cleanupErrors.length === 0
            ? error
            : new AggregateError([error, ...cleanupErrors], "Cornerfill refresh and ownership rollback failed");
          this._recordError(entry, failure);
          entry.ownershipVerified = false;
          this._settleWaiters(entry, revision, failure);
        }
      }));
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
    entry: FallbackEntry,
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
    const resolveLease = async (
      lease: Readonly<ImageLease>,
      identity: string,
    ): Promise<CornerfillRasterSource> => {
      let image: CornerfillRasterSource;
      try {
        image = await lease.promise;
      } catch (error) {
        discardRejectedLease(lease, identity);
        if (!this._entryIsCurrent(entry, revision)) throw new StaleEntryWorkError();
        throw error;
      }
      this._assertEntryCurrent(entry, revision);
      return image;
    };
    let paint: ResolvedPaintDescriptor;
    try {
      if (descriptor.kind === "layers") {
        const layers = await Promise.all(descriptor.layers.map(async (
          layer,
        ): Promise<NormalizedBackgroundLayer> => {
          if (layer.kind !== "image" || layer.image) {
            return layer;
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
          const image = await resolveLease(lease, request.identity);
          return Object.freeze({ ...layer, image });
        }));
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
          image = await resolveLease(lease, request.identity);
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
    const previousImageLease = entry.imageLease;
    const previousLayerImageLeases = entry.layerImageLeases;
    const commit = () => {
      if (settled) return;
      settled = true;
      entry.imageLease = desiredImageLease;
      entry.imageLeaseUrl = desiredImageLeaseUrl;
      entry.layerImageLeases = desiredLayerLeases.size > 0 ? desiredLayerLeases : null;
      entry.resolvedImage = desiredResolvedImage;
      for (const lease of acquired) entry.pendingImageLeases?.delete(lease);
      if (entry.pendingImageLeases?.size === 0) entry.pendingImageLeases = null;
      acquired.clear();
      if (previousImageLease && !retained.has(previousImageLease)) previousImageLease.release();
      for (const lease of previousLayerImageLeases?.values() ?? []) {
        if (!retained.has(lease)) lease.release();
      }
    };
    return Object.freeze({ paint, commit, rollback });
  }

  async _snapshot(
    entry: DynamicEntry,
    revision: number | null = null,
  ): Promise<Readonly<DynamicSnapshot>> {
    const authored = this.ownership.withAuthoredComputedStyle(entry, (computed) => {
      const sources = currentSources(entry, computed);
      return Object.freeze({
        colorContext: captureElementColorContext(entry.element, computed, ownedColorInputs(sources)),
        computed: Object.freeze({ visibility: computed.visibility }),
        composition: inspectFallbackHost(entry.element, computed),
        size: measureBorderBox(entry.element, computed),
        sources,
        flow: flowFromComputed(computed),
        boxMetrics: backgroundBoxMetrics(computed),
      });
    });
    const sources = withElementColorResolver(
      this.view,
      entry.element,
      authored.colorContext,
      (resolveColor) => resolveCurrentSourceColors(authored.sources, resolveColor),
    );
    const { width, height } = authored.size;
    const dpr = this.view.devicePixelRatio || 1;
    this._assertSurfaceDimensions(width, height, dpr);
    const { flow, boxMetrics } = authored;
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

  async _initializeEntry(entry: DynamicEntry): Promise<CornerfillEntryExplanation> {
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

  _refreshDynamicPaint(entry: DynamicEntry, reason: string | null): boolean {
    const position = entry.backgroundPositionSpec;
    const surface = entry.surface;
    const geometry = entry.geometry;
    if (entry.paintSource.kind !== "image" || !position) {
      throw new TypeError("paint-only refresh requires a positioned raster descriptor");
    }
    if (!surface || !geometry) throw new Error("paint-only refresh requires an initialized surface and geometry");
    const paintSource = Object.freeze({
      ...entry.paintSource,
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
    const paintResult = fastPaint ?? paintCornerfill(surface.context, {
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
    entry.paintKey = nextPaintKey;
    entry.paintResult = paintResult;
    entry.paintCount += 1;
    this.counters.paints += 1;
    this.counters.paintOnlyUpdates += 1;
    entry.needsPaint = false;
    entry.lastInvalidationReason = reason || "dynamic-background-position";
    this._clearError(entry);
    return true;
  }

  _refreshEntry(entry: DynamicEntry, revision: number): boolean | Promise<boolean> {
    const reason = entry.pendingReason;
    const initial = entry.initial;
    const state = entry.overrides;
    const rootChanged = this._reconcileEntryOwnershipRoot(entry);
    const needsFullRefresh = entry.fullRefreshPending || rootChanged;
    const commitInvalidation = (result: boolean): boolean => {
      this._assertEntryCurrent(entry, revision);
      entry.pendingReason = null;
      entry.fullRefreshPending = false;
      return result;
    };
    const dynamicPaintOnly = canRefreshDynamicPaint({
      explicitPaint: state.paint !== undefined,
      fullRefresh: needsFullRefresh,
      paintKind: entry.paintSource.kind,
      paintPosition: initial.dynamic.paintPosition,
      reason,
    });
    if (dynamicPaintOnly) {
      return commitInvalidation(this._refreshDynamicPaint(entry, reason));
    }
    return this._refreshEntryFull(entry, reason, revision).then(commitInvalidation);
  }

  async _refreshEntryFull(entry: DynamicEntry, reason: string | null, revision: number): Promise<boolean> {
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
      if (needsPaint && entry.visible) {
        const paintResult = paintCornerfill(surface.context, {
          geometry: snapshot.geometry,
          paint: snapshot.paint,
          border: snapshot.border,
          shadow: snapshot.shadow,
          outline: snapshot.outline,
          dpr: snapshot.dpr,
        });
        surface.commit();
        applyDynamicSnapshot(entry, snapshot);
        entry.paintResult = paintResult;
        this.ownership.apply(entry);
        entry.paintCount += 1;
        this.counters.paints += 1;
        entry.needsPaint = false;
        entry.lastInvalidationReason = reason || "direct-update";
      } else if (needsPaint) {
        applyDynamicSnapshot(entry, snapshot);
        entry.needsPaint = true;
        entry.lastInvalidationReason = "hidden-paint-deferred";
      } else if (!this.ownership.isApplied(entry)) {
        applyDynamicSnapshot(entry, snapshot);
        this.ownership.apply(entry);
        this.counters.ownershipRepairs += 1;
        entry.lastInvalidationReason = "ownership-repair-without-repaint";
      } else {
        this.ownership.assertStylesApplied(entry);
        applyDynamicSnapshot(entry, snapshot);
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
    if (this.counters.fallbackEntries >= this.options.maxActiveFallbackEntries) {
      throw new RangeError(
        `active fallback entry budget ${this.options.maxActiveFallbackEntries} is exhausted`,
      );
    }
  }

  _assertSurfaceBudget(
    width: number,
    height: number,
    dpr: number,
    replaced: FallbackEntry | null = null,
  ): void {
    const requested = this._assertSurfaceDimensions(width, height, dpr);
    const retained = this.surfacePixels - this._surfacePixels(replaced?.surface ?? null);
    if (retained + requested > this.options.maxTotalSurfacePixels) {
      throw new RangeError(
        `aggregate surface allocation ${retained + requested} exceeds ${this.options.maxTotalSurfacePixels} pixels`,
      );
    }
  }

  _assertSurfaceDimensions(width: number, height: number, dpr: number): number {
    const backingWidth = Math.max(1, Math.ceil(width * dpr));
    const backingHeight = Math.max(1, Math.ceil(height * dpr));
    const requested = backingWidth * backingHeight;
    if (!Number.isSafeInteger(requested) || requested > this.options.maxSurfacePixels) {
      throw new RangeError(
        `surface allocation ${backingWidth}x${backingHeight} exceeds ${this.options.maxSurfacePixels} pixels`,
      );
    }
    return requested;
  }

  _surfacePixels(surface: CornerfillSurface | null): number {
    return surface?.allocationPixels ?? 0;
  }

  _setSurface(entry: FallbackEntry, surface: CornerfillSurface | null): void {
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

  _resizeSurface(entry: FallbackEntry, width: number, height: number, dpr: number): boolean {
    const surface = entry.surface;
    if (!surface) throw new Error("cannot resize an unavailable Cornerfill surface");
    this._assertSurfaceBudget(width, height, dpr, entry);
    const previousPixels = this._surfacePixels(surface);
    try {
      return surface.resize(width, height, dpr);
    } finally {
      this.surfacePixels += this._surfacePixels(surface) - previousPixels;
    }
  }

  _disposeSurface(entry: FallbackEntry): void {
    const surface = entry.surface;
    this._setSurface(entry, null);
    surface?.dispose();
  }

  _resetPreparedOwnership(entry: PreparedEntry): void {
    const errors = [];
    try { this.ownership.remove(entry); } catch (error) { errors.push(error); }
    try {
      restoreOwnershipState(entry.element, entry.ownershipSnapshot);
    } catch (error) {
      errors.push(error);
    }
    entry.ownershipVerified = false;
    if (errors.length > 0) {
      throw new AggregateError(errors, "Cornerfill prepared ownership rollback failed");
    }
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
      maxSurfacePixels: this.options.maxSurfacePixels,
    });
  }

  _createPreparedSurface(entry: PreparedEntry, verifyOwnership = true): boolean {
    if (entry.surface) return false;
    const backend = entry.backend;
    if (!backend) throw new Error("prepared surface backend is unavailable");
    this._assertSurfaceBudget(entry.width, entry.height, entry.dpr, entry);
    this._setSurface(entry, this._createSurface(entry.width, entry.height, entry.dpr, backend));
    try {
      this._paintPreparedFull(entry, verifyOwnership);
    } catch (error) {
      const rollbackErrors = [];
      try { this._resetPreparedOwnership(entry); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      try { this._disposeSurface(entry); } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      if (rollbackErrors.length > 0) {
        throw new AggregateError(
          [error, ...rollbackErrors],
          "Cornerfill prepared surface rollback failed",
        );
      }
      throw error;
    }
    if (entry.surfaceDeferred) {
      entry.surfaceDeferred = false;
      this.counters.deferredSurfaceEntries -= 1;
    }
    return true;
  }

  _paintPreparedFull(entry: PreparedEntry, verifyOwnership = true): void {
    const surface = entry.surface;
    const geometry = entry.geometry;
    const resolvedPaint = entry.resolvedPaint;
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
    if (entry.paintProgram) {
      preparePreparedOpaqueImageContext(surface.context, entry.paintProgram);
    }
    surface.commit();
    this.ownership.apply(entry, verifyOwnership);
    this._clearError(entry);
    entry.needsPaint = false;
    entry.paintCount += 1;
    this.counters.paints += 1;
    this.counters.preparedPaints += 1;
    entry.needsFullPaint = false;
  }

  _paintPreparedEntry(entry: PreparedEntry): void {
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
    if (entry.needsFullPaint) {
      if (this._resizeSurface(entry, entry.width, entry.height, entry.dpr)) {
        this.counters.surfaceResizes += 1;
      }
      this._paintPreparedFull(entry);
      entry.lastInvalidationReason = "prepared-layout-repaint";
      return;
    }
    if (!entry.paintProgram) {
      throw new TypeError("this prepared entry has no allocation-free opaque raster update program");
    }
    drawPreparedOpaqueImage(
      surface.context,
      entry.paintProgram,
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

  _queuePrepared(entry: PreparedEntry): void {
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
        let failure = error;
        try {
          this._resetPreparedOwnership(entry);
        } catch (rollbackError) {
          failure = new AggregateError(
            [error, rollbackError],
            "Cornerfill prepared paint and ownership rollback failed",
          );
        }
        this._recordError(entry, failure);
        firstError ??= failure;
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
    entry: PreparedEntry,
    x: number,
    y: number,
  ): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new TypeError("prepared background position must contain two finite pixels");
    }
    if (!entry.paintProgram) {
      throw new TypeError("prepared background-position updates require an opaque no-border raster paint");
    }
    validatePreparedOpaqueImagePosition(entry.paintProgram, x, y);
    if (entry.positionX === x && entry.positionY === y) return false;
    entry.positionX = x;
    entry.positionY = y;
    entry.positionRevision += 1;
    entry.paintResult = null;
    entry.needsPaint = true;
    this.counters.dynamicPaintUpdates += 1;
    this.counters.preparedUpdates += 1;
    this._queuePrepared(entry);
    return true;
  }

  _setPreparedVisibility(entry: PreparedEntry, visible: boolean): boolean {
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
    if (this.destroyed) throw new Error("Cornerfill controller is destroyed");
    if (!Array.isArray(updates)) throw new TypeError("prepared batch must be an array");
    const prepared = [] as Array<Readonly<{
      backgroundPosition?: PixelPair;
      entry: PreparedEntry;
      paintActive?: boolean;
    }>>;
    for (const update of updates) {
      const element = update?.element;
      const entry = this.entryByElement.get(element);
      if (!entry || entry.disposed || entry.mode !== "prepared") {
        throw new Error("prepared batch contains an element that is not attached");
      }
      const backgroundPosition = update.backgroundPosition;
      let position: PixelPair | undefined;
      if (backgroundPosition !== undefined) {
        if (!Array.isArray(backgroundPosition) || backgroundPosition.length !== 2) {
          throw new TypeError("prepared batch background position must be [x, y]");
        }
        const [x, y] = backgroundPosition;
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          throw new TypeError("prepared background position must contain two finite pixels");
        }
        if (!entry.paintProgram) {
          throw new TypeError("prepared background-position updates require an opaque no-border raster paint");
        }
        validatePreparedOpaqueImagePosition(entry.paintProgram, x, y);
        position = Object.freeze([x, y]) as PixelPair;
      }
      const requestedPaintActive = update.paintActive;
      if (requestedPaintActive !== undefined && typeof requestedPaintActive !== "boolean") {
        throw new TypeError("paintActive must be a boolean");
      }
      prepared.push(Object.freeze({
        entry,
        ...(position === undefined ? {} : { backgroundPosition: position }),
        ...(requestedPaintActive === undefined ? {} : { paintActive: requestedPaintActive }),
      }));
    }
    for (const update of prepared) {
      const { entry } = update;
      if (update.backgroundPosition !== undefined) {
        const [x, y] = update.backgroundPosition;
        this._setPreparedBackgroundPosition(entry, x, y);
      }
      if (update.paintActive !== undefined) this._setPreparedVisibility(entry, update.paintActive);
    }
    this.counters.preparedBatches += 1;
    return this._flushPrepared(true);
  }

  async _resolvePreparedLayout(
    entry: PreparedEntry,
    config: Readonly<PreparedLayoutConfigSnapshot>,
    revision: number,
    initial = false,
    requestedAtPositionRevision = entry.positionRevision,
  ): Promise<Readonly<PreparedLayoutSnapshot>> {
    const computed = this.view.getComputedStyle(entry.element);
    const writingFlow = flowFromComputed(computed);
    const composition = inspectFallbackHost(entry.element, computed);
    const size = config.size ?? [entry.width, entry.height];
    if (!isPositivePixelPair(size)) {
      throw new TypeError("prepared layout requires size: [positiveWidth, positiveHeight]");
    }
    const [width, height] = size;
    const dpr = config.dpr ?? entry.dpr ?? this.view.devicePixelRatio ?? 1;
    if (!Number.isFinite(dpr) || dpr <= 0) throw new TypeError("prepared layout DPR must be positive");
    this._assertSurfaceDimensions(width, height, dpr);
    const borderRadius = config.borderRadius ?? entry.radiusSource;
    const cornerShape = config.cornerShape ?? entry.shapeSource;
    let geometry = config.geometry ?? null;
    if (!geometry) {
      if (borderRadius === undefined || cornerShape === undefined) {
        const changesGeometryInput = config.borderRadius !== undefined
          || config.cornerShape !== undefined;
        if (!initial && !changesGeometryInput
          && width === entry.width && height === entry.height && dpr === entry.dpr) {
          geometry = entry.geometry;
        }
        else throw new TypeError("resizing explicit prepared geometry requires new geometry or reusable radius and shape sources");
      } else {
        geometry = this._geometry(
          width,
          height,
          dpr,
          resolveRadiusSource(borderRadius, width, height, writingFlow),
          resolveCornerShape(cornerShape, writingFlow),
        ).geometry;
      }
    }
    if (!geometry) throw new TypeError("prepared layout geometry is unavailable");
    if (geometry.width !== width || geometry.height !== height || geometry.dpr !== dpr) {
      throw new RangeError("prepared geometry dimensions or DPR do not match prepared layout");
    }
    const paintSource = config.paint ?? entry.paintSource;
    const normalizedDescriptor = paintSource;
    if (normalizedDescriptor.kind !== "solid" && normalizedDescriptor.kind !== "layers"
      && normalizedDescriptor.blendMode === "multiply") {
      throw new TypeError("prepared paint requires normal background blending");
    }
    const normalizedBorder = config.border === undefined
      ? initial ? captureBorder(computed) : entry.borderSource
      : config.border;
    const normalizedShadow = config.shadow === undefined
      ? initial ? normalizeInsetShadow(computed.boxShadow) : entry.shadowSource
      : config.shadow;
    const normalizedOutline = config.outline === undefined
      ? initial ? captureOutline(computed) : entry.outlineSource
      : config.outline;
    const { descriptor, border, shadow, outline } = withElementColorResolver(
      this.view,
      entry.element,
      captureElementColorContext(entry.element, computed, [
        ...paintColorInputs(normalizedDescriptor),
        ...(normalizedBorder ? [normalizedBorder.color] : []),
        ...(normalizedShadow ? [normalizedShadow.color] : []),
        ...(normalizedOutline ? [normalizedOutline.color] : []),
      ]),
      (resolveColor) => Object.freeze({
        descriptor: resolvePaintColors(normalizedDescriptor, resolveColor),
        border: resolveBorderColor(normalizedBorder, resolveColor),
        shadow: resolveShadowColor(normalizedShadow, resolveColor),
        outline: resolveOutlineColor(normalizedOutline, resolveColor),
      }),
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
      const preserveNewerPosition = !initial
        && (config.paint === undefined || entry.positionRevision !== requestedAtPositionRevision);
      const paint = preserveNewerPosition && paintLeases.paint.kind === "image"
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
        descriptor: normalizedDescriptor,
        border,
        borderSource: normalizedBorder,
        shadow,
        shadowSource: normalizedShadow,
        outline,
        outlineSource: normalizedOutline,
        composition,
        borderRadius,
        cornerShape,
        program,
        writingFlow,
      });
    } catch (error) {
      paintLeases.rollback();
      throw error;
    }
  }

  _commitPreparedLayout(
    entry: PreparedEntry,
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
      // The old surface remains live until the transactional replacement commits.
      this._assertSurfaceBudget(snapshot.width, snapshot.height, snapshot.dpr);
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
      needsFullPaint: entry.needsFullPaint,
      needsPaint: entry.needsPaint,
      outline: entry.outline,
      ownershipVerified: entry.ownershipVerified,
      paintResult: entry.paintResult,
      positionX: entry.positionX,
      positionY: entry.positionY,
      radiusSource: entry.radiusSource,
      borderSource: entry.borderSource,
      shapeSource: entry.shapeSource,
      outlineSource: entry.outlineSource,
      paintProgram: entry.paintProgram,
      paintSource: entry.paintSource,
      resolvedPaint: entry.resolvedPaint,
      shadowSource: entry.shadowSource,
      shadow: entry.shadow,
      width: entry.width,
      writingFlow: entry.writingFlow,
    });
    try {
      applyPreparedLayoutSnapshot(entry, snapshot);
      entry.needsPaint = !entry.visible;
      entry.needsFullPaint = !entry.visible;
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
        else this._resetPreparedOwnership(entry);
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
    if (replacement && entry.surfaceDeferred) {
      entry.surfaceDeferred = false;
      this.counters.deferredSurfaceEntries -= 1;
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
    entry: PreparedEntry,
    config: Readonly<PreparedLayoutConfigSnapshot>,
    requestedAtPositionRevision = entry.positionRevision,
  ): Promise<CornerfillEntryExplanation> {
    this._assertEntryCurrent(entry);
    const revision = ++entry.revision;
    let snapshot: Readonly<PreparedLayoutSnapshot> | null = null;
    try {
      snapshot = await this._resolvePreparedLayout(
        entry,
        config,
        revision,
        false,
        requestedAtPositionRevision,
      );
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
    entry: PreparedEntry,
    operation: () => Promise<CornerfillEntryExplanation>,
  ): Promise<CornerfillEntryExplanation> {
    const predecessor = entry.layoutChain ?? entry.ready;
    if (!predecessor) throw new Error("prepared entry initialization has not started");
    const queued = predecessor.then(() => (
      this._entryIsCurrent(entry) ? operation() : entryExplanation(entry)
    ));
    entry.layoutChain = queued.catch(() => {});
    return queued;
  }

  _resizePrepared(
    element: CornerfillElement,
    config: Readonly<CornerfillPreparedResizeConfig> = {},
  ): Promise<CornerfillEntryExplanation> {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed || entry.mode !== "prepared") throw new Error("prepared element is not attached");
    const preparedConfig = snapshotPreparedLayoutConfig(config);
    const requestedAtPositionRevision = entry.positionRevision;
    return this._queuePreparedLayout(
      entry,
      () => this._runPreparedLayout(entry, preparedConfig, requestedAtPositionRevision),
    );
  }

  _setPreparedCornerShape(
    entry: PreparedEntry,
    cornerShape: CornerShapeSource,
  ): Promise<CornerfillEntryExplanation> {
    const shapeSource = snapshotCornerShapeSource(cornerShape);
    return this._queuePreparedLayout(entry, async () => {
      this._assertEntryCurrent(entry);
      const writingFlow = flowFromComputed(this.view.getComputedStyle(entry.element));
      const resolved = resolveCornerShape(shapeSource, writingFlow);
      if (sameWritingFlow(entry.writingFlow, writingFlow)
        && entry.geometry?.shapeParameters.every((value, index) => Object.is(value, resolved[index]))) {
        entry.shapeSource = shapeSource;
        return entryExplanation(entry);
      }
      return this._runPreparedLayout(entry, { cornerShape: shapeSource });
    });
  }

  _refreshPrepared(entry: PreparedEntry): Promise<CornerfillEntryExplanation> {
    return this._queuePreparedLayout(entry, async () => {
      entry.needsPaint = true;
      entry.needsFullPaint = true;
      this._queuePrepared(entry);
      this._flushPrepared(true);
      return entryExplanation(entry);
    });
  }

  async _initializePreparedEntry(
    entry: PreparedEntry,
    config: Readonly<PreparedLayoutConfigSnapshot>,
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
        entry.surfaceDeferred = true;
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
  ): Readonly<CornerfillPreparedHandle> {
    if (this.destroyed) throw new Error("Cornerfill controller is destroyed");
    if (!(element instanceof this.view.Element)) throw new TypeError("attachPrepared() requires an Element from this document");
    const existing = this.entryByElement.get(element);
    if (existing && !existing.disposed) throw new Error("element is already attached to this Cornerfill controller");
    assertElementAvailable(element);
    this._assertFallbackEntryBudget();
    assertCooperativeOwnership(element);
    const composition = inspectFallbackHost(element, this.view.getComputedStyle(element));
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
    const preparedConfig = snapshotPreparedLayoutConfig(config);
    if (!isPositivePixelPair(preparedConfig.size)) {
      throw new TypeError("attachPrepared() requires size: [positiveWidth, positiveHeight]");
    }
    if (!preparedConfig.geometry
      && (preparedConfig.borderRadius === undefined || preparedConfig.cornerShape === undefined)) {
      throw new TypeError("attachPrepared() requires prepared geometry or explicit borderRadius and cornerShape");
    }
    if (!preparedConfig.paint) throw new TypeError("attachPrepared() requires normalized paint state");
    const paintActive = preparedConfig.paintActive ?? true;
    const entry = createPreparedEntry<CornerfillEntryExplanation>({
      element,
      backend,
      ownershipSnapshot: captureOwnershipState(element),
      ownershipRoot: element.getRootNode() as OwnershipRoot,
      width: preparedConfig.size[0],
      height: preparedConfig.size[1],
      dpr: preparedConfig.dpr ?? this.view.devicePixelRatio ?? 1,
      composition,
      paintSource: preparedConfig.paint,
      radiusSource: preparedConfig.borderRadius,
      shapeSource: preparedConfig.cornerShape,
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
    entry.ready = this._initializePreparedEntry(entry, preparedConfig);
    return this._handle(entry);
  }

  _shouldUseNative(config: Readonly<AttachConfigSnapshot>): boolean {
    if (this.options.forceFallback || !this.capabilities.native.qualified) return false;
    if (config.paint !== undefined || config.border !== undefined
      || config.shadow !== undefined || config.outline !== undefined) return false;
    return true;
  }

  _attachNative(
    element: CornerfillElement,
    config: Readonly<AttachConfigSnapshot>,
  ): Readonly<CornerfillNativeHandle> {
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
    const entry = createNativeEntry<CornerfillEntryExplanation>({
      element,
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
    claimElement(entry);
    try {
      writeNativeDeclarationGroups(entry, [
        ...(shapeDeclarations ? [Object.freeze({
          properties: NATIVE_SHAPE_PROPERTIES,
          declarations: shapeDeclarations,
        })] : []),
        ...(radiusDeclarations ? [Object.freeze({
          properties: NATIVE_RADIUS_PROPERTIES,
          declarations: radiusDeclarations,
        })] : []),
      ]);
    } catch (error) {
      releaseElement(entry);
      throw error;
    }
    entry.ready = Promise.resolve(entryExplanation(entry));
    this.entries.add(entry);
    this.entryByElement.set(element, entry);
    this.counters.attachments += 1;
    this.counters.nativeEntries += 1;
    return this._handle(entry);
  }

  _updateNativeEntry(
    entry: NativeEntry,
    next: Readonly<CornerfillNativeHandleUpdate>,
  ): Promise<Readonly<CornerfillEntryExplanation>> {
    assertSupportedUpdateKeys(next as Readonly<Record<string, unknown>>, NATIVE_UPDATE_KEYS, "native");
    const shapeDeclarations = next.cornerShape === undefined
      ? null
      : nativeShapeDeclarations(entry.element, next.cornerShape);
    const radiusDeclarations = next.borderRadius === undefined
      ? null
      : nativeRadiusDeclarations(entry.element, next.borderRadius);
    writeNativeDeclarationGroups(entry, [
      ...(shapeDeclarations ? [Object.freeze({
        properties: NATIVE_SHAPE_PROPERTIES,
        declarations: shapeDeclarations,
      })] : []),
      ...(radiusDeclarations ? [Object.freeze({
        properties: NATIVE_RADIUS_PROPERTIES,
        declarations: radiusDeclarations,
      })] : []),
    ]);
    return Promise.resolve(entryExplanation(entry));
  }

  _updatePreparedEntry(
    entry: PreparedEntry,
    next: Readonly<CornerfillPreparedHandleUpdate>,
  ): Promise<Readonly<CornerfillEntryExplanation>> {
    assertSupportedUpdateKeys(next as Readonly<Record<string, unknown>>, PREPARED_UPDATE_KEYS, "prepared");
    const backgroundPosition = next.backgroundPosition;
    let position: PixelPair | undefined;
    if (backgroundPosition !== undefined) {
      if (!Array.isArray(backgroundPosition) || backgroundPosition.length !== 2) {
        throw new TypeError("prepared background update requires [x, y]");
      }
      const [x, y] = backgroundPosition;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new TypeError("prepared background position must contain two finite pixels");
      }
      position = Object.freeze([x, y]) as PixelPair;
    }
    const requestedPaintActive = next.paintActive;
    if (requestedPaintActive !== undefined && typeof requestedPaintActive !== "boolean") {
      throw new TypeError("paintActive must be a boolean");
    }
    const paintActive = requestedPaintActive;
    const apply = (): Readonly<CornerfillEntryExplanation> => {
      if (position !== undefined) this._setPreparedBackgroundPosition(entry, position[0], position[1]);
      if (paintActive !== undefined) this._setPreparedVisibility(entry, paintActive);
      this._flushPrepared(true);
      return entryExplanation(entry);
    };
    if (position !== undefined && !entry.initialized) {
      return this._queuePreparedLayout(entry, async () => apply());
    }
    return Promise.resolve(apply());
  }

  _updateDynamicEntry(
    entry: DynamicEntry,
    next: Readonly<CornerfillDynamicHandleUpdate>,
  ): Promise<Readonly<CornerfillEntryExplanation>> {
    const state = entry.overrides;
    assertSupportedUpdateKeys(next as Readonly<Record<string, unknown>>, DYNAMIC_UPDATE_KEYS, "dynamic fallback");
    const {
      border,
      outline,
      paint,
      paintActive,
      radiusSource,
      resolvedShape,
      shapeSource,
      shadow,
    } = this._resolveDynamicEntryUpdate(entry, next);
    let changed = false;
    if (radiusSource !== undefined) {
      state.borderRadius = radiusSource;
      changed = true;
    }
    if (shapeSource !== undefined) {
      state.cornerShape = shapeSource;
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
    if (paintActive !== undefined) {
      const previousVisible = entry.visible;
      entry.requestedVisible = paintActive;
      entry.visible = entry.requestedVisible && entry.styleVisible;
      if (entry.visible !== previousVisible) {
        if (entry.visible) entry.needsPaint = true;
        changed = true;
      }
    }
    if (!changed) return Promise.resolve(entryExplanation(entry));
    return this._scheduleAndWait(entry, "direct-update", true);
  }

  _resolveDynamicEntryUpdate(
    entry: DynamicEntry,
    next: Readonly<CornerfillDynamicHandleUpdate>,
  ): Readonly<ResolvedDynamicEntryUpdate> {
    const requestedPaint = next.paint;
    const requestedBorder = next.border;
    const requestedShadow = next.shadow;
    const requestedOutline = next.outline;
    const requestedRadius = next.borderRadius;
    const requestedShape = next.cornerShape;
    const normalizedPaint = requestedPaint === undefined ? undefined : normalizePaintDescriptor(requestedPaint);
    const normalizedBorder = requestedBorder === undefined ? undefined : normalizeBorder(requestedBorder);
    const normalizedShadow = requestedShadow === undefined ? undefined : normalizeInsetShadow(requestedShadow);
    const normalizedOutline = requestedOutline === undefined ? undefined : normalizeContainedOutline(requestedOutline);
    const requestedPaintActive = next.paintActive;
    if (requestedPaintActive !== undefined && typeof requestedPaintActive !== "boolean") {
      throw new TypeError("paintActive must be a boolean");
    }
    const paintActive = requestedPaintActive;
    if (normalizedPaint !== undefined || normalizedBorder !== undefined
      || normalizedShadow !== undefined || normalizedOutline !== undefined) {
      const colorContext = this.ownership.withAuthoredComputedStyle(
        entry,
        (computed) => captureElementColorContext(entry.element, computed, [
          ...(normalizedPaint ? paintColorInputs(normalizedPaint) : []),
          ...(normalizedBorder ? [normalizedBorder.color] : []),
          ...(normalizedShadow ? [normalizedShadow.color] : []),
          ...(normalizedOutline ? [normalizedOutline.color] : []),
        ]),
      );
      const resolvedOutline = withElementColorResolver(
        this.view,
        entry.element,
        colorContext,
        (resolveColor) => {
          if (normalizedPaint) resolvePaintColors(normalizedPaint, resolveColor);
          if (normalizedBorder !== undefined) resolveBorderColor(normalizedBorder, resolveColor);
          if (normalizedShadow !== undefined) resolveShadowColor(normalizedShadow, resolveColor);
          return normalizedOutline === undefined
            ? undefined
            : resolveOutlineColor(normalizedOutline, resolveColor);
        },
      );
      if (resolvedOutline !== undefined) assertOutlineHost(this.view, entry.element, resolvedOutline);
    }
    const updatesGeometry = requestedRadius !== undefined || requestedShape !== undefined;
    const flow = updatesGeometry
      ? this.ownership.withAuthoredComputedStyle(entry, (computed) => flowFromComputed(computed))
      : undefined;
    const radiusSource = requestedRadius === undefined
      ? undefined
      : snapshotRadiusSource(requestedRadius);
    if (radiusSource !== undefined) resolveRadiusSource(radiusSource, entry.width, entry.height, flow);
    const shapeSource = requestedShape === undefined
      ? undefined
      : snapshotCornerShapeSource(requestedShape);
    const resolvedShape = shapeSource === undefined ? null : resolveCornerShape(shapeSource, flow);
    return {
      border: normalizedBorder,
      outline: normalizedOutline,
      paint: normalizedPaint,
      paintActive,
      radiusSource,
      resolvedShape,
      shapeSource,
      shadow: normalizedShadow,
    };
  }

  _handle(entry: NativeEntry): Readonly<CornerfillNativeHandle>;
  _handle(entry: DynamicEntry): Readonly<CornerfillDynamicHandle>;
  _handle(entry: PreparedEntry): Readonly<CornerfillPreparedHandle>;
  _handle(entry: RuntimeEntry): Readonly<CornerfillHandle> {
    const controller = this;
    return Object.freeze({
      get mode() { return entry.mode; },
      get ready() {
        if (!entry.ready) throw new Error("Cornerfill entry initialization has not started");
        return entry.ready;
      },
      get backend() {
        return entry.mode === "native" ? "native-corner-shape" : entry.surface?.backend ?? entry.backend ?? "pending";
      },
      update(next: CornerfillInternalHandleUpdate = {}) {
        if (!controller._entryIsCurrent(entry)) throw new CornerfillDetachedError();
        if (entry.mode === "native") {
          return controller._updateNativeEntry(entry, next as CornerfillNativeHandleUpdate);
        }
        if (entry.mode === "prepared") {
          return controller._updatePreparedEntry(entry, next as CornerfillPreparedHandleUpdate);
        }
        return controller._updateDynamicEntry(entry, next as CornerfillDynamicHandleUpdate);
      },
      interpolateCornerShape(
        from: CornerShapeSource,
        to: CornerShapeSource,
        progress: number,
        options: CornerWritingOptions = {},
      ) {
        if (!controller._entryIsCurrent(entry)) throw new CornerfillDetachedError();
        const cornerShape = interpolateCornerShapeValues(from, to, progress, options);
        if (entry.mode === "native") {
          const declarations = nativeShapeDeclarations(entry.element, cornerShape);
          writeNativeDeclarations(entry, NATIVE_SHAPE_PROPERTIES, declarations);
          return Promise.resolve(entryExplanation(entry));
        }
        if (entry.mode === "prepared") {
          return controller._setPreparedCornerShape(entry, cornerShape);
        }
        entry.overrides.cornerShape = cornerShape;
        if (entry.geometry?.shapeParameters?.every((value, index) => Object.is(value, cornerShape[index]))) {
          return Promise.resolve(entryExplanation(entry));
        }
        return controller._scheduleAndWait(entry, "corner-shape-interpolation", true);
      },
      refresh() {
        if (!controller._entryIsCurrent(entry)) throw new CornerfillDetachedError();
        if (entry.mode === "native") return Promise.resolve(entryExplanation(entry));
        if (entry.mode === "prepared") {
          return controller._refreshPrepared(entry);
        }
        return controller._scheduleAndWait(entry, "explicit-refresh", true);
      },
      resize(next: CornerfillPreparedResizeConfig = {}) {
        if (!controller._entryIsCurrent(entry)) throw new CornerfillDetachedError();
        if (entry.mode === "native") throw new TypeError("resize() is available only for attachPrepared() handles");
        if (entry.mode !== "prepared") throw new TypeError("resize() is available only for attachPrepared() handles");
        return controller._resizePrepared(entry.element, next);
      },
      verify() {
        if (!controller._entryIsCurrent(entry)) throw new CornerfillDetachedError();
        if (entry.error) throw entry.error;
        if (entry.mode !== "native") {
          const computed = controller.view.getComputedStyle(entry.element);
          inspectFallbackHost(entry.element, computed);
          assertOutlineHost(controller.view, entry.element, entry.outline);
          if (entry.mode === "prepared" && entry.surfaceDeferred) {
            if (entry.surface) throw new Error("deferred Cornerfill surface was allocated early");
            return entryExplanation(entry);
          }
          if (controller._reconcileEntryOwnershipRoot(entry) && entry.mode !== "prepared") {
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
    }) as Readonly<CornerfillHandle>;
  }

  attach(
    element: CornerfillElement,
    config: Readonly<CornerfillAttachConfig> = {},
  ): Readonly<CornerfillNativeHandle | CornerfillDynamicHandle> {
    if (this.destroyed) throw new Error("Cornerfill controller is destroyed");
    if (!(element instanceof this.view.Element)) throw new TypeError("attach() requires an Element from this document");
    const existing = this.entryByElement.get(element);
    if (existing && !existing.disposed) throw new Error("element is already attached to this Cornerfill controller");
    assertElementAvailable(element);
    const capturedConfig = snapshotAttachConfig(config);
    const useNative = this._shouldUseNative(capturedConfig);
    if (useNative) return this._attachNative(element, capturedConfig);

    this._assertFallbackEntryBudget();
    assertCooperativeOwnership(element);
    const computed = this.view.getComputedStyle(element);
    const composition = inspectFallbackHost(element, computed);
    const hasExplicitColorSource = capturedConfig.paint !== undefined
      || capturedConfig.border !== undefined
      || capturedConfig.shadow !== undefined
      || capturedConfig.outline !== undefined;
    const initial = captureInitialSources(element, capturedConfig, computed);
    if (hasExplicitColorSource) {
      withElementColorResolver(
        this.view,
        element,
        captureElementColorContext(element, computed, [
          ...(capturedConfig.paint !== undefined ? paintColorInputs(initial.paintSource) : []),
          ...(capturedConfig.border !== undefined && initial.borderSource ? [initial.borderSource.color] : []),
          ...(capturedConfig.shadow !== undefined && initial.shadowSource ? [initial.shadowSource.color] : []),
          ...(capturedConfig.outline !== undefined && initial.outlineSource ? [initial.outlineSource.color] : []),
        ]),
        (resolveColor) => {
          if (capturedConfig.paint !== undefined) resolvePaintColors(initial.paintSource, resolveColor);
          if (capturedConfig.border !== undefined) resolveBorderColor(initial.borderSource, resolveColor);
          if (capturedConfig.shadow !== undefined) resolveShadowColor(initial.shadowSource, resolveColor);
          if (capturedConfig.outline !== undefined) resolveOutlineColor(initial.outlineSource, resolveColor);
        },
      );
    }
    const watchCarriers = initial.dynamic.radius || initial.dynamic.shape || initial.dynamic.paint
      || (initial.dynamic.border && Boolean(initial.borderSource))
      || initial.dynamic.shadow || initial.dynamic.outline;
    const entry = createDynamicEntry<CornerfillEntryExplanation>({
      element,
      initial,
      paintSource: initial.paintSource,
      backgroundPositionSpec: initial.paintSource.kind === "image"
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
      requestedVisible: capturedConfig.paintActive !== false,
      styleVisible: computed.visibility !== "hidden",
      visible: capturedConfig.paintActive !== false && computed.visibility !== "hidden",
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
    const cleanupErrors: unknown[] = [];
    const attempt = (operation: () => void): void => {
      try { operation(); } catch (error) { cleanupErrors.push(error); }
    };
    entry.disposed = true;
    this.entryByElement.delete(element);
    this.entries.delete(entry);
    if (entry.mode === "dynamic") {
      this.dirty.delete(entry);
      this.activeAnimations.delete(entry);
      this.ignoredAnimations.delete(entry);
    } else if (entry.mode === "prepared") {
      this.preparedDirty.delete(entry);
    }
    attempt(() => this.resizeObserver?.unobserve(element));
    if (entry.mode === "native") {
      attempt(() => restoreNativeDeclarationGroup(entry, NATIVE_OWNED_PROPERTIES));
      this.counters.nativeEntries -= 1;
    } else {
      attempt(() => this.ownership.remove(entry));
      attempt(() => restoreOwnershipState(element, entry.ownershipSnapshot));
      attempt(() => this._disposeSurface(entry));
      for (const lease of entry.pendingImageLeases ?? []) attempt(lease.release);
      entry.pendingImageLeases = null;
      if (entry.imageLease) attempt(entry.imageLease.release);
      entry.imageLease = null;
      if (entry.layerImageLeases) {
        for (const lease of entry.layerImageLeases.values()) attempt(lease.release);
        entry.layerImageLeases = null;
      }
      entry.resolvedImage = null;
      this.counters.fallbackEntries -= 1;
      if (entry.mode === "prepared") {
        this.counters.preparedEntries -= 1;
        if (entry.surfaceDeferred) {
          entry.surfaceDeferred = false;
          this.counters.deferredSurfaceEntries -= 1;
        }
      }
      attempt(() => this._releaseOwnershipRoot(entry.ownershipRoot, entry.mode !== "prepared"));
    }
    releaseElement(entry);
    if (entry.mode === "dynamic") {
      const waiters = entry.waiters?.splice(0) ?? [];
      entry.waiters = null;
      if (waiters.length > 0) {
        const error = new CornerfillDetachedError(
          "Cornerfill handle was disposed before its pending update completed",
        );
        for (const waiter of waiters) waiter.reject(error);
      }
    }
    this.counters.detachments += 1;
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "Cornerfill detach encountered cleanup errors");
    }
    return true;
  }

  refresh() {
    if (this.destroyed) return Promise.reject(new Error("Cornerfill controller is destroyed"));
    return Promise.all([...this.entries].map((entry) => (
      entry.mode !== "dynamic"
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
    if (!Array.isArray(properties)) {
      throw new TypeError("Cornerfill authored-style properties must be an array");
    }
    const propertyNames: string[] = [];
    for (let index = 0; index < properties.length; index += 1) {
      if (!(index in properties)) {
        throw new TypeError("Cornerfill authored-style properties must be a dense array of strings");
      }
      const property = properties[index];
      if (typeof property !== "string") {
        throw new TypeError("Cornerfill authored-style properties must be a dense array of strings");
      }
      propertyNames.push(property);
    }
    Object.freeze(propertyNames);
    const inspect = (computed: CSSStyleDeclaration) => {
      const requiresFallback = authoredCornerRequiresFallback(element, computed);
      let fallbackProblem: string | null = null;
      if (requiresFallback && !this._shouldUseNative(EMPTY_ATTACH_CONFIG)) {
        try {
          inspectFallbackHost(element, computed);
          const sources = captureInitialSources(element, EMPTY_ATTACH_CONFIG, computed);
          assertOutlineHost(this.view, element, sources.outlineSource);
        } catch (error) {
          fallbackProblem = errorFrom(error).message;
        }
      }
      return Object.freeze({
        fallbackProblem,
        requiresFallback,
        values: Object.freeze(Object.fromEntries(propertyNames.map((property) => (
          [property, computed.getPropertyValue(property)]
        )))),
      });
    };
    const entry = this.entryByElement.get(element);
    if (!entry) return inspect(this.view.getComputedStyle(element));
    if (entry.mode !== "native") return this.ownership.withAuthoredComputedStyle(entry, inspect);
    const styleAttribute = element.getAttribute("style");
    try {
      restoreNativeDeclarationGroup(entry, NATIVE_OWNED_PROPERTIES);
      return inspect(this.view.getComputedStyle(element));
    } finally {
      if (styleAttribute === null) element.removeAttribute("style");
      else element.setAttribute("style", styleAttribute);
    }
  }

  explain(element: CornerfillElement): Readonly<CornerfillEntryExplanation> | null {
    const entry = this.entryByElement.get(element);
    return entry ? entryExplanation(entry) : null;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const errors: unknown[] = [];
    const attempt = (operation: () => void): void => {
      try { operation(); } catch (error) { errors.push(error); }
    };
    for (const entry of [...this.entries]) {
      attempt(() => this.detach(entry.element));
    }
    for (const observer of this.rootObservers.values()) observer?.disconnect();
    this.rootObservers.clear();
    for (const observer of this.attachmentLifecycleObservers.values()) observer.disconnect();
    this.attachmentLifecycleObservers.clear();
    this.resizeObserver?.disconnect();
    if (this._onWindowResize) this.view.removeEventListener("resize", this._onWindowResize);
    if (this.flushHandle !== null) this.view.cancelAnimationFrame(this.flushHandle);
    if (this.animationHandle !== undefined) this.view.cancelAnimationFrame(this.animationHandle);
    this.flushHandle = null;
    this.animationHandle = undefined;
    this._onWindowResize = undefined;
    this.observersInstalled = false;
    this.ownership.destroy();
    this.ownershipRootCounts.clear();
    this.observedRootCounts.clear();
    this.dirty.clear();
    this.preparedDirty.clear();
    this.activeAnimations.clear();
    this.ignoredAnimations.clear();
    this.images.destroy();
    this.geometryCache.clear();
    if (errors.length > 0) throw new AggregateError(errors, "Cornerfill teardown encountered backend errors");
  }
}

export function installCornerfill(
  options: Readonly<CornerfillInstallOptions> = {},
): CornerfillControllerHandle {
  return new CornerfillController(options);
}
