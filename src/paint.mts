import {
  insetCornerGeometry,
  snapshotCornerGeometry,
} from "./geometry.mjs";
import { rasterSourceDimensions } from "./background.mjs";
import type { CornerGeometry, Point } from "./geometry.mjs";
import type { GradientStop, LinearGradientLine, RadialGradientShape } from "./gradients.mjs";
import type {
  BackgroundArea,
  BackgroundBlendMode,
  BackgroundRepeat,
  CornerfillRasterSource,
  PixelPair,
} from "./background.mjs";
import type { Four } from "./values.mjs";

const CORNERFILL_PAINTER_SCHEMA = "cornerfill-production-painter@1";
const INTERIOR_TOPOLOGY_PROBE_RATIO = 1e-5;
const ZERO_INSETS = Object.freeze([0, 0, 0, 0]) as Four<number>;
const validatedOuterTopologies = new WeakSet<CornerGeometry>();

const ZERO_ALPHA = String.raw`(?:0+(?:\.0*)?|\.0+)(?:e[+-]?\d+)?%?`;
const ZERO_SLASH_ALPHA = new RegExp(`/\\s*${ZERO_ALPHA}\\s*\\)$`, "iu");
const ZERO_LEGACY_ALPHA = new RegExp(`^(?:rgba|hsla)\\([\\s\\S]*,\\s*${ZERO_ALPHA}\\s*\\)$`, "iu");

export function isFullyTransparentCssColor(value: string): boolean {
  const color = String(value).trim();
  return /^transparent$/iu.test(color)
    || ZERO_SLASH_ALPHA.test(color)
    || ZERO_LEGACY_ALPHA.test(color);
}

export interface RasterPaintState {
  readonly backgroundPosition?: PixelPair | undefined;
  readonly backgroundSize?: PixelPair | undefined;
  readonly blendMode?: BackgroundBlendMode | undefined;
  readonly clipArea?: Readonly<BackgroundArea> | undefined;
  readonly color?: string | undefined;
  readonly image: CornerfillRasterSource;
  readonly imageSmoothing?: boolean | undefined;
  readonly kind: "image";
  readonly opaque?: boolean | undefined;
  readonly repeat?: Readonly<BackgroundRepeat> | "no-repeat" | undefined;
  readonly sourceSize?: PixelPair | undefined;
  readonly tilePlan?: Readonly<{ x: readonly number[]; y: readonly number[] }> | undefined;
}

interface CoveredRasterPaintState extends RasterPaintState {
  readonly backgroundPosition: PixelPair;
  readonly backgroundSize: PixelPair;
  readonly opaque: true;
}

interface GradientPaintStateBase {
  readonly backgroundSize?: PixelPair | undefined;
  readonly clipArea?: Readonly<BackgroundArea> | undefined;
  readonly color?: string | undefined;
  readonly stops: readonly GradientStop[];
  readonly tilePlan?: Readonly<{ x: readonly number[]; y: readonly number[] }> | undefined;
}

interface LinearGradientPaintState extends GradientPaintStateBase {
  readonly from?: PixelPair | undefined;
  readonly kind: "linear-gradient";
  readonly line?: LinearGradientLine | undefined;
  readonly to?: PixelPair | undefined;
}

interface RadialGradientPaintState extends GradientPaintStateBase {
  readonly gradientCenter: PixelPair;
  readonly gradientRadii: PixelPair;
  readonly kind: "radial-gradient";
  readonly shape?: RadialGradientShape | undefined;
}

interface ConicGradientPaintState extends GradientPaintStateBase {
  readonly angle: number;
  readonly gradientCenter: PixelPair;
  readonly kind: "conic-gradient";
}

interface SolidPaintState {
  readonly clipArea?: Readonly<BackgroundArea> | undefined;
  readonly color: string;
  readonly kind: "solid";
}

interface EmptyPaintState {
  readonly clipArea?: Readonly<BackgroundArea> | undefined;
  readonly kind: "none";
}

export type OwnedPaintLayer =
  | SolidPaintState
  | EmptyPaintState
  | RasterPaintState
  | LinearGradientPaintState
  | RadialGradientPaintState
  | ConicGradientPaintState;

interface LayeredPaintState {
  readonly color: string;
  readonly colorClipArea: Readonly<BackgroundArea>;
  readonly kind: "layers";
  readonly layers: readonly OwnedPaintLayer[];
}

export type CornerfillPaintState = LayeredPaintState | OwnedPaintLayer;

export interface BorderPaintState {
  readonly color: string;
  readonly colors?: readonly string[] | undefined;
  readonly styles?: readonly string[] | undefined;
  readonly width?: number | null | undefined;
  readonly widths?: readonly number[] | undefined;
}

export interface OwnedBorderPaintState extends BorderPaintState {
  readonly colors?: Four<string> | undefined;
  readonly styles?: Four<string> | undefined;
  readonly widths: Four<number>;
}

