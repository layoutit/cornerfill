import {
  captureComputedPaint,
  normalizePaintDescriptor,
  parseBackgroundPosition,
  paintDescriptorKey,
  resolvePaintForBox,
} from "./background.mjs";
import {
  createSurface,
  detectSurfaceCapabilities,
  getSurfaceResourceStats,
} from "./backends.mjs";
import {
  buildCornerGeometry,
} from "./geometry.mjs";
import { ImageCache } from "./images.mjs";
import { nextDocumentId } from "./identity.mjs";
import { CORNERFILL_ORACLE_QUALIFICATION, qualifyNativeCornerShape } from "./native.mjs";
import {
  createPreparedOpaqueImageProgram,
  drawPreparedOpaqueImage,
  explainPreparedOpaqueImage,
  paintCornerfill,
  preparePreparedOpaqueImageContext,
  repaintOpaqueCornerfill,
  validatePreparedOpaqueImagePosition,
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
const elementOwners = new WeakMap();

class StaleEntryWorkError extends Error {
  constructor() {
    super("Cornerfill entry work was superseded or cancelled");
    this.name = "StaleEntryWorkError";
  }
}

function nextControllerId(document) {
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
));

const LOGICAL_RADIUS_PROPERTY_BY_CORNER = Object.freeze(Object.fromEntries(
  ["start-start", "start-end", "end-end", "end-start"].map((corner, index) => (
    [corner, LOGICAL_RADIUS_LONGHANDS[index]]
  )),
));

const PHYSICAL_SHAPE_PROPERTY_BY_CORNER = Object.freeze(Object.fromEntries(
  ["top-left", "top-right", "bottom-right", "bottom-left"].map((corner, index) => (
    [corner, PHYSICAL_SHAPE_LONGHANDS[index]]
  )),
));

const LOGICAL_SHAPE_PROPERTY_BY_CORNER = Object.freeze(Object.fromEntries(
  ["start-start", "start-end", "end-end", "end-start"].map((corner, index) => (
    [corner, LOGICAL_SHAPE_LONGHANDS[index]]
  )),
));

function nativeLonghandProperty(input, byCorner, validProperties, label) {
  if (Object.hasOwn(byCorner, input)) return byCorner[input];
  if (validProperties.includes(input)) return input;
  throw new TypeError(`invalid ${label}: ${input}`);
}

function clearNativeProperties(element, properties) {
  for (const property of properties) element.style.removeProperty(property);
}

function applyNativeRadiusSource(element, source) {
  clearNativeProperties(element, NATIVE_RADIUS_PROPERTIES);
  if (typeof source === "string") {
    element.style.setProperty("border-radius", source);
    return;
  }
  if (Array.isArray(source)) {
    if (source.length !== 4 || source.some(({ rx, ry }) => !Number.isFinite(rx) || !Number.isFinite(ry))) {
      throw new TypeError("native resolved radii must contain four finite corners");
    }
    element.style.setProperty("border-radius", `${source.map(({ rx }) => `${rx}px`).join(" ")} / ${source.map(({ ry }) => `${ry}px`).join(" ")}`);
    return;
  }
  if (!source || typeof source !== "object") throw new TypeError("unsupported native border-radius source");
  element.style.setProperty("border-radius", source.shorthand ?? "0");
  for (const [corner, value] of Object.entries(source.physical ?? {})) {
    element.style.setProperty(nativeLonghandProperty(
      corner,
      PHYSICAL_RADIUS_PROPERTY_BY_CORNER,
      RADIUS_LONGHANDS,
      "physical radius corner",
    ), value);
  }
  for (const [corner, value] of Object.entries(source.logical ?? {})) {
    element.style.setProperty(nativeLonghandProperty(
      corner,
      LOGICAL_RADIUS_PROPERTY_BY_CORNER,
      LOGICAL_RADIUS_LONGHANDS,
      "logical radius corner",
    ), value);
  }
}

function applyNativeShapeSource(element, source) {
  clearNativeProperties(element, NATIVE_SHAPE_PROPERTIES);
  if (typeof source === "string") {
    element.style.setProperty("corner-shape", source);
    return;
  }
  if (Array.isArray(source)) {
    if (source.length !== 4) throw new TypeError("native resolved shapes must contain four corners");
    element.style.setProperty("corner-shape", source.map(serializeShapeParameter).join(" "));
    return;
  }
  if (!source || typeof source !== "object") throw new TypeError("unsupported native corner-shape source");
  element.style.setProperty("corner-shape", source.shorthand ?? "round");
  for (const [corner, value] of Object.entries(source.physical ?? {})) {
    element.style.setProperty(nativeLonghandProperty(
      corner,
      PHYSICAL_SHAPE_PROPERTY_BY_CORNER,
      PHYSICAL_SHAPE_LONGHANDS,
      "physical shape corner",
    ), value);
  }
  for (const [corner, value] of Object.entries(source.logical ?? {})) {
    element.style.setProperty(nativeLonghandProperty(
      corner,
      LOGICAL_SHAPE_PROPERTY_BY_CORNER,
      LOGICAL_SHAPE_LONGHANDS,
      "logical shape corner",
    ), value);
  }
}

function readCarrier(computed, name) {
  const value = computed.getPropertyValue(name).trim();
  return value === "__cornerfill_unset__" ? "" : value;
}

function readColorCarrier(computed, name) {
  const value = readCarrier(computed, name);
  return /^currentcolor$/iu.test(value) ? computed.color : value;
}

function readShadowCarrier(computed) {
  return readCarrier(computed, CARRIER.boxShadow)
    .replaceAll(/\bcurrentcolor\b/giu, computed.color);
}

function readCarrierMap(computed, carriers) {
  const values = {};
  for (const [corner, property] of Object.entries(carriers)) {
    const value = readCarrier(computed, property);
    if (value) values[corner] = value;
  }
  return Object.freeze(values);
}

