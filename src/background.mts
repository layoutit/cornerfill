import {
  parseLengthPercentage,
  resolveLengthPercentage,
  splitTopLevelCommas,
  splitTopLevelWhitespace,
} from "./values.mjs";
import { isCssGradient, parseCssGradient } from "./gradients.mjs";
import type { GradientStop, LinearGradientLine, RadialGradientShape, RadialGradientSize } from "./gradients.mjs";
import type { Four, LengthPercentage } from "./values.mjs";

export type PixelPair = readonly [first: number, second: number];
type BackgroundAxis = "x" | "y";
type BackgroundBox = "border-box" | "padding-box" | "content-box";
type BackgroundRepeatMode = "repeat" | "space" | "round" | "no-repeat";
export type BackgroundBlendMode = "normal" | "multiply";

interface PositionComponent {
  readonly kind: "position";
  readonly percent: number;
  readonly px: number;
  readonly source: string;
}

interface EdgePositionComponent {
  readonly edge: "left" | "right" | "top" | "bottom";
  readonly kind: "edge-position";
  readonly offset: Readonly<LengthPercentage>;
  readonly source: string;
}

export type BackgroundPositionComponent = PositionComponent | EdgePositionComponent;
export type BackgroundPositionSpec =
  | Readonly<{ kind: "prepared"; x: number; y: number }>
  | Readonly<{
    kind: "components";
    x: BackgroundPositionComponent;
    y: BackgroundPositionComponent;
  }>;

type BackgroundSizeComponent =
  | Readonly<{ kind: "auto"; source: string }>
  | Readonly<{
    kind: "length-percentage";
    source: string;
    value: Readonly<LengthPercentage>;
  }>;

type BackgroundSizeSpec =
  | Readonly<{ height: number; kind: "prepared"; width: number }>
  | Readonly<{ kind: "contain" | "cover" }>
  | Readonly<{
    height: BackgroundSizeComponent;
    kind: "components";
    width: BackgroundSizeComponent;
  }>;

export interface BackgroundRepeat {
  readonly x: BackgroundRepeatMode;
  readonly y: BackgroundRepeatMode;
}

type BackgroundBoxSideInput = number | Four<number> | Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

export interface BackgroundBoxMetricsInput {
  readonly border?: BackgroundBoxSideInput | null | undefined;
  readonly padding?: BackgroundBoxSideInput | null | undefined;
}

export interface BackgroundBoxMetrics {
  readonly border: Four<number>;
  readonly padding: Four<number>;
}