export interface InsetShadowPaintState {
  readonly color: string;
  readonly kind: "inset-solid-ring";
  readonly spread: number;
}

export interface ContainedOutlinePaintState {
  readonly color: string;
  readonly kind: "contained-solid-ring";
  readonly offset: number;
  readonly width: number;
}

export interface PreparedGeometry {
  readonly dpr?: number | undefined;
  readonly height: number;
  readonly width: number;
}

export interface PreparedOpaqueImageProgram {
  readonly backgroundHeight: number;
  readonly backgroundWidth: number;
  readonly dpr: number;
  readonly height: number;
  readonly image: CornerfillRasterSource;
  readonly imageSmoothing: boolean;
  readonly intrinsicHeight: number;
  readonly intrinsicWidth: number;
  readonly sourceHeight: number;
  readonly sourceScaleX: number;
  readonly sourceScaleY: number;
  readonly sourceWidth: number;
  readonly width: number;
}

export interface CornerfillPaintOptions {
  readonly border?: BorderPaintState | null | undefined;
  readonly dpr?: number | undefined;
  readonly geometry: CornerGeometry;
  readonly outline?: ContainedOutlinePaintState | null | undefined;
  readonly paint: CornerfillPaintState;
  readonly shadow?: InsetShadowPaintState | null | undefined;
}

type PixelRect = readonly [x: number, y: number, width: number, height: number];

interface ImageLayerPaintResult {
  readonly blendMode?: "multiply" | undefined;
  readonly destinationRect: PixelRect | null;
  readonly imageSize: PixelPair;
  readonly kind: "image";
  readonly repeat?: Readonly<BackgroundRepeat> | "no-repeat" | undefined;
  readonly sourceRect: PixelRect | null;
  readonly tileSize?: PixelPair | undefined;
  readonly tilesDrawn?: number | undefined;
}

interface GradientLayerPaintResult {
  readonly kind: "conic-gradient" | "linear-gradient" | "radial-gradient";
  readonly tilesDrawn: number;
}

interface SolidLayerPaintResult {
  readonly color: string;
  readonly kind: "solid";
}

interface EmptyLayerPaintResult {
  readonly kind: "none";
}

export type OwnedLayerPaintResult =
  | ImageLayerPaintResult
  | GradientLayerPaintResult
  | SolidLayerPaintResult
  | EmptyLayerPaintResult;

interface EmptyClipPaintResult {
  readonly emptyClip: true;
  readonly kind: OwnedPaintLayer["kind"];
}

type ClippedOwnedLayerPaintResult = OwnedLayerPaintResult | EmptyClipPaintResult;

interface LayerStackPaintResult {
  readonly color: Readonly<ClippedOwnedLayerPaintResult> | null;
  readonly kind: "layers";
  readonly layers: readonly Readonly<ClippedOwnedLayerPaintResult>[];
}

export type PaintLayerResult = OwnedLayerPaintResult | EmptyClipPaintResult | LayerStackPaintResult;

interface CornerfillPaintResult {
  readonly border: Readonly<{
    color: string;
    kind: "solid-shaped-ring";
    widths: Four<number>;
  }> | null;
  readonly layer: Readonly<PaintLayerResult>;
  readonly outline: Readonly<ContainedOutlinePaintState> | null;
  readonly painter: typeof CORNERFILL_PAINTER_SCHEMA;
  readonly shadow: Readonly<InsetShadowPaintState> | null;
}

export interface PreparedOpaqueImageExplanation {
  readonly border: null;
  readonly layer: Readonly<ImageLayerPaintResult>;
  readonly painter: typeof CORNERFILL_PAINTER_SCHEMA;
  readonly update: "prepared-opaque-source-in";
}

export interface OpaqueCornerfillPaintResult {
  readonly border: null;
  readonly layer: Readonly<OwnedLayerPaintResult>;
  readonly painter: typeof CORNERFILL_PAINTER_SCHEMA;
  readonly update: "opaque-source-in";
}

export type CornerfillPaintExplanation =
  | CornerfillPaintResult
  | PreparedOpaqueImageExplanation
  | OpaqueCornerfillPaintResult;

function freezePair(first: number, second: number): PixelPair {
  return Object.freeze([first, second]);
}

function freezeRect(x: number, y: number, width: number, height: number): PixelRect {
  return Object.freeze([x, y, width, height]);
}

function verifiedImageDimensions(
  paint: Pick<RasterPaintState, "image" | "sourceSize">,
): PixelPair {
  const dimensions = rasterSourceDimensions(paint.image);
  if (!paint.sourceSize) return dimensions;
  const [intrinsicWidth, intrinsicHeight] = dimensions;
  const [expectedWidth, expectedHeight] = paint.sourceSize;
  if (intrinsicWidth !== expectedWidth || intrinsicHeight !== expectedHeight) {
    throw new Error(
      `image dimensions changed: expected ${expectedWidth}x${expectedHeight}, `
      + `got ${intrinsicWidth}x${intrinsicHeight}`,
    );
  }
  return dimensions;
}

