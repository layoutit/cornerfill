import type { CornerfillSurface } from "./backends.mjs";
import { nextDocumentId } from "./identity.mjs";
import { isFullyTransparentCssColor } from "./paint.mjs";
import { splitTopLevelCommas } from "./values.mjs";

export type CornerfillElement = Element & ElementCSSInlineStyle & Readonly<{
  offsetHeight: number;
  offsetWidth: number;
}>;

export type OwnershipRoot = Document | ShadowRoot;

export interface OwnershipSnapshot {
  readonly borderOwner: string | null;
  readonly owner: string | null;
  readonly surfaceOwner: string | null;
}

export interface OwnershipEntry {
  readonly border: unknown;
  readonly disposed: boolean;
  readonly element: CornerfillElement;
  readonly ownershipRoot: OwnershipRoot;
  ownershipToken: string | null;
  ownershipVerified: boolean;
  readonly surface: CornerfillSurface | null;
}

interface OwnershipSurface {
  readonly image: string;
  readonly root: OwnershipRoot;
}

interface OwnershipSurfaceRule {
  readonly root: OwnershipRoot;
  readonly rule: CSSStyleRule;
}

export const OWNERSHIP_ATTRIBUTE = "data-cornerfill-owned";
export const OWNED_BORDER_ATTRIBUTE = "data-cornerfill-owned-border";
export const OWNED_SURFACE_ATTRIBUTE = "data-cornerfill-owned-surface";
export const AUTHOR_IMPORTANT_OWNERSHIP_REASON =
  "Author !important background, border, or radius declarations that outrank Cornerfill ownership are rejected.";

export const LIVE_IMAGE_PROPERTY = "--cornerfill-live-image";
const OWNED_RADIUS_PROPERTIES = Object.freeze([
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
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
  ...OWNED_RADIUS_PROPERTIES,
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-end-radius",
  "border-end-start-radius",
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
  LIVE_IMAGE_PROPERTY,
]);