export interface BackgroundArea {
  readonly height: number;
  readonly insets: Four<number>;
  readonly name: BackgroundBox;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export type CornerfillRasterSource =
  | HTMLCanvasElement
  | HTMLImageElement
  | HTMLVideoElement
  | ImageBitmap
  | OffscreenCanvas
  | VideoFrame;

export function rasterSourceDimensions(image: CornerfillRasterSource): PixelPair {
  const source = image as Readonly<{
    displayHeight?: unknown;
    displayWidth?: unknown;
    height?: unknown;
    naturalHeight?: unknown;
    naturalWidth?: unknown;
    videoHeight?: unknown;
    videoWidth?: unknown;
    width?: unknown;
  }>;
  const width = source.naturalWidth ?? source.videoWidth ?? source.displayWidth ?? source.width;
  const height = source.naturalHeight ?? source.videoHeight ?? source.displayHeight ?? source.height;
  if (typeof width !== "number" || typeof height !== "number"
    || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("raster paint requires a decoded image with intrinsic dimensions");
  }
  return Object.freeze([width, height]);
}

interface NormalizedLayerCommon {
  readonly attachment: "scroll";
  readonly backgroundPositionSpec: BackgroundPositionSpec;
  readonly backgroundSizeSpec: BackgroundSizeSpec;
  readonly blendMode: BackgroundBlendMode;
  readonly clip: BackgroundBox;
  readonly origin: BackgroundBox;
  readonly repeat: Readonly<BackgroundRepeat>;
}

interface NormalizedNoneLayer extends NormalizedLayerCommon {
  readonly kind: "none";
}

export interface NormalizedImageLayer extends NormalizedLayerCommon {
  readonly crossOrigin?: string | null | undefined;
  readonly image?: CornerfillRasterSource | undefined;
  readonly imageSmoothing: boolean;
  readonly kind: "image";
  readonly opaque?: boolean | undefined;
  readonly sourceSize?: PixelPair | undefined;
  readonly url?: string | undefined;
}

interface NormalizedGradientLayerBase extends NormalizedLayerCommon {
  readonly css?: string | undefined;
  readonly stops: readonly GradientStop[];
}

interface NormalizedLinearGradientLayer extends NormalizedGradientLayerBase {
  readonly from?: PixelPair | undefined;
  readonly kind: "linear-gradient";
  readonly line?: LinearGradientLine | undefined;
  readonly to?: PixelPair | undefined;
}

interface NormalizedRadialGradientLayer extends NormalizedGradientLayerBase {
  readonly centerSpec: BackgroundPositionSpec;
  readonly kind: "radial-gradient";
  readonly shape: RadialGradientShape;
  readonly size: RadialGradientSize;
}

interface NormalizedConicGradientLayer extends NormalizedGradientLayerBase {
  readonly angle: number;
  readonly centerSpec: BackgroundPositionSpec;
  readonly kind: "conic-gradient";
}

export type NormalizedBackgroundLayer =
  | NormalizedNoneLayer
  | NormalizedImageLayer
  | NormalizedLinearGradientLayer
  | NormalizedRadialGradientLayer
  | NormalizedConicGradientLayer;

interface PaintBoxInput {
  readonly box?: BackgroundBoxMetricsInput | undefined;
}

interface SolidPaintDescriptor extends PaintBoxInput {
  readonly clip: BackgroundBox;
  readonly color: string;
  readonly kind: "solid";
}

interface LayeredPaintDescriptor extends PaintBoxInput {
  readonly color: string;
  readonly kind: "layers";
  readonly layers: readonly NormalizedBackgroundLayer[];
}

type SingleLayerPaintDescriptor = NormalizedBackgroundLayer & PaintBoxInput & Readonly<{ color: string }>;
export type NormalizedPaintDescriptor =
  | SolidPaintDescriptor
  | LayeredPaintDescriptor
  | SingleLayerPaintDescriptor;

interface BackgroundLayerInputCommon {
  readonly attachment?: "scroll" | undefined;
  readonly backgroundClip?: BackgroundBox | undefined;
  readonly backgroundOrigin?: BackgroundBox | undefined;
  readonly backgroundPosition?: string | PixelPair | undefined;
  readonly backgroundPositionSpec?: BackgroundPositionSpec | undefined;
  readonly backgroundSize?: string | PixelPair | undefined;
  readonly backgroundSizeSpec?: BackgroundSizeSpec | undefined;
  readonly blendMode?: BackgroundBlendMode | undefined;
  readonly clip?: BackgroundBox | undefined;
  readonly origin?: BackgroundBox | undefined;
  readonly repeat?: string | Readonly<BackgroundRepeat> | undefined;
}

type BackgroundLayerInput = BackgroundLayerInputCommon & Readonly<{
  readonly angle?: number | undefined;
  readonly centerSource?: string | undefined;
  readonly centerSpec?: BackgroundPositionSpec | undefined;
  readonly crossOrigin?: string | null | undefined;
  readonly css?: string | undefined;
  readonly from?: PixelPair | undefined;
  readonly image?: CornerfillRasterSource | undefined;
  readonly imageSmoothing?: boolean | undefined;
  readonly kind: "none" | "image" | "linear-gradient" | "radial-gradient" | "conic-gradient";
  readonly line?: LinearGradientLine | undefined;
  readonly opaque?: boolean | undefined;
  readonly shape?: RadialGradientShape | undefined;
  readonly size?: RadialGradientSize | undefined;
  readonly sourceSize?: PixelPair | undefined;
  readonly stops?: readonly GradientStop[] | undefined;
  readonly to?: PixelPair | undefined;
  readonly url?: string | undefined;
}>;

interface SolidPaintDescriptorInput {
  readonly backgroundClip?: BackgroundBox | undefined;
  readonly box?: BackgroundBoxMetricsInput | undefined;
  readonly clip?: BackgroundBox | undefined;
  readonly color: string;
  readonly kind: "solid";
}

interface LayeredPaintDescriptorInput {
  readonly blendMode?: BackgroundBlendMode | readonly BackgroundBlendMode[] | undefined;
  readonly box?: BackgroundBoxMetricsInput | undefined;
  readonly color?: string | undefined;
  readonly kind: "layers";
  readonly layers: readonly BackgroundLayerInput[];
}

export type PaintDescriptorInput =
  | SolidPaintDescriptorInput
  | LayeredPaintDescriptorInput
  | (BackgroundLayerInput & PaintBoxInput & Readonly<{ readonly color?: string | undefined }>);

interface ResolvedLayerCommon {
  readonly backgroundPosition: PixelPair;
  readonly backgroundSize: PixelPair;
  readonly boxMetrics: Readonly<BackgroundBoxMetrics>;
  readonly clipArea: Readonly<BackgroundArea>;
  readonly positioningArea: Readonly<BackgroundArea>;
  readonly tilePlan: Readonly<{ x: readonly number[]; y: readonly number[] }>;
}

type ResolvedNoneLayer = NormalizedNoneLayer & Readonly<{
  boxMetrics: Readonly<BackgroundBoxMetrics>;
  clipArea: Readonly<BackgroundArea>;
}>;
type ResolvedImageLayer = NormalizedImageLayer & ResolvedLayerCommon & Readonly<{
  image: CornerfillRasterSource;
}>;
type ResolvedLinearGradientLayer = NormalizedLinearGradientLayer & ResolvedLayerCommon;
type ResolvedRadialGradientLayer = NormalizedRadialGradientLayer & ResolvedLayerCommon & Readonly<{
  gradientCenter: PixelPair;
  gradientRadii: PixelPair;
}>;
type ResolvedConicGradientLayer = NormalizedConicGradientLayer & ResolvedLayerCommon & Readonly<{
  gradientCenter: PixelPair;
}>;
type ResolvedBackgroundLayer =
  | ResolvedNoneLayer
  | ResolvedImageLayer
  | ResolvedLinearGradientLayer
  | ResolvedRadialGradientLayer
  | ResolvedConicGradientLayer;
export type ResolvedPaintDescriptor =
  | (SolidPaintDescriptor & Readonly<{
    boxMetrics: Readonly<BackgroundBoxMetrics>;
    clipArea: Readonly<BackgroundArea>;
  }>)
  | (LayeredPaintDescriptor & Readonly<{
    boxMetrics: Readonly<BackgroundBoxMetrics>;
    colorClipArea: Readonly<BackgroundArea>;
    layers: readonly ResolvedBackgroundLayer[];
  }>)
  | (ResolvedBackgroundLayer & Readonly<{ color: string }>);

interface PositionEdgePair {
  readonly axis: BackgroundAxis;
  readonly value: EdgePositionComponent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function frozenFour<T>(first: T, second: T, third: T, fourth: T): Four<T> {
  return Object.freeze([first, second, third, fourth]);
}

function isFiniteSideTuple(values: readonly unknown[]): values is Four<number> {
  if (values.length !== 4) return false;
  for (let index = 0; index < 4; index += 1) {
    const value = values[index];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
  }
  return true;
}

function parseCssUrl(input: unknown): string {
  const value = String(input).trim();
  const match = /^url\((.*)\)$/isu.exec(value);
  if (!match) throw new SyntaxError(`only one url() background image is supported: ${value}`);
  const token = match[1]!.trim();
  if ((token.startsWith("\"") && token.endsWith("\""))
    || (token.startsWith("'") && token.endsWith("'"))) {
    return token.slice(1, -1).replace(/\\([\\"'])/gu, "$1");
  }
  if (!token || /[\s"'()]/u.test(token)) throw new SyntaxError(`unsupported url() token: ${value}`);
  return token;
}

function component(input: unknown, axis: BackgroundAxis): PositionComponent {
  const value = String(input).toLowerCase();
  const keywordPercent: Readonly<Record<string, number>> = axis === "x"
    ? { left: 0, center: 0.5, right: 1 }
    : { top: 0, center: 0.5, bottom: 1 };
  if (Object.hasOwn(keywordPercent, value)) {
    return Object.freeze({
      kind: "position",
      px: 0,
      percent: keywordPercent[value]!,
      source: value,
    });
  }
  const parsed = parseLengthPercentage(value, { label: `background-position ${axis}` });
  return Object.freeze({ kind: "position", px: parsed.px, percent: parsed.percent, source: value });
}

function edgeComponent(
  edge: string,
  offset: string | undefined,
  axis: BackgroundAxis,
): EdgePositionComponent {
  const valid = axis === "x" ? new Set(["left", "right"]) : new Set(["top", "bottom"]);
  if (!valid.has(edge)) throw new SyntaxError(`invalid background-position ${axis} edge: ${edge}`);
  return Object.freeze({
    kind: "edge-position",
    edge: edge as EdgePositionComponent["edge"],
    offset: parseLengthPercentage(offset ?? "0", { label: `background-position ${edge} offset` }),
    source: offset === undefined ? edge : `${edge} ${offset}`,
  });
}

function positionAxisForEdge(token: string): BackgroundAxis | null {
  if (token === "left" || token === "right") return "x";
  if (token === "top" || token === "bottom") return "y";
  return null;
}

function parseEdgePair(edge: string, offset: string | undefined): Readonly<PositionEdgePair> | null {
  const axis = positionAxisForEdge(edge);
  if (!axis || offset === undefined || positionAxisForEdge(offset) || offset === "center") return null;
  return Object.freeze({ axis, value: edgeComponent(edge, offset, axis) });
}

export function parseBackgroundPosition(input: unknown): BackgroundPositionSpec {
  if (Array.isArray(input)) {
    if (input.length !== 2 || !Number.isFinite(input[0]) || !Number.isFinite(input[1])) {
      throw new TypeError("prepared background position must contain two finite pixels");
    }
    return Object.freeze({ kind: "prepared", x: input[0]!, y: input[1]! });
  }
  const tokens = splitTopLevelWhitespace(String(input));
  if (tokens.length < 1 || tokens.length > 4) {
    throw new SyntaxError(`background-position requires one through four supported values: ${input}`);
  }
  const lower = tokens.map((token) => token.toLowerCase());
  if (tokens.length === 4) {
    const first = parseEdgePair(lower[0]!, tokens[1]);
    const second = parseEdgePair(lower[2]!, tokens[3]);
    if (!first || !second || first.axis === second.axis) {
      throw new SyntaxError(`invalid four-value background-position: ${input}`);
    }
    return Object.freeze({
      kind: "components",
      x: first.axis === "x" ? first.value : second.value,
      y: first.axis === "y" ? first.value : second.value,
    });
  }
  if (tokens.length === 3) {
    const leadingPair = parseEdgePair(lower[0]!, tokens[1]);
    const trailingPair = parseEdgePair(lower[1]!, tokens[2]);
    const pair = leadingPair ?? trailingPair;
    const otherToken = (leadingPair ? lower[2] : lower[0])!;
    const otherAxis = pair?.axis === "x" ? "y" : "x";
    if (!pair || (otherToken !== "center" && positionAxisForEdge(otherToken) !== otherAxis)) {
      throw new SyntaxError(`invalid three-value background-position: ${input}`);
    }
    const other = component(otherToken, otherAxis);
    return Object.freeze({
      kind: "components",
      x: pair.axis === "x" ? pair.value : other,
      y: pair.axis === "y" ? pair.value : other,
    });
  }
  let xToken = tokens[0]!;
  let yToken = tokens[1] ?? "center";
  if (tokens.length === 1 && new Set(["top", "bottom"]).has(tokens[0]!.toLowerCase())) {
    xToken = "center";
    yToken = tokens[0]!;
  } else if (tokens.length === 2
    && ((positionAxisForEdge(lower[0]!) === "y"
      && (positionAxisForEdge(lower[1]!) === "x" || lower[1] === "center"))
      || (lower[0] === "center" && positionAxisForEdge(lower[1]!) === "x"))) {
    [xToken, yToken] = [tokens[1]!, tokens[0]!];
  }
  return Object.freeze({ kind: "components", x: component(xToken, "x"), y: component(yToken, "y") });
}

export function parseBackgroundRepeat(input: unknown = "repeat"): Readonly<BackgroundRepeat> {
  if (isRecord(input) && !Array.isArray(input)) {
    const x = String(input.x ?? "repeat").toLowerCase();
    const y = String(input.y ?? x).toLowerCase();
    const valid = new Set(["repeat", "space", "round", "no-repeat"]);
    if (!valid.has(x) || !valid.has(y)) throw new SyntaxError(`invalid background-repeat: ${JSON.stringify(input)}`);
    return Object.freeze({ x: x as BackgroundRepeatMode, y: y as BackgroundRepeatMode });
  }
  const value = String(input).trim().toLowerCase();
  if (value === "repeat-x") return Object.freeze({ x: "repeat", y: "no-repeat" });
  if (value === "repeat-y") return Object.freeze({ x: "no-repeat", y: "repeat" });
  const tokens = splitTopLevelWhitespace(value);
  const valid = new Set(["repeat", "space", "round", "no-repeat"]);
  if (tokens.length < 1 || tokens.length > 2 || tokens.some((token) => !valid.has(token))) {
    throw new SyntaxError(`invalid background-repeat: ${input}`);
  }
  return Object.freeze({
    x: tokens[0]! as BackgroundRepeatMode,
    y: (tokens[1] ?? tokens[0]!) as BackgroundRepeatMode,
  });
}

function parseBackgroundBox(input: unknown, label: string): BackgroundBox {
  const value = String(input).trim().toLowerCase();
  if (!new Set(["border-box", "padding-box", "content-box"]).has(value)) {
    throw new TypeError(`unsupported ${label}: ${input}`);
  }
  return value as BackgroundBox;
}

function sizeComponent(input: unknown, axis: "width" | "height"): BackgroundSizeComponent {
  const value = String(input).toLowerCase();
  if (value === "auto") return Object.freeze({ kind: "auto", source: value });
  const parsed = parseLengthPercentage(value, { label: `background-size ${axis}` });
  if (!/^calc\(/iu.test(value) && (parsed.px < 0 || parsed.percent < 0)) {
    throw new SyntaxError(`background-size ${axis} must be non-negative: ${value}`);
  }
  return Object.freeze({
    kind: "length-percentage",
    value: parsed,
    source: value,
  });
}

function parseBackgroundSize(input: unknown): BackgroundSizeSpec {
  if (Array.isArray(input)) {
    if (input.length !== 2
      || !Number.isFinite(input[0]) || input[0] < 0
      || !Number.isFinite(input[1]) || input[1] < 0) {
      throw new TypeError("prepared background size must contain two finite non-negative pixels");
    }
    return Object.freeze({ kind: "prepared", width: input[0]!, height: input[1]! });
  }
  const value = String(input).trim().toLowerCase();
  if (value === "cover" || value === "contain") return Object.freeze({ kind: value });
  const tokens = splitTopLevelWhitespace(value);
  if (tokens.length < 1 || tokens.length > 2) {
    throw new SyntaxError(`background-size requires one or two supported values: ${input}`);
  }
  return Object.freeze({
    kind: "components",
    width: sizeComponent(tokens[0]!, "width"),
    height: sizeComponent(tokens[1] ?? "auto", "height"),
  });
}

function normalizedPixelPair(
  input: unknown,
  label: string,
  { positive = false }: Readonly<{ positive?: boolean }> = {},
): PixelPair {
  if (!Array.isArray(input) || input.length !== 2
    || typeof input[0] !== "number" || !Number.isFinite(input[0]) || (positive && input[0] <= 0)
    || typeof input[1] !== "number" || !Number.isFinite(input[1]) || (positive && input[1] <= 0)) {
    throw new TypeError(`${label} must contain two finite${positive ? " positive" : ""} numbers`);
  }
  return Object.freeze([input[0]!, input[1]!]);
}

function normalizedLengthPercentage(input: unknown, label: string): Readonly<LengthPercentage> {
  if (!isRecord(input)
    || typeof input.px !== "number" || !Number.isFinite(input.px)
    || typeof input.percent !== "number" || !Number.isFinite(input.percent)
    || typeof input.source !== "string") {
    throw new TypeError(`${label} must be a finite normalized length-percentage`);
  }
  return Object.freeze({ px: input.px, percent: input.percent, source: input.source });
}

function normalizedPositionComponent(
  input: unknown,
  axis: BackgroundAxis,
): BackgroundPositionComponent {
  if (!isRecord(input) || typeof input.source !== "string") {
    throw new TypeError(`background-position ${axis} requires a normalized component`);
  }
  if (input.kind === "position"
    && typeof input.px === "number" && Number.isFinite(input.px)
    && typeof input.percent === "number" && Number.isFinite(input.percent)) {
    return Object.freeze({
      kind: "position",
      px: input.px,
      percent: input.percent,
      source: input.source,
    });
  }
  const edgeMatchesAxis = axis === "x"
    ? input.edge === "left" || input.edge === "right"
    : input.edge === "top" || input.edge === "bottom";
  if (input.kind === "edge-position" && edgeMatchesAxis) {
    return Object.freeze({
      kind: "edge-position",
      edge: input.edge as EdgePositionComponent["edge"],
      offset: normalizedLengthPercentage(input.offset, `background-position ${axis} edge offset`),
      source: input.source,
    });
  }
  throw new TypeError(`background-position ${axis} requires a normalized component`);
}

function normalizedBackgroundPositionSpec(input: unknown): BackgroundPositionSpec {
  if (!isRecord(input)) throw new TypeError("background-position requires a normalized specification");
  if (input.kind === "prepared"
    && typeof input.x === "number" && Number.isFinite(input.x)
    && typeof input.y === "number" && Number.isFinite(input.y)) {
    return Object.freeze({ kind: "prepared", x: input.x, y: input.y });
  }
  if (input.kind === "components") {
    return Object.freeze({
      kind: "components",
      x: normalizedPositionComponent(input.x, "x"),
      y: normalizedPositionComponent(input.y, "y"),
    });
  }
  throw new TypeError("background-position requires a normalized specification");
}

function normalizedSizeComponent(input: unknown, axis: "width" | "height"): BackgroundSizeComponent {
  if (!isRecord(input) || typeof input.source !== "string") {
    throw new TypeError(`background-size ${axis} requires a normalized component`);
  }
  if (input.kind === "auto") return Object.freeze({ kind: "auto", source: input.source });
  if (input.kind === "length-percentage") {
    return Object.freeze({
      kind: "length-percentage",
      source: input.source,
      value: normalizedLengthPercentage(input.value, `background-size ${axis}`),
    });
  }
  throw new TypeError(`background-size ${axis} requires a normalized component`);
}

function normalizedBackgroundSizeSpec(input: unknown): BackgroundSizeSpec {
  if (!isRecord(input)) throw new TypeError("background-size requires a normalized specification");
  if (input.kind === "prepared"
    && typeof input.width === "number" && Number.isFinite(input.width) && input.width >= 0
    && typeof input.height === "number" && Number.isFinite(input.height) && input.height >= 0) {
    return Object.freeze({ kind: "prepared", width: input.width, height: input.height });
  }
  if (input.kind === "cover" || input.kind === "contain") return Object.freeze({ kind: input.kind });
  if (input.kind === "components") {
    return Object.freeze({
      kind: "components",
      width: normalizedSizeComponent(input.width, "width"),
      height: normalizedSizeComponent(input.height, "height"),
    });
  }
  throw new TypeError("background-size requires a normalized specification");
}

function normalizedLinearLine(input: unknown): LinearGradientLine {
  if (!isRecord(input)) throw new TypeError("linear-gradient requires a normalized line");
  if (input.kind === "angle" && typeof input.radians === "number" && Number.isFinite(input.radians)) {
    return Object.freeze({ kind: "angle", radians: input.radians });
  }
  const horizontal = input.horizontal;
  const vertical = input.vertical;
  if (input.kind === "side"
    && (horizontal === null || horizontal === "left" || horizontal === "right")
    && (vertical === null || vertical === "top" || vertical === "bottom")
    && (horizontal !== null || vertical !== null)) {
    return Object.freeze({
      kind: "side",
      horizontal: horizontal as "left" | "right" | null,
      vertical: vertical as "top" | "bottom" | null,
    });
  }
  throw new TypeError("linear-gradient requires a normalized line");
}

const RADIAL_SIZE_KEYWORDS = new Set([
  "closest-side",
  "closest-corner",
  "farthest-side",
  "farthest-corner",
]);

function normalizedRadialSize(input: unknown, shape: RadialGradientShape): RadialGradientSize {
  if (!isRecord(input)) throw new TypeError("radial-gradient requires a normalized size");
  if (input.kind === "keyword" && typeof input.value === "string"
    && RADIAL_SIZE_KEYWORDS.has(input.value)) {
    return Object.freeze({
      kind: "keyword",
      value: input.value as Extract<RadialGradientSize, { kind: "keyword" }>["value"],
    });
  }
  const expected = shape === "circle" ? 1 : 2;
  const inputRadii = input.radii;
  if (input.kind === "explicit" && Array.isArray(inputRadii) && inputRadii.length === expected) {
    const radii = Object.freeze(Array.from({ length: expected }, (_value, index) => (
      normalizedLengthPercentage(inputRadii[index], `radial-gradient radius ${index + 1}`)
    )));
    if (shape === "circle" && radii[0]!.percent !== 0) {
      throw new TypeError("circle radial-gradient percentage radii are invalid");
    }
    return Object.freeze({ kind: "explicit", radii });
  }
  throw new TypeError(`radial-gradient ${shape} requires ${expected} normalized radius${expected === 1 ? "" : "es"}`);
}

const GRADIENT_KINDS: ReadonlySet<unknown> = new Set([
  "linear-gradient",
  "radial-gradient",
  "conic-gradient",
]);

function layerList(input: unknown, fallback: string): readonly string[] {
  const parts = splitTopLevelCommas(String(input || fallback));
  if (parts.length === 0) throw new SyntaxError("background layer list cannot be empty");
  return parts;
}

function listItem<T>(list: readonly T[], index: number): T {
  return list[index % list.length]!;
}

function normalizeLayerCommon(paint: Readonly<Record<string, unknown>>): Omit<NormalizedLayerCommon, "box"> {
  const blendMode = String(paint.blendMode ?? "normal").trim().toLowerCase();
  const attachment = String(paint.attachment ?? "scroll").trim().toLowerCase();
  if (blendMode !== "normal" && blendMode !== "multiply") {
    throw new TypeError(`unsupported background-blend-mode: ${blendMode}`);
  }
  if (attachment !== "scroll") throw new TypeError(`unsupported background-attachment: ${attachment}`);
  const backgroundSizeSpec = paint.backgroundSizeSpec === undefined
    ? parseBackgroundSize(paint.backgroundSize ?? "auto")
    : normalizedBackgroundSizeSpec(paint.backgroundSizeSpec);
  const backgroundPositionSpec = paint.backgroundPositionSpec === undefined
    ? parseBackgroundPosition(paint.backgroundPosition ?? "0% 0%")
    : normalizedBackgroundPositionSpec(paint.backgroundPositionSpec);
  return Object.freeze({
    backgroundSizeSpec,
    backgroundPositionSpec,
    repeat: parseBackgroundRepeat(paint.repeat ?? "repeat"),
    origin: parseBackgroundBox(
      paint.origin ?? paint.backgroundOrigin ?? "padding-box",
      "background-origin",
    ),
    clip: parseBackgroundBox(
      paint.clip ?? paint.backgroundClip ?? "border-box",
      "background-clip",
    ),
    blendMode,
    attachment,
  });
}

function normalizeStops(stops: unknown, kind: string): readonly GradientStop[] {
  if (!Array.isArray(stops) || stops.length < 2) {
    throw new TypeError(`${kind} requires at least two normalized color stops`);
  }
  let previousOffset = 0;
  return Object.freeze(Array.from({ length: stops.length }, (_value, index) => {
    const stop = stops[index];
    if (!Array.isArray(stop) || stop.length !== 2
      || !Number.isFinite(stop[0]) || stop[0] < 0 || stop[0] > 1 || !stop[1]) {
      throw new TypeError(`invalid ${kind} color stop`);
    }
    const offset = Math.max(previousOffset, stop[0]);
    previousOffset = offset;
    return Object.freeze([offset, String(stop[1])] as const);
  }));
}

function normalizeGradientLayer(
  paint: Readonly<Record<string, unknown>>,
): NormalizedLinearGradientLayer | NormalizedRadialGradientLayer | NormalizedConicGradientLayer {
  const parsed = paint.css && !paint.stops ? parseCssGradient(String(paint.css)) : null;
  const source: Readonly<Record<string, unknown>> = parsed ? { ...parsed, ...paint } : paint;
  if (!GRADIENT_KINDS.has(source.kind)) throw new TypeError(`unsupported gradient kind: ${source.kind}`);
  const common = normalizeLayerCommon(source);
  const base = {
    ...common,
    ...(source.css === undefined ? {} : { css: String(source.css) }),
    stops: normalizeStops(source.stops, String(source.kind)),
  };
  if (source.kind === "linear-gradient") {
    if (source.line !== undefined) {
      return Object.freeze({ ...base, kind: source.kind, line: normalizedLinearLine(source.line) });
    }
    return Object.freeze({
      ...base,
      kind: source.kind,
      from: normalizedPixelPair(source.from, "linear-gradient from"),
      to: normalizedPixelPair(source.to, "linear-gradient to"),
    });
  }
  const centerSpec = source.centerSpec === undefined
    ? parseBackgroundPosition(source.centerSource ?? "center")
    : normalizedBackgroundPositionSpec(source.centerSpec);
  if (source.kind === "radial-gradient") {
    if (source.shape !== "circle" && source.shape !== "ellipse") {
      throw new TypeError("radial-gradient requires a circle or ellipse shape");
    }
    return Object.freeze({
      ...base,
      kind: source.kind,
      centerSpec,
      shape: source.shape,
      size: normalizedRadialSize(source.size, source.shape),
    });
  }
  if (typeof source.angle !== "number" || !Number.isFinite(source.angle)) {
    throw new TypeError("conic-gradient requires a finite start angle");
  }
  return Object.freeze({ ...base, kind: "conic-gradient", angle: source.angle, centerSpec });
}

function normalizeLayer(paint: unknown): NormalizedBackgroundLayer {
  if (!isRecord(paint)) throw new TypeError("background layer is required");
  if (paint.kind === "none") {
    const layer = { kind: "none" as const, ...normalizeLayerCommon(paint) };
    if (layer.blendMode !== "normal") {
      throw new TypeError("multiply requires exactly one raster background image");
    }
    return Object.freeze(layer) as NormalizedNoneLayer;
  }
  if (GRADIENT_KINDS.has(paint.kind)) {
    const layer = normalizeGradientLayer(paint);
    if (layer.blendMode !== "normal") {
      throw new TypeError("multiply requires exactly one raster background image");
    }
    return layer;
  }
  if (paint.kind !== "image") throw new TypeError(`unsupported background layer kind: ${paint.kind}`);
  if (!paint.image && !paint.url) throw new TypeError("image paint requires a decoded image or URL");
  const crossOrigin = paint.crossOrigin === undefined || paint.crossOrigin === null
    ? paint.crossOrigin as null | undefined
    : String(paint.crossOrigin);
  if (crossOrigin !== undefined && crossOrigin !== null
    && crossOrigin !== "anonymous" && crossOrigin !== "use-credentials") {
    throw new TypeError(`unsupported image crossOrigin mode: ${crossOrigin}`);
  }
  return Object.freeze({
    kind: "image",
    ...normalizeLayerCommon(paint),
    ...(paint.image === undefined ? {} : { image: paint.image as CornerfillRasterSource }),
    ...(paint.url === undefined ? {} : { url: String(paint.url) }),
    ...(crossOrigin === undefined ? {} : { crossOrigin }),
    ...(paint.sourceSize === undefined ? {} : {
      sourceSize: normalizedPixelPair(paint.sourceSize, "image sourceSize", { positive: true }),
    }),
    ...(paint.opaque === undefined ? {} : { opaque: paint.opaque === true }),
    imageSmoothing: paint.imageSmoothing !== false,
  }) as NormalizedImageLayer;
}

function canvasImageSmoothing(value: unknown): boolean {
  const normalized = String(value ?? "auto").trim().toLowerCase();
  if (["pixelated", "crisp-edges", "-webkit-optimize-contrast"].includes(normalized)) return false;
  if (["", "auto", "smooth", "high-quality"].includes(normalized)) return true;
  throw new TypeError(`unsupported image-rendering value: ${normalized}`);
}

export interface ComputedPaintStyle {
  readonly backgroundAttachment?: string | undefined;
  readonly backgroundBlendMode?: string | undefined;
  readonly backgroundClip?: string | undefined;
  readonly backgroundColor?: string | undefined;
  readonly backgroundImage?: string | undefined;
  readonly backgroundOrigin?: string | undefined;
  readonly backgroundPosition?: string | undefined;
  readonly backgroundRepeat?: string | undefined;
  readonly backgroundSize?: string | undefined;
  readonly imageRendering?: string | undefined;
}

export interface ComputedPaintCarriers {
  readonly attachment?: string | undefined;
  readonly blendMode?: string | undefined;
  readonly clip?: string | undefined;
  readonly color?: string | undefined;
  readonly image?: string | undefined;
  readonly origin?: string | undefined;
  readonly position?: string | undefined;
  readonly repeat?: string | undefined;
  readonly size?: string | undefined;
  readonly smoothing?: string | undefined;
}

export interface ComputedPaintCaptureOptions {
  readonly rasterIsOpaque?: boolean | undefined;
}

export function captureComputedPaint(
  computedStyle: Readonly<ComputedPaintStyle>,
  carriers: Readonly<ComputedPaintCarriers> = {},
  options: Readonly<ComputedPaintCaptureOptions> = {},
): NormalizedPaintDescriptor {
  const imageLayers = layerList(carriers.image || computedStyle.backgroundImage, "none");
  const sizes = layerList(carriers.size || computedStyle.backgroundSize, "auto");
  const positions = layerList(carriers.position || computedStyle.backgroundPosition, "0% 0%");
  const repeats = layerList(carriers.repeat || computedStyle.backgroundRepeat, "repeat");
  const origins = layerList(carriers.origin || computedStyle.backgroundOrigin, "padding-box");
  const clips = layerList(carriers.clip || computedStyle.backgroundClip, "border-box");
  const blends = layerList(carriers.blendMode || computedStyle.backgroundBlendMode, "normal");
  const attachments = layerList(carriers.attachment || computedStyle.backgroundAttachment, "scroll");
  const color = carriers.color || computedStyle.backgroundColor || "transparent";
  const layers = imageLayers.map((image, index) => {
    const common = {
      backgroundSize: listItem(sizes, index),
      backgroundPosition: listItem(positions, index),
      repeat: listItem(repeats, index),
      origin: listItem(origins, index),
      clip: listItem(clips, index),
      blendMode: listItem(blends, index),
      attachment: listItem(attachments, index),
    };
    if (image === "none") return normalizeLayer({ kind: "none", ...common });
    if (isCssGradient(image)) return normalizeLayer({ ...parseCssGradient(image), ...common });
    return normalizeLayer({
      kind: "image",
      url: parseCssUrl(image),
      imageSmoothing: canvasImageSmoothing(carriers.smoothing || computedStyle.imageRendering),
      ...(options.rasterIsOpaque === true ? { opaque: true } : {}),
      ...common,
    });
  });
  let descriptor: NormalizedPaintDescriptor;
  if (layers.length === 1 && layers[0]!.kind === "none") {
    descriptor = Object.freeze({ kind: "solid", color, clip: layers[0]!.clip });
  } else if (layers.length === 1) {
    descriptor = Object.freeze({ ...layers[0]!, color });
  } else {
    descriptor = Object.freeze({ kind: "layers", color, layers: Object.freeze(layers) });
  }
  validateNormalizedBlend(descriptor);
  return descriptor;
}

function opaqueBlendColor(input: unknown): boolean {
  const value = String(input).trim().toLowerCase();
  const hex = /^#([\da-f]+)$/u.exec(value)?.[1];
  if (hex) {
    if (hex.length === 3 || hex.length === 6) return true;
    if (hex.length === 4) return hex[3] === "f";
    if (hex.length === 8) return hex.endsWith("ff");
    return false;
  }
  const functional = /^(rgba?)\((.*)\)$/su.exec(value);
  if (!functional) return false;
  const body = functional[2]!;
  const slash = body.lastIndexOf("/");
  let alpha = slash < 0 ? null : body.slice(slash + 1).trim();
  if (alpha === null) {
    const parts = splitTopLevelCommas(body);
    if (parts.length === 4) alpha = parts[3]!;
    else if (functional[1] === "rgba") return false;
  }
  if (alpha === null) return true;
  if (alpha.endsWith("%")) return Number(alpha.slice(0, -1)) === 100;
  return Number(alpha) === 1;
}

function validateNormalizedBlend(paint: NormalizedPaintDescriptor): void {
  if (paint.kind === "solid") return;
  if (paint.kind === "layers") {
    if (paint.layers.some(({ blendMode }) => blendMode !== "normal")) {
      throw new TypeError("multiply requires exactly one raster background image");
    }
    return;
  }
  if (paint.kind === "image" && paint.blendMode === "multiply" && paint.opaque !== true) {
    throw new TypeError("multiply requires an explicitly opaque raster image");
  }
  if (paint.blendMode === "multiply" && !opaqueBlendColor(paint.color)) {
    throw new TypeError("multiply requires an opaque rgb() or hex background color");
  }
}

export function normalizePaintDescriptor(paint: unknown): NormalizedPaintDescriptor {
  if (!isRecord(paint)) throw new TypeError("paint descriptor is required");
  const box = paint.box === undefined
    ? undefined
    : normalizeBackgroundBoxMetrics(paint.box as BackgroundBoxMetricsInput);
  if (paint.kind === "solid") {
    if (!paint.color) throw new TypeError("solid paint requires a color");
    return Object.freeze({
      kind: "solid",
      color: String(paint.color),
      clip: parseBackgroundBox(paint.clip ?? paint.backgroundClip ?? "border-box", "background-clip"),
      ...(box ? { box } : {}),
    });
  }
  if (paint.kind === "layers") {
    const inputLayers = paint.layers;
    if (!Array.isArray(inputLayers) || inputLayers.length < 1) {
      throw new TypeError("layered paint requires at least one background layer");
    }
    const blendModes = paint.blendMode === undefined
      ? []
      : Array.isArray(paint.blendMode) ? paint.blendMode : [paint.blendMode];
    if (Array.from({ length: blendModes.length }, (_value, index) => blendModes[index])
      .some((mode) => String(mode).trim().toLowerCase() !== "normal")) {
      throw new TypeError("only normal background layer blending is supported");
    }
    const layers = Array.from(
      { length: inputLayers.length },
      (_value, index) => normalizeLayer(inputLayers[index]),
    );
    const descriptor = Object.freeze({
      kind: "layers",
      color: String(paint.color ?? "transparent"),
      layers: Object.freeze(layers),
      ...(box ? { box } : {}),
    });
    validateNormalizedBlend(descriptor);
    return descriptor;
  }
  const layer = normalizeLayer(paint);
  const color = String(paint.color ?? "transparent");
  const descriptor = Object.freeze({ ...layer, color, ...(box ? { box } : {}) });
  validateNormalizedBlend(descriptor);
  return descriptor;
}

function resolveSize(
  spec: BackgroundSizeSpec,
  areaWidth: number,
  areaHeight: number,
  intrinsicWidth: number,
  intrinsicHeight: number,
): PixelPair {
  if (spec.kind === "prepared") return [spec.width, spec.height];
  if (spec.kind === "cover") {
    const scale = Math.max(areaWidth / intrinsicWidth, areaHeight / intrinsicHeight);
    return [intrinsicWidth * scale, intrinsicHeight * scale];
  }
  if (spec.kind === "contain") {
    const scale = Math.min(areaWidth / intrinsicWidth, areaHeight / intrinsicHeight);
    return [intrinsicWidth * scale, intrinsicHeight * scale];
  }
  if (spec.kind !== "components") throw new TypeError("unsupported background-size specification");
  const width = spec.width.kind === "auto" ? null : Math.max(0, resolveLengthPercentage(spec.width.value, areaWidth));
  const height = spec.height.kind === "auto" ? null : Math.max(0, resolveLengthPercentage(spec.height.value, areaHeight));
  if (width === null && height === null) return [intrinsicWidth, intrinsicHeight];
  if (width === null) return [height! * intrinsicWidth / intrinsicHeight, height!];
  if (height === null) return [width, width * intrinsicHeight / intrinsicWidth];
  return [width, height];
}

function resolveGeneratedSize(
  spec: BackgroundSizeSpec,
  areaWidth: number,
  areaHeight: number,
): PixelPair {
  if (spec.kind === "prepared") return [spec.width, spec.height];
  if (spec.kind === "cover" || spec.kind === "contain") return [areaWidth, areaHeight];
  if (spec.kind !== "components") throw new TypeError("unsupported background-size specification");
  const width = spec.width.kind === "auto"
    ? areaWidth
    : Math.max(0, resolveLengthPercentage(spec.width.value, areaWidth));
  const height = spec.height.kind === "auto"
    ? areaHeight
    : Math.max(0, resolveLengthPercentage(spec.height.value, areaHeight));
  return [width, height];
}

function resolvePositionComponent(
  spec: BackgroundPositionComponent,
  areaSize: number,
  imageSize: number,
): number {
  if (spec.kind === "edge-position") {
    const freeSpace = areaSize - imageSize;
    const offset = spec.offset.px + spec.offset.percent * freeSpace;
    return spec.edge === "right" || spec.edge === "bottom"
      ? freeSpace - offset
      : offset;
  }
  return spec.px + spec.percent * (areaSize - imageSize);
}

function resolvePosition(
  spec: BackgroundPositionSpec,
  areaWidth: number,
  areaHeight: number,
  imageWidth: number,
  imageHeight: number,
): PixelPair {
  if (spec.kind === "prepared") return [spec.x, spec.y];
  return [
    resolvePositionComponent(spec.x, areaWidth, imageWidth),
    resolvePositionComponent(spec.y, areaHeight, imageHeight),
  ];
}

export function normalizeSideValues(input: unknown, label: string): Four<number> {
  if (input === undefined || input === null) return Object.freeze([0, 0, 0, 0]);
  if (typeof input === "number" && Number.isFinite(input) && input >= 0) {
    return Object.freeze([input, input, input, input]);
  }
  const values: unknown[] = Array.isArray(input)
    ? input
    : isRecord(input) ? [input.top, input.right, input.bottom, input.left] : [];
  if (!isFiniteSideTuple(values)) {
    throw new TypeError(`${label} must contain four finite non-negative sides`);
  }
  return frozenFour(values[0], values[1], values[2], values[3]);
}

function normalizeBackgroundBoxMetrics(
  input: Readonly<BackgroundBoxMetricsInput> | undefined = {},
): Readonly<BackgroundBoxMetrics> {
  return Object.freeze({
    border: normalizeSideValues(input.border, "background box border"),
    padding: normalizeSideValues(input.padding, "background box padding"),
  });
}

function insetArea(
  width: number,
  height: number,
  insets: Four<number>,
  name: BackgroundBox,
): Readonly<BackgroundArea> {
  const [top, right, bottom, left] = insets;
  return Object.freeze({
    name,
    x: Math.min(width, left),
    y: Math.min(height, top),
    width: Math.max(0, width - left - right),
    height: Math.max(0, height - top - bottom),
    insets: frozenFour(insets[0], insets[1], insets[2], insets[3]),
  });
}

function areaForBox(
  name: BackgroundBox,
  width: number,
  height: number,
  metrics: Readonly<BackgroundBoxMetrics>,
): Readonly<BackgroundArea> {
  if (name === "border-box") return insetArea(width, height, [0, 0, 0, 0], name);
  if (name === "padding-box") return insetArea(width, height, metrics.border, name);
  return insetArea(width, height, frozenFour(
    metrics.border[0] + metrics.padding[0],
    metrics.border[1] + metrics.padding[1],
    metrics.border[2] + metrics.padding[2],
    metrics.border[3] + metrics.padding[3],
  ), name);
}

function sizeUsesAuto(spec: BackgroundSizeSpec, axis: "width" | "height"): boolean {
  return spec.kind === "components" && spec[axis].kind === "auto";
}

function roundTileSizes(
  size: PixelPair,
  repeat: Readonly<BackgroundRepeat>,
  spec: BackgroundSizeSpec,
  area: Readonly<BackgroundArea>,
  preserveRatio: boolean,
): PixelPair {
  let [tileWidth, tileHeight] = size;
  if (repeat.x === "round" && tileWidth > 0 && area.width > 0) {
    const roundedWidth = area.width / Math.max(1, Math.round(area.width / tileWidth));
    if (preserveRatio && repeat.y !== "round" && sizeUsesAuto(spec, "height")) {
      tileHeight *= roundedWidth / tileWidth;
    }
    tileWidth = roundedWidth;
  }
  if (repeat.y === "round" && tileHeight > 0 && area.height > 0) {
    const roundedHeight = area.height / Math.max(1, Math.round(area.height / tileHeight));
    if (preserveRatio && repeat.x !== "round" && sizeUsesAuto(spec, "width")) {
      tileWidth *= roundedHeight / tileHeight;
    }
    tileHeight = roundedHeight;
  }
  return Object.freeze([tileWidth, tileHeight]);
}

const MAX_BACKGROUND_TILES = 65_536;

interface RepeatedAxisOptions {
  readonly areaSize: number;
  readonly areaStart: number;
  readonly clipSize: number;
  readonly clipStart: number;
  readonly mode: BackgroundRepeatMode;
  readonly position: number;
  readonly tileSize: number;
}

function repeatedAxisPositions({
  mode,
  areaStart,
  areaSize,
  clipStart,
  clipSize,
  tileSize,
  position,
}: RepeatedAxisOptions): readonly number[] {
  if (!(tileSize > 0) || !(clipSize > 0)) return Object.freeze([]);
  if (mode === "no-repeat" || (mode === "space" && Math.floor(areaSize / tileSize) < 2)) {
    return Object.freeze([position]);
  }
  let start = position;
  let step = tileSize;
  if (mode === "space") {
    const count = Math.floor(areaSize / tileSize);
    step = tileSize + (areaSize - count * tileSize) / (count - 1);
    start = areaStart;
  }
  const clipEnd = clipStart + clipSize;
  const firstIndex = Math.floor((clipStart - start) / step);
  const lastIndex = Math.ceil((clipEnd - start) / step);
  if (lastIndex - firstIndex + 1 > MAX_BACKGROUND_TILES) {
    throw new RangeError(`background repeat exceeds ${MAX_BACKGROUND_TILES} tiles on one axis`);
  }
  const values: number[] = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const value = start + index * step;
    if (value < clipEnd && value + tileSize > clipStart) values.push(value);
  }
  return Object.freeze(values);
}

function cornerDistances(width: number, height: number, center: PixelPair): readonly PixelPair[] {
  const [x, y] = center;
  return Object.freeze([
    Object.freeze([Math.abs(x), Math.abs(y)]),
    Object.freeze([Math.abs(width - x), Math.abs(y)]),
    Object.freeze([Math.abs(width - x), Math.abs(height - y)]),
    Object.freeze([Math.abs(x), Math.abs(height - y)]),
  ]) as readonly PixelPair[];
}

function radialRadii(
  descriptor: NormalizedRadialGradientLayer,
  width: number,
  height: number,
  center: PixelPair,
): PixelPair {
  if (descriptor.size.kind === "explicit") {
    const values = descriptor.size.radii;
    const rx = Math.max(0, resolveLengthPercentage(values[0]!, width));
    const ry = descriptor.shape === "circle"
      ? rx
      : Math.max(0, resolveLengthPercentage(values[1]!, height));
    if (![rx, ry].every((radius) => Number.isFinite(radius) && radius >= 0)) {
      throw new RangeError("radial-gradient radii must resolve finite and non-negative");
    }
    return Object.freeze([rx, ry]);
  }
  const distances = cornerDistances(width, height, center);
  const horizontal = distances.map(([x]) => x);
  const vertical = distances.map(([, y]) => y);
  const nearest = descriptor.size.value.startsWith("closest");
  if (descriptor.shape === "circle") {
    const candidates = descriptor.size.value.endsWith("side")
      ? [...horizontal, ...vertical]
      : distances.map(([x, y]) => Math.hypot(x, y));
    const radius = nearest ? Math.min(...candidates) : Math.max(...candidates);
    if (!(Number.isFinite(radius) && radius >= 0)) {
      throw new RangeError("radial-gradient radius must resolve finite and non-negative");
    }
    return Object.freeze([radius, radius]);
  }
  let rx = nearest ? Math.min(...horizontal) : Math.max(...horizontal);
  let ry = nearest ? Math.min(...vertical) : Math.max(...vertical);
  if (![rx, ry].every((radius) => Number.isFinite(radius) && radius >= 0)) {
    throw new RangeError("radial-gradient radii must resolve finite and non-negative");
  }
  if (descriptor.size.value.endsWith("corner")) {
    if (rx === 0 || ry === 0) return Object.freeze([rx, ry]);
    const scales = distances.map(([x, y]) => Math.hypot(x / rx, y / ry));
    const scale = nearest ? Math.min(...scales) : Math.max(...scales);
    rx *= scale;
    ry *= scale;
  }
  return Object.freeze([rx, ry]);
}

function resolveLayerForBox(
  descriptor: NormalizedBackgroundLayer,
  width: number,
  height: number,
  metrics: Readonly<BackgroundBoxMetrics>,
  image: CornerfillRasterSource | undefined = descriptor.kind === "image"
    ? descriptor.image
    : undefined,
): ResolvedBackgroundLayer {
  const clipArea = areaForBox(descriptor.clip ?? "border-box", width, height, metrics);
  if (descriptor.kind === "none") {
    return Object.freeze({ ...descriptor, clipArea, boxMetrics: metrics });
  }
  if (descriptor.kind === "image" && !image) {
    throw new TypeError("resolved image paint requires a decoded image");
  }
  const positioningArea = areaForBox(descriptor.origin ?? "padding-box", width, height, metrics);
  let backgroundSize;
  if (descriptor.kind === "image") {
    const [intrinsicWidth, intrinsicHeight] = rasterSourceDimensions(image!);
    backgroundSize = resolveSize(
      descriptor.backgroundSizeSpec,
      positioningArea.width,
      positioningArea.height,
      intrinsicWidth,
      intrinsicHeight,
    );
  } else {
    backgroundSize = resolveGeneratedSize(
      descriptor.backgroundSizeSpec,
      positioningArea.width,
      positioningArea.height,
    );
  }
  if (backgroundSize.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("resolved background size must be finite and non-negative");
  }
  backgroundSize = roundTileSizes(
    backgroundSize,
    descriptor.repeat,
    descriptor.backgroundSizeSpec,
    positioningArea,
    descriptor.kind === "image",
  );
  const localPosition = resolvePosition(
    descriptor.backgroundPositionSpec,
    positioningArea.width,
    positioningArea.height,
    backgroundSize[0],
    backgroundSize[1],
  );
  const backgroundPosition: PixelPair = Object.freeze([
    positioningArea.x + localPosition[0],
    positioningArea.y + localPosition[1],
  ]);
  const xPositions = repeatedAxisPositions({
    mode: descriptor.repeat.x,
    areaStart: positioningArea.x,
    areaSize: positioningArea.width,
    clipStart: clipArea.x,
    clipSize: clipArea.width,
    tileSize: backgroundSize[0],
    position: backgroundPosition[0],
  });
  const yPositions = repeatedAxisPositions({
    mode: descriptor.repeat.y,
    areaStart: positioningArea.y,
    areaSize: positioningArea.height,
    clipStart: clipArea.y,
    clipSize: clipArea.height,
    tileSize: backgroundSize[1],
    position: backgroundPosition[1],
  });
  if (xPositions.length * yPositions.length > MAX_BACKGROUND_TILES) {
    throw new RangeError(`background repeat exceeds ${MAX_BACKGROUND_TILES} tiles`);
  }
  const resolvedCommon: ResolvedLayerCommon = Object.freeze({
    backgroundSize: Object.freeze(backgroundSize),
    backgroundPosition,
    positioningArea,
    clipArea,
    boxMetrics: metrics,
    tilePlan: Object.freeze({ x: xPositions, y: yPositions }),
  });
  if (descriptor.kind === "radial-gradient") {
    const gradientCenter = Object.freeze(resolvePosition(
      descriptor.centerSpec,
      backgroundSize[0],
      backgroundSize[1],
      0,
      0,
    ));
    return Object.freeze({
      ...descriptor,
      ...resolvedCommon,
      gradientCenter,
      gradientRadii: radialRadii(
        descriptor,
        backgroundSize[0],
        backgroundSize[1],
        gradientCenter,
      ),
    });
  }
  if (descriptor.kind === "conic-gradient") {
    return Object.freeze({
      ...descriptor,
      ...resolvedCommon,
      gradientCenter: Object.freeze(resolvePosition(
        descriptor.centerSpec,
        backgroundSize[0],
        backgroundSize[1],
        0,
        0,
      )),
    });
  }
  if (descriptor.kind === "image") {
    return Object.freeze({ ...descriptor, ...resolvedCommon, image: image! });
  }
  return Object.freeze({ ...descriptor, ...resolvedCommon });
}

export function resolvePaintForBox(
  descriptor: NormalizedPaintDescriptor,
  width: number,
  height: number,
  image: CornerfillRasterSource | undefined = descriptor.kind === "image"
    ? descriptor.image
    : undefined,
  boxMetrics: Readonly<BackgroundBoxMetricsInput> | undefined = descriptor.box,
): ResolvedPaintDescriptor {
  const metrics = normalizeBackgroundBoxMetrics(boxMetrics);
  if (descriptor.kind === "solid") {
    const clipArea = areaForBox(descriptor.clip ?? "border-box", width, height, metrics);
    return Object.freeze({ ...descriptor, clipArea, boxMetrics: metrics });
  }
  if (descriptor.kind === "layers") {
    const layers = descriptor.layers.map((layer) => resolveLayerForBox(
      layer,
      width,
      height,
      metrics,
      layer.kind === "image" ? layer.image : undefined,
    ));
    return Object.freeze({
      ...descriptor,
      layers: Object.freeze(layers),
      colorClipArea: layers.at(-1)!.clipArea,
      boxMetrics: metrics,
    });
  }
  return Object.freeze({
    ...resolveLayerForBox(descriptor, width, height, metrics, image),
    color: descriptor.color,
  });
}

const decodedImageIdentities = new WeakMap<object, number>();
let nextDecodedImageIdentity = 1;

function decodedImageIdentity(image: CornerfillRasterSource | undefined): number | null {
  if (!image) return null;
  let identity = decodedImageIdentities.get(image);
  if (identity === undefined) {
    identity = nextDecodedImageIdentity;
    nextDecodedImageIdentity += 1;
    decodedImageIdentities.set(image, identity);
  }
  return identity;
}

function backgroundLayerKey(
  descriptor: NormalizedBackgroundLayer,
): Readonly<Record<string, unknown>> {
  if (descriptor.kind === "image") {
    return {
      kind: descriptor.kind,
      url: descriptor.url ?? "decoded-image",
      image: decodedImageIdentity(descriptor.image),
      sourceSize: descriptor.sourceSize ?? null,
      size: descriptor.backgroundSizeSpec,
      position: descriptor.backgroundPositionSpec,
      repeat: descriptor.repeat,
      origin: descriptor.origin,
      clip: descriptor.clip,
      crossOrigin: descriptor.crossOrigin ?? null,
      smoothing: descriptor.imageSmoothing,
      opaque: descriptor.opaque === true,
      blendMode: descriptor.blendMode,
      attachment: descriptor.attachment,
    };
  }
  return { ...descriptor };
}

export function paintDescriptorKey(descriptor: NormalizedPaintDescriptor): string {
  if (descriptor.kind === "solid") return `solid:${descriptor.color}:${descriptor.clip}`;
  if (descriptor.kind === "layers") return JSON.stringify({
    kind: descriptor.kind,
    color: descriptor.color,
    layers: descriptor.layers.map(backgroundLayerKey),
  });
  return JSON.stringify({
    ...backgroundLayerKey(descriptor),
    color: descriptor.color,
    box: descriptor.box ?? null,
  });
}
