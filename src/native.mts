export const CORNERFILL_NATIVE_QUALIFICATION_SCHEMA = "cornerfill-native-qualification@2";

export interface CornerfillNativeSyntaxProbes {
  readonly aliases: boolean;
  readonly shorthand: boolean;
  readonly longhand: boolean;
  readonly convexSuperellipse: boolean;
  readonly concaveSuperellipse: boolean;
}

export interface CornerfillNativeRequirement {
  readonly supported: boolean;
  readonly observable?: boolean;
  readonly probes?: Readonly<CornerfillNativeSyntaxProbes>;
  readonly shorthand?: string;
  readonly longhands?: readonly string[];
  readonly bevelExcludes?: boolean;
  readonly roundIncludes?: boolean;
}

export interface CornerfillNativeRequirements {
  readonly syntax: Readonly<CornerfillNativeRequirement>;
  readonly computedValues: Readonly<CornerfillNativeRequirement>;
  readonly shapedHitTesting: Readonly<CornerfillNativeRequirement>;
}

export type CornerfillNativeCapabilityStatus = "supported" | "unsupported" | "unobserved";

export interface CornerfillNativeCapabilities {
  readonly animation: CornerfillNativeCapabilityStatus;
  readonly backgroundClip: CornerfillNativeCapabilityStatus;
  readonly computedValues: CornerfillNativeCapabilityStatus;
  readonly innerBorderContour: CornerfillNativeCapabilityStatus;
  readonly outerPaint: CornerfillNativeCapabilityStatus;
  readonly outlines: CornerfillNativeCapabilityStatus;
  readonly overflowClip: CornerfillNativeCapabilityStatus;
  readonly shadows: CornerfillNativeCapabilityStatus;
  readonly shapedHitTesting: CornerfillNativeCapabilityStatus;
  readonly syntax: CornerfillNativeCapabilityStatus;
}

export interface CornerfillNativeQualification {
  readonly capabilities: Readonly<CornerfillNativeCapabilities>;
  readonly schema: typeof CORNERFILL_NATIVE_QUALIFICATION_SCHEMA;
  readonly qualified: boolean;
  readonly requirements: Readonly<CornerfillNativeRequirements>;
  readonly tiers: Readonly<{
    readonly animationQualified: boolean;
    readonly observableShapeQualified: boolean;
    readonly computedValuesQualified: boolean;
    readonly fullNativeQualified: boolean;
    readonly semanticClippingQualified: boolean;
    readonly syntaxQualified: boolean;
  }>;
  readonly unresolved: readonly (keyof CornerfillNativeRequirements)[];
  readonly reason: string;
  readonly error?: string;
}

type CssSupportWindow = Window & {
  CSS?: {
    supports?: (property: string, value: string) => boolean;
  };
};

type RequirementDetails = Omit<CornerfillNativeRequirement, "supported">;

const CACHE = new WeakMap<Document, Readonly<CornerfillNativeQualification>>();
const TRUSTED_QUALIFICATIONS = new WeakSet<object>();
const PHYSICAL_LONGHANDS = Object.freeze([
  "corner-top-left-shape",
  "corner-top-right-shape",
  "corner-bottom-right-shape",
  "corner-bottom-left-shape",
]);
const LOGICAL_LONGHANDS = Object.freeze([
  "corner-start-start-shape",
  "corner-start-end-shape",
  "corner-end-end-shape",
  "corner-end-start-shape",
]);
const LONGHANDS = Object.freeze([...PHYSICAL_LONGHANDS, ...LOGICAL_LONGHANDS]);
const EXPECTED_LONGHANDS = Object.freeze(["bevel", "scoop", "round", "notch"]);
const EXPECTED_PARAMETERS = Object.freeze([0, -1, 1, Number.NEGATIVE_INFINITY]);
const SHAPE_ALIASES = Object.freeze({
  bevel: 0,
  notch: Number.NEGATIVE_INFINITY,
  round: 1,
  scoop: -1,
  square: Number.POSITIVE_INFINITY,
  squircle: 2,
});

