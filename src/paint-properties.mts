const OWNED_PAINT_PROPERTIES = new Set([
  "-webkit-appearance",
  "-webkit-backdrop-filter",
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

export function standardPropertyAffectsOwnedPaint(property: string): boolean {
  return OWNED_PAINT_PROPERTIES.has(property)
    || OWNED_PAINT_PREFIXES.some((prefix) => (
      property === prefix || property.startsWith(`${prefix}-`)
    ));
}

export function propertyAffectsOwnedPaint(property: string): boolean {
  return property.startsWith("--") || standardPropertyAffectsOwnedPaint(property);
}