function readBorderColorCarriers(computed) {
  const sides = [
    CARRIER.borderTopColor,
    CARRIER.borderRightColor,
    CARRIER.borderBottomColor,
    CARRIER.borderLeftColor,
  ].map((property) => readColorCarrier(computed, property));
  if (sides.some(Boolean)) return sides;
  return readColorCarrier(computed, CARRIER.borderColor);
}

function flowFromComputed(computed) {
  return Object.freeze({
    writingMode: computed.writingMode || "horizontal-tb",
    direction: computed.direction || "ltr",
  });
}

function physicalRadiusValues(computed) {
  return Object.freeze(Object.fromEntries(RADIUS_LONGHANDS.map((property, index) => [
    ["top-left", "top-right", "bottom-right", "bottom-left"][index],
    computed.getPropertyValue(property),
  ])));
}

function physicalShapeValues(computed) {
  const values = {};
  for (let index = 0; index < PHYSICAL_SHAPE_LONGHANDS.length; index += 1) {
    const value = computed.getPropertyValue(PHYSICAL_SHAPE_LONGHANDS[index]).trim();
    if (value) values[["top-left", "top-right", "bottom-right", "bottom-left"][index]] = value;
  }
  return Object.freeze(values);
}

function captureRadiusCarriers(computed, baselinePhysical = null) {
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

function captureShapeCarriers(computed, baseline = null) {
  const shorthand = readCarrier(computed, CARRIER.shape);
  const carrierPhysical = readCarrierMap(computed, SHAPE_PHYSICAL_CARRIERS);
  const logical = readCarrierMap(computed, SHAPE_LOGICAL_CARRIERS);
  const present = Boolean(shorthand)
    || Object.keys(carrierPhysical).length > 0
    || Object.keys(logical).length > 0;
  if (!present && !baseline) return null;
  const capturedBaseline = baseline ?? Object.freeze({
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
    }),
  });
}

function numberFromPx(value) {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function measureBorderBox(element, computed) {
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

function hasPaintedPseudo(view, element, pseudo) {
  const computed = view.getComputedStyle(element, pseudo);
  return computed.display !== "none" && !new Set(["", "none", "normal"]).has(computed.content);
}

function hasHostForeground(view, element, computed = view.getComputedStyle(element)) {
  const childContent = [...element.childNodes].some((node) => (
    node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim() !== "")
  ));
  const shadowContent = [...(element.shadowRoot?.childNodes ?? [])].some((node) => (
    node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim() !== "")
  ));
  const listMarker = computed.display === "list-item"
    && (computed.listStyleType !== "none" || computed.listStyleImage !== "none");
  return childContent
    || shadowContent
    || listMarker
    || hasPaintedPseudo(view, element, "::before")
    || hasPaintedPseudo(view, element, "::after");
}

function inspectFallbackHost(view, element, computed) {
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

function assertOutlineHost(view, element, outline) {
  if (outline && hasHostForeground(view, element)) {
    throw new TypeError(
      "A contained outline can be painted only on an empty, paint-owned host without foreground or pseudo-element content.",
    );
  }
}

function assertFallbackRequirements(requirements = {}) {
  if (requirements.overflowClip) throw new Error(CORNERFILL_LIMITATIONS.descendantOverflowClipping.reason);
  if (requirements.hitTest) throw new Error(CORNERFILL_LIMITATIONS.shapedHitTesting.reason);
  if (requirements.replacedContent) throw new Error(CORNERFILL_LIMITATIONS.replacedContentClipping.reason);
  if (requirements.fragmentedBox) throw new Error(CORNERFILL_LIMITATIONS.fragmentedBoxes.reason);
  if (requirements.backdropFilterClip) throw new Error(CORNERFILL_LIMITATIONS.backdropFilterClipping.reason);
}

function backgroundBoxMetrics(computed) {
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
  });
}

function captureOwnershipState(element) {
  return Object.freeze({
    owner: element.getAttribute(OWNERSHIP_ATTRIBUTE),
    borderOwner: element.getAttribute(OWNED_BORDER_ATTRIBUTE),
    surfaceOwner: element.getAttribute(OWNED_SURFACE_ATTRIBUTE),
  });
}

function restoreOwnershipState(element, snapshot) {
  if (snapshot.owner === null) element.removeAttribute(OWNERSHIP_ATTRIBUTE);
  else element.setAttribute(OWNERSHIP_ATTRIBUTE, snapshot.owner);
  if (snapshot.borderOwner === null) element.removeAttribute(OWNED_BORDER_ATTRIBUTE);
  else element.setAttribute(OWNED_BORDER_ATTRIBUTE, snapshot.borderOwner);
  if (snapshot.surfaceOwner === null) element.removeAttribute(OWNED_SURFACE_ATTRIBUTE);
  else element.setAttribute(OWNED_SURFACE_ATTRIBUTE, snapshot.surfaceOwner);
}

function assertCooperativeOwnership(element) {
  const conflicts = COOPERATIVE_OWNERSHIP_PROPERTIES.filter(
    (property) => element.style.getPropertyPriority(property) === "important",
  );
  if (conflicts.length > 0) {
    throw new TypeError(
      `${CORNERFILL_LIMITATIONS.authorImportantOwnership.reason} Conflicts: ${conflicts.join(", ")}`,
    );
  }
}

function claimElement(entry) {
  const existing = elementOwners.get(entry.element);
  if (existing && existing !== entry && !existing.disposed) {
    throw new Error("element is already attached to another Cornerfill controller");
  }
  elementOwners.set(entry.element, entry);
}

function assertElementAvailable(element) {
  const existing = elementOwners.get(element);
  if (existing && !existing.disposed) {
    throw new Error("element is already attached to another Cornerfill controller");
  }
}

function releaseElement(entry) {
  if (elementOwners.get(entry.element) === entry) elementOwners.delete(entry.element);
}