function computedShapeParameter(source: string): number | null {
  const value = source.trim().toLowerCase();
  if (Object.hasOwn(SHAPE_ALIASES, value)) {
    return SHAPE_ALIASES[value as keyof typeof SHAPE_ALIASES];
  }
  const match = /^superellipse\(\s*(infinity|-infinity|[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*\)$/iu.exec(value);
  if (!match) return null;
  if (match[1] === "infinity") return Number.POSITIVE_INFINITY;
  if (match[1] === "-infinity") return Number.NEGATIVE_INFINITY;
  const number = Number(match[1]);
  return Number.isFinite(number) ? (Object.is(number, -0) ? 0 : number) : null;
}

function requirement(
  supported: boolean,
  details: RequirementDetails = {},
): Readonly<CornerfillNativeRequirement> {
  return Object.freeze({ supported, ...details });
}

function unresolvedRequirements(
  requirements: CornerfillNativeRequirements,
): readonly (keyof CornerfillNativeRequirements)[] {
  return Object.freeze((["syntax", "computedValues", "shapedHitTesting"] as const)
    .filter((name) => !requirements[name].supported));
}

function observedCapability(
  capability: Readonly<CornerfillNativeRequirement>,
): CornerfillNativeCapabilityStatus {
  if (capability.observable === false) return "unobserved";
  return capability.supported ? "supported" : "unsupported";
}

function qualification(
  requirements: CornerfillNativeRequirements,
  error: unknown = null,
): Readonly<CornerfillNativeQualification> {
  const unresolved = unresolvedRequirements(requirements);
  const tiers = Object.freeze({
    syntaxQualified: requirements.syntax.supported,
    computedValuesQualified: requirements.syntax.supported && requirements.computedValues.supported,
    observableShapeQualified: requirements.syntax.supported
      && requirements.computedValues.supported
      && requirements.shapedHitTesting.supported,
    semanticClippingQualified: false,
    animationQualified: false,
    fullNativeQualified: false,
  });
  const qualified = tiers.observableShapeQualified;
  const result = Object.freeze({
    schema: CORNERFILL_NATIVE_QUALIFICATION_SCHEMA,
    qualified,
    capabilities: Object.freeze({
      syntax: observedCapability(requirements.syntax),
      computedValues: observedCapability(requirements.computedValues),
      shapedHitTesting: observedCapability(requirements.shapedHitTesting),
      outerPaint: "unobserved",
      innerBorderContour: "unobserved",
      backgroundClip: "unobserved",
      overflowClip: "unobserved",
      shadows: "unobserved",
      outlines: "unobserved",
      animation: "unobserved",
    }),
    requirements: Object.freeze(requirements),
    tiers,
    unresolved,
    reason: qualified
      ? "Native corner-shape syntax and computed values passed; shaped hit testing passed as the conservative observable native-selection proxy. Paint subfeatures remain unobserved."
      : `Native corner-shape is unqualified: ${unresolved.join(", ") || "probe failure"}.`,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  });
  TRUSTED_QUALIFICATIONS.add(result);
  return result;
}

function snapshotRequirement(
  input: unknown,
  name: keyof CornerfillNativeRequirements,
): Readonly<CornerfillNativeRequirement> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`native qualification requirement ${name} must be a record`);
  }
  const {
    supported,
    observable,
    probes: inputProbes,
    shorthand,
    longhands: inputLonghands,
    bevelExcludes,
    roundIncludes,
  } = input as Readonly<Record<string, unknown>>;
  if (typeof supported !== "boolean") {
    throw new TypeError(`native qualification requirement ${name} requires a boolean supported result`);
  }
  if (observable !== undefined && typeof observable !== "boolean") {
    throw new TypeError(`native qualification requirement ${name} observable result must be boolean`);
  }
  if (supported && observable === false) {
    throw new TypeError(`native qualification requirement ${name} cannot be supported when unobserved`);
  }
  let probes: Readonly<CornerfillNativeSyntaxProbes> | undefined;
  if (inputProbes !== undefined) {
    if (!inputProbes || typeof inputProbes !== "object" || Array.isArray(inputProbes)) {
      throw new TypeError(`native qualification requirement ${name} probes must be a record`);
    }
    const values = inputProbes as Readonly<Record<keyof CornerfillNativeSyntaxProbes, unknown>>;
    if ([values.aliases, values.shorthand, values.longhand, values.convexSuperellipse,
      values.concaveSuperellipse].some((value) => typeof value !== "boolean")) {
      throw new TypeError(`native qualification requirement ${name} probes must be boolean`);
    }
    probes = Object.freeze({
      aliases: values.aliases as boolean,
      shorthand: values.shorthand as boolean,
      longhand: values.longhand as boolean,
      convexSuperellipse: values.convexSuperellipse as boolean,
      concaveSuperellipse: values.concaveSuperellipse as boolean,
    });
  }
  let longhands: readonly string[] | undefined;
  if (inputLonghands !== undefined) {
    if (!Array.isArray(inputLonghands) || inputLonghands.some((value) => typeof value !== "string")) {
      throw new TypeError(`native qualification requirement ${name} longhands must be strings`);
    }
    longhands = Object.freeze([...inputLonghands]);
  }
  for (const [label, value] of [["bevelExcludes", bevelExcludes], ["roundIncludes", roundIncludes]] as const) {
    if (value !== undefined && typeof value !== "boolean") {
      throw new TypeError(`native qualification requirement ${name} ${label} result must be boolean`);
    }
  }
  if (shorthand !== undefined && typeof shorthand !== "string") {
    throw new TypeError(`native qualification requirement ${name} shorthand must be a string`);
  }
  const capturedBevelExcludes = bevelExcludes as boolean | undefined;
  const capturedRoundIncludes = roundIncludes as boolean | undefined;
  return requirement(supported, {
    ...(observable === undefined ? {} : { observable }),
    ...(probes === undefined ? {} : { probes }),
    ...(shorthand === undefined ? {} : { shorthand }),
    ...(longhands === undefined ? {} : { longhands }),
    ...(capturedBevelExcludes === undefined ? {} : { bevelExcludes: capturedBevelExcludes }),
    ...(capturedRoundIncludes === undefined ? {} : { roundIncludes: capturedRoundIncludes }),
  });
}