function traceClosedPoints(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  offsetX = 0,
  offsetY = 0,
): void {
  if (!Array.isArray(points) || points.length < 2) throw new TypeError("a closed path needs at least two points");
  context.beginPath();
  appendClosedPoints(context, points, offsetX, offsetY);
}

function appendClosedPoints(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  offsetX = 0,
  offsetY = 0,
): void {
  context.moveTo(points[0]![0] + offsetX, points[0]![1] + offsetY);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index]![0] + offsetX, points[index]![1] + offsetY);
  }
  context.closePath();
}

function clearSurface(context: CanvasRenderingContext2D, width: number, height: number, dpr: number): void {
  context.save();
  try {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.clearRect(0, 0, Math.ceil(width * dpr), Math.ceil(height * dpr));
  } finally {
    context.restore();
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.globalCompositeOperation = "source-over";
}

function fillRect(context: CanvasRenderingContext2D, color: string, width: number, height: number): void {
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
}

function drawNoRepeatImage(
  context: CanvasRenderingContext2D,
  paint: RasterPaintState,
  width: number,
  height: number,
): Readonly<ImageLayerPaintResult> {
  const image = paint.image;
  const [intrinsicWidth, intrinsicHeight] = verifiedImageDimensions(paint);
  const [backgroundWidth, backgroundHeight] = paint.backgroundSize ?? [intrinsicWidth, intrinsicHeight];
  const [positionX, positionY] = paint.backgroundPosition ?? [0, 0];
  if (!Number.isFinite(backgroundWidth) || backgroundWidth < 0
    || !Number.isFinite(backgroundHeight) || backgroundHeight < 0
    || !Number.isFinite(positionX) || !Number.isFinite(positionY)) {
    throw new TypeError("raster background size and position must resolve to finite non-negative pixels");
  }
  const destinationLeft = Math.max(0, positionX);
  const destinationTop = Math.max(0, positionY);
  const destinationRight = Math.min(width, positionX + backgroundWidth);
  const destinationBottom = Math.min(height, positionY + backgroundHeight);
  if (destinationRight <= destinationLeft || destinationBottom <= destinationTop) {
    return Object.freeze({
      kind: "image",
      imageSize: freezePair(intrinsicWidth, intrinsicHeight),
      sourceRect: null,
      destinationRect: null,
    });
  }
  const scaleX = backgroundWidth / intrinsicWidth;
  const scaleY = backgroundHeight / intrinsicHeight;
  const sourceX = (destinationLeft - positionX) / scaleX;
  const sourceY = (destinationTop - positionY) / scaleY;
  const sourceWidth = (destinationRight - destinationLeft) / scaleX;
  const sourceHeight = (destinationBottom - destinationTop) / scaleY;
  context.imageSmoothingEnabled = paint.imageSmoothing !== false;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destinationLeft,
    destinationTop,
    destinationRight - destinationLeft,
    destinationBottom - destinationTop,
  );
  return Object.freeze({
    kind: "image",
    imageSize: freezePair(intrinsicWidth, intrinsicHeight),
    sourceRect: freezeRect(sourceX, sourceY, sourceWidth, sourceHeight),
    destinationRect: freezeRect(
      destinationLeft,
      destinationTop,
      destinationRight - destinationLeft,
      destinationBottom - destinationTop,
    ),
  });
}

function noRepeat(repeat: RasterPaintState["repeat"]): boolean {
  return repeat === undefined || repeat === "no-repeat"
    || (repeat?.x === "no-repeat" && repeat?.y === "no-repeat");
}

function drawRasterImage(
  context: CanvasRenderingContext2D,
  paint: RasterPaintState,
  width: number,
  height: number,
): Readonly<ImageLayerPaintResult> {
  if (noRepeat(paint.repeat)) return drawNoRepeatImage(context, paint, width, height);
  const image = paint.image;
  const [intrinsicWidth, intrinsicHeight] = verifiedImageDimensions(paint);
  const backgroundSize = paint.backgroundSize;
  const xPositions = paint.tilePlan?.x ?? [];
  const yPositions = paint.tilePlan?.y ?? [];
  if (!backgroundSize || backgroundSize.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError("raster background size must resolve to finite non-negative pixels");
  }
  const [backgroundWidth, backgroundHeight] = backgroundSize;
  context.imageSmoothingEnabled = paint.imageSmoothing !== false;
  let tilesDrawn = 0;
  if (backgroundWidth > 0 && backgroundHeight > 0) {
    for (const y of yPositions) {
      for (const x of xPositions) {
        context.drawImage(
          image,
          0,
          0,
          intrinsicWidth,
          intrinsicHeight,
          x,
          y,
          backgroundWidth,
          backgroundHeight,
        );
        tilesDrawn += 1;
      }
    }
  }
  return Object.freeze({
    kind: "image",
    imageSize: freezePair(intrinsicWidth, intrinsicHeight),
    tileSize: freezePair(backgroundWidth, backgroundHeight),
    tilesDrawn,
    repeat: paint.repeat,
    sourceRect: tilesDrawn ? freezeRect(0, 0, intrinsicWidth, intrinsicHeight) : null,
    destinationRect: tilesDrawn
      ? freezeRect(xPositions[0]!, yPositions[0]!, backgroundWidth, backgroundHeight)
      : null,
  });
}

