import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function channelsForColorType(colorType) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new Error(`unsupported PNG color type ${colorType}`);
}

export function decodePngBuffer(buffer, label = "PNG") {
  if (!Buffer.isBuffer(buffer) || buffer.length < PNG_SIGNATURE.length
    || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error(`invalid PNG signature: ${label}`);
  }
  let offset = PNG_SIGNATURE.length;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`truncated ${type} chunk: ${label}`);
    const data = buffer.subarray(dataStart, dataEnd);
    offset = dataEnd + 4;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      interlace = data[12];
      if (bitDepth !== 8 || compression !== 0 || filter !== 0 || interlace !== 0) {
        throw new Error(
          `unsupported PNG encoding bitDepth=${bitDepth} compression=${compression} `
          + `filter=${filter} interlace=${interlace}: ${label}`,
        );
      }
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || idat.length === 0) {
    throw new Error(`PNG is missing IHDR or IDAT: ${label}`);
  }
  const channels = channelsForColorType(colorType);
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  if (inflated.length !== (stride + 1) * height) {
    throw new Error(`unexpected PNG payload length: ${label}`);
  }
  const rgba = Buffer.alloc(width * height * 4);
  let sourceOffset = 0;
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = Buffer.from(inflated.subarray(sourceOffset, sourceOffset + stride));
    sourceOffset += stride;
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? row[index - channels] : 0;
      const up = previous[index];
      const upLeft = index >= channels ? previous[index - channels] : 0;
      if (filter === 1) row[index] = (row[index] + left) & 255;
      else if (filter === 2) row[index] = (row[index] + up) & 255;
      else if (filter === 3) row[index] = (row[index] + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[index] = (row[index] + paeth(left, up, upLeft)) & 255;
      else if (filter !== 0) throw new Error(`unsupported PNG row filter ${filter}: ${label}`);
    }
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      if (colorType === 0) {
        rgba[target] = row[source];
        rgba[target + 1] = row[source];
        rgba[target + 2] = row[source];
        rgba[target + 3] = 255;
      } else if (colorType === 2) {
        rgba[target] = row[source];
        rgba[target + 1] = row[source + 1];
        rgba[target + 2] = row[source + 2];
        rgba[target + 3] = 255;
      } else if (colorType === 4) {
        rgba[target] = row[source];
        rgba[target + 1] = row[source];
        rgba[target + 2] = row[source];
        rgba[target + 3] = row[source + 1];
      } else {
        rgba[target] = row[source];
        rgba[target + 1] = row[source + 1];
        rgba[target + 2] = row[source + 2];
        rgba[target + 3] = row[source + 3];
      }
    }
    previous = row;
  }
  return Object.freeze({ width, height, pixels: rgba });
}

export function readPng(path) {
  return decodePngBuffer(readFileSync(path), path);
}

let crcTable;

function makeCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

function crc32(buffer) {
  crcTable ??= makeCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return output;
}

export function encodePng({ width, height, pixels }) {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new TypeError("PNG dimensions must be positive integers");
  }
  if (!Buffer.isBuffer(pixels) && !(pixels instanceof Uint8Array)) {
    throw new TypeError("PNG pixels must be an RGBA byte buffer");
  }
  if (pixels.length !== width * height * 4) throw new RangeError("PNG RGBA buffer has the wrong length");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4)
      .copy(raw, rowOffset + 1);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function writePng(path, image) {
  writeFileSync(path, encodePng(image));
}

function median3(a, b, c) {
  return a + b + c - Math.min(a, b, c) - Math.max(a, b, c);
}

export function reconstructTransparencyFromBlackAndWhite(black, white) {
  if (black.width !== white.width || black.height !== white.height) {
    throw new Error(
      `opaque-pair dimensions differ: ${black.width}x${black.height} vs ${white.width}x${white.height}`,
    );
  }
  const pixels = Buffer.alloc(black.pixels.length);
  let maxChannelSpread = 0;
  let pixelsWithChannelSpreadAboveOne = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (black.pixels[offset + 3] !== 255 || white.pixels[offset + 3] !== 255) {
      throw new Error(`opaque-pair input contains transparency at pixel ${offset / 4}`);
    }
    const deltas = [0, 1, 2].map((channel) => (
      Math.max(0, Math.min(255, white.pixels[offset + channel] - black.pixels[offset + channel]))
    ));
    const spread = Math.max(...deltas) - Math.min(...deltas);
    maxChannelSpread = Math.max(maxChannelSpread, spread);
    if (spread > 1) pixelsWithChannelSpreadAboveOne += 1;
    const alpha = 255 - median3(...deltas);
    pixels[offset + 3] = alpha;
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[offset + channel] = alpha === 0
        ? 0
        : Math.max(0, Math.min(255, Math.round(black.pixels[offset + channel] * 255 / alpha)));
    }
  }
  return Object.freeze({
    width: black.width,
    height: black.height,
    pixels,
    diagnostics: Object.freeze({
      maxChannelSpread,
      pixelsWithChannelSpreadAboveOne,
      pixelCount: black.width * black.height,
    }),
  });
}