export function snapshotNativeQualification(
  input: Readonly<CornerfillNativeQualification>,
): Readonly<CornerfillNativeQualification> {
  if (input === null || typeof input !== "object") {
    throw new TypeError("native qualification must be a record");
  }
  if (TRUSTED_QUALIFICATIONS.has(input as object)) return input;
  const { schema, qualified, requirements: inputRequirements, unresolved, error } = input;
  if (schema !== CORNERFILL_NATIVE_QUALIFICATION_SCHEMA) {
    throw new TypeError(`native qualification requires schema ${CORNERFILL_NATIVE_QUALIFICATION_SCHEMA}`);
  }
  if (typeof qualified !== "boolean") {
    throw new TypeError("native qualification requires a boolean qualified result");
  }
  if (!inputRequirements || typeof inputRequirements !== "object" || Array.isArray(inputRequirements)) {
    throw new TypeError("native qualification requires requirement evidence");
  }
  const requirements = Object.freeze({
    syntax: snapshotRequirement(inputRequirements.syntax, "syntax"),
    computedValues: snapshotRequirement(inputRequirements.computedValues, "computedValues"),
    shapedHitTesting: snapshotRequirement(inputRequirements.shapedHitTesting, "shapedHitTesting"),
  });
  if (error !== undefined && typeof error !== "string") {
    throw new TypeError("native qualification error must be a string");
  }
  const result = qualification(requirements, error ?? null);
  if (qualified !== result.qualified) {
    throw new TypeError("native qualification result contradicts its requirement evidence");
  }
  if (!Array.isArray(unresolved)
    || unresolved.length !== result.unresolved.length
    || result.unresolved.some((name, index) => unresolved[index] !== name)) {
    throw new TypeError("native qualification unresolved requirements contradict its requirement evidence");
  }
  return result;
}

function syntaxRequirement(view: Window): Readonly<CornerfillNativeRequirement> {
  const css = (view as CssSupportWindow).CSS;
  const probes = Object.freeze({
    shorthand: Boolean(css?.supports?.("corner-shape", "bevel scoop round notch")),
    longhand: LONGHANDS.every((property) => Boolean(css?.supports?.(property, "notch"))),
    aliases: ["square", "squircle"].every((value) => Boolean(css?.supports?.("corner-shape", value))),
    convexSuperellipse: Boolean(css?.supports?.("corner-shape", "superellipse(2)")),
    concaveSuperellipse: Boolean(css?.supports?.("corner-shape", "superellipse(-1)")),
  });
  return requirement(Object.values(probes).every(Boolean), { probes });
}

function setProbeStyle(element: HTMLElement, declarations: Readonly<Record<string, string>>): void {
  for (const [property, value] of Object.entries(declarations)) {
    element.style.setProperty(property, value, "important");
  }
}

function probeElement(document: Document): HTMLDivElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  setProbeStyle(element, {
    all: "initial",
    background: "rgb(1, 2, 3)",
    border: "0 solid transparent",
    "box-sizing": "border-box",
    contain: "strict",
    display: "block",
    margin: "0",
    opacity: "0",
    padding: "0",
    "pointer-events": "auto",
    position: "fixed",
    "z-index": "2147483647",
  });
  return element;
}

