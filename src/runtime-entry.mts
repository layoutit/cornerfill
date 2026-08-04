import type {
  BackgroundBoxMetrics,
  BackgroundPositionSpec,
  CornerfillRasterSource,
  NormalizedPaintDescriptor,
  ResolvedPaintDescriptor,
} from "./background.mjs";
import type {
  ConcreteSurfaceBackend,
  CornerfillSurface,
} from "./backends.mjs";
import type { CornerGeometry } from "./geometry.mjs";
import type { ImageLease } from "./images.mjs";
import type {
  CornerfillElement,
  OwnershipRoot,
  OwnershipSnapshot,
} from "./ownership.mjs";
import type {
  ContainedOutlinePaintState,
  CornerfillPaintExplanation,
  InsetShadowPaintState,
  OwnedBorderPaintState,
  PreparedOpaqueImageProgram,
} from "./paint.mjs";
import type {
  NativeDeclarationRecord,
  RadiusSource,
} from "./style.mjs";
import type { CornerShapeSource } from "./values.mjs";

export interface HostComposition {
  readonly filter: "browser-compositor";
  readonly fragmentCount: number;
  readonly opacity: "browser-compositor";
  readonly originalElement: true;
  readonly pseudoElements: "browser-owned-without-shaped-overflow-clip";
  readonly stacking: "browser";
  readonly transform: "browser-compositor";
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

export interface InitialSources {
  readonly borderSource: Readonly<OwnedBorderPaintState> | null;
  readonly dynamic: Readonly<EntryDynamicSources>;
  readonly initialBackgroundPosition: string;
  readonly outlineSource: Readonly<ContainedOutlinePaintState> | null;
  readonly paintSource: NormalizedPaintDescriptor;
  readonly radiusSource: RadiusSource;
  readonly rasterIsOpaque: boolean;
  readonly shadowSource: Readonly<InsetShadowPaintState> | null;
  readonly shapeSource: CornerShapeSource;
}

interface DynamicOverrides {
  border?: Readonly<OwnedBorderPaintState> | null | undefined;
  borderRadius?: RadiusSource | undefined;
  cornerShape?: CornerShapeSource | undefined;
  outline?: Readonly<ContainedOutlinePaintState> | null | undefined;
  paint?: NormalizedPaintDescriptor | undefined;
  shadow?: Readonly<InsetShadowPaintState> | null | undefined;
}

export interface EntryWaiter<Explanation> {
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: Explanation) => void;
  readonly revision: number;
}

interface RuntimeEntryBase<Explanation> {
  committedRevision: number;
  disposed: boolean;
  element: CornerfillElement;
  elementOwnerRegistry?: WeakMap<CornerfillElement, RuntimeEntry<Explanation>> | undefined;
  error: Error | null;
  initialized: boolean;
  lastError: Error | null;
  lastInvalidationReason: string | null;
  readonly mode: "dynamic" | "native" | "prepared";
  ownershipRoot: OwnershipRoot;
  ownershipSnapshot: Readonly<OwnershipSnapshot>;
  paintCount: number;
  ready: Promise<Explanation> | null;
  revision: number;
  styleCheckCount: number;
}

export interface NativeEntry<Explanation> extends RuntimeEntryBase<Explanation> {
  readonly mode: "native";
  saved: Map<string, Readonly<NativeDeclarationRecord>> | null;
  savedDeclarationOrder: readonly string[] | null;
}

interface FallbackEntryBase<Explanation> extends RuntimeEntryBase<Explanation> {
  backend: ConcreteSurfaceBackend | null;
  border: Readonly<OwnedBorderPaintState> | null;
  borderKey: string | null;
  composition: Readonly<HostComposition> | null;
  dpr: number;
  effectsKey: string | null;
  geometry: CornerGeometry | null;
  geometryKey: string | null;
  height: number;
  imageLease: Readonly<ImageLease> | null;
  imageLeaseUrl: string | null;
  layerImageLeases: Map<string, Readonly<ImageLease>> | null;
  needsPaint: boolean;
  outline: Readonly<ContainedOutlinePaintState> | null;
  ownershipToken: string | null;
  ownershipVerified: boolean;
  paintResult: Readonly<CornerfillPaintExplanation> | null;
  paintSource: NormalizedPaintDescriptor;
  pendingImageLeases: Set<Readonly<ImageLease>> | null;
  requestedVisible: boolean;
  resolvedImage: CornerfillRasterSource | null;
  shadow: Readonly<InsetShadowPaintState> | null;
  styleVisible: boolean;
  surface: CornerfillSurface | null;
  visible: boolean;
  width: number;
}

export interface DynamicEntry<Explanation> extends FallbackEntryBase<Explanation> {
  backgroundPositionSpec: BackgroundPositionSpec | null;
  boxMetrics: Readonly<BackgroundBoxMetrics> | null;
  fullRefreshPending: boolean;
  readonly initial: Readonly<InitialSources>;
  inlineBackgroundPositionX: string;
  inlineBackgroundPositionY: string;
  inlineCarrierSignature: string;
  readonly mode: "dynamic";
  readonly overrides: DynamicOverrides;
  paintKey: string | null;
  pendingReason: string | null;
  waiters: EntryWaiter<Explanation>[] | null;
  readonly watchCarriers: boolean;
  readonly watchPosition: boolean;
}

export interface PreparedEntry<Explanation> extends FallbackEntryBase<Explanation> {
  borderSource: Readonly<OwnedBorderPaintState> | null;
  layoutChain: Promise<unknown> | null;
  readonly mode: "prepared";
  needsFullPaint: boolean;
  outlineSource: Readonly<ContainedOutlinePaintState> | null;
  paintProgram: Readonly<PreparedOpaqueImageProgram> | null;
  positionX: number;
  positionY: number;
  radiusSource: RadiusSource | undefined;
  resolvedPaint: ResolvedPaintDescriptor | null;
  shadowSource: Readonly<InsetShadowPaintState> | null;
  shapeSource: CornerShapeSource | undefined;
  surfaceDeferred: boolean;
}

