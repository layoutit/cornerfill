import {
  insetCornerGeometry,
} from "./geometry.mjs";

export const CORNERFILL_PAINTER_SCHEMA = "cornerfill-production-painter@1";

function imageDimensions(image) {
  const width = image?.naturalWidth ?? image?.videoWidth ?? image?.width;
  const height = image?.naturalHeight ?? image?.videoHeight ?? image?.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new TypeError("raster paint requires a decoded image with intrinsic dimensions");
  }
  return [width, height];
}

export function traceClosedPoints(context, points, offsetX = 0, offsetY = 0) {
  if (!Array.isArray(points) || points.length < 2) throw new TypeError("a closed path needs at least two points");
  context.beginPath();
  appendClosedPoints(context, points, offsetX, offsetY);
}

function appendClosedPoints(context, points, offsetX = 0, offsetY = 0) {
  context.moveTo(points[0][0] + offsetX, points[0][1] + offsetY);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index][0] + offsetX, points[index][1] + offsetY);
  }
  context.closePath();
}

function clearSurface(context, width, height, dpr) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.clearRect(0, 0, Math.ceil(width * dpr), Math.ceil(height * dpr));
  context.restore();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.globalCompositeOperation = "source-over";
}

function fillRect(context, color, width, height) {
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
}

function drawNoRepeatImage(context, paint, width, height) {
  const image = paint.image;
  const [intrinsicWidth, intrinsicHeight] = imageDimensions(image);
  if (paint.sourceSize) {
    const [expectedWidth, expectedHeight] = paint.sourceSize;
    if (intrinsicWidth !== expectedWidth || intrinsicHeight !== expectedHeight) {
      throw new Error(
        `image dimensions changed: expected ${expectedWidth}x${expectedHeight}, `
        + `got ${intrinsicWidth}x${intrinsicHeight}`,
      );
    }
  }
  const [backgroundWidth, backgroundHeight] = paint.backgroundSize ?? [intrinsicWidth, intrinsicHeight];
  const [positionX, positionY] = paint.backgroundPosition ?? [0, 0];
  if (![backgroundWidth, backgroundHeight].every((value) => Number.isFinite(value) && value > 0)
    || ![positionX, positionY].every(Number.isFinite)) {
    throw new TypeError("raster background size and position must resolve to finite pixels");
  }
  const destinationLeft = Math.max(0, positionX);
  const destinationTop = Math.max(0, positionY);
  const destinationRight = Math.min(width, positionX + backgroundWidth);
  const destinationBottom = Math.min(height, positionY + backgroundHeight);
  if (destinationRight <= destinationLeft || destinationBottom <= destinationTop) {
    return Object.freeze({
      kind: "image",
      imageSize: Object.freeze([intrinsicWidth, intrinsicHeight]),
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
    imageSize: Object.freeze([intrinsicWidth, intrinsicHeight]),
    sourceRect: Object.freeze([sourceX, sourceY, sourceWidth, sourceHeight]),
    destinationRect: Object.freeze([
      destinationLeft,
      destinationTop,
      destinationRight - destinationLeft,
      destinationBottom - destinationTop,
    ]),
  });
}

function noRepeat(repeat) {
  return repeat === undefined || repeat === "no-repeat"
    || (repeat?.x === "no-repeat" && repeat?.y === "no-repeat");
}

function drawRasterImage(context, paint, width, height) {
  if (noRepeat(paint.repeat)) return drawNoRepeatImage(context, paint, width, height);
  const image = paint.image;
  const [intrinsicWidth, intrinsicHeight] = imageDimensions(image);
  if (paint.sourceSize) {
    const [expectedWidth, expectedHeight] = paint.sourceSize;
    if (intrinsicWidth !== expectedWidth || intrinsicHeight !== expectedHeight) {
      throw new Error(
        `image dimensions changed: expected ${expectedWidth}x${expectedHeight}, `
        + `got ${intrinsicWidth}x${intrinsicHeight}`,
      );
    }
  }
  const [backgroundWidth, backgroundHeight] = paint.backgroundSize ?? [];
  const xPositions = paint.tilePlan?.x ?? [];
  const yPositions = paint.tilePlan?.y ?? [];
  if (![backgroundWidth, backgroundHeight].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new TypeError("raster background size must resolve to finite non-negative pixels");
  }
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
    imageSize: Object.freeze([intrinsicWidth, intrinsicHeight]),
    tileSize: Object.freeze([backgroundWidth, backgroundHeight]),
    tilesDrawn,
    repeat: paint.repeat,
    sourceRect: tilesDrawn ? Object.freeze([0, 0, intrinsicWidth, intrinsicHeight]) : null,
    destinationRect: tilesDrawn
      ? Object.freeze([xPositions[0], yPositions[0], backgroundWidth, backgroundHeight])
      : null,
  });
}