function computedRequirement(
  document: Document,
  element: HTMLElement,
): Readonly<CornerfillNativeRequirement> {
  element.style.setProperty("corner-shape", EXPECTED_LONGHANDS.join(" "), "important");
  const computed = document.defaultView!.getComputedStyle(element);
  const shorthand = computed.getPropertyValue("corner-shape").trim();
  const longhands = Object.freeze(LONGHANDS.map((property) => (
    computed.getPropertyValue(property).trim()
  )));
  return requirement(
    longhands.every((value, index) => Object.is(
      computedShapeParameter(value),
      EXPECTED_PARAMETERS[index % EXPECTED_PARAMETERS.length],
    )),
    { shorthand, longhands },
  );
}

function shapedHitTestRequirement(
  document: Document,
  element: HTMLElement,
): Readonly<CornerfillNativeRequirement> {
  const view = document.defaultView!;
  const available = Math.floor(Math.min(view.innerWidth ?? 0, view.innerHeight ?? 0) - 8);
  if (available < 32 || typeof document.elementFromPoint !== "function") {
    return requirement(false, { observable: false });
  }
  const size = Math.min(100, available);
  const left = 2;
  const top = 2;
  setProbeStyle(element, {
    "border-radius": `${size / 2}px`,
    height: `${size}px`,
    left: `${left}px`,
    top: `${top}px`,
    width: `${size}px`,
  });
  const x = left + Math.round(size * 0.15);
  const y = top + Math.round(size * 0.2);
  element.style.setProperty("corner-shape", "bevel", "important");
  view.getComputedStyle(element).getPropertyValue("corner-shape");
  const bevelExcludes = document.elementFromPoint(x, y) !== element;
  element.style.setProperty("corner-shape", "round", "important");
  view.getComputedStyle(element).getPropertyValue("corner-shape");
  const roundIncludes = document.elementFromPoint(x, y) === element;
  return requirement(bevelExcludes && roundIncludes, {
    observable: true,
    bevelExcludes,
    roundIncludes,
  });
}

function isolatedProbeDocument(document: Document): Readonly<{
  document: Document;
  frame: HTMLIFrameElement;
}> {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  setProbeStyle(frame, {
    border: "0",
    height: "128px",
    left: "0",
    opacity: "0",
    "pointer-events": "none",
    position: "fixed",
    top: "0",
    width: "128px",
  });
  document.documentElement.append(frame);
  const isolated = frame.contentDocument;
  if (!isolated?.defaultView || !isolated.documentElement) {
    frame.remove();
    throw new Error("native corner-shape qualification could not create an isolated document");
  }
  if (isolated.body) isolated.body.style.margin = "0";
  return Object.freeze({ document: isolated, frame });
}

export function qualifyNativeCornerShape(
  document: Document | undefined = globalThis.document,
): Readonly<CornerfillNativeQualification> {
  if (!document?.defaultView || !document.documentElement) {
    throw new TypeError("native corner-shape qualification requires an active browser document");
  }
  const cached = CACHE.get(document);
  if (cached) return cached;
  const syntax = syntaxRequirement(document.defaultView);
  if (!syntax.supported) {
    const result = qualification({
      syntax,
      computedValues: requirement(false, { observable: false }),
      shapedHitTesting: requirement(false, { observable: false }),
    });
    CACHE.set(document, result);
    return result;
  }

  let frame: HTMLIFrameElement | null = null;
  let element: HTMLElement | null = null;
  let result: Readonly<CornerfillNativeQualification>;
  try {
    let probeDocument = document;
    try {
      const isolated = isolatedProbeDocument(document);
      frame = isolated.frame;
      probeDocument = isolated.document;
    } catch {
      // CSP can block iframe documents. Syntax/computed-value selection still has a host probe.
    }
    element = probeElement(probeDocument);
    probeDocument.documentElement.append(element);
    result = qualification({
      syntax,
      computedValues: computedRequirement(probeDocument, element),
      shapedHitTesting: shapedHitTestRequirement(probeDocument, element),
    });
  } catch (error) {
    result = qualification({
      syntax,
      computedValues: requirement(false, { observable: false }),
      shapedHitTesting: requirement(false, { observable: false }),
    }, error);
  } finally {
    element?.remove();
    frame?.remove();
  }
  const observable = result.requirements.computedValues.observable !== false
    && result.requirements.shapedHitTesting.observable !== false;
  if (observable) CACHE.set(document, result);
  return result;
}