function addGradientStops(gradient: CanvasGradient, stops: readonly GradientStop[]): void {
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
}

type GradientPaintState =
  | LinearGradientPaintState
  | RadialGradientPaintState
  | ConicGradientPaintState;

function linearVector(line: LinearGradientLine, width: number, height: number): PixelPair {
  if (line.kind === "angle") {
    return Object.freeze([Math.sin(line.radians), -Math.cos(line.radians)]);
  }
  if (line.horizontal && line.vertical) {
    const dx = line.horizontal === "right" ? height : -height;
    const dy = line.vertical === "bottom" ? width : -width;
    const length = Math.hypot(dx, dy);
    return Object.freeze([dx / length, dy / length]);
  }
  if (line.horizontal) return Object.freeze([line.horizontal === "right" ? 1 : -1, 0]);
  return Object.freeze([0, line.vertical === "bottom" ? 1 : -1]);
}

function paintLinearGradientTile(
  context: CanvasRenderingContext2D,
  paint: LinearGradientPaintState,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  let startX: number;
  let startY: number;
  let endX: number;
  let endY: number;
  if (paint.line) {
    const [dx, dy] = linearVector(paint.line, width, height);
    const lineLength = Math.abs(width * dx) + Math.abs(height * dy);
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    startX = centerX - dx * lineLength / 2;
    startY = centerY - dy * lineLength / 2;
    endX = centerX + dx * lineLength / 2;
    endY = centerY + dy * lineLength / 2;
  } else {
    startX = x + paint.from![0] * width;
    startY = y + paint.from![1] * height;
    endX = x + paint.to![0] * width;
    endY = y + paint.to![1] * height;
  }
  const gradient = context.createLinearGradient(startX, startY, endX, endY);
  addGradientStops(gradient, paint.stops);
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
}

function paintRadialGradientTile(
  context: CanvasRenderingContext2D,
  paint: RadialGradientPaintState,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const centerX = x + paint.gradientCenter[0];
  const centerY = y + paint.gradientCenter[1];
  const [radiusX, radiusY] = paint.gradientRadii;
  if (paint.shape !== "circle" && radiusX === 0) {
    // CSS Images defines a zero-width ellipse as an arbitrarily thin,
    // horizontally mirrored gradient. Keep that distinction instead of
    // collapsing it into the zero-height solid-color case.
    const halfWidth = 1e-4;
    const gradient = context.createLinearGradient(
      centerX - halfWidth,
      centerY,
      centerX + halfWidth,
      centerY,
    );
    for (const [offset, color] of [...paint.stops].reverse()) {
      gradient.addColorStop((1 - offset) / 2, color);
    }
    for (const [offset, color] of paint.stops) {
      gradient.addColorStop((1 + offset) / 2, color);
    }
    context.fillStyle = gradient;
    context.fillRect(x, y, width, height);
    return;
  }
  if (paint.shape !== "circle" && radiusY === 0) {
    context.fillStyle = paint.stops.at(-1)![1];
    context.fillRect(x, y, width, height);
    return;
  }
  const effectiveRadiusX = radiusX === 0 ? 1e-4 : radiusX;
  const effectiveRadiusY = radiusY === 0 ? 1e-4 : radiusY;
  context.save();
  try {
    context.translate(centerX, centerY);
    context.scale(1, effectiveRadiusY / effectiveRadiusX);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, effectiveRadiusX);
    addGradientStops(gradient, paint.stops);
    context.fillStyle = gradient;
    context.fillRect(
      x - centerX,
      (y - centerY) * effectiveRadiusX / effectiveRadiusY,
      width,
      height * effectiveRadiusX / effectiveRadiusY,
    );
  } finally {
    context.restore();
  }
}

function paintConicGradientTile(
  context: CanvasRenderingContext2D,
  paint: ConicGradientPaintState,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  if (typeof context.createConicGradient !== "function") {
    throw new TypeError("this Canvas backend does not support conic gradients");
  }
  const gradient = context.createConicGradient(
    paint.angle - Math.PI / 2,
    x + paint.gradientCenter[0],
    y + paint.gradientCenter[1],
  );
  addGradientStops(gradient, paint.stops);
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
}