function addGradientStops(gradient, stops) {
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
}

function gradientTiles(paint, width, height) {
  const [tileWidth, tileHeight] = paint.backgroundSize ?? [width, height];
  const xPositions = paint.tilePlan?.x ?? [0];
  const yPositions = paint.tilePlan?.y ?? [0];
  const tiles = [];
  if (tileWidth > 0 && tileHeight > 0) {
    for (const y of yPositions) for (const x of xPositions) tiles.push([x, y, tileWidth, tileHeight]);
  }
  return tiles;
}

function linearVector(line, width, height) {
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

function paintLinearGradientTile(context, paint, x, y, width, height) {
  let startX;
  let startY;
  let endX;
  let endY;
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
    startX = x + paint.from[0] * width;
    startY = y + paint.from[1] * height;
    endX = x + paint.to[0] * width;
    endY = y + paint.to[1] * height;
  }
  const gradient = context.createLinearGradient(startX, startY, endX, endY);
  addGradientStops(gradient, paint.stops);
  context.fillStyle = gradient;
  context.fillRect(x, y, width, height);
}

function paintRadialGradientTile(context, paint, x, y, width, height) {
  const centerX = x + paint.gradientCenter[0];
  const centerY = y + paint.gradientCenter[1];
  const [radiusX, radiusY] = paint.gradientRadii;
  context.save();
  context.translate(centerX, centerY);
  context.scale(1, radiusY / radiusX);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusX);
  addGradientStops(gradient, paint.stops);
  context.fillStyle = gradient;
  context.fillRect(
    x - centerX,
    (y - centerY) * radiusX / radiusY,
    width,
    height * radiusX / radiusY,
  );
  context.restore();
}

