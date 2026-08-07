const OWNED_PAINT_PROPERTIES = new Set([
  "all",
  "appearance",
  "aspect-ratio",
  "backdrop-filter",
  "block-size",
  "border-collapse",
  "box-shadow",
  "box-sizing",
  "color",
  "color-scheme",
  "contain",
  "content",
  "content-visibility",
  "direction",
  "display",
  "forced-color-adjust",
  "height",
  "image-rendering",
  "inline-size",
  "line-height",
  "max-block-size",
  "max-height",
  "max-inline-size",
  "max-width",
  "min-block-size",
  "min-height",
  "min-inline-size",
  "min-width",
  "text-orientation",
  "visibility",
  "width",
  "writing-mode",
]);

const OWNED_PAINT_ALIAS_PREFIXES = Object.freeze(["-moz-", "-webkit-"]);

const OWNED_PAINT_PREFIXES = Object.freeze([
  "background",
  "border",
  "corner",
  "font",
  "list-style",
  "outline",
  "overflow",
  "padding",
]);

const INHERITED_OWNED_PAINT_PROPERTIES = new Set([
  "color",
  "color-scheme",
  "direction",
  "forced-color-adjust",
  "image-rendering",
  "line-height",
  "text-orientation",
  "visibility",
  "writing-mode",
]);

function canonicalOwnedPaintProperty(property: string): string {
  const normalized = property.toLowerCase();
  for (const prefix of OWNED_PAINT_ALIAS_PREFIXES) {
    if (!normalized.startsWith(prefix)) continue;
    const unprefixed = normalized.slice(prefix.length);
    if (OWNED_PAINT_PROPERTIES.has(unprefixed)
      || OWNED_PAINT_PREFIXES.some((candidate) => (
        unprefixed === candidate || unprefixed.startsWith(`${candidate}-`)
      ))) return unprefixed;
  }
  return normalized;
}

export function standardPropertyAffectsOwnedPaint(property: string): boolean {
  const canonical = canonicalOwnedPaintProperty(property);
  return OWNED_PAINT_PROPERTIES.has(canonical)
    || OWNED_PAINT_PREFIXES.some((prefix) => (
      canonical === prefix || canonical.startsWith(`${prefix}-`)
    ));
}

export function standardPropertyInheritsIntoOwnedPaint(property: string): boolean {
  const canonical = canonicalOwnedPaintProperty(property);
  return canonical === "all"
    || INHERITED_OWNED_PAINT_PROPERTIES.has(canonical)
    || canonical === "font"
    || canonical.startsWith("font-");
}

export function propertyAffectsOwnedPaint(property: string): boolean {
  return property.startsWith("--") || standardPropertyAffectsOwnedPaint(property);
}
