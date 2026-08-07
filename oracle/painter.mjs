import {
  CORNERFILL_RUNTIME_SCHEMA,
  installCornerfill,
} from "../dist/runtime.mjs";

export const CANDIDATE_PAINTER_SCHEMA = CORNERFILL_RUNTIME_SCHEMA;

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export async function attachProductionCandidate(element, oracleCase) {
  element.style.setProperty("--cornerfill-border-radius", oracleCase.radiusCss);
  element.style.setProperty(
    "--cornerfill-corner-shape",
    oracleCase.interpolation?.from ?? oracleCase.shapeCss,
  );
  const controller = installCornerfill({
    document,
    forceFallback: true,
    staticFallback: true,
  });
  const handle = oracleCase.id === "mario-texel-face"
    ? controller.attachPrepared(element, {
      size: oracleCase.size,
      borderRadius: oracleCase.radiusCss,
      cornerShape: oracleCase.shapeCss,
      paint: Object.freeze({ ...oracleCase.paint, opaque: true }),
      border: oracleCase.border ?? null,
      paintActive: true,
    })
    : controller.attach(element, {
      paint: oracleCase.paint,
      border: oracleCase.border ?? null,
    });
  await handle.ready;
  if (oracleCase.interpolation) {
    await handle.interpolateCornerShape(
      oracleCase.interpolation.from,
      oracleCase.interpolation.to,
      oracleCase.interpolation.progress,
    );
  }
  return Object.freeze({
    controller,
    handle,
    metadata: handle.explain(),
  });
}

export function createLifecycleProof({ controller, handle, element, oracleCase }) {
  return async () => {
    const initial = controller.stats();
    const initialPaints = initial.counters.paints;
    const originalTransform = element.style.transform;
    const originalWidth = element.style.width;
    const originalShape = element.style.getPropertyValue("--cornerfill-corner-shape");

    element.style.transform = "matrix3d(1,0,0,0,0,0.8660254,0.5,0,0,-0.5,0.8660254,0,0,0,0,1)";
    await handle.refresh();
    await nextPaint();
    const afterTransform = controller.stats();

    element.style.setProperty("--cornerfill-corner-shape", "notch");
    await handle.refresh();
    const afterStyle = controller.stats();

    element.style.width = `${oracleCase.size[0] + 7}px`;
    await handle.refresh();
    const afterResize = controller.stats();

    element.style.width = originalWidth;
    element.style.transform = originalTransform;
    element.style.setProperty("--cornerfill-corner-shape", originalShape);
    await handle.refresh();
    const beforeDispose = handle.explain();
    handle.dispose();
    const afterDispose = controller.stats();
    const disposed = handle.explain();
    controller.destroy();

    const proof = Object.freeze({
      schema: "cornerfill-lifecycle-proof@1",
      transformPaintDelta: afterTransform.counters.paints - initialPaints,
      stylePaintDelta: afterStyle.counters.paints - afterTransform.counters.paints,
      resizePaintDelta: afterResize.counters.paints - afterStyle.counters.paints,
      surfaceResizeDelta: afterResize.counters.surfaceResizes - afterStyle.counters.surfaceResizes,
      entriesAfterDispose: afterDispose.entries,
      disposedStatus: disposed.status,
      backendBeforeDispose: beforeDispose.backend,
      originalElementKeptTransform: beforeDispose.transformOwnedByCornerfill === false,
    });
    return Object.freeze({
      ...proof,
      passed: proof.transformPaintDelta === 0
        && proof.stylePaintDelta === 1
        && proof.resizePaintDelta === 1
        && proof.surfaceResizeDelta === 1
        && proof.entriesAfterDispose === 0
        && proof.disposedStatus === "disposed"
        && proof.originalElementKeptTransform,
    });
  };
}

export function createRasterUpdateProof({ controller, handle, element, oracleCase }) {
  return async () => {
    const initial = controller.stats();
    const initialEntry = handle.explain();
    const nextPosition = [oracleCase.paint.backgroundPosition[0] - 64, oracleCase.paint.backgroundPosition[1]];
    controller.updatePreparedBatch([{
      element,
      backgroundPosition: nextPosition,
    }]);
    const updated = controller.stats();
    const updatedEntry = handle.explain();
    handle.dispose();
    const disposed = controller.stats();
    controller.destroy();
    const sourceRect = updatedEntry.paint?.layer?.sourceRect ?? null;
    const proof = Object.freeze({
      schema: "cornerfill-raster-update-proof@1",
      paintDelta: updated.counters.paints - initial.counters.paints,
      imageDecodeDelta: updated.counters.imageDecodes - initial.counters.imageDecodes,
      sameSurface: initialEntry.surface?.id === updatedEntry.surface?.id,
      updatedSourceRect: sourceRect,
      entriesAfterDispose: disposed.entries,
    });
    return Object.freeze({
      ...proof,
      passed: proof.paintDelta === 1
        && proof.imageDecodeDelta === 0
        && proof.sameSurface
        && sourceRect?.[0] === 32
        && proof.entriesAfterDispose === 0,
    });
  };
}

export function nativeBackgroundCss(paint) {
  if (paint.kind === "solid") return Object.freeze({ backgroundColor: paint.color });
  if (paint.kind === "linear-gradient") return Object.freeze({ backgroundImage: paint.css });
  if (paint.kind === "radial-gradient" || paint.kind === "conic-gradient") {
    return Object.freeze({ backgroundImage: paint.css });
  }
  if (paint.kind === "layers") {
    const value = (layer, property, fallback) => {
      const candidate = layer[property];
      if (Array.isArray(candidate)) return `${candidate[0]}px ${candidate[1]}px`;
      return candidate ?? fallback;
    };
    const image = (layer) => layer.kind === "image"
      ? `url(${JSON.stringify(layer.url)})`
      : layer.kind === "none" ? "none" : layer.css;
    return Object.freeze({
      backgroundColor: paint.color,
      backgroundImage: paint.layers.map(image).join(", "),
      backgroundSize: paint.layers.map((layer) => value(layer, "backgroundSize", "auto")).join(", "),
      backgroundPosition: paint.layers.map((layer) => value(layer, "backgroundPosition", "0% 0%")).join(", "),
      backgroundRepeat: paint.layers.map((layer) => value(layer, "repeat", "repeat")).join(", "),
      backgroundOrigin: paint.layers.map((layer) => value(layer, "origin", "padding-box")).join(", "),
      backgroundClip: paint.layers.map((layer) => value(layer, "clip", "border-box")).join(", "),
    });
  }
  if (paint.kind === "image") {
    const size = Array.isArray(paint.backgroundSize)
      ? `${paint.backgroundSize[0]}px ${paint.backgroundSize[1]}px`
      : paint.backgroundSize;
    const position = Array.isArray(paint.backgroundPosition)
      ? `${paint.backgroundPosition[0]}px ${paint.backgroundPosition[1]}px`
      : paint.backgroundPosition;
    return Object.freeze({
      backgroundColor: paint.color,
      backgroundImage: `url(${JSON.stringify(paint.url)})`,
      backgroundSize: size,
      backgroundPosition: position,
      backgroundRepeat: paint.repeat,
      backgroundOrigin: paint.origin,
      backgroundClip: paint.clip,
      backgroundBlendMode: paint.blendMode,
    });
  }
  throw new TypeError(`unsupported paint kind: ${paint.kind}`);
}
