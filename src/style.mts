import { parseBackgroundPosition } from "./background.mjs";
import type {
  BackgroundPositionComponent,
  BackgroundPositionSpec,
  ComputedPaintCarriers,
} from "./background.mjs";
import type { CornerfillElement } from "./ownership.mjs";
import { serializeShapeParameter } from "./values.mjs";
import type {
  BorderRadiusDeclarations,
  CornerShapeDeclarations,
  CornerShapeSource,
  CornerWritingOptions,
  Four,
  ResolvedCornerRadius,
} from "./values.mjs";

type UnknownRecord = Record<string, unknown>;
type Radius = Readonly<ResolvedCornerRadius>;
export type PhysicalRadiusValues = NonNullable<BorderRadiusDeclarations["physical"]>;
type PhysicalShapeValues = NonNullable<CornerShapeDeclarations["physical"]>;
export type RadiusSource =
  | string
  | Four<Radius>
  | BorderRadiusDeclarations
  | Readonly<{ kind: "longhands"; values: Four<string> }>;

interface BackgroundPositionEntry {
  dynamicBackgroundPositionSpec: BackgroundPositionSpec | null;
  readonly element: ElementCSSInlineStyle;
  readonly initial: Readonly<{
    readonly dynamic: Readonly<{ paintPosition: boolean }>;
    readonly initialBackgroundPosition: string;
  }> | null;
  inlineBackgroundPositionX: string;
  inlineBackgroundPositionY: string;
}

type AuthoredStyleReader = <T>(callback: (computed: CSSStyleDeclaration) => T) => T;

export interface NativeDeclarationRecord {
  readonly ownedPresent: boolean;
  readonly ownedPriority: string;
  readonly ownedValue: string;
  readonly present: boolean;
  readonly priority: string;
  readonly value: string;
}

