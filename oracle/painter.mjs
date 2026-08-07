export const CANDIDATE_PAINTER_SCHEMA = "cornerfill-oracle-candidate@2";

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

export async function attachProductionCandidate(element, oracleCase) {
  if (oracleCase.id === "mario-texel-face") {
    const { CORNERFILL_RUNTIME_SCHEMA, installCornerfill } = await import("../dist/runtime.mjs");
    element.style.setProperty("--cornerfill-border-radius", oracleCase.radiusCss);
    element.style.setProperty("--cornerfill-corner-shape", oracleCase.shapeCss);
    const controller = installCornerfill({
      document,
      forceFallback: true,
      staticFallback: true,
    });
    const handle = controller.attachPrepared(element, {
      size: oracleCase.size,
      borderRadius: oracleCase.radiusCss,
      cornerShape: oracleCase.shapeCss,
      paint: Object.freeze({ ...oracleCase.paint, opaque: true }),
      border: oracleCase.border ?? null,
      paintActive: true,
    });
    await handle.ready;
    return Object.freeze({
      backend: handle.backend,
      controller,
      handle,
      metadata: Object.freeze({
        schema: CANDIDATE_PAINTER_SCHEMA,
        mode: "explicit",
        route: "explicit-prepared",
        runtime: CORNERFILL_RUNTIME_SCHEMA,
        controller: controller.stats(),
        entry: handle.explain(),
      }),
    });
  }

  if (oracleCase.id === "background-blend-multiply") {
    const { CORNERFILL_RUNTIME_SCHEMA, installCornerfill } = await import("../dist/runtime.mjs");
    element.style.setProperty("--cornerfill-border-radius", oracleCase.radiusCss);
    element.style.setProperty("--cornerfill-corner-shape", oracleCase.shapeCss);
    const controller = installCornerfill({
      document,
      forceFallback: true,
      staticFallback: true,
    });
    const handle = controller.attach(element, {
      paint: oracleCase.paint,
      border: oracleCase.border ?? null,
    });
    await handle.ready;
    return Object.freeze({
      backend: handle.backend,
      controller,
      handle,
      metadata: Object.freeze({
        schema: CANDIDATE_PAINTER_SCHEMA,
        mode: "explicit",
        route: "explicit-runtime",
        runtime: CORNERFILL_RUNTIME_SCHEMA,
        controller: controller.stats(),
        entry: handle.explain(),
      }),
    });
  }

  element.style.setProperty("--cornerfill-oracle-shape", oracleCase.shapeCss);
  const packageController = (await import("../dist/index.mjs")).default;
  if (!packageController) throw new Error("Cornerfill package root is unavailable");
  const packageReport = await packageController.ready;
  let controller = packageController;
  let route = "package-root-compiled";
  if (packageReport.mode === "native") {
    packageController.destroy();
    const { installCornerfillCompiled } = await import("../dist/compiled-runtime.mjs");
    controller = installCornerfillCompiled({
      document,
      forceFallback: true,
      staticFallback: true,
    });
    route = "compiled-forced-calibration";
    await controller.ready;
  }
  const report = controller.explain();
  const entry = controller.explain(element);
  return Object.freeze({
    backend: entry?.backend ?? "browser-paint-inert",
    controller,
    handle: null,
    metadata: Object.freeze({
      schema: CANDIDATE_PAINTER_SCHEMA,
      mode: report.mode,
      route,
      runtime: entry?.runtime ?? report.compiled?.runtime?.runtime ?? report.runtime?.runtime ?? null,
      controller: report,
      entry,
    }),
  });
}

function compiledReport(controller) {
  const report = controller.explain();
  return report.schema === "cornerfill@1" ? report.compiled : report;
}

export function createCompiledLifecycleProof({ controller, element, oracleCase }) {
  return async () => {
    const initial = compiledReport(controller);
    const originalTransform = element.style.transform;
    const originalWidth = element.style.width;
    const originalShape = element.style.getPropertyValue("--cornerfill-oracle-shape");

    element.style.transform = "matrix3d(1,0,0,0,0,0.8660254,0.5,0,0,-0.5,0.8660254,0,0,0,0,1)";
    await nextPaint();
    const afterTransform = compiledReport(controller);

    element.style.setProperty("--cornerfill-oracle-shape", "notch");
    await nextPaint();
    const afterStyle = compiledReport(controller);

    element.style.width = `${oracleCase.size[0] + 7}px`;
    await nextPaint();
    const afterResize = compiledReport(controller);

    element.style.width = originalWidth;
    element.style.transform = originalTransform;
    element.style.setProperty("--cornerfill-oracle-shape", originalShape);
    const beforeDispose = controller.explain(element);
    controller.destroy();
    const afterDispose = compiledReport(controller);
    const disposed = controller.explain(element);

    const proof = Object.freeze({
      schema: "cornerfill-lifecycle-proof@1",
      transformPaintDelta: afterTransform.runtime.counters.paints - initial.runtime.counters.paints,
      transformComputedCheckDelta: afterTransform.counters.computedChecks
        - initial.counters.computedChecks,
      stylePaintDelta: afterStyle.runtime.counters.paints
        - afterTransform.runtime.counters.paints,
      resizePaintDelta: afterResize.runtime.counters.paints - afterStyle.runtime.counters.paints,
      surfaceResizeDelta: afterResize.runtime.counters.surfaceResizes
        - afterStyle.runtime.counters.surfaceResizes,
      entriesAfterDispose: afterDispose.runtime.entries,
      disposedStatus: disposed?.status ?? "disposed",
      backendBeforeDispose: beforeDispose.backend,
      originalElementKeptTransform: beforeDispose.transformOwnedByCornerfill === false,
    });
    return Object.freeze({
      ...proof,
      passed: proof.transformPaintDelta === 0
        && proof.transformComputedCheckDelta === 0
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