function captureBorder(computed, colorOverride = "") {
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
  if (styles.some((style, index) => widths[index] > 0 && style !== "solid")) {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  const computedColors = [
    computed.borderTopColor,
    computed.borderRightColor,
    computed.borderBottomColor,
    computed.borderLeftColor,
  ];
  const colors = Array.isArray(colorOverride)
    ? colorOverride.map((color, index) => color || computedColors[index])
    : computedColors;
  const paintedColors = colors.filter((_, index) => widths[index] > 0);
  if (!paintedColors.every((color) => color === paintedColors[0])) {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  return normalizeBorder({
    widths,
    color: typeof colorOverride === "string" && colorOverride ? colorOverride : paintedColors[0],
  });
}

function borderSides(input, label) {
  if (Number.isFinite(input) && input >= 0) return [input, input, input, input];
  const values = Array.isArray(input)
    ? input
    : [input?.top, input?.right, input?.bottom, input?.left];
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TypeError(`${label} must contain four finite non-negative sides`);
  }
  return [...values];
}

function normalizeBorder(border) {
  if (border === null || border === undefined) return null;
  const widths = borderSides(border.widths ?? border.width ?? 0, "border widths");
  if (widths.every((width) => width === 0)) return null;
  const styles = border.styles ?? border.style ?? "solid";
  const styleSides = (typeof styles === "string"
    ? [styles, styles, styles, styles]
    : Array.isArray(styles) ? [...styles] : [styles.top, styles.right, styles.bottom, styles.left])
    .map((style) => String(style).toLowerCase());
  if (styleSides.length !== 4
    || styleSides.some((style, index) => widths[index] > 0 && style !== "solid")) {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  const colors = border.colors ?? border.color;
  const colorSides = typeof colors === "string"
    ? [colors, colors, colors, colors]
    : Array.isArray(colors) ? [...colors] : [colors?.top, colors?.right, colors?.bottom, colors?.left];
  if (colorSides.length !== 4 || colorSides.some((color, index) => widths[index] > 0 && !color)) {
    throw new TypeError("painted border sides require colors");
  }
  const paintedColors = colorSides.filter((_, index) => widths[index] > 0).map(String);
  if (!paintedColors.every((color) => color === paintedColors[0])) {
    throw new TypeError(CORNERFILL_LIMITATIONS.perSideBorderPaint.reason);
  }
  return Object.freeze({
    widths: Object.freeze(widths),
    width: widths.every((width) => width === widths[0]) ? widths[0] : null,
    color: paintedColors[0],
    colors: Object.freeze(colorSides.map((color) => String(color ?? paintedColors[0]))),
    styles: Object.freeze(styleSides),
  });
}

function effectLength(token) {
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px)?$/iu.exec(String(token).trim());
  if (!match) return null;
  const value = Number(match[1]);
  if (!match[2] && value !== 0) return null;
  return value;
}

function normalizeInsetShadow(shadow) {
  if (shadow === null || shadow === undefined || shadow === "none") return null;
  if (typeof shadow === "string") {
    const layers = splitTopLevelCommas(shadow);
    if (layers.length !== 1) throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
    const tokens = splitTopLevelWhitespace(layers[0]);
    const lengths = [];
    const color = [];
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
  if (!shadow || typeof shadow !== "object") {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
  const offset = shadow.offset ?? [shadow.offsetX ?? 0, shadow.offsetY ?? 0];
  const offsetX = Number(offset[0]);
  const offsetY = Number(offset[1]);
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

function normalizeContainedOutline(outline) {
  if (outline === null || outline === undefined || outline.style === "none") return null;
  if (!outline || typeof outline !== "object") {
    throw new TypeError(CORNERFILL_LIMITATIONS.shadowAndOutlineGrammar.reason);
  }
  const width = typeof outline.width === "string" ? effectLength(outline.width) : Number(outline.width);
  const offset = typeof outline.offset === "string" ? effectLength(outline.offset) : Number(outline.offset ?? 0);
  const style = String(outline.style ?? "solid").toLowerCase();
  if (![width, offset].every(Number.isFinite) || width < 0 || style !== "solid" || !outline.color) {
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

function captureOutline(computed, overrides = {}) {
  return normalizeContainedOutline({
    width: overrides.width || computed.outlineWidth,
    style: overrides.style || computed.outlineStyle,
    color: overrides.color || computed.outlineColor,
    offset: overrides.offset || computed.outlineOffset,
  });
}

function captureInitialSources(element, config, computed) {
  const dynamicCarriers = config.dynamicCarriers === true;
  const radiusCapture = captureRadiusCarriers(computed);
  const computedShape = computed.getPropertyValue("corner-shape").trim();
  const shapeAttribute = element.getAttribute("data-cornerfill-shape");
  const shapeBaseline = Object.freeze({
    shorthand: computedShape || shapeAttribute || "round",
    physical: physicalShapeValues(computed),
  });
  const shapeCapture = captureShapeCarriers(computed, shapeBaseline);
  const radiusSource = config.borderRadius ?? (radiusCapture?.present
    ? radiusCapture.source
    : Object.freeze({
    kind: "longhands",
    values: Object.freeze([
      computed.borderTopLeftRadius,
      computed.borderTopRightRadius,
      computed.borderBottomRightRadius,
      computed.borderBottomLeftRadius,
    ]),
  }));
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
  return Object.freeze({
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
}

function currentSources(entry, computed) {
  const { initial, state } = entry;
  let radiusSource = state.borderRadius ?? initial.radiusSource;
  if (state.borderRadius === undefined && initial.dynamic.radius) {
    radiusSource = captureRadiusCarriers(computed, initial.radiusCarrierBaseline)?.source
      ?? Object.freeze({
        kind: "longhands",
        values: Object.freeze([
          computed.borderTopLeftRadius,
          computed.borderTopRightRadius,
          computed.borderBottomRightRadius,
          computed.borderBottomLeftRadius,
        ]),
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
        || (initial.dynamicCarriers ? computed.color : initial.borderSource?.color),
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

function resolveRadiusSource(source, width, height, flow = {}) {
  if (typeof source === "string") return resolveBorderRadius(source, width, height);
  if (source?.kind === "longhands") return resolveCornerRadiusLonghands(source.values, width, height);
  if (source?.kind === "declarations" || (source && !Array.isArray(source)
    && typeof source === "object" && (source.shorthand || source.physical || source.logical))) {
    return resolveBorderRadiusDeclarations({
      ...source,
      writingMode: source.writingMode ?? flow.writingMode,
      direction: source.direction ?? flow.direction,
    }, width, height);
  }
  if (Array.isArray(source) && source.length === 4 && source.every(({ rx, ry }) => (
    Number.isFinite(rx) && rx >= 0 && Number.isFinite(ry) && ry >= 0
  ))) return Object.freeze(source.map(({ rx, ry }) => Object.freeze({ rx, ry })));
  throw new TypeError("unsupported border-radius source");
}

function shapeKey(value) {
  if (value === Number.POSITIVE_INFINITY) return "+inf";
  if (value === Number.NEGATIVE_INFINITY) return "-inf";
  return String(value);
}

function geometryKey(width, height, dpr, radii, shapes) {
  return [
    width,
    height,
    dpr,
    ...radii.flatMap(({ rx, ry }) => [rx, ry]),
    ...shapes.map(shapeKey),
  ].join("|");
}

function imageRequest(document, descriptor) {
  const parsedUrl = new URL(descriptor.url, document.baseURI);
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

function releaseLayerImageLeases(entry, keep = null) {
  for (const [identity, lease] of entry.layerImageLeases ?? []) {
    if (keep?.has(identity)) continue;
    lease.release();
    entry.layerImageLeases.delete(identity);
  }
}

export function detectCornerfillCapabilities(document = globalThis.document, options = {}) {
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

function ownershipStylesheetText(id) {
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

function applyOwnedStyles(entry, verify = true) {
  const { controller, element, surface } = entry;
  if (!surface) return;
  controller._ensureOwnershipStylesheet(entry.ownershipRoot);
  controller._setOwnershipSurface(entry);
  element.setAttribute(OWNERSHIP_ATTRIBUTE, controller.ownershipId);
  if (entry.border) element.setAttribute(OWNED_BORDER_ATTRIBUTE, controller.ownershipId);
  else element.removeAttribute(OWNED_BORDER_ATTRIBUTE);
  if (verify) controller._assertOwnedStylesApplied(entry);
}

function withAuthoredComputedStyle(view, entry, callback) {
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

function surfaceTokenIsApplied(entry) {
  return Boolean(entry.surface)
    && entry.controller._ownershipStylesheetIsConnected(entry.ownershipRoot)
    && entry.element.getAttribute(OWNERSHIP_ATTRIBUTE) === entry.controller.ownershipId
    && entry.element.getAttribute(OWNED_SURFACE_ATTRIBUTE) === entry.ownershipToken
    && entry.controller._ownershipSurfaceIsCurrent(entry);
}

function inlineCarrierSignature(element) {
  return ALL_CARRIERS
    .map((property) => `${property}:${element.style.getPropertyValue(property)}`)
    .join("|");
}

function visibilityAffectingInlineSignature(value) {
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

function styleMutationMayAffectVisibility(record) {
  return visibilityAffectingInlineSignature(record.oldValue)
    !== visibilityAffectingInlineSignature(record.target?.getAttribute?.("style"));
}

function paintAffectingInlineSignature(value, ignorePositionAxes = false) {
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

function styleMutationMayAffectPaint(record, ignorePositionAxes = false) {
  return paintAffectingInlineSignature(record.oldValue, ignorePositionAxes)
    !== paintAffectingInlineSignature(record.target?.getAttribute?.("style"), ignorePositionAxes);
}

function nodeContainsStylesheetSource(node) {
  return node?.nodeType === 1 && (
    /^(?:style|link)$/u.test(node.localName)
    || Boolean(node.querySelector?.("style,link[rel~=stylesheet]"))
  );
}

function mutationStylesheetRoot(record) {
  if (record.type === "characterData") {
    const style = record.target.parentElement;
    return style?.localName === "style" ? style.getRootNode() : null;
  }
  if (record.type === "attributes") {
    return /^(?:style|link)$/u.test(record.target.localName) ? record.target.getRootNode() : null;
  }
  if (record.target.localName === "style"
    || [...record.addedNodes, ...record.removedNodes].some(nodeContainsStylesheetSource)) {
    return record.target.getRootNode();
  }
  return null;
}

function positionAffectingInlineSignature(value) {
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

function styleMutationMayAffectPosition(record) {
  return positionAffectingInlineSignature(record.oldValue)
    !== positionAffectingInlineSignature(record.target?.getAttribute?.("style"));
}

function shadowIncludingContains(ancestor, element) {
  let current = element;
  while (current) {
    if (current === ancestor) return true;
    if (current.parentNode) {
      current = current.parentNode;
      continue;
    }
    current = current.getRootNode?.()?.host ?? null;
  }
  return false;
}

function positionAxisSpec(axis, value) {
  const parsed = parseBackgroundPosition(axis === "x" ? `${value} 0px` : `0px ${value}`);
  return parsed[axis];
}

function captureBackgroundPosition(entry) {
  const { style } = entry.element;
  if (!entry.initial.dynamic.paintPosition) return false;
  const xValue = style.getPropertyValue("background-position-x").trim();
  const yValue = style.getPropertyValue("background-position-y").trim();
  if (xValue === entry.inlineBackgroundPositionX && yValue === entry.inlineBackgroundPositionY) return false;
  const previous = entry.dynamicBackgroundPositionSpec;
  const components = previous?.kind === "components"
    ? previous
    : parseBackgroundPosition("0px 0px");
  let x = components.x;
  let y = components.y;
  if (xValue && xValue !== entry.inlineBackgroundPositionX) x = positionAxisSpec("x", xValue);
  if (yValue && yValue !== entry.inlineBackgroundPositionY) y = positionAxisSpec("y", yValue);
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

function animationToken(event) {
  if (event.type.startsWith("transition")) return `transition:${event.propertyName}`;
  return `animation:${event.animationName}`;
}

function normalizeAnimatedProperty(property) {
  if (property.startsWith("--")) return property;
  return property.replace(/[A-Z]/gu, (character) => `-${character.toLowerCase()}`);
}

function animationAffectsPaint(entry, event) {
  if (entry.prepared) return false;
  if (event.type.startsWith("transition")) {
    return ANIMATED_PAINT_PROPERTIES.has(event.propertyName);
  }
  const animations = entry.element.getAnimations?.() ?? [];
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

function entryExplanation(entry) {
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
  });
}

class CornerfillController {
  constructor(options = {}) {
    this.document = options.document ?? globalThis.document;
    if (!this.document?.defaultView) throw new TypeError("installCornerfill() requires a browser document");
    this.view = this.document.defaultView;
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

  _ownershipStylesheetIsConnected(root) {
    return Boolean(this.ownershipStylesheets.get(root)?.isConnected);
  }

  _setOwnershipSurface(entry) {
    entry.ownershipToken ??= `${this.ownershipId}-surface-${++this.nextOwnershipToken}`;
    const previous = this.ownershipSurfaces.get(entry);
    const next = Object.freeze({ root: entry.ownershipRoot, image: entry.surface.cssImage });
    if (previous?.root === next.root && previous.image === next.image
      && entry.element.getAttribute(OWNED_SURFACE_ATTRIBUTE) === entry.ownershipToken
      && this._ownershipSurfaceRuleIsCurrent(entry, next)) return;
    if (previous && previous.root !== next.root) this._releaseOwnershipSurfaceRule(entry);
    this.ownershipSurfaces.set(entry, next);
    entry.element.setAttribute(OWNED_SURFACE_ATTRIBUTE, entry.ownershipToken);
    this._ensureOwnershipStylesheet(next.root);
    this._assignOwnershipSurfaceRule(entry, next);
  }

  _removeOwnershipSurface(entry) {
    this._releaseOwnershipSurfaceRule(entry);
    this.ownershipSurfaces.delete(entry);
  }

  _ownershipSurfaceSelector(entry) {
    return `[${OWNERSHIP_ATTRIBUTE}="${this.ownershipId}"]`
      + `[${OWNED_SURFACE_ATTRIBUTE}="${entry.ownershipToken}"]`;
  }

  _ownershipSurfaceRuleIsCurrent(entry, surface = this.ownershipSurfaces.get(entry)) {
    const record = this.ownershipSurfaceRules.get(entry);
    const stylesheet = this.ownershipStylesheets.get(surface?.root);
    return Boolean(record && surface && stylesheet?.isConnected
      && record.root === surface.root
      && record.rule.parentStyleSheet === stylesheet.sheet
      && record.rule.selectorText === this._ownershipSurfaceSelector(entry)
      && record.rule.style.getPropertyValue(LIVE_IMAGE_PROPERTY).trim() === surface.image
      && record.rule.style.getPropertyPriority(LIVE_IMAGE_PROPERTY) === "important");
  }

  _assignOwnershipSurfaceRule(entry, surface) {
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
      rule = sheet.cssRules[index];
    } else {
      rule.selectorText = selector;
      rule.style.setProperty(LIVE_IMAGE_PROPERTY, surface.image, "important");
    }
    this.ownershipSurfaceRules.set(entry, Object.freeze({ root: surface.root, rule }));
  }

  _releaseOwnershipSurfaceRule(entry) {
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

  _ownershipSurfaceIsCurrent(entry) {
    const record = this.ownershipSurfaces.get(entry);
    return Boolean(record)
      && record.root === entry.ownershipRoot
      && record.image === entry.surface?.cssImage
      && this._ownershipSurfaceRuleIsCurrent(entry, record);
  }

  _repairEntryOwnership(entry) {
    if (entry.native || entry.disposed || !entry.surface || surfaceTokenIsApplied(entry)) return false;
    applyOwnedStyles(entry);
    this.counters.ownershipRepairs += 1;
    entry.counters.ownershipRepairs += 1;
    entry.lastInvalidationReason = "ownership-repair-without-repaint";
    return true;
  }

  _ensureOwnershipStylesheet(root) {
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

  _assertOwnedStylesApplied(entry) {
    const computed = this.view.getComputedStyle(entry.element);
    const image = computed.backgroundImage;
    const expectedImage = entry.surface.backend === "static-data-url"
      ? image === entry.surface.cssImage
        || image.includes(entry.surface.cssImage.slice(5, -2))
      : image.includes(entry.surface.id);
    const transparent = computed.backgroundColor === "transparent"
      || (/^rgba\(/u.test(computed.backgroundColor) && /,\s*0(?:\.0+)?\s*\)$/u.test(computed.backgroundColor))
      || (/\/\s*0(?:\.0+)?\s*\)$/u.test(computed.backgroundColor));
    const radiiOwned = RADIUS_LONGHANDS.every((property) => (
      numberFromPx(computed.getPropertyValue(property)) === 0
    ));
    const borderOwned = !entry.border || [
      computed.borderTopColor,
      computed.borderRightColor,
      computed.borderBottomColor,
      computed.borderLeftColor,
    ].every((color) => color === "transparent"
      || (/^rgba\(/u.test(color) && /,\s*0(?:\.0+)?\s*\)$/u.test(color))
      || (/\/\s*0(?:\.0+)?\s*\)$/u.test(color)));
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

  _verifyPreparedOwnership(entry) {
    this.preparedOwnershipVerificationEntries.add(entry);
    if (!this.preparedOwnershipVerification) {
      this.preparedOwnershipVerification = new Promise((resolve) => {
        this.view.setTimeout(() => {
          const failures = new Map();
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
    return this.preparedOwnershipVerification.then((failures) => {
      const failure = failures.get(entry);
      if (failure) throw failure;
    });
  }

  _retainOwnershipRoot(root, observe) {
    this.ownershipRootCounts.set(root, (this.ownershipRootCounts.get(root) ?? 0) + 1);
    if (observe) this._installObservers(root);
  }

  _releaseOwnershipRoot(root) {
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
    const desiredRoots = new Set();
    for (const [ownershipRoot, observer] of this.rootObservers) {
      if (!observer || ownershipRoot === this.document) continue;
      let containingRoot = ownershipRoot.host?.getRootNode?.() ?? null;
      while (containingRoot) {
        const containingDocument = containingRoot === this.document
          ? this.document
          : containingRoot.ownerDocument;
        if (containingDocument !== this.document
          || (containingRoot !== this.document && !containingRoot.host)) break;
        if (!this.rootObservers.has(containingRoot)) desiredRoots.add(containingRoot);
        if (containingRoot === this.document) break;
        containingRoot = containingRoot.host?.getRootNode?.() ?? null;
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

  _installObservers(root) {
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

  _onMutation(records) {
    let childListChanged = false;
    const stylesheetRoots = new Set();
    const styleEntries = new Set();
    const visibilityStyleEntries = new Set();
    const paintStyleEntries = new Set();
    const visibilityAncestors = new Set();
    const selectorAncestors = new Set();
    const semanticEntries = new Set();
    for (const record of records) {
      const stylesheetRoot = mutationStylesheetRoot(record);
      if (stylesheetRoot) stylesheetRoots.add(stylesheetRoot);
      if (record.type === "childList" || record.type === "characterData") {
        if (record.type === "childList") childListChanged = true;
        const target = record.type === "characterData" ? record.target.parentNode : record.target;
        const entry = this.entryByElement.get(target);
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
        const entry = this.entryByElement.get(record.target);
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

  _updateEntryStyleVisibility(entry, computed = null) {
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

  _reconcileEntryOwnershipRoot(entry) {
    if (entry.native || entry.disposed) return false;
    if (entry.element.ownerDocument !== this.document) {
      throw new Error(
        "Cornerfill cannot migrate an attached element to another document; dispose it and attach it with that document's controller",
      );
    }
    const nextRoot = entry.element.getRootNode();
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

  _onResize(records) {
    for (const record of records) {
      const entry = this.entryByElement.get(record.target);
      if (entry && !entry.native && !entry.prepared && !entry.disposed) {
        this._markDirty(entry, "resize", true);
      }
    }
  }

  _onAnimationStart(event) {
    const entry = this.entryByElement.get(event.target);
    if (!entry || entry.native || entry.prepared || entry.disposed || !animationAffectsPaint(entry, event)) return;
    let tokens = this.activeAnimations.get(entry);
    if (!tokens) {
      tokens = new Set();
      this.activeAnimations.set(entry, tokens);
    }
    tokens.add(animationToken(event));
    if (this.animationHandle === undefined) this.animationHandle = this.view.requestAnimationFrame(this._animationTick);
  }

  _onAnimationEnd(event) {
    const entry = this.entryByElement.get(event.target);
    if (!entry) return;
    const tokens = this.activeAnimations.get(entry);
    if (!tokens?.delete(animationToken(event))) return;
    if (tokens.size === 0) this.activeAnimations.delete(entry);
    if (!entry.native && !entry.prepared && !entry.disposed) {
      this._markDirty(entry, "animation-final", true);
    }
  }

  _animationTick() {
    this.animationHandle = undefined;
    for (const entry of this.activeAnimations.keys()) {
      if (!entry.disposed && entry.visible) this._markDirty(entry, "animation-sample", true);
    }
    if (this.activeAnimations.size > 0) {
      this.animationHandle = this.view.requestAnimationFrame(this._animationTick);
    }
  }

  _entryIsCurrent(entry, revision = null) {
    return !this.destroyed
      && !entry.disposed
      && this.entryByElement.get(entry.element) === entry
      && elementOwners.get(entry.element) === entry
      && (revision === null || entry.revision === revision);
  }

  _assertEntryCurrent(entry, revision = null) {
    if (!this._entryIsCurrent(entry, revision)) throw new StaleEntryWorkError();
  }

  _recordError(entry, error) {
    entry.error = error;
    entry.lastError = error;
  }

  _clearError(entry) {
    entry.error = null;
  }

  _settleWaiters(entry, revision, error = null) {
    const pending = [];
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

  _markDirty(entry, reason, needsFullRefresh) {
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

  _scheduleAndWait(entry, reason, needsFullRefresh) {
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
            const refresh = this._refreshEntry(entry, revision);
            const committed = refresh && typeof refresh.then === "function" ? await refresh : refresh;
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

  _geometry(width, height, dpr, radii, shapes) {
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
      this.geometryCache.delete(this.geometryCache.keys().next().value);
    }
    return { key, geometry };
  }

  async _resolvedPaint(entry, descriptor, width, height, revision = null, boxMetrics = descriptor.box) {
    if (descriptor.kind === "layers") {
      if (entry.imageLease) {
        entry.imageLease.release();
        entry.imageLease = null;
        entry.imageLeaseUrl = null;
      }
      const desired = new Set();
      const layers = [];
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
        let image;
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
      return resolvePaintForBox(descriptor, width, height, descriptor.image, boxMetrics);
    }
    releaseLayerImageLeases(entry);
    let image = descriptor.image;
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

  async _snapshot(entry, revision = null) {
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

  async _initializeEntry(entry) {
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

  _refreshDynamicPaint(entry, reason) {
    const paintSource = Object.freeze({
      ...entry.initial.paintSource,
      backgroundPositionSpec: entry.dynamicBackgroundPositionSpec,
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
      entry.boxMetrics,
    );
    const fastPaint = repaintOpaqueCornerfill(entry.surface.context, {
      geometry: entry.geometry,
      paint,
      border: entry.border,
      shadow: entry.shadow,
      outline: entry.outline,
      dpr: entry.dpr,
    });
    entry.paintResult = fastPaint ?? paintCornerfill(entry.surface.context, {
      geometry: entry.geometry,
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
    entry.surface.commit();
    if (entry.surface.backend === "static-data-url") applyOwnedStyles(entry);
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

  _refreshEntry(entry, revision) {
    const reason = entry.pendingReason;
    const rootChanged = this._reconcileEntryOwnershipRoot(entry);
    const needsFullRefresh = entry.fullRefreshPending || rootChanged;
    entry.pendingReason = null;
    entry.fullRefreshPending = false;
    const dynamicPaintOnly = entry.initial.dynamic.paintPosition
      && !entry.initial.dynamic.paint
      && entry.state.paint === undefined
      && !needsFullRefresh;
    if (dynamicPaintOnly) {
      return this._refreshDynamicPaint(entry, reason);
    }
    return this._refreshEntryFull(entry, reason, revision);
  }

  async _refreshEntryFull(entry, reason, revision) {
    this.counters.styleChecks += 1;
    entry.counters.styleChecks += 1;
    const snapshot = await this._snapshot(entry, revision);
    this._assertEntryCurrent(entry, revision);
    this._updateEntryStyleVisibility(entry, snapshot.computed);
    const geometryChanged = snapshot.geometryKey !== entry.geometryKey;
    const paintChanged = snapshot.paintKey !== entry.paintKey;
    const borderChanged = snapshot.borderKey !== entry.borderKey;
    const effectsChanged = snapshot.effectsKey !== entry.effectsKey;
    const resized = entry.surface.resize(snapshot.width, snapshot.height, snapshot.dpr);
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
    entry.paintKey = snapshot.paintKey;
    entry.borderKey = snapshot.borderKey;
    entry.border = snapshot.border;
    entry.effectsKey = snapshot.effectsKey;
    entry.shadow = snapshot.shadow;
    entry.outline = snapshot.outline;
    entry.composition = snapshot.composition;
    entry.boxMetrics = snapshot.boxMetrics;
    if (needsPaint && entry.visible) {
      entry.paintResult = paintCornerfill(entry.surface.context, {
        geometry: snapshot.geometry,
        paint: snapshot.paint,
        border: snapshot.border,
        shadow: snapshot.shadow,
        outline: snapshot.outline,
        dpr: snapshot.dpr,
      });
      entry.surface.commit();
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

  _selectedFallbackBackend() {
    if (this.options.backend !== "auto") return this.options.backend;
    if (this.capabilities.surfaces.webkitCanvas) return "webkit-canvas";
    if (this.capabilities.surfaces.mozElement) return "moz-element";
    if (this.options.staticFallback) return "static-data-url";
    return "none";
  }

  _createPreparedSurface(entry, verifyOwnership = true) {
    if (entry.surface) return false;
    entry.surface = createSurface(this.document, {
      cssWidth: entry.width,
      cssHeight: entry.height,
      dpr: entry.dpr,
      allowStatic: this.options.staticFallback,
      backend: entry.backend,
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

  _paintPreparedFull(entry, verifyOwnership = true) {
    const paint = entry.preparedResolvedPaint.kind === "image"
      ? {
        ...entry.preparedResolvedPaint,
        backgroundPosition: [entry.positionX, entry.positionY],
      }
      : entry.preparedResolvedPaint;
    entry.paintResult = paintCornerfill(entry.surface.context, {
      geometry: entry.geometry,
      paint,
      border: entry.border,
      shadow: entry.shadow,
      outline: entry.outline,
      dpr: entry.dpr,
    });
    if (entry.preparedPaintProgram) {
      preparePreparedOpaqueImageContext(entry.surface.context, entry.preparedPaintProgram);
    }
    entry.surface.commit();
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

  _paintPreparedEntry(entry) {
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
    drawPreparedOpaqueImage(
      entry.surface.context,
      entry.preparedPaintProgram,
      entry.positionX,
      entry.positionY,
    );
    entry.surface.commit();
    if (entry.surface.backend === "static-data-url" || !surfaceTokenIsApplied(entry)) applyOwnedStyles(entry);
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

  _queuePrepared(entry, schedule = true) {
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

  _flushPrepared(throwOnError = false) {
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

  _setPreparedBackgroundPosition(entry, x, y, schedule = true) {
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

  _setPreparedVisibility(entry, visible, schedule = true) {
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

  setPreparedBackgroundPosition(element, x, y) {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed) throw new Error("prepared element is not attached");
    this._setPreparedBackgroundPosition(entry, x, y, true);
  }

  setPreparedBackgroundPositionY(element, y) {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed) throw new Error("prepared element is not attached");
    this._setPreparedBackgroundPosition(entry, entry.positionX, y, true);
  }

  setPreparedVisibility(element, visible) {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed) throw new Error("prepared element is not attached");
    this._setPreparedVisibility(entry, visible, true);
  }

  updatePreparedBatch(updates) {
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

  flushPrepared() {
    return this._flushPrepared(true);
  }

  async _resolvePreparedLayout(entry, config, revision, initial = false) {
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
    if (geometry.width !== width || geometry.height !== height || geometry.dpr !== dpr) {
      throw new RangeError("prepared geometry dimensions or DPR do not match prepared layout");
    }
    const paintSource = config.paint ?? entry.preparedPaintSource;
    const descriptor = normalizePaintDescriptor(paintSource);
    if (descriptor.blendMode === "multiply") {
      throw new TypeError("prepared paint requires normal background blending");
    }
    let paint = await this._resolvedPaint(entry, descriptor, width, height, revision);
    this._assertEntryCurrent(entry, revision);
    const preservePosition = !initial && config.paint === undefined && paint.kind === "image";
    if (preservePosition) {
      paint = Object.freeze({
        ...paint,
        backgroundPosition: Object.freeze([entry.positionX, entry.positionY]),
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

  _commitPreparedLayout(entry, snapshot, reason) {
    this._assertEntryCurrent(entry);
    this._reconcileEntryOwnershipRoot(entry);
    const resized = entry.surface?.resize(snapshot.width, snapshot.height, snapshot.dpr) ?? false;
    if (resized) {
      this.counters.surfaceResizes += 1;
      entry.counters.surfaceResizes += 1;
    }
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

  resizePrepared(element, config = {}) {
    const entry = this.entryByElement.get(element);
    if (!entry || entry.disposed || !entry.prepared) throw new Error("prepared element is not attached");
    const predecessor = entry.preparedLayoutChain ?? entry.ready;
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

  async _initializePreparedEntry(entry, config) {
    try {
      const revision = entry.revision;
      const snapshot = await this._resolvePreparedLayout(entry, config, revision, true);
      this._assertEntryCurrent(entry, revision);
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

  attachPrepared(element, config = {}) {
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
    const entry = {
      controller: this,
      element,
      native: false,
      prepared: true,
      backend,
      mode: config.mode ?? "paint",
      initial: null,
      state: null,
      ownershipSnapshot: captureOwnershipState(element),
      ownershipRoot: element.getRootNode(),
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
      counters: {
        paints: 0,
        styleChecks: 0,
        ignoredStyleChanges: 0,
        ignoredStyleMutations: 0,
        dynamicPaintUpdates: 0,
        paintOnlyUpdates: 0,
        opaqueFastPaints: 0,
        preparedUpdates: 0,
        preparedPaints: 0,
        preparedScheduledFlushes: 0,
        preparedLayoutUpdates: 0,
        visibilityUpdates: 0,
        surfaceResizes: 0,
        ownershipRepairs: 0,
      },
    };
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

  _shouldUseNative(config) {
    if (this.options.forceFallback || !this.capabilities.native.qualified) return false;
    if (config.paint !== undefined || config.border !== undefined
      || config.shadow !== undefined || config.outline !== undefined) return false;
    return true;
  }

  _attachNative(element, config) {
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
    const entry = {
      element,
      native: true,
      mode: config.mode ?? "paint",
      disposed: false,
      initialized: true,
      error: null,
      lastError: null,
      revision: 0,
      committedRevision: 0,
      saved,
      lastInvalidationReason: "native-qualified",
      counters: { paints: 0, styleChecks: 0, ignoredStyleChanges: 0, surfaceResizes: 0, ownershipRepairs: 0 },
    };
    entry.ready = Promise.resolve(entryExplanation(entry));
    claimElement(entry);
    this.entries.add(entry);
    this.entryByElement.set(element, entry);
    this.counters.attachments += 1;
    this.counters.nativeEntries += 1;
    return this._handle(entry);
  }

  _handle(entry) {
    const controller = this;
    return Object.freeze({
      get ready() { return entry.ready; },
      get backend() {
        return entry.native ? "native-corner-shape" : entry.surface?.backend ?? entry.backend ?? "pending";
      },
      update(next = {}) {
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
        let changed = false;
        if (next.borderRadius !== undefined) {
          entry.state.borderRadius = next.borderRadius;
          changed = true;
        }
        if (next.cornerShape !== undefined) {
          entry.state.cornerShape = next.cornerShape;
          const sameResolvedShape = Array.isArray(next.cornerShape)
            && entry.geometry?.shapeParameters?.every((value, index) => Object.is(value, next.cornerShape[index]));
          if (!sameResolvedShape) changed = true;
        }
        if (next.paint !== undefined) {
          entry.state.paint = next.paint;
          entry.forcePaint = true;
          changed = true;
        }
        if (next.border !== undefined) {
          entry.state.border = next.border;
          entry.forcePaint = true;
          changed = true;
        }
        if (next.shadow !== undefined) {
          entry.state.shadow = next.shadow;
          entry.forcePaint = true;
          changed = true;
        }
        if (next.outline !== undefined) {
          entry.state.outline = next.outline;
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
      interpolateCornerShape(from, to, progress, options = {}) {
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
        entry.state.cornerShape = cornerShape;
        if (entry.geometry?.shapeParameters?.every((value, index) => Object.is(value, cornerShape[index]))) {
          return Promise.resolve(entryExplanation(entry));
        }
        return controller._scheduleAndWait(entry, "corner-shape-interpolation", true);
      },
      setVisible(visible) {
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
      resize(next = {}) {
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

  attach(element, config = {}) {
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
    const entry = {
      controller: this,
      element,
      native: false,
      prepared: false,
      backend: null,
      mode: config.mode ?? "paint",
      state: {},
      initial,
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
      ownershipRoot: element.getRootNode(),
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
      counters: {
        paints: 0,
        styleChecks: 0,
        ignoredStyleChanges: 0,
        ignoredStyleMutations: 0,
        dynamicPaintUpdates: 0,
        paintOnlyUpdates: 0,
        opaqueFastPaints: 0,
        visibilityUpdates: 0,
        surfaceResizes: 0,
        ownershipRepairs: 0,
      },
    };
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

  detach(element) {
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

  stats() {
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
    });
  }

  explain(element) {
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

export function installCornerfill(options = {}) {
  return new CornerfillController(options);
}
