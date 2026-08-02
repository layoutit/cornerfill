export const CORNERFILL_NATIVE_QUALIFICATION_SCHEMA = "cornerfill-native-qualification@1";
export const CORNERFILL_ORACLE_QUALIFICATION = Object.freeze({
  schema: "cornerfill-oracle-qualification@1",
  nativeCalibration: Object.freeze({
    status: "PASS",
    scope: "same-fixture native A/A capture",
    approvedTolerance: true,
    exactZeroTolerance: true,
  }),
  candidate: Object.freeze({
    status: "UNQUALIFIED",
    approvedTolerance: false,
    reason: "No native-versus-candidate pixel tolerance has been approved.",
  }),
});

export interface CornerfillNativeSyntaxProbes {
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
  readonly shapedBehavior: Readonly<CornerfillNativeRequirement>;
}

export interface CornerfillNativeQualification {
  readonly schema: typeof CORNERFILL_NATIVE_QUALIFICATION_SCHEMA;
  readonly qualified: boolean;
  readonly requirements: Readonly<CornerfillNativeRequirements>;
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
const LONGHANDS = Object.freeze([
  "corner-top-left-shape",
  "corner-top-right-shape",
  "corner-bottom-right-shape",
  "corner-bottom-left-shape",
]);
const EXPECTED_LONGHANDS = Object.freeze(["bevel", "scoop", "round", "notch"]);

function requirement(
  supported: boolean,
  details: RequirementDetails = {},
): Readonly<CornerfillNativeRequirement> {
  return Object.freeze({ supported, ...details });
}

function unresolvedRequirements(
  requirements: CornerfillNativeRequirements,
): readonly (keyof CornerfillNativeRequirements)[] {
  return Object.freeze((Object.keys(requirements) as (keyof CornerfillNativeRequirements)[])
    .filter((name) => !requirements[name].supported));
}

function qualification(
  requirements: CornerfillNativeRequirements,
  error: unknown = null,
): Readonly<CornerfillNativeQualification> {
  const unresolved = unresolvedRequirements(requirements);
  const qualified = unresolved.length === 0;
  return Object.freeze({
    schema: CORNERFILL_NATIVE_QUALIFICATION_SCHEMA,
    qualified,
    requirements: Object.freeze(requirements),
    unresolved,
    reason: qualified
      ? "Required corner-shape syntax, computed values, and shaped behavior were observed."
      : `Native corner-shape is unqualified: ${unresolved.join(", ") || "probe failure"}.`,
    ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
  });
}

function syntaxRequirement(view: Window): Readonly<CornerfillNativeRequirement> {
  const css = (view as CssSupportWindow).CSS;
  const probes = Object.freeze({
    shorthand: Boolean(css?.supports?.("corner-shape", "bevel scoop round notch")),
    longhand: Boolean(css?.supports?.("corner-top-left-shape", "notch")),
    convexSuperellipse: Boolean(css?.supports?.("corner-shape", "superellipse(2)")),
    concaveSuperellipse: Boolean(css?.supports?.("corner-shape", "superellipse(-1)")),
  });
  return requirement(Object.values(probes).every(Boolean), { probes });
}

function probeElement(document: Document): HTMLDivElement {
  const element = document.createElement("div");
  element.setAttribute("aria-hidden", "true");
  Object.assign(element.style, {
    all: "initial",
    background: "rgb(1, 2, 3)",
    border: "0 solid transparent",
    boxSizing: "border-box",
    contain: "strict",
    display: "block",
    margin: "0",
    padding: "0",
    pointerEvents: "auto",
    position: "fixed",
    zIndex: "2147483647",
  });
  return element;
}

function computedRequirement(
  document: Document,
  element: HTMLElement,
): Readonly<CornerfillNativeRequirement> {
  element.style.setProperty("corner-shape", EXPECTED_LONGHANDS.join(" "));
  const computed = document.defaultView!.getComputedStyle(element);
  const shorthand = computed.getPropertyValue("corner-shape").trim();
  const longhands = Object.freeze(LONGHANDS.map((property) => (
    computed.getPropertyValue(property).trim()
  )));
  return requirement(
    shorthand === EXPECTED_LONGHANDS.join(" ")
      && longhands.every((value, index) => value === EXPECTED_LONGHANDS[index]),
    { shorthand, longhands },
  );
}

function behaviorRequirement(
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
  Object.assign(element.style, {
    borderRadius: `${size / 2}px`,
    height: `${size}px`,
    left: `${left}px`,
    top: `${top}px`,
    width: `${size}px`,
  });
  const x = left + Math.round(size * 0.15);
  const y = top + Math.round(size * 0.2);
  element.style.setProperty("corner-shape", "bevel");
  view.getComputedStyle(element).getPropertyValue("corner-shape");
  const bevelExcludes = document.elementFromPoint(x, y) !== element;
  element.style.setProperty("corner-shape", "round");
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
  Object.assign(frame.style, {
    border: "0",
    height: "128px",
    left: "0",
    opacity: "0",
    pointerEvents: "none",
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
      shapedBehavior: requirement(false, { observable: false }),
    });
    CACHE.set(document, result);
    return result;
  }

  let frame: HTMLIFrameElement | null = null;
  let element: HTMLElement | null = null;
  let result: Readonly<CornerfillNativeQualification>;
  try {
    const isolated = isolatedProbeDocument(document);
    frame = isolated.frame;
    element = probeElement(isolated.document);
    isolated.document.documentElement.append(element);
    result = qualification({
      syntax,
      computedValues: computedRequirement(isolated.document, element),
      shapedBehavior: behaviorRequirement(isolated.document, element),
    });
  } catch (error) {
    result = qualification({
      syntax,
      computedValues: requirement(false, { observable: false }),
      shapedBehavior: requirement(false, { observable: false }),
    }, error);
  } finally {
    element?.remove();
    frame?.remove();
  }
  const observable = result.requirements.computedValues.observable !== false
    && result.requirements.shapedBehavior.observable !== false;
  if (observable) CACHE.set(document, result);
  return result;
}