function alphaBoundaryMask(image) {
  const { width, height, pixels } = image;
  const raw = new Uint8Array(width * height);
  const alphaAt = (x, y) => pixels[(y * width + x) * 4 + 3];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = alphaAt(x, y);
      let boundary = alpha > 0 && alpha < 255;
      if (!boundary && x > 0) boundary = alphaAt(x - 1, y) !== alpha;
      if (!boundary && x + 1 < width) boundary = alphaAt(x + 1, y) !== alpha;
      if (!boundary && y > 0) boundary = alphaAt(x, y - 1) !== alpha;
      if (!boundary && y + 1 < height) boundary = alphaAt(x, y + 1) !== alpha;
      if (boundary) raw[y * width + x] = 1;
    }
  }
  const dilated = new Uint8Array(raw);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!raw[y * width + x]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
            dilated[nextY * width + nextX] = 1;
          }
        }
      }
    }
  }
  return dilated;
}

function connectedRegions(mask, width, height) {
  const visited = new Uint8Array(mask.length);
  const regions = [];
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let pixels = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      pixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (let direction = 0; direction < neighbors.length; direction += 1) {
        const next = neighbors[direction];
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue;
        if (direction === 0 && x === 0) continue;
        if (direction === 1 && x + 1 === width) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    regions.push(Object.freeze({ pixels, bounds: Object.freeze([minX, minY, maxX + 1, maxY + 1]) }));
  }
  return Object.freeze(regions.sort((a, b) => b.pixels - a.pixels));
}

export function comparePngImages(expected, actual, { channelThreshold = 0 } = {}) {
  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `image dimensions differ: ${expected.width}x${expected.height} vs `
      + `${actual.width}x${actual.height}`,
    );
  }
  if (!Number.isInteger(channelThreshold) || channelThreshold < 0 || channelThreshold > 255) {
    throw new TypeError("channelThreshold must be an integer from 0 through 255");
  }
  const { width, height } = expected;
  const pixelCount = width * height;
  const expectedBoundary = alphaBoundaryMask(expected);
  const actualBoundary = alphaBoundaryMask(actual);
  const changedMask = new Uint8Array(pixelCount);
  const heatmap = Buffer.alloc(pixelCount * 4);
  let alphaTotal = 0;
  let premultipliedRgbTotal = 0;
  let maxAlpha = 0;
  let maxPremultipliedRgb = 0;
  let changedPixels = 0;
  let boundaryPixels = 0;
  let boundaryChangedPixels = 0;
  let interiorPixels = 0;
  let interiorAlphaTotal = 0;
  let interiorRgbTotal = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const expectedAlpha = expected.pixels[offset + 3];
    const actualAlpha = actual.pixels[offset + 3];
    const alphaDelta = Math.abs(expectedAlpha - actualAlpha);
    let maxRgbDelta = 0;
    let rgbDelta = 0;
    for (let channel = 0; channel < 3; channel += 1) {
      const expectedPremultiplied = expected.pixels[offset + channel] * expectedAlpha / 255;
      const actualPremultiplied = actual.pixels[offset + channel] * actualAlpha / 255;
      const delta = Math.abs(expectedPremultiplied - actualPremultiplied);
      rgbDelta += delta;
      maxRgbDelta = Math.max(maxRgbDelta, delta);
    }
    alphaTotal += alphaDelta;
    premultipliedRgbTotal += rgbDelta;
    maxAlpha = Math.max(maxAlpha, alphaDelta);
    maxPremultipliedRgb = Math.max(maxPremultipliedRgb, maxRgbDelta);
    const changed = alphaDelta > channelThreshold || maxRgbDelta > channelThreshold;
    if (changed) {
      changedMask[pixel] = 1;
      changedPixels += 1;
    }
    const boundary = expectedBoundary[pixel] || actualBoundary[pixel];
    if (boundary) {
      boundaryPixels += 1;
      if (changed) boundaryChangedPixels += 1;
    } else if (expectedAlpha === 255 && actualAlpha === 255) {
      interiorPixels += 1;
      interiorAlphaTotal += alphaDelta;
      interiorRgbTotal += rgbDelta;
    }
    heatmap[offset] = Math.min(255, Math.round(alphaDelta * 4));
    heatmap[offset + 1] = Math.min(255, Math.round(maxRgbDelta * 4));
    heatmap[offset + 2] = changed ? 96 : 0;
    heatmap[offset + 3] = 255;
  }

  return Object.freeze({
    metrics: Object.freeze({
      width,
      height,
      pixelCount,
      exactPixels: pixelCount - changedPixels,
      changedPixels,
      changedPixelRatio: changedPixels / pixelCount,
      meanAlpha: alphaTotal / pixelCount,
      maxAlpha,
      meanPremultipliedRgb: premultipliedRgbTotal / (pixelCount * 3),
      maxPremultipliedRgb,
      boundaryPixels,
      boundaryChangedPixels,
      boundaryChangedPixelRatio: boundaryPixels ? boundaryChangedPixels / boundaryPixels : 0,
      interiorPixels,
      interiorMeanAlpha: interiorPixels ? interiorAlphaTotal / interiorPixels : 0,
      interiorMeanPremultipliedRgb: interiorPixels ? interiorRgbTotal / (interiorPixels * 3) : 0,
      connectedRegions: connectedRegions(changedMask, width, height),
    }),
    heatmap: Object.freeze({ width, height, pixels: heatmap }),
  });
}