interface NativeDeclarationOwner {
  readonly element: CornerfillElement;
  readonly saved: Map<string, Readonly<NativeDeclarationRecord>> | null;
  readonly savedDeclarationOrder: readonly string[] | null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === "object";
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

export function isRadiusTuple(value: unknown): value is Four<Radius> {
  return Array.isArray(value) && value.length === 4 && value.every(isRadius);
}

function isShapeTuple(value: unknown): value is Four<number> {
  return Array.isArray(value)
    && value.length === 4
    && value.every((corner): corner is number => (
      typeof corner === "number" && !Number.isNaN(corner)
    ));
}

export const RADIUS_LONGHANDS = Object.freeze([
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
]);

export const LOGICAL_RADIUS_LONGHANDS = Object.freeze([
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-end-radius",
  "border-end-start-radius",
]);

export const PHYSICAL_SHAPE_LONGHANDS = Object.freeze([
  "corner-top-left-shape",
  "corner-top-right-shape",
  "corner-bottom-right-shape",
  "corner-bottom-left-shape",
]);

export const LOGICAL_SHAPE_LONGHANDS = Object.freeze([
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

export const CARRIER = Object.freeze({
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

export const PAINT_CARRIERS = Object.freeze([
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

export const ALL_CARRIERS = Object.freeze([
  ...Object.values(CARRIER),
  ...Object.values(RADIUS_PHYSICAL_CARRIERS),
  ...Object.values(RADIUS_LOGICAL_CARRIERS),
  ...Object.values(SHAPE_PHYSICAL_CARRIERS),
  ...Object.values(SHAPE_LOGICAL_CARRIERS),
]);

export const NATIVE_RADIUS_PROPERTIES = Object.freeze([
  "border-radius",
  ...RADIUS_LONGHANDS,
  ...LOGICAL_RADIUS_LONGHANDS,
]);

export const NATIVE_SHAPE_PROPERTIES = Object.freeze([
  "corner-shape",
  ...PHYSICAL_SHAPE_LONGHANDS,
  ...LOGICAL_SHAPE_LONGHANDS,
]);

export const NATIVE_OWNED_PROPERTIES = Object.freeze([
  ...NATIVE_SHAPE_PROPERTIES,
  ...NATIVE_RADIUS_PROPERTIES,
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

function validateNativeDeclarations(
  element: CornerfillElement,
  declarations: readonly (readonly [property: string, value: string])[],
  label: string,
): void {
  const scratch = element.ownerDocument?.createElement?.("div")?.style;
  if (!scratch) return;
  for (const [property, value] of declarations) {
    scratch.removeProperty(property);
    scratch.setProperty(property, value);
    if (!scratch.getPropertyValue(property)) {
      throw new SyntaxError(`invalid native ${label} value for ${property}: ${value}`);
    }
  }
}

export function nativeRadiusDeclarations(
  element: CornerfillElement,
  source: unknown,
): readonly (readonly [property: string, value: string])[] {
  const declarations: [string, string][] = [];
  if (typeof source === "string") {
    declarations.push(["border-radius", source]);
  } else if (Array.isArray(source)) {
    if (!isRadiusTuple(source)) {
      throw new TypeError("native resolved radii must contain four finite corners");
    }
    declarations.push(["border-radius", `${source.map(({ rx }) => `${rx}px`).join(" ")} / ${source.map(({ ry }) => `${ry}px`).join(" ")}`]);
  } else {
    if (!isRecord(source)) throw new TypeError("unsupported native border-radius source");
    if (source.kind === "longhands") {
      if (!Array.isArray(source.values) || source.values.length !== 4
        || !source.values.every((value) => typeof value === "string")) {
        throw new TypeError("native radius longhands must contain four CSS strings");
      }
      const values = source.values as readonly string[];
      declarations.push(...RADIUS_LONGHANDS.map((property, index): [string, string] => [property, values[index]!]));
    } else {
      declarations.push(["border-radius", String(source.shorthand ?? "0")]);
      const physical = isRecord(source.physical) ? source.physical : {};
      for (const [corner, value] of Object.entries(physical)) {
        declarations.push([nativeLonghandProperty(
          corner,
          PHYSICAL_RADIUS_PROPERTY_BY_CORNER,
          RADIUS_LONGHANDS,
          "physical radius corner",
        ), String(value)]);
      }
      const logical = isRecord(source.logical) ? source.logical : {};
      for (const [corner, value] of Object.entries(logical)) {
        declarations.push([nativeLonghandProperty(
          corner,
          LOGICAL_RADIUS_PROPERTY_BY_CORNER,
          LOGICAL_RADIUS_LONGHANDS,
          "logical radius corner",
        ), String(value)]);
      }
    }
  }
  validateNativeDeclarations(element, declarations, "border-radius");
  return Object.freeze(declarations.map((declaration) => Object.freeze(declaration)));
}

export function nativeShapeDeclarations(
  element: CornerfillElement,
  source: unknown,
): readonly (readonly [property: string, value: string])[] {
  const declarations: [string, string][] = [];
  if (typeof source === "string") {
    declarations.push(["corner-shape", source]);
  } else if (Array.isArray(source)) {
    if (!isShapeTuple(source)) throw new TypeError("native resolved shapes must contain four corners");
    declarations.push(["corner-shape", source.map(serializeShapeParameter).join(" ")]);
  } else {
    if (!isRecord(source)) throw new TypeError("unsupported native corner-shape source");
    declarations.push(["corner-shape", String(source.shorthand ?? "round")]);
    const physical = isRecord(source.physical) ? source.physical : {};
    for (const [corner, value] of Object.entries(physical)) {
      declarations.push([nativeLonghandProperty(
        corner,
        PHYSICAL_SHAPE_PROPERTY_BY_CORNER,
        PHYSICAL_SHAPE_LONGHANDS,
        "physical shape corner",
      ), String(value)]);
    }
    const logical = isRecord(source.logical) ? source.logical : {};
    for (const [corner, value] of Object.entries(logical)) {
      declarations.push([nativeLonghandProperty(
        corner,
        LOGICAL_SHAPE_PROPERTY_BY_CORNER,
        LOGICAL_SHAPE_LONGHANDS,
        "logical shape corner",
      ), String(value)]);
    }
  }
  validateNativeDeclarations(element, declarations, "corner-shape");
  return Object.freeze(declarations.map((declaration) => Object.freeze(declaration)));
}

export function writeNativeDeclarations(
  entry: NativeDeclarationOwner,
  properties: readonly string[],
  declarations: readonly (readonly [property: string, value: string])[],
): void {
  const saved = entry.saved;
  if (!saved) throw new Error("native declaration ownership is unavailable");
  const declared = Array.from(
    { length: entry.element.style.length },
    (_value, index) => entry.element.style.item(index),
  );
  const originalOrder = entry.savedDeclarationOrder ?? declared;
  for (const property of properties) {
    if (!saved.has(property)) {
      const order = originalOrder.indexOf(property);
      saved.set(property, Object.freeze({
        present: order >= 0,
        value: entry.element.style.getPropertyValue(property),
        priority: entry.element.style.getPropertyPriority(property),
        ownedPresent: false,
        ownedValue: "",
        ownedPriority: "",
      }));
    }
  }
  for (const property of properties) entry.element.style.removeProperty(property);
  for (const [property, value] of declarations) entry.element.style.setProperty(property, value);
  const ownedDeclarations = new Set(Array.from(
    { length: entry.element.style.length },
    (_value, index) => entry.element.style.item(index),
  ));
  for (const property of properties) {
    const original = saved.get(property)!;
    saved.set(property, Object.freeze({
      ...original,
      ownedPresent: ownedDeclarations.has(property),
      ownedValue: entry.element.style.getPropertyValue(property),
      ownedPriority: entry.element.style.getPropertyPriority(property),
    }));
  }
}

export function restoreNativeDeclarationGroup(
  entry: NativeDeclarationOwner,
  properties: readonly string[],
): void {
  const saved = entry.saved;
  const originalOrder = entry.savedDeclarationOrder;
  if (!saved || !originalOrder) return;
  const style = entry.element.style;
  const currentOrder = Array.from(
    { length: style.length },
    (_value, index) => style.item(index),
  );
  const currentProperties = new Set(currentOrder);
  const desired = new Map(currentOrder.map((property) => [property, Object.freeze({
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property),
  })]));
  const records = properties.flatMap((property) => {
    const record = saved.get(property);
    return record ? [Object.freeze({ property, record })] : [];
  });
  let changed = false;
  for (const { property, record } of records) {
    const currentPresent = currentProperties.has(property);
    const stillOwned = currentPresent === record.ownedPresent
      && (!currentPresent || (
        style.getPropertyValue(property) === record.ownedValue
        && style.getPropertyPriority(property) === record.ownedPriority
      ));
    if (!stillOwned) continue;
    changed = true;
    if (record.present) {
      desired.set(property, Object.freeze({ value: record.value, priority: record.priority }));
    } else {
      desired.delete(property);
    }
  }
  if (!changed) return;

  const reposition = new Set(records
    .filter(({ property, record }) => record.present && desired.has(property))
    .map(({ property }) => property));
  const order = currentOrder.filter((property) => desired.has(property) && !reposition.has(property));
  for (let index = 0; index < originalOrder.length; index += 1) {
    const property = originalOrder[index]!;
    if (!reposition.has(property)) continue;
    const next = originalOrder.slice(index + 1).find((candidate) => order.includes(candidate));
    if (next) {
      order.splice(order.indexOf(next), 0, property);
      continue;
    }
    const previous = originalOrder.slice(0, index).reverse().find((candidate) => order.includes(candidate));
    if (previous) order.splice(order.indexOf(previous) + 1, 0, property);
    else order.push(property);
  }
  for (const property of desired.keys()) if (!order.includes(property)) order.push(property);

  for (const property of currentOrder) style.removeProperty(property);
  for (const property of order) {
    const declaration = desired.get(property)!;
    style.setProperty(property, declaration.value, declaration.priority);
  }
}

export function readCarrier(computed: CSSStyleDeclaration, name: string): string {
  const value = computed.getPropertyValue(name).trim();
  return value === "__cornerfill_unset__" || /^(?:initial|unset)$/iu.test(value) ? "" : value;
}

export function readColorCarrier(computed: CSSStyleDeclaration, name: string): string {
  const value = readCarrier(computed, name);
  return /^currentcolor$/iu.test(value) ? computed.color : value;
}

export function readShadowCarrier(computed: CSSStyleDeclaration): string {
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

export function readBorderColorCarriers(computed: CSSStyleDeclaration): string | readonly string[] {
  const sides = [
    CARRIER.borderTopColor,
    CARRIER.borderRightColor,
    CARRIER.borderBottomColor,
    CARRIER.borderLeftColor,
  ].map((property) => readColorCarrier(computed, property));
  if (sides.some(Boolean)) return sides;
  return readColorCarrier(computed, CARRIER.borderColor);
}

export function readPaintCarriers(computed: CSSStyleDeclaration): Readonly<ComputedPaintCarriers> {
  return {
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
  };
}

export function flowFromComputed(computed: CSSStyleDeclaration): Required<CornerWritingOptions> {
  return Object.freeze({
    writingMode: (computed.writingMode || "horizontal-tb") as Required<CornerWritingOptions>["writingMode"],
    direction: (computed.direction || "ltr") as Required<CornerWritingOptions>["direction"],
  });
}

function positionAxisSpec(axis: "x" | "y", value: string): BackgroundPositionComponent {
  const parsed = parseBackgroundPosition(axis === "x" ? `${value} 0px` : `0px ${value}`);
  if (parsed.kind !== "components") throw new TypeError("background position did not resolve to components");
  return parsed[axis];
}

export function captureBackgroundPosition(
  entry: BackgroundPositionEntry,
  readAuthoredStyle: AuthoredStyleReader,
): boolean {
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
    authored = readAuthoredStyle((computed) => (
      parseBackgroundPosition(
        computed.getPropertyValue("background-position").trim()
          || computed.backgroundPosition
          || initial.initialBackgroundPosition
          || "0% 0%",
      ) as Extract<BackgroundPositionSpec, { kind: "components" }>
    ));
  }
  if (xChanged) x = xValue ? positionAxisSpec("x", xValue) : authored!.x;
  if (yChanged) y = yValue ? positionAxisSpec("y", yValue) : authored!.y;
  entry.inlineBackgroundPositionX = xValue;
  entry.inlineBackgroundPositionY = yValue;
  const next = Object.freeze({ kind: "components" as const, x, y });
  const changed = JSON.stringify(next) !== JSON.stringify(previous);
  entry.dynamicBackgroundPositionSpec = next;
  return changed;
}

export function canRefreshDynamicPaint({
  explicitPaint,
  fullRefresh,
  paintKind,
  paintPosition,
  reason,
}: Readonly<{
  explicitPaint: boolean;
  fullRefresh: boolean;
  paintKind: string;
  paintPosition: boolean;
  reason: string | null;
}>): boolean {
  return reason === "background-position"
    && paintPosition
    && paintKind === "image"
    && !explicitPaint
    && !fullRefresh;
}

function physicalRadiusValues(computed: CSSStyleDeclaration): PhysicalRadiusValues {
  return Object.freeze({
    "top-left": computed.getPropertyValue(RADIUS_LONGHANDS[0]!),
    "top-right": computed.getPropertyValue(RADIUS_LONGHANDS[1]!),
    "bottom-right": computed.getPropertyValue(RADIUS_LONGHANDS[2]!),
    "bottom-left": computed.getPropertyValue(RADIUS_LONGHANDS[3]!),
  });
}

export function physicalShapeValues(computed: CSSStyleDeclaration): PhysicalShapeValues {
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

export function captureRadiusCarriers(
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

export function captureShapeCarriers(
  computed: CSSStyleDeclaration,
  baseline: Readonly<ShapeCarrierBaseline>,
): Readonly<ShapeCarrierCapture>;
export function captureShapeCarriers(
  computed: CSSStyleDeclaration,
  baseline?: null,
): Readonly<ShapeCarrierCapture> | null;
export function captureShapeCarriers(
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