function numberFromPx(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

function stylesheetText(id: string): string {
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
    + `  border-top-color: transparent !important;\n`
    + `  border-right-color: transparent !important;\n`
    + `  border-bottom-color: transparent !important;\n`
    + `  border-left-color: transparent !important;\n`
    + `  border-top-left-radius: 0 !important;\n`
    + `  border-top-right-radius: 0 !important;\n`
    + `  border-bottom-right-radius: 0 !important;\n`
    + `  border-bottom-left-radius: 0 !important;\n`
    + `}\n`;
}

export function captureOwnershipState(element: CornerfillElement): Readonly<OwnershipSnapshot> {
  return Object.freeze({
    owner: element.getAttribute(OWNERSHIP_ATTRIBUTE),
    borderOwner: element.getAttribute(OWNED_BORDER_ATTRIBUTE),
    surfaceOwner: element.getAttribute(OWNED_SURFACE_ATTRIBUTE),
  });
}

export function restoreOwnershipState(
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

export function assertCooperativeOwnership(element: CornerfillElement): void {
  const conflicts = COOPERATIVE_OWNERSHIP_PROPERTIES.filter(
    (property) => element.style.getPropertyPriority(property) === "important",
  );
  if (conflicts.length > 0) {
    throw new TypeError(`${AUTHOR_IMPORTANT_OWNERSHIP_REASON} Conflicts: ${conflicts.join(", ")}`);
  }
}

export class OwnershipManager<Entry extends OwnershipEntry> {
  readonly id: string;
  private readonly document: Document;
  private readonly view: Window;
  private readonly nonce: string | null;
  private readonly stylesheets = new Map<OwnershipRoot, HTMLStyleElement>();
  private readonly surfaces = new Map<Entry, Readonly<OwnershipSurface>>();
  private readonly surfaceRules = new Map<Entry, Readonly<OwnershipSurfaceRule>>();
  private readonly freeRules = new Map<OwnershipRoot, CSSStyleRule[]>();
  private readonly verificationEntries = new Map<Entry, () => boolean>();
  private verification: Promise<Map<Entry, unknown>> | null = null;
  private nextToken = 0;
  private destroyed = false;

  constructor(document: Document, nonce: string | null = null) {
    if (!document.defaultView) throw new TypeError("Cornerfill ownership requires a browser document");
    this.document = document;
    this.view = document.defaultView;
    this.nonce = nonce;
    this.id = nextDocumentId(document, "controller", "cornerfill-controller");
  }

  private stylesheetIsConnected(root: OwnershipRoot): boolean {
    return Boolean(this.stylesheets.get(root)?.isConnected);
  }

  private selector(entry: Entry): string {
    return `[${OWNERSHIP_ATTRIBUTE}="${this.id}"]`
      + `[${OWNED_SURFACE_ATTRIBUTE}="${entry.ownershipToken}"]`;
  }

  private surfaceRuleIsCurrent(
    entry: Entry,
    surface: Readonly<OwnershipSurface> | undefined = this.surfaces.get(entry),
  ): boolean {
    const record = this.surfaceRules.get(entry);
    const stylesheet = surface ? this.stylesheets.get(surface.root) : undefined;
    return Boolean(record && surface && stylesheet?.isConnected
      && record.root === surface.root
      && record.rule.parentStyleSheet === stylesheet.sheet
      && record.rule.selectorText === this.selector(entry)
      && record.rule.style.getPropertyValue(LIVE_IMAGE_PROPERTY).trim() === surface.image
      && record.rule.style.getPropertyPriority(LIVE_IMAGE_PROPERTY) === "important");
  }

  private releaseSurfaceRule(entry: Entry): void {
    const record = this.surfaceRules.get(entry);
    if (!record) return;
    this.surfaceRules.delete(entry);
    const style = this.stylesheets.get(record.root);
    if (!style?.isConnected || record.rule.parentStyleSheet !== style.sheet) return;
    record.rule.selectorText = ":not(*)";
    record.rule.style.removeProperty(LIVE_IMAGE_PROPERTY);
    let free = this.freeRules.get(record.root);
    if (!free) {
      free = [];
      this.freeRules.set(record.root, free);
    }
    free.push(record.rule);
  }

  private assignSurfaceRule(entry: Entry, surface: Readonly<OwnershipSurface>): void {
    if (this.surfaceRuleIsCurrent(entry, surface)) return;
    this.releaseSurfaceRule(entry);
    const style = this.stylesheets.get(surface.root);
    const sheet = style?.sheet;
    if (!style?.isConnected || !sheet) throw new Error("Cornerfill ownership stylesheet is unavailable");
    const free = this.freeRules.get(surface.root);
    let rule = free?.pop() ?? null;
    if (free?.length === 0) this.freeRules.delete(surface.root);
    const selector = this.selector(entry);
    if (!rule) {
      const index = sheet.insertRule(`${selector}{${LIVE_IMAGE_PROPERTY}:${surface.image}!important}`);
      rule = sheet.cssRules[index] as CSSStyleRule | undefined ?? null;
    } else {
      rule.selectorText = selector;
      rule.style.setProperty(LIVE_IMAGE_PROPERTY, surface.image, "important");
    }
    if (!rule) throw new Error("Cornerfill ownership rule was not created");
    this.surfaceRules.set(entry, Object.freeze({ root: surface.root, rule }));
  }

  private ensureStylesheet(root: OwnershipRoot): HTMLStyleElement {
    if (this.destroyed) throw new Error("Cornerfill ownership is destroyed");
    const existing = this.stylesheets.get(root);
    if (existing?.isConnected) return existing;
    existing?.remove();
    this.freeRules.delete(root);
    for (const [entry, record] of this.surfaceRules) {
      if (record.root === root) this.surfaceRules.delete(entry);
    }
    const style = this.document.createElement("style");
    style.setAttribute("data-cornerfill-ownership-styles", this.id);
    if (this.nonce) style.setAttribute("nonce", this.nonce);
    style.textContent = stylesheetText(this.id);
    if (root === this.document) (this.document.head ?? this.document.documentElement).append(style);
    else root.append(style);
    this.stylesheets.set(root, style);
    for (const [entry, surface] of this.surfaces) {
      if (!entry.disposed && surface.root === root) this.assignSurfaceRule(entry, surface);
    }
    return style;
  }

  private setSurface(entry: Entry): void {
    const surface = entry.surface;
    if (!surface) throw new Error("Cornerfill surface is unavailable");
    entry.ownershipToken ??= `${this.id}-surface-${++this.nextToken}`;
    const previous = this.surfaces.get(entry);
    const next = Object.freeze({ root: entry.ownershipRoot, image: surface.cssImage });
    if (previous?.root === next.root && previous.image === next.image
      && entry.element.getAttribute(OWNED_SURFACE_ATTRIBUTE) === entry.ownershipToken
      && this.surfaceRuleIsCurrent(entry, next)) return;
    if (previous && previous.root !== next.root) this.releaseSurfaceRule(entry);
    this.surfaces.set(entry, next);
    entry.element.setAttribute(OWNED_SURFACE_ATTRIBUTE, entry.ownershipToken);
    this.ensureStylesheet(next.root);
    this.assignSurfaceRule(entry, next);
  }

  apply(entry: Entry, verify = true): void {
    if (!entry.surface) return;
    this.ensureStylesheet(entry.ownershipRoot);
    this.setSurface(entry);
    entry.element.setAttribute(OWNERSHIP_ATTRIBUTE, this.id);
    if (entry.border) entry.element.setAttribute(OWNED_BORDER_ATTRIBUTE, this.id);
    else entry.element.removeAttribute(OWNED_BORDER_ATTRIBUTE);
    if (verify) this.assertStylesApplied(entry);
  }

  remove(entry: Entry): void {
    this.releaseSurfaceRule(entry);
    this.surfaces.delete(entry);
  }

  isApplied(entry: Entry): boolean {
    const record = this.surfaces.get(entry);
    return Boolean(entry.surface && record)
      && this.stylesheetIsConnected(entry.ownershipRoot)
      && entry.element.getAttribute(OWNERSHIP_ATTRIBUTE) === this.id
      && entry.element.getAttribute(OWNED_SURFACE_ATTRIBUTE) === entry.ownershipToken
      && record!.root === entry.ownershipRoot
      && record!.image === entry.surface!.cssImage
      && this.surfaceRuleIsCurrent(entry, record);
  }

  withAuthoredComputedStyle<T>(
    entry: Entry,
    callback: (computed: CSSStyleDeclaration) => T,
  ): T {
    const ownership = entry.element.getAttribute(OWNERSHIP_ATTRIBUTE);
    const ownedBorder = entry.element.getAttribute(OWNED_BORDER_ATTRIBUTE);
    if (ownership !== this.id) return callback(this.view.getComputedStyle(entry.element));
    entry.element.removeAttribute(OWNERSHIP_ATTRIBUTE);
    entry.element.removeAttribute(OWNED_BORDER_ATTRIBUTE);
    try {
      return callback(this.view.getComputedStyle(entry.element));
    } finally {
      entry.element.setAttribute(OWNERSHIP_ATTRIBUTE, ownership);
      if (ownedBorder !== null) entry.element.setAttribute(OWNED_BORDER_ATTRIBUTE, ownedBorder);
    }
  }

  assertStylesApplied(entry: Entry): void {
    const surface = entry.surface;
    if (!surface) throw new Error("Cornerfill surface is unavailable");
    const computed = this.view.getComputedStyle(entry.element);
    const image = computed.backgroundImage;
    const imageLayers = splitTopLevelCommas(image);
    const onlyImage = imageLayers.length === 1 ? imageLayers[0]! : "";
    const expectedImage = surface.backend === "static-data-url"
      ? onlyImage === surface.cssImage || onlyImage.includes(surface.cssImage.slice(5, -2))
      : onlyImage.replace(/\s+/gu, "") === surface.cssImage.replace(/\s+/gu, "");
    const transparent = isFullyTransparentCssColor(computed.backgroundColor);
    const radiiOwned = OWNED_RADIUS_PROPERTIES.every((property) => (
      numberFromPx(computed.getPropertyValue(property)) === 0
    ));
    const borderOwned = [
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
        `${AUTHOR_IMPORTANT_OWNERSHIP_REASON} `
        + `Computed ownership: image=${image}, color=${computed.backgroundColor}.`,
      );
    }
    entry.ownershipVerified = true;
  }

  verifyPrepared(entry: Entry, isCurrent: () => boolean): Promise<void> {
    this.verificationEntries.set(entry, isCurrent);
    if (!this.verification) {
      this.verification = new Promise<Map<Entry, unknown>>((resolve) => {
        this.view.setTimeout(() => {
          const failures = new Map<Entry, unknown>();
          const entries = [...this.verificationEntries];
          this.verificationEntries.clear();
          for (const [candidate, current] of entries) {
            if (!current() || !candidate.surface) continue;
            try {
              this.assertStylesApplied(candidate);
            } catch (error) {
              failures.set(candidate, error);
            }
          }
          resolve(failures);
        }, 0);
      }).finally(() => {
        this.verification = null;
      });
    }
    return this.verification.then((failures) => {
      const failure = failures.get(entry);
      if (failure) throw failure;
      return undefined;
    });
  }

  releaseRoot(root: OwnershipRoot): void {
    this.stylesheets.get(root)?.remove();
    this.stylesheets.delete(root);
    this.freeRules.delete(root);
    for (const [entry, record] of this.surfaceRules) {
      if (record.root === root) this.surfaceRules.delete(entry);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const stylesheet of this.stylesheets.values()) stylesheet.remove();
    this.stylesheets.clear();
    this.surfaces.clear();
    this.surfaceRules.clear();
    this.freeRules.clear();
    this.verificationEntries.clear();
  }
}