export type FallbackEntry<Explanation> = DynamicEntry<Explanation> | PreparedEntry<Explanation>;
export type RuntimeEntry<Explanation> = NativeEntry<Explanation> | FallbackEntry<Explanation>;

interface EntryBaseSeed {
  readonly committedRevision?: number | undefined;
  readonly element: CornerfillElement;
  readonly initialized?: boolean | undefined;
  readonly lastInvalidationReason: string;
  readonly ownershipRoot: OwnershipRoot;
  readonly ownershipSnapshot: Readonly<OwnershipSnapshot>;
}

interface FallbackEntrySeed {
  readonly backend?: ConcreteSurfaceBackend | null | undefined;
  readonly composition: Readonly<HostComposition>;
  readonly dpr?: number | undefined;
  readonly height?: number | undefined;
  readonly paintSource: NormalizedPaintDescriptor;
  readonly requestedVisible: boolean;
  readonly styleVisible?: boolean | undefined;
  readonly visible: boolean;
  readonly width?: number | undefined;
}

export interface DynamicEntrySeed extends EntryBaseSeed, FallbackEntrySeed {
  readonly backgroundPositionSpec: BackgroundPositionSpec | null;
  readonly initial: Readonly<InitialSources>;
  readonly inlineBackgroundPositionX: string;
  readonly inlineBackgroundPositionY: string;
  readonly inlineCarrierSignature: string;
  readonly watchCarriers: boolean;
  readonly watchPosition: boolean;
}

export interface PreparedEntrySeed extends EntryBaseSeed, FallbackEntrySeed {
  readonly radiusSource: RadiusSource | undefined;
  readonly shapeSource: CornerShapeSource | undefined;
}

export interface NativeEntrySeed extends EntryBaseSeed {
  readonly saved: Map<string, Readonly<NativeDeclarationRecord>>;
  readonly savedDeclarationOrder: readonly string[];
}

function createEntryBase<Explanation>(
  seed: Readonly<EntryBaseSeed>,
): Omit<RuntimeEntryBase<Explanation>, "mode"> {
  return {
    committedRevision: seed.committedRevision ?? -1,
    disposed: false,
    element: seed.element,
    error: null,
    initialized: seed.initialized ?? false,
    lastError: null,
    lastInvalidationReason: seed.lastInvalidationReason,
    ownershipRoot: seed.ownershipRoot,
    ownershipSnapshot: seed.ownershipSnapshot,
    paintCount: 0,
    ready: null,
    revision: 0,
    styleCheckCount: 0,
  };
}

type FallbackEntryState<Explanation> = Omit<
  FallbackEntryBase<Explanation>,
  keyof RuntimeEntryBase<Explanation>
>;

function createFallbackEntryState<Explanation>(
  seed: Readonly<FallbackEntrySeed>,
): FallbackEntryState<Explanation> {
  return {
    backend: seed.backend ?? null,
    border: null,
    borderKey: null,
    composition: seed.composition,
    dpr: seed.dpr ?? 1,
    effectsKey: null,
    geometry: null,
    geometryKey: null,
    height: seed.height ?? 0,
    imageLease: null,
    imageLeaseUrl: null,
    layerImageLeases: null,
    needsPaint: false,
    outline: null,
    ownershipToken: null,
    ownershipVerified: false,
    paintResult: null,
    paintSource: seed.paintSource,
    pendingImageLeases: null,
    requestedVisible: seed.requestedVisible,
    resolvedImage: null,
    shadow: null,
    styleVisible: seed.styleVisible ?? true,
    surface: null,
    visible: seed.visible,
    width: seed.width ?? 0,
  };
}

export function createDynamicEntry<Explanation>(
  seed: Readonly<DynamicEntrySeed>,
): DynamicEntry<Explanation> {
  return {
    ...createEntryBase<Explanation>(seed),
    ...createFallbackEntryState<Explanation>(seed),
    backgroundPositionSpec: seed.backgroundPositionSpec,
    boxMetrics: null,
    fullRefreshPending: false,
    initial: seed.initial,
    inlineBackgroundPositionX: seed.inlineBackgroundPositionX,
    inlineBackgroundPositionY: seed.inlineBackgroundPositionY,
    inlineCarrierSignature: seed.inlineCarrierSignature,
    mode: "dynamic",
    overrides: {},
    paintKey: null,
    pendingReason: null,
    waiters: null,
    watchCarriers: seed.watchCarriers,
    watchPosition: seed.watchPosition,
  };
}

export function createPreparedEntry<Explanation>(
  seed: Readonly<PreparedEntrySeed>,
): PreparedEntry<Explanation> {
  return {
    ...createEntryBase<Explanation>(seed),
    ...createFallbackEntryState<Explanation>(seed),
    borderSource: null,
    layoutChain: null,
    mode: "prepared",
    needsFullPaint: false,
    outlineSource: null,
    paintProgram: null,
    positionX: 0,
    positionY: 0,
    radiusSource: seed.radiusSource,
    resolvedPaint: null,
    shadowSource: null,
    shapeSource: seed.shapeSource,
    surfaceDeferred: false,
  };
}

export function createNativeEntry<Explanation>(
  seed: Readonly<NativeEntrySeed>,
): NativeEntry<Explanation> {
  return {
    ...createEntryBase<Explanation>(seed),
    mode: "native",
    saved: seed.saved,
    savedDeclarationOrder: seed.savedDeclarationOrder,
  };
}