function paintConicGradientTile(context, paint, x, y, width, height) {
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

function paintGradient(context, paint, width, height) {
  const tiles = gradientTiles(paint, width, height);
  for (const [x, y, tileWidth, tileHeight] of tiles) {
    if (paint.kind === "linear-gradient") {
      paintLinearGradientTile(context, paint, x, y, tileWidth, tileHeight);
    } else if (paint.kind === "radial-gradient") {
      paintRadialGradientTile(context, paint, x, y, tileWidth, tileHeight);
    } else {
      paintConicGradientTile(context, paint, x, y, tileWidth, tileHeight);
    }
  }
  return Object.freeze({ kind: paint.kind, tilesDrawn: tiles.length });
}

export function paintOwnedLayer(context, paint, width, height) {
  if (!paint || typeof paint !== "object") throw new TypeError("paint state is required");
  if (paint.kind === "solid") {
    fillRect(context, paint.color, width, height);
    return Object.freeze({ kind: "solid", color: paint.color });
  }
  if (new Set(["linear-gradient", "radial-gradient", "conic-gradient"]).has(paint.kind)) {
    return paintGradient(context, paint, width, height);
  }
  if (paint.kind === "none") return Object.freeze({ kind: "none" });
  if (paint.kind === "image") {
    return drawRasterImage(context, paint, width, height);
  }
  throw new TypeError(`unsupported paint kind: ${paint.kind}`);
}

function fullyCoversBox(paint, width, height) {
  if (paint.kind !== "image" || paint.opaque !== true || !noRepeat(paint.repeat)
    || (paint.clipArea && paint.clipArea.name !== "border-box")) return false;
  const [backgroundWidth, backgroundHeight] = paint.backgroundSize ?? [];
  const [positionX, positionY] = paint.backgroundPosition ?? [];
  return [backgroundWidth, backgroundHeight, positionX, positionY].every(Number.isFinite)
    && positionX <= 0
    && positionY <= 0
    && positionX + backgroundWidth >= width
    && positionY + backgroundHeight >= height;
}

export function createPreparedOpaqueImageProgram({
  geometry,
  paint,
  dpr = geometry?.dpr ?? 1,
}) {
  if (!geometry || typeof geometry !== "object") throw new TypeError("resolved geometry is required");
  if (paint?.kind !== "image" || paint.opaque !== true) {
    throw new TypeError("prepared image updates require an explicitly opaque image paint");
  }
  if (!noRepeat(paint.repeat)) throw new TypeError("prepared image updates require no-repeat paint");
  const [intrinsicWidth, intrinsicHeight] = imageDimensions(paint.image);
  if (paint.sourceSize) {
    const [expectedWidth, expectedHeight] = paint.sourceSize;
    if (intrinsicWidth !== expectedWidth || intrinsicHeight !== expectedHeight) {
      throw new Error(
        `image dimensions changed: expected ${expectedWidth}x${expectedHeight}, `
        + `got ${intrinsicWidth}x${intrinsicHeight}`,
      );
    }
  }
  const [backgroundWidth, backgroundHeight] = paint.backgroundSize ?? [];
  const [positionX, positionY] = paint.backgroundPosition ?? [];
  if (![backgroundWidth, backgroundHeight].every((value) => Number.isFinite(value) && value > 0)
    || ![positionX, positionY].every(Number.isFinite)) {
    throw new TypeError("prepared image paint requires finite resolved size and position values");
  }
  if (!fullyCoversBox(paint, geometry.width, geometry.height)) {
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

function preparedImageRect(program, positionX, positionY) {
  return {
    sourceX: positionX === 0 ? 0 : -positionX * program.sourceScaleX,
    sourceY: positionY === 0 ? 0 : -positionY * program.sourceScaleY,
    sourceWidth: program.sourceWidth,
    sourceHeight: program.sourceHeight,
  };
}

export function preparePreparedOpaqueImageContext(context, program) {
  context.setTransform(program.dpr, 0, 0, program.dpr, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.imageSmoothingEnabled = program.imageSmoothing;
}

export function validatePreparedOpaqueImagePosition(program, positionX, positionY) {
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

export function drawPreparedOpaqueImage(context, program, positionX, positionY) {
  validatePreparedOpaqueImagePosition(program, positionX, positionY);
  const sourceX = positionX === 0 ? 0 : -positionX * program.sourceScaleX;
  const sourceY = positionY === 0 ? 0 : -positionY * program.sourceScaleY;
  context.drawImage(
    program.image,
    sourceX,
    sourceY,
    program.sourceWidth,
    program.sourceHeight,
    0,
    0,
    program.width,
    program.height,
  );
}

export function repaintPreparedOpaqueImage(context, program, positionX, positionY) {
  preparePreparedOpaqueImageContext(context, program);
  drawPreparedOpaqueImage(context, program, positionX, positionY);
}

export function explainPreparedOpaqueImage(program, positionX, positionY) {
  const rect = preparedImageRect(program, positionX, positionY);
  return Object.freeze({
    painter: CORNERFILL_PAINTER_SCHEMA,
    layer: Object.freeze({
      kind: "image",
      imageSize: Object.freeze([program.intrinsicWidth, program.intrinsicHeight]),
      sourceRect: Object.freeze([
        rect.sourceX,
        rect.sourceY,
        rect.sourceWidth,
        rect.sourceHeight,
      ]),
      destinationRect: Object.freeze([0, 0, program.width, program.height]),
    }),
    border: null,
    update: "prepared-opaque-source-in",
  });
}

export function repaintOpaqueCornerfill(context, {
  geometry,
  paint,
  border = null,
  shadow = null,
  outline = null,
  dpr = geometry?.dpr ?? 1,
}) {
  if (!geometry || typeof geometry !== "object") throw new TypeError("resolved geometry is required");
  if (border || shadow || outline || !fullyCoversBox(paint, geometry.width, geometry.height)) return null;
  context.save();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.globalCompositeOperation = "source-in";
  const layer = paintOwnedLayer(context, paint, geometry.width, geometry.height);
  context.restore();
  return Object.freeze({
    painter: CORNERFILL_PAINTER_SCHEMA,
    layer,
    border: null,
    update: "opaque-source-in",
  });
}

function subtractCarveOuts(context, carveOuts) {
  context.save();
  context.globalCompositeOperation = "destination-out";
  context.fillStyle = "#000";
  for (const carveOut of carveOuts) {
    traceClosedPoints(context, carveOut);
    context.fill();
  }
  context.restore();
}

function supportedBorder(border) {
  if (!border) return null;
  const widths = border.widths ?? [border.width, border.width, border.width, border.width];
  if (!Array.isArray(widths) || widths.length !== 4
    || widths.some((width) => !Number.isFinite(width) || width < 0)
    || widths.every((width) => width === 0) || !border.color) {
    throw new TypeError("border requires four non-negative widths and one color");
  }
  if (border.styles?.some((style, index) => widths[index] > 0 && style !== "solid")) {
    throw new TypeError("painted border sides must use solid style");
  }
  return Object.freeze({ ...border, widths: Object.freeze([...widths]), color: String(border.color) });
}

function clipPolygonEdge(points, inside, intersection) {
  if (points.length === 0) return points;
  const output = [];
  let previous = points.at(-1);
  let previousInside = inside(previous);
  for (const point of points) {
    const pointInside = inside(point);
    if (pointInside !== previousInside) output.push(intersection(previous, point));
    if (pointInside) output.push(point);
    previous = point;
    previousInside = pointInside;
  }
  return output;
}

function clipContourToRect(points, rect) {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const verticalIntersection = (x) => (first, second) => {
    const ratio = (x - first[0]) / (second[0] - first[0]);
    return [x, first[1] + (second[1] - first[1]) * ratio];
  };
  const horizontalIntersection = (y) => (first, second) => {
    const ratio = (y - first[1]) / (second[1] - first[1]);
    return [first[0] + (second[0] - first[0]) * ratio, y];
  };
  let clipped = [...points];
  clipped = clipPolygonEdge(clipped, ([x]) => x >= left, verticalIntersection(left));
  clipped = clipPolygonEdge(clipped, ([x]) => x <= right, verticalIntersection(right));
  clipped = clipPolygonEdge(clipped, ([, y]) => y >= top, horizontalIntersection(top));
  clipped = clipPolygonEdge(clipped, ([, y]) => y <= bottom, horizontalIntersection(bottom));
  return clipped;
}

function contourAtInsets(geometry, insets) {
  if (insets.every((value) => value === 0)) return geometry.contour;
  const inset = insetCornerGeometry(geometry, insets);
  if (inset.contour.length < 2 || inset.targetRect.width <= 0 || inset.targetRect.height <= 0) return [];
  return clipContourToRect(inset.contour, inset.targetRect);
}

function paintContourRing(context, outerContour, innerContour, color) {
  if (outerContour.length < 2) return false;
  context.save();
  context.beginPath();
  appendClosedPoints(context, outerContour);
  if (innerContour.length > 1) appendClosedPoints(context, innerContour);
  context.fillStyle = color;
  context.fill("evenodd");
  context.restore();
  return true;
}

function paintInsetShadow(context, geometry, shadow, border) {
  if (!shadow) return null;
  if (shadow.kind !== "inset-solid-ring" || !Number.isFinite(shadow.spread)
    || shadow.spread <= 0 || !shadow.color) {
    throw new TypeError("unsupported inset shadow descriptor");
  }
  const baseInsets = border?.widths ?? [0, 0, 0, 0];
  const innerInsets = baseInsets.map((value) => value + shadow.spread);
  paintContourRing(
    context,
    contourAtInsets(geometry, baseInsets),
    contourAtInsets(geometry, innerInsets),
    shadow.color,
  );
  return Object.freeze({
    kind: shadow.kind,
    spread: shadow.spread,
    color: shadow.color,
  });
}

function paintContainedOutline(context, geometry, outline) {
  if (!outline) return null;
  if (outline.kind !== "contained-solid-ring" || !Number.isFinite(outline.width)
    || !Number.isFinite(outline.offset) || outline.width <= 0
    || outline.offset + outline.width > 0 || !outline.color) {
    throw new TypeError("unsupported contained outline descriptor");
  }
  const outerInset = Math.max(0, -(outline.offset + outline.width));
  const innerInset = Math.max(0, -outline.offset);
  paintContourRing(
    context,
    contourAtInsets(geometry, [outerInset, outerInset, outerInset, outerInset]),
    contourAtInsets(geometry, [innerInset, innerInset, innerInset, innerInset]),
    outline.color,
  );
  return Object.freeze({
    kind: outline.kind,
    width: outline.width,
    offset: outline.offset,
    color: outline.color,
  });
}

function clipToBackgroundArea(context, geometry, area) {
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

function paintBackground(context, geometry, paint) {
  const paintClipped = (layer, clipArea) => {
    context.save();
    const visible = clipToBackgroundArea(context, geometry, clipArea);
    const result = visible
      ? paintOwnedLayer(context, layer, geometry.width, geometry.height)
      : Object.freeze({ kind: layer.kind, emptyClip: true });
    context.restore();
    return result;
  };
  const transparent = (color) => !color
    || color === "transparent"
    || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/iu.test(color)
    || /\/\s*0(?:\.0+)?\s*\)$/u.test(color);
  let layer;
  if (paint.kind === "layers") {
    const color = transparent(paint.color)
      ? null
      : paintClipped({ kind: "solid", color: paint.color }, paint.colorClipArea);
    const results = new Array(paint.layers.length);
    for (let index = paint.layers.length - 1; index >= 0; index -= 1) {
      results[index] = paintClipped(paint.layers[index], paint.layers[index].clipArea);
    }
    layer = Object.freeze({
      kind: "layers",
      color,
      layers: Object.freeze(results),
    });
  } else {
    if (paint.kind !== "solid" && !transparent(paint.color)) {
      paintClipped({ kind: "solid", color: paint.color }, paint.clipArea);
    }
    layer = paintClipped(paint, paint.clipArea);
  }
  subtractCarveOuts(context, geometry.carveOuts);
  return layer;
}

export function paintCornerfill(context, {
  geometry,
  paint,
  border = null,
  shadow = null,
  outline = null,
  dpr = geometry?.dpr ?? 1,
}) {
  if (!geometry || typeof geometry !== "object") throw new TypeError("resolved geometry is required");
  const { width, height } = geometry;
  clearSurface(context, width, height, dpr);
  const ownedBorder = supportedBorder(border);

  const layer = paintBackground(context, geometry, paint);
  const shadowResult = paintInsetShadow(context, geometry, shadow, ownedBorder);
  let borderResult = null;
  if (ownedBorder) {
    paintContourRing(
      context,
      geometry.contour,
      contourAtInsets(geometry, ownedBorder.widths),
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