function paintGradient(
  context: CanvasRenderingContext2D,
  paint: GradientPaintState,
  width: number,
  height: number,
): Readonly<GradientLayerPaintResult> {
  const [tileWidth, tileHeight] = paint.backgroundSize ?? [width, height];
  const xPositions = paint.tilePlan?.x ?? [0];
  const yPositions = paint.tilePlan?.y ?? [0];
  let tilesDrawn = 0;
  if (tileWidth > 0 && tileHeight > 0) {
    for (const y of yPositions) {
      for (const x of xPositions) {
        if (paint.kind === "linear-gradient") {
          paintLinearGradientTile(context, paint, x, y, tileWidth, tileHeight);
        } else if (paint.kind === "radial-gradient") {
          paintRadialGradientTile(context, paint, x, y, tileWidth, tileHeight);
        } else {
          paintConicGradientTile(context, paint, x, y, tileWidth, tileHeight);
        }
        tilesDrawn += 1;
      }
    }
  }
  return Object.freeze({ kind: paint.kind, tilesDrawn });
}

export function paintOwnedLayer(
  context: CanvasRenderingContext2D,
  paint: OwnedPaintLayer,
  width: number,
  height: number,
): Readonly<OwnedLayerPaintResult> {
  if (!paint || typeof paint !== "object") throw new TypeError("paint state is required");
  if (paint.kind === "solid") {
    fillRect(context, paint.color, width, height);
    return Object.freeze({ kind: "solid", color: paint.color });
  }
  if (paint.kind === "linear-gradient"
    || paint.kind === "radial-gradient"
    || paint.kind === "conic-gradient") {
    return paintGradient(context, paint, width, height);
  }
  if (paint.kind === "none") return Object.freeze({ kind: "none" });
  if (paint.kind === "image") {
    if (paint.blendMode !== "multiply") return drawRasterImage(context, paint, width, height);
    context.save();
    context.globalCompositeOperation = "multiply";
    try {
      return Object.freeze({
        ...drawRasterImage(context, paint, width, height),
        blendMode: "multiply",
      });
    } finally {
      context.restore();
    }
  }
  const unsupportedKind = (paint as { readonly kind?: unknown }).kind;
  throw new TypeError(`unsupported paint kind: ${String(unsupportedKind)}`);
}

export function isPreparedOpaqueImageEligible(
  paint: CornerfillPaintState,
  width: number,
  height: number,
): paint is CoveredRasterPaintState {
  if (paint.kind !== "image" || paint.opaque !== true || !noRepeat(paint.repeat)
    || paint.blendMode === "multiply"
    || (paint.clipArea && paint.clipArea.name !== "border-box")) return false;
  const backgroundSize = paint.backgroundSize;
  const backgroundPosition = paint.backgroundPosition;
  if (!backgroundSize || !backgroundPosition
    || !Number.isFinite(backgroundSize[0]) || !Number.isFinite(backgroundSize[1])
    || !Number.isFinite(backgroundPosition[0]) || !Number.isFinite(backgroundPosition[1])) return false;
  const [backgroundWidth, backgroundHeight] = backgroundSize;
  const [positionX, positionY] = backgroundPosition;
  return positionX <= 0
    && positionY <= 0
    && positionX + backgroundWidth >= width
    && positionY + backgroundHeight >= height;
}

export function createPreparedOpaqueImageProgram({
  geometry,
  paint,
  dpr = geometry?.dpr ?? 1,
}: Readonly<{
  dpr?: number | undefined;
  geometry: PreparedGeometry;
  paint: RasterPaintState;
}>): Readonly<PreparedOpaqueImageProgram> {
  if (!geometry || typeof geometry !== "object") throw new TypeError("resolved geometry is required");
  if (paint?.kind !== "image" || paint.opaque !== true) {
    throw new TypeError("prepared image updates require an explicitly opaque image paint");
  }
  if (!noRepeat(paint.repeat)) throw new TypeError("prepared image updates require no-repeat paint");
  const [intrinsicWidth, intrinsicHeight] = verifiedImageDimensions(paint);
  const backgroundSize = paint.backgroundSize;
  const backgroundPosition = paint.backgroundPosition;
  if (!backgroundSize || !backgroundPosition
    || !Number.isFinite(backgroundSize[0]) || backgroundSize[0] <= 0
    || !Number.isFinite(backgroundSize[1]) || backgroundSize[1] <= 0
    || !Number.isFinite(backgroundPosition[0]) || !Number.isFinite(backgroundPosition[1])) {
    throw new TypeError("prepared image paint requires finite resolved size and position values");
  }
  const [backgroundWidth, backgroundHeight] = backgroundSize;
  if (!isPreparedOpaqueImageEligible(paint, geometry.width, geometry.height)) {
    throw new RangeError("prepared opaque image must cover the complete Cornerfill surface");
  }
  const sourceScaleX = intrinsicWidth / backgroundWidth;
  const sourceScaleY = intrinsicHeight / backgroundHeight;
  return Object.freeze({
    image: paint.image,
    imageSmoothing: paint.imageSmoothing !== false,
    intrinsicWidth,
    intrinsicHeight,
    backgroundWidth,
    backgroundHeight,
    sourceScaleX,
    sourceScaleY,
    sourceWidth: geometry.width * sourceScaleX,
    sourceHeight: geometry.height * sourceScaleY,
    width: geometry.width,
    height: geometry.height,
    dpr,
  });
}

function preparedImageRect(
  program: Readonly<PreparedOpaqueImageProgram>,
  positionX: number,
  positionY: number,
): Readonly<{ sourceHeight: number; sourceWidth: number; sourceX: number; sourceY: number }> {
  return Object.freeze({
    sourceX: positionX === 0 ? 0 : -positionX * program.sourceScaleX,
    sourceY: positionY === 0 ? 0 : -positionY * program.sourceScaleY,
    sourceWidth: program.sourceWidth,
    sourceHeight: program.sourceHeight,
  });
}

export function preparePreparedOpaqueImageContext(
  context: CanvasRenderingContext2D,
  program: Readonly<PreparedOpaqueImageProgram>,
): void {
  context.setTransform(program.dpr, 0, 0, program.dpr, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.imageSmoothingEnabled = program.imageSmoothing;
}

export function validatePreparedOpaqueImagePosition(
  program: Readonly<PreparedOpaqueImageProgram>,
  positionX: number,
  positionY: number,
): true {
  if (!program || typeof program !== "object") {
    throw new TypeError("prepared opaque image program is required");
  }
  if (!Number.isFinite(positionX) || !Number.isFinite(positionY)) {
    throw new TypeError("prepared background position must contain finite pixels");
  }
  if (positionX > 0 || positionY > 0
    || positionX + program.backgroundWidth < program.width
    || positionY + program.backgroundHeight < program.height) {
    throw new RangeError("prepared opaque image update no longer covers the complete Cornerfill surface");
  }
  return true;
}

export function drawPreparedOpaqueImage(
  context: CanvasRenderingContext2D,
  program: Readonly<PreparedOpaqueImageProgram>,
  positionX: number,
  positionY: number,
): void {
  validatePreparedOpaqueImagePosition(program, positionX, positionY);
  context.drawImage(
    program.image,
    positionX === 0 ? 0 : -positionX * program.sourceScaleX,
    positionY === 0 ? 0 : -positionY * program.sourceScaleY,
    program.sourceWidth,
    program.sourceHeight,
    0,
    0,
    program.width,
    program.height,
  );
}

export function explainPreparedOpaqueImage(
  program: Readonly<PreparedOpaqueImageProgram>,
  positionX: number,
  positionY: number,
): Readonly<PreparedOpaqueImageExplanation> {
  const rect = preparedImageRect(program, positionX, positionY);
  return Object.freeze({
    painter: CORNERFILL_PAINTER_SCHEMA,
    layer: Object.freeze({
      kind: "image",
      imageSize: freezePair(program.intrinsicWidth, program.intrinsicHeight),
      sourceRect: freezeRect(
        rect.sourceX,
        rect.sourceY,
        rect.sourceWidth,
        rect.sourceHeight,
      ),
      destinationRect: freezeRect(0, 0, program.width, program.height),
    }),
    border: null,
    update: "prepared-opaque-source-in",
  });
}

export function repaintOpaqueCornerfill(context: CanvasRenderingContext2D, {
  geometry,
  paint,
  border = null,
  shadow = null,
  outline = null,
  dpr = geometry?.dpr ?? 1,
}: Readonly<{
  border?: BorderPaintState | null | undefined;
  dpr?: number | undefined;
  geometry: PreparedGeometry;
  outline?: ContainedOutlinePaintState | null | undefined;
  paint: CornerfillPaintState;
  shadow?: InsetShadowPaintState | null | undefined;
}>): Readonly<OpaqueCornerfillPaintResult> | null {
  if (!geometry || typeof geometry !== "object") throw new TypeError("resolved geometry is required");
  if (border || shadow || outline
    || !isPreparedOpaqueImageEligible(paint, geometry.width, geometry.height)) return null;
  context.save();
  try {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.globalCompositeOperation = "source-in";
    const layer = paintOwnedLayer(context, paint, geometry.width, geometry.height);
    return Object.freeze({
      painter: CORNERFILL_PAINTER_SCHEMA,
      layer,
      border: null,
      update: "opaque-source-in",
    });
  } finally {
    context.restore();
  }
}

function subtractCarveOuts(
  context: CanvasRenderingContext2D,
  carveOuts: readonly (readonly Point[])[],
): void {
  context.save();
  try {
    context.globalCompositeOperation = "destination-out";
    context.fillStyle = "#000";
    for (const carveOut of carveOuts) {
      traceClosedPoints(context, carveOut);
      context.fill();
    }
  } finally {
    context.restore();
  }
}

function supportedBorder(
  border: Readonly<BorderPaintState> | null | undefined,
): Readonly<OwnedBorderPaintState> | null {
  if (!border) return null;
  const input = border.widths ?? [border.width, border.width, border.width, border.width];
  if (!Array.isArray(input) || input.length !== 4) {
    throw new TypeError("border requires four non-negative widths and one color");
  }
  const widths = [input[0], input[1], input[2], input[3]];
  if (widths.some((width) => typeof width !== "number" || !Number.isFinite(width) || width < 0)
    || widths.every((width) => width === 0) || !border.color) {
    throw new TypeError("border requires four non-negative widths and one color");
  }
  if (border.styles) {
    for (let index = 0; index < 4; index += 1) {
      if (widths[index]! > 0 && border.styles[index] !== "solid") {
        throw new TypeError("painted border sides must use solid style");
      }
    }
  }
  return Object.freeze({
    widths: Object.freeze([...widths]) as Four<number>,
    width: widths.every((width) => width === widths[0]) ? widths[0]! : null,
    color: String(border.color),
  });
}

function contourAtInsets(geometry: CornerGeometry, insets: Four<number>): readonly Point[] {
  if (insets.every((value) => value === 0)) {
    if (!Object.isFrozen(geometry) || !validatedOuterTopologies.has(geometry)) {
      // Reject contours that only avoid an interior crossing at their exact outer boundary.
      const interiorProbe = Math.min(geometry.width, geometry.height) * INTERIOR_TOPOLOGY_PROBE_RATIO;
      if (interiorProbe > 0) {
        insetCornerGeometry(geometry, [interiorProbe, interiorProbe, interiorProbe, interiorProbe]);
      }
      if (Object.isFrozen(geometry)) validatedOuterTopologies.add(geometry);
    }
    return geometry.contour;
  }
  const inset = insetCornerGeometry(geometry, insets);
  if (inset.contour.length < 2 || inset.targetRect.width <= 0 || inset.targetRect.height <= 0) return [];
  return inset.contour;
}

function paintContourRing(
  context: CanvasRenderingContext2D,
  outerContour: readonly Point[],
  innerContour: readonly Point[],
  color: string,
): boolean {
  if (outerContour.length < 2) return false;
  context.save();
  try {
    context.beginPath();
    appendClosedPoints(context, outerContour);
    if (innerContour.length > 1) appendClosedPoints(context, innerContour);
    context.fillStyle = color;
    // Inset contours are not normalized to the outer contour's winding.
    context.fill("evenodd");
  } finally {
    context.restore();
  }
  return true;
}

function insetShadowContours(
  geometry: CornerGeometry,
  shadow: Readonly<InsetShadowPaintState> | null | undefined,
  border: Readonly<OwnedBorderPaintState> | null,
): Readonly<{ inner: readonly Point[]; outer: readonly Point[] }> | null {
  if (!shadow) return null;
  if (shadow.kind !== "inset-solid-ring" || !Number.isFinite(shadow.spread)
    || shadow.spread <= 0 || !shadow.color) {
    throw new TypeError("unsupported inset shadow descriptor");
  }
  const baseInsets: Four<number> = border?.widths ?? [0, 0, 0, 0];
  const innerInsets: Four<number> = [
    baseInsets[0] + shadow.spread,
    baseInsets[1] + shadow.spread,
    baseInsets[2] + shadow.spread,
    baseInsets[3] + shadow.spread,
  ];
  return Object.freeze({
    outer: contourAtInsets(geometry, baseInsets),
    inner: contourAtInsets(geometry, innerInsets),
  });
}

function paintInsetShadow(
  context: CanvasRenderingContext2D,
  geometry: CornerGeometry,
  shadow: Readonly<InsetShadowPaintState> | null | undefined,
  border: Readonly<OwnedBorderPaintState> | null,
) {
  const contours = insetShadowContours(geometry, shadow, border);
  if (!shadow || !contours) return null;
  paintContourRing(
    context,
    contours.outer,
    contours.inner,
    shadow.color,
  );
  return Object.freeze({
    kind: shadow.kind,
    spread: shadow.spread,
    color: shadow.color,
  });
}

function containedOutlineContours(
  geometry: CornerGeometry,
  outline: Readonly<ContainedOutlinePaintState> | null | undefined,
): Readonly<{ inner: readonly Point[]; outer: readonly Point[] }> | null {
  if (!outline) return null;
  if (outline.kind !== "contained-solid-ring" || !Number.isFinite(outline.width)
    || !Number.isFinite(outline.offset) || outline.width <= 0
    || outline.offset + outline.width > 0 || !outline.color) {
    throw new TypeError("unsupported contained outline descriptor");
  }
  const outerInset = Math.max(0, -(outline.offset + outline.width));
  const innerInset = Math.max(0, -outline.offset);
  return Object.freeze({
    outer: contourAtInsets(geometry, [outerInset, outerInset, outerInset, outerInset]),
    inner: contourAtInsets(geometry, [innerInset, innerInset, innerInset, innerInset]),
  });
}

function paintContainedOutline(
  context: CanvasRenderingContext2D,
  geometry: CornerGeometry,
  outline: Readonly<ContainedOutlinePaintState> | null | undefined,
) {
  const contours = containedOutlineContours(geometry, outline);
  if (!outline || !contours) return null;
  paintContourRing(
    context,
    contours.outer,
    contours.inner,
    outline.color,
  );
  return Object.freeze({
    kind: outline.kind,
    width: outline.width,
    offset: outline.offset,
    color: outline.color,
  });
}

function validateBackgroundAreaTopology(
  geometry: CornerGeometry,
  area: Readonly<BackgroundArea> | null | undefined,
): void {
  if (area && area.name !== "border-box") contourAtInsets(geometry, area.insets);
}

export function validateCornerfillTopology({
  geometry,
  paint,
  border = null,
  shadow = null,
  outline = null,
}: Readonly<CornerfillPaintOptions>): void {
  geometry = snapshotCornerGeometry(geometry);
  contourAtInsets(geometry, ZERO_INSETS);
  const ownedBorder = supportedBorder(border);
  if (ownedBorder) contourAtInsets(geometry, ownedBorder.widths);
  if (paint.kind === "layers") {
    validateBackgroundAreaTopology(geometry, paint.colorClipArea);
    for (const layer of paint.layers) validateBackgroundAreaTopology(geometry, layer.clipArea);
  } else {
    validateBackgroundAreaTopology(geometry, paint.clipArea);
  }
  insetShadowContours(geometry, shadow, ownedBorder);
  containedOutlineContours(geometry, outline);
}

function clipToBackgroundArea(
  context: CanvasRenderingContext2D,
  geometry: CornerGeometry,
  area: Readonly<BackgroundArea> | null | undefined,
): boolean {
  if (!area || area.name === "border-box") return true;
  const inset = insetCornerGeometry(geometry, area.insets);
  if (inset.contour.length < 2 || inset.targetRect.width <= 0 || inset.targetRect.height <= 0) return false;
  context.beginPath();
  context.rect(inset.targetRect.x, inset.targetRect.y, inset.targetRect.width, inset.targetRect.height);
  context.clip();
  traceClosedPoints(context, inset.contour);
  context.clip();
  return true;
}

function paintBackground(
  context: CanvasRenderingContext2D,
  geometry: CornerGeometry,
  paint: CornerfillPaintState,
): PaintLayerResult {
  const paintClipped = (
    layer: OwnedPaintLayer,
    clipArea: Readonly<BackgroundArea> | null | undefined,
  ): ClippedOwnedLayerPaintResult => {
    context.save();
    try {
      const visible = clipToBackgroundArea(context, geometry, clipArea);
      return visible
        ? paintOwnedLayer(context, layer, geometry.width, geometry.height)
        : Object.freeze({ kind: layer.kind, emptyClip: true });
    } finally {
      context.restore();
    }
  };
  const transparent = (color: string | undefined): boolean => !color
    || isFullyTransparentCssColor(color);
  let layer: PaintLayerResult;
  if (paint.kind === "layers") {
    const color = transparent(paint.color)
      ? null
      : paintClipped({ kind: "solid", color: paint.color }, paint.colorClipArea);
    const results: ClippedOwnedLayerPaintResult[] = new Array(paint.layers.length);
    for (let index = paint.layers.length - 1; index >= 0; index -= 1) {
      results[index] = paintClipped(paint.layers[index]!, paint.layers[index]!.clipArea);
    }
    layer = Object.freeze({
      kind: "layers",
      color,
      layers: Object.freeze(results),
    });
  } else {
    const color = "color" in paint ? paint.color : undefined;
    if (paint.kind !== "solid" && !transparent(color)) {
      paintClipped({ kind: "solid", color: color! }, paint.clipArea);
    }
    layer = paintClipped(paint, paint.clipArea);
  }
  subtractCarveOuts(context, geometry.carveOuts);
  return layer;
}

export function paintCornerfill(
  context: CanvasRenderingContext2D,
  options: Readonly<CornerfillPaintOptions>,
) {
  const geometry = snapshotCornerGeometry(options.geometry);
  const { paint, border = null, shadow = null, outline = null } = options;
  const dpr = options.dpr ?? geometry.dpr;
  validateCornerfillTopology({ geometry, paint, border, shadow, outline, dpr });
  const { width, height } = geometry;
  const ownedBorder = supportedBorder(border);
  const borderInnerContour = ownedBorder ? contourAtInsets(geometry, ownedBorder.widths) : null;
  clearSurface(context, width, height, dpr);

  const layer = paintBackground(context, geometry, paint);
  const shadowResult = paintInsetShadow(context, geometry, shadow, ownedBorder);
  let borderResult = null;
  if (ownedBorder) {
    paintContourRing(
      context,
      geometry.contour,
      borderInnerContour!,
      ownedBorder.color,
    );
    borderResult = Object.freeze({
      kind: "solid-shaped-ring",
      widths: ownedBorder.widths,
      color: ownedBorder.color,
    });
  }
  const outlineResult = paintContainedOutline(context, geometry, outline);
  return Object.freeze({
    painter: CORNERFILL_PAINTER_SCHEMA,
    layer,
    border: borderResult,
    shadow: shadowResult,
    outline: outlineResult,
  });
}
