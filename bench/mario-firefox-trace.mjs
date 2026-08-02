const TRACE_SCHEMA = "cornerfill-mario-firefox-page-trace@4";
const FACE_SELECTOR = "[data-shape] > u";
const EXPECTED_FACE_COUNT = 1213;
const PREPARED_BRIDGE_GLOBAL = "__CORNERFILL_MARIO_PREPARED__";
const SOURCE_TICK_GLOBAL = "__CORNERFILL_MARIO_SOURCE_TICK__";
const SOURCE_STATE_GLOBAL = "__CORNERFILL_MARIO_SOURCE_STATE__";
const RUNTIME_ERROR_GLOBAL = "__CORNERFILL_MARIO_RUNTIME_ERROR__";
const WAIT_TIMEOUT_MS = 120_000;

function pixel(value, label) {
  const text = String(value).trim();
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)px$/u.test(text)) {
    throw new TypeError(`${label} must be a resolved pixel value: ${text}`);
  }
  return finite(Number.parseFloat(text), label);
}

function pixelPair(value, label) {
  const parts = String(value).trim().split(/\s+/u);
  if (parts.length !== 2) throw new TypeError(`${label} must contain two resolved pixel values`);
  return [pixel(parts[0], `${label} x`), pixel(parts[1], `${label} y`)];
}

function resolvedPositionComponent(value, areaSize, imageSize, axis) {
  const text = String(value).trim().toLowerCase();
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)px$/u.test(text)) return Number.parseFloat(text);
  if (/^-?(?:\d+(?:\.\d+)?|\.\d+)%$/u.test(text)) {
    return Number.parseFloat(text) / 100 * (areaSize - imageSize);
  }
  const ratio = axis === "x"
    ? { left: 0, center: 0.5, right: 1 }[text]
    : { top: 0, center: 0.5, bottom: 1 }[text];
  if (ratio === undefined) throw new TypeError(`unsupported prepared background-position ${axis}: ${text}`);
  return ratio * (areaSize - imageSize);
}

function resolvedBackgroundPosition(value, size, backgroundSize) {
  const parts = String(value).trim().split(/\s+/u);
  if (parts.length !== 2) throw new TypeError("Mario background-position must contain two values");
  return [
    resolvedPositionComponent(parts[0], size[0], backgroundSize[0], "x"),
    resolvedPositionComponent(parts[1], size[1], backgroundSize[1], "y"),
  ];
}

function installPreparedFrameBridge(leaves) {
  if (globalThis[PREPARED_BRIDGE_GLOBAL] !== undefined) {
    throw new Error("Mario already has a prepared frame bridge");
  }
  const bindingByElement = new WeakMap();
  const bindings = leaves.map((element, index) => {
    const positionValue = element.style.backgroundPositionY || "0px";
    const binding = {
      index,
      element,
      position: [0, pixel(positionValue, "Mario initial background-position-y")],
      positionValue,
      visible: element.style.visibility !== "hidden",
      update: { element, backgroundPosition: undefined, visible: undefined },
      pending: false,
      positionWrites: 0,
      positionChanges: 0,
      visibilityWrites: 0,
      visibilityChanges: 0,
      touched: false,
    };
    bindingByElement.set(element, binding);
    return binding;
  });
  const updates = [];
  let frameDepth = 0;
  let sourceFrames = 0;
  let batches = 0;
  let batchUpdates = 0;
  let batchPaints = 0;
  let streamHash = 0x811c9dc5;
  let streamEvents = 0;
  let abortedFrames = 0;
  let configured = false;
  let activeController = null;
  let disposed = false;

  const hash = (value) => {
    const text = String(value);
    for (let index = 0; index < text.length; index += 1) {
      streamHash ^= text.charCodeAt(index);
      streamHash = Math.imul(streamHash, 0x01000193) >>> 0;
    }
    streamEvents += 1;
  };

  const queue = (binding) => {
    if (binding.pending) return;
    binding.pending = true;
    updates.push(binding.update);
  };
  const flush = () => {
    if (updates.length === 0) return 0;
    const count = updates.length;
    let painted = 0;
    try {
      if (!activeController) return 0;
      painted = activeController.updatePreparedBatch(updates);
      batches += 1;
      batchUpdates += count;
      batchPaints += painted;
      return painted;
    } finally {
      for (const update of updates) {
        const binding = bindingByElement.get(update.element);
        if (binding) binding.pending = false;
        update.backgroundPosition = undefined;
        update.visible = undefined;
      }
      updates.length = 0;
    }
  };
  const flushIfUnframed = () => {
    if (frameDepth === 0) flush();
  };
  const bridge = Object.freeze({
    beginFrame() {
      if (disposed) return;
      frameDepth += 1;
      if (frameDepth === 1) {
        sourceFrames += 1;
        hash(`f:${sourceFrames}`);
      }
    },
    setBackgroundPositionY(element, value) {
      if (disposed) return false;
      const binding = bindingByElement.get(element);
      if (!binding) return false;
      binding.positionWrites += 1;
      hash(`p:${binding.index}:${String(value)}`);
      if (binding.positionValue === String(value)) return activeController !== null;
      const y = pixel(value, "Mario background-position-y");
      binding.positionValue = String(value);
      if (binding.position[1] === y) return activeController !== null;
      binding.position[1] = y;
      binding.positionChanges += 1;
      binding.touched = true;
      if (activeController) {
        binding.update.backgroundPosition = binding.position;
        queue(binding);
        flushIfUnframed();
      }
      return activeController !== null;
    },
    setVisibility(element, visible) {
      if (disposed) return false;
      const binding = bindingByElement.get(element);
      if (!binding) return false;
      binding.visibilityWrites += 1;
      const nextVisible = Boolean(visible);
      hash(`v:${binding.index}:${nextVisible ? 1 : 0}`);
      if (binding.visible === nextVisible) return true;
      binding.visible = nextVisible;
      binding.update.visible = nextVisible;
      binding.visibilityChanges += 1;
      binding.touched = true;
      if (activeController) {
        queue(binding);
        flushIfUnframed();
      }
      return true;
    },
    endFrame() {
      if (disposed) return;
      if (frameDepth <= 0) throw new Error("Mario prepared frame bridge ended without a matching begin");
      frameDepth -= 1;
      if (frameDepth === 0) {
        flush();
        hash(`e:${sourceFrames}`);
      }
    },
    abortFrame() {
      if (disposed) return;
      abortedFrames += 1;
      frameDepth = 0;
      for (const update of updates) {
        const binding = bindingByElement.get(update.element);
        if (binding) binding.pending = false;
        update.backgroundPosition = undefined;
        update.visible = undefined;
      }
      updates.length = 0;
    },
  });
  globalThis[PREPARED_BRIDGE_GLOBAL] = bridge;
  return Object.freeze({
    configure(preparedFaces) {
      if (configured) throw new Error("Mario prepared bridge is already configured");
      if (!Array.isArray(preparedFaces) || preparedFaces.length !== bindings.length) {
        throw new Error("Mario prepared bridge configuration does not cover every leaf");
      }
      for (let index = 0; index < bindings.length; index += 1) {
        const binding = bindings[index];
        const [positionX, positionY] = preparedFaces[index].paint.backgroundPosition;
        binding.position = [positionX, positionY];
        binding.positionValue = binding.element.style.backgroundPositionY || `${positionY}px`;
        binding.visible = Boolean(preparedFaces[index].visibility);
        binding.update.backgroundPosition = undefined;
        binding.update.visible = undefined;
      }
      configured = true;
    },
    activate(controller) {
      if (!configured) throw new Error("Mario prepared bridge must be configured before activation");
      if (activeController) throw new Error("Mario prepared bridge is already active");
      const reconciliation = bindings.map((binding) => ({
        element: binding.element,
        backgroundPosition: binding.position,
        visible: binding.visible,
      }));
      const painted = controller.updatePreparedBatch(reconciliation);
      for (const binding of bindings) {
        binding.update.backgroundPosition = undefined;
        binding.update.visible = undefined;
        binding.pending = false;
      }
      activeController = controller;
      return painted;
    },
    coverage(controller) {
      let visible = 0;
      let visibleWithSurface = 0;
      let stateMatches = 0;
      for (const binding of bindings) {
        const explanation = controller.explain(binding.element);
        if (binding.visible) visible += 1;
        if (binding.visible && explanation?.surface) visibleWithSurface += 1;
        if (explanation?.prepared?.visible === binding.visible
          && explanation?.prepared?.backgroundPosition?.[0] === binding.position[0]
          && explanation?.prepared?.backgroundPosition?.[1] === binding.position[1]) stateMatches += 1;
      }
      return Object.freeze({ visible, visibleWithSurface, stateMatches });
    },
    backgroundPositionY(element) {
      return bindingByElement.get(element)?.positionValue ?? element.style.backgroundPositionY;
    },
    reset() {
      sourceFrames = 0;
      batches = 0;
      batchUpdates = 0;
      batchPaints = 0;
      streamHash = 0x811c9dc5;
      streamEvents = 0;
      abortedFrames = 0;
      for (const binding of bindings) {
        binding.positionWrites = 0;
        binding.positionChanges = 0;
        binding.visibilityWrites = 0;
        binding.visibilityChanges = 0;
        binding.touched = false;
      }
    },
    snapshot() {
      let positionWrites = 0;
      let positionChanges = 0;
      let visibilityWrites = 0;
      let visibilityChanges = 0;
      let touchedLeaves = 0;
      for (const binding of bindings) {
        positionWrites += binding.positionWrites;
        positionChanges += binding.positionChanges;
        visibilityWrites += binding.visibilityWrites;
        visibilityChanges += binding.visibilityChanges;
        if (binding.touched) touchedLeaves += 1;
      }
      return Object.freeze({
        sourceFrames,
        batches,
        batchUpdates,
        batchPaints,
        positionWrites,
        positionChanges,
        visibilityWrites,
        visibilityChanges,
        touchedLeaves,
        streamHash: streamHash.toString(16).padStart(8, "0"),
        streamEvents,
        abortedFrames,
        active: activeController !== null,
      });
    },
    dispose() {
      if (disposed) return;
      if (frameDepth !== 0) throw new Error("cannot dispose the Mario prepared bridge during a source frame");
      flush();
      disposed = true;
      activeController = null;
      if (globalThis[PREPARED_BRIDGE_GLOBAL] === bridge) delete globalThis[PREPARED_BRIDGE_GLOBAL];
      for (const binding of bindings) {
        binding.element.style.backgroundPositionY = binding.positionValue;
        bindingByElement.delete(binding.element);
      }
    },
  });
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function percentile(sorted, ratio) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const mean = sorted.length === 0 ? 0 : total / sorted.length;
  return Object.freeze({
    count: sorted.length,
    mean,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
    over20ms: sorted.filter((value) => value > 20).length,
    over33ms: sorted.filter((value) => value > 1000 / 30).length,
    effectiveFps: mean > 0 ? 1000 / mean : 0,
  });
}

function counterDelta(after, before) {
  if (!after || !before) return null;
  return Object.freeze(Object.fromEntries(
    Object.keys(after.counters).map((key) => [key, after.counters[key] - before.counters[key]]),
  ));
}

function runtimeError() {
  const error = globalThis[RUNTIME_ERROR_GLOBAL];
  if (error) return `${error.name}: ${error.message}`;
  const host = document.querySelector("#demo[data-state='runtime-error'], [data-state='runtime-error']");
  return host ? "Mario host entered runtime-error state" : null;
}

function assertRuntimeHealthy() {
  const error = runtimeError();
  if (error) throw new Error(`Mario runtime failed: ${error}`);
}

function sourceState() {
  const state = globalThis[SOURCE_STATE_GLOBAL];
  if (!state || !Number.isSafeInteger(state.completedTick)) {
    throw new Error("Mario source-state instrumentation is unavailable");
  }
  return Object.freeze({ ...state });
}

function nextFrameBefore(deadline, label) {
  const remaining = deadline - performance.now();
  if (!(remaining > 0)) return Promise.reject(new Error(`${label} timed out`));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out`)), remaining);
    requestAnimationFrame((timestamp) => {
      clearTimeout(timeout);
      resolve(timestamp);
    });
  });
}

async function waitFrames(count, timeoutMs = WAIT_TIMEOUT_MS) {
  const deadline = performance.now() + timeoutMs;
  for (let index = 0; index < count; index += 1) {
    assertRuntimeHealthy();
    await nextFrameBefore(deadline, "Mario display-frame wait");
  }
}

function sourceTick() {
  const value = globalThis[SOURCE_TICK_GLOBAL];
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Mario source-tick instrumentation is unavailable");
  return value;
}

async function waitSourceTicks(count, timeoutMs = WAIT_TIMEOUT_MS) {
  const target = sourceTick() + count;
  const deadline = performance.now() + timeoutMs;
  while (sourceTick() < target) {
    assertRuntimeHealthy();
    await nextFrameBefore(deadline, "Mario source-tick wait");
  }
  assertRuntimeHealthy();
  if (sourceTick() !== target) throw new Error("Mario source-tick warmup overshot its target");
}

function selectExperienceMode(value) {
  const input = document.querySelector(`input[name="mode"][value="${value}"]`);
  if (!(input instanceof HTMLInputElement)) throw new Error(`Mario ${value} control is unavailable`);
  if (!input.checked) {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

async function restartOpening() {
  selectExperienceMode("interaction");
  await waitSourceTicks(1);
  selectExperienceMode("animation");
  await waitSourceTicks(1);
}

function captureLeafState(leaves, preparedBridge = null) {
  return leaves.map((element) => Object.freeze({
    transform: element.style.transform,
    backgroundPositionY: preparedBridge?.backgroundPositionY(element) ?? element.style.backgroundPositionY,
    visibility: element.style.visibility,
  }));
}

function captureVisibilityCounts(leaves) {
  let inlineVisible = 0;
  let inlineHidden = 0;
  let computedVisible = 0;
  let computedHidden = 0;
  for (const element of leaves) {
    if (element.style.visibility === "hidden") inlineHidden += 1;
    else inlineVisible += 1;
    if (getComputedStyle(element).visibility === "hidden") computedHidden += 1;
    else computedVisible += 1;
  }
  return Object.freeze({ inlineVisible, inlineHidden, computedVisible, computedHidden });
}

function changedLeafState(before, after) {
  let transforms = 0;
  let backgroundPositions = 0;
  let visibility = 0;
  for (let index = 0; index < before.length; index += 1) {
    if (before[index].transform !== after[index].transform) transforms += 1;
    if (before[index].backgroundPositionY !== after[index].backgroundPositionY) backgroundPositions += 1;
    if (before[index].visibility !== after[index].visibility) visibility += 1;
  }
  return Object.freeze({ transforms, backgroundPositions, visibility });
}

function hashLeafState(values) {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const text = `${value.transform}\n${value.backgroundPositionY}\n${value.visibility}\n`;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}

async function captureMemory() {
  if (typeof performance.measureUserAgentSpecificMemory === "function") {
    try {
      const result = await performance.measureUserAgentSpecificMemory();
      return Object.freeze({ supported: true, source: "measureUserAgentSpecificMemory", bytes: result.bytes });
    } catch (error) {
      return Object.freeze({
        supported: false,
        source: "measureUserAgentSpecificMemory",
        bytes: null,
        error: `${error.name}: ${error.message}`,
      });
    }
  }
  if (performance.memory && Number.isFinite(performance.memory.usedJSHeapSize)) {
    return Object.freeze({
      supported: true,
      source: "performance.memory",
      bytes: performance.memory.usedJSHeapSize,
    });
  }
  return Object.freeze({ supported: false, source: null, bytes: null });
}

async function sampleAnimationSourceTicks(sourceFrameCount) {
  const intervals = [];
  let previous = null;
  const startSourceTick = sourceTick();
  const targetSourceTick = startSourceTick + sourceFrameCount;
  const startTime = performance.now();
  const deadline = startTime + WAIT_TIMEOUT_MS;
  while (sourceTick() < targetSourceTick) {
    assertRuntimeHealthy();
    const timestamp = await nextFrameBefore(deadline, "Mario measured source-tick wait");
    if (previous !== null) intervals.push(finite(timestamp - previous, "frame interval"));
    previous = timestamp;
  }
  const endSourceTick = sourceTick();
  assertRuntimeHealthy();
  if (endSourceTick !== targetSourceTick) throw new Error("Mario source-frame capture overshot its target");
  const elapsedMs = finite(performance.now() - startTime, "source-frame elapsed time");
  return Object.freeze({
    start: startSourceTick,
    end: endSourceTick,
    count: endSourceTick - startSourceTick,
    elapsedMs,
    effectiveFps: elapsedMs > 0 ? (endSourceTick - startSourceTick) * 1000 / elapsedMs : 0,
    displayIntervalsMs: Object.freeze(intervals),
  });
}

function runtimeStats(controller) {
  return controller ? controller.stats() : null;
}

export async function installMarioFirefoxTrace({
  mode,
  cornerfillModuleUrl,
  expectedFaceCount = EXPECTED_FACE_COUNT,
  texelsUrl = new URL("/mario/assets/texels.webp", location.href).href,
  texelsSize = [4852, 3280],
} = {}) {
  if (!new Set(["off", "on"]).has(mode)) throw new TypeError(`unknown trace mode: ${mode}`);
  if (document.documentElement.dataset.modelReady === undefined) {
    throw new Error("Mario model is not ready");
  }
  const leaves = [...document.querySelectorAll(FACE_SELECTOR)];
  positiveInteger(expectedFaceCount, "expected face count");
  if (leaves.length !== expectedFaceCount) {
    throw new Error(`Mario mounted ${leaves.length} faces; expected ${expectedFaceCount}`);
  }
  let preparedBridge = installPreparedFrameBridge(leaves);
  try {
    selectExperienceMode("interaction");
    await waitFrames(4);
  } catch (error) {
    try { preparedBridge.dispose(); } catch {}
    throw error;
  }

  let controller = null;
  let handles = [];
  let setupReconciliationPaints = 0;
  let setupBridgeCoverage = null;
  const setupStart = performance.now();
  performance.mark(`cornerfill-mario-${mode}-setup-start`);
  console.timeStamp(`cornerfill-mario-${mode}-setup-start`);
  try {
    const preparedFaces = leaves.map((element) => {
      const computed = getComputedStyle(element);
      const size = [pixel(computed.width, "Mario face width"), pixel(computed.height, "Mario face height")];
      const backgroundSize = pixelPair(computed.backgroundSize, "Mario background-size");
      const backgroundPosition = resolvedBackgroundPosition(computed.backgroundPosition, size, backgroundSize);
      return Object.freeze({
        size,
        visibility: computed.visibility !== "hidden",
        paint: Object.freeze({
          kind: "image",
          url: texelsUrl,
          sourceSize: texelsSize,
          backgroundSize,
          backgroundPosition,
          repeat: "no-repeat",
          imageSmoothing: computed.imageRendering !== "pixelated",
          opaque: true,
        }),
      });
    });
    preparedBridge.configure(preparedFaces);
    if (mode === "on") {
      if (!cornerfillModuleUrl) throw new TypeError("Cornerfill module URL is required in on mode");
      const { installCornerfill } = await import(cornerfillModuleUrl);
      controller = installCornerfill({
        document,
        forceFallback: true,
        backend: "moz-element",
        observe: false,
        maxGeometryCacheEntries: 4096,
      });
      handles = leaves.map((element, index) => controller.attachPrepared(element, {
        mode: "paint",
        size: preparedFaces[index].size,
        borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
        cornerShape: "bevel bevel round round",
        paint: preparedFaces[index].paint,
        visibility: preparedFaces[index].visibility,
        deferHiddenSurface: true,
      }));
      await Promise.all(handles.map((handle) => handle.ready));
      setupReconciliationPaints = preparedBridge.activate(controller);
      setupBridgeCoverage = preparedBridge.coverage(controller);
    }
  } catch (error) {
    try { preparedBridge?.dispose(); } catch {}
    for (const handle of handles) {
      try { handle.dispose(); } catch {}
    }
    try { controller?.destroy(); } catch {}
    throw error;
  }
  performance.mark(`cornerfill-mario-${mode}-setup-end`);
  performance.measure(
    `cornerfill-mario-${mode}-setup`,
    `cornerfill-mario-${mode}-setup-start`,
    `cornerfill-mario-${mode}-setup-end`,
  );
  console.timeStamp(`cornerfill-mario-${mode}-setup-end`);
  const setupMs = performance.now() - setupStart;

  const backendCounts = Object.freeze(Object.fromEntries(
    [...new Set(handles.map((handle) => handle.backend))]
      .map((backend) => [backend, handles.filter((handle) => handle.backend === backend).length]),
  ));
  const computedBackendFaces = mode === "on"
    ? leaves.filter((element) => getComputedStyle(element).backgroundImage.startsWith("-moz-element("))
      .length
    : 0;
  const setupVisibility = captureVisibilityCounts(leaves);
  const setupRuntime = runtimeStats(controller);
  if (mode === "on" && (backendCounts["moz-element"] !== leaves.length
    || computedBackendFaces !== setupRuntime.surfaces
    || setupRuntime.counters.styleChecks !== 0
    || setupRuntime.counters.preparedEntries !== leaves.length
    || setupBridgeCoverage.stateMatches !== leaves.length
    || setupBridgeCoverage.visibleWithSurface !== setupBridgeCoverage.visible)) {
    try { preparedBridge.dispose(); } catch {}
    for (const handle of handles) {
      try { handle.dispose(); } catch {}
    }
    try { controller.destroy(); } catch {}
    throw new Error(
      `Cornerfill backend coverage is incomplete: handles=${backendCounts["moz-element"] ?? 0}, `
      + `computed=${computedBackendFaces}, surfaces=${setupRuntime.surfaces}, faces=${leaves.length}`,
    );
  }

  const trials = [];
  let teardown = null;
  const trace = {
    async runTrial({ index, frames = 300, warmupFrames = 60 } = {}) {
      positiveInteger(index, "trial index");
      positiveInteger(frames, "trial frame count");
      positiveInteger(warmupFrames, "warmup frame count");
      await restartOpening();
      await waitSourceTicks(warmupFrames);

      const beforeLeafState = captureLeafState(leaves, preparedBridge);
      const beforeVisibility = captureVisibilityCounts(leaves);
      const beforeRuntime = runtimeStats(controller);
      const beforeMemory = await captureMemory();
      const startSourceState = sourceState();
      preparedBridge?.reset();

      const label = `cornerfill-mario-${mode}-trial-${index}`;
      performance.mark(`${label}-start`);
      console.timeStamp(`${label}-start`);
      const sourceTiming = await sampleAnimationSourceTicks(frames);
      const intervals = sourceTiming.displayIntervalsMs;
      const trailingPreparedPaints = controller?.flushPrepared() ?? 0;
      performance.mark(`${label}-end`);
      performance.measure(label, `${label}-start`, `${label}-end`);
      console.timeStamp(`${label}-end`);
      const afterRuntime = runtimeStats(controller);
      const preparedWrites = preparedBridge?.snapshot() ?? null;
      const afterLeafState = captureLeafState(leaves, preparedBridge);
      const afterVisibility = captureVisibilityCounts(leaves);
      const endSourceState = sourceState();
      const afterMemory = await captureMemory();
      const result = Object.freeze({
        schema: "cornerfill-mario-firefox-trial@4",
        mode,
        index,
        frames,
        warmupFrames,
        frameIntervalsMs: Object.freeze(intervals),
        frameTiming: summarize(intervals),
        sourceTiming,
        preparedWrites,
        workload: Object.freeze({
          startSourceState,
          endSourceState,
          beforeLeafHash: hashLeafState(beforeLeafState),
          afterLeafHash: hashLeafState(afterLeafState),
          streamHash: preparedWrites.streamHash,
          streamEvents: preparedWrites.streamEvents,
        }),
        changedLeaves: changedLeafState(beforeLeafState, afterLeafState),
        visibility: Object.freeze({
          before: beforeVisibility,
          after: afterVisibility,
        }),
        runtimeDelta: counterDelta(afterRuntime, beforeRuntime),
        runtimeAfter: afterRuntime,
        memory: Object.freeze({ before: beforeMemory, after: afterMemory }),
      });
      if (preparedWrites.sourceFrames !== sourceTiming.count || preparedWrites.abortedFrames !== 0) {
        throw new Error(`source bridge invariant failed: ${JSON.stringify({ preparedWrites, sourceTiming })}`);
      }
      if (mode === "on") {
        const runtimeDelta = result.runtimeDelta;
        if (trailingPreparedPaints !== 0
          || runtimeDelta.styleChecks !== 0
          || runtimeDelta.ignoredStyleMutations !== 0
          || runtimeDelta.preparedScheduledFlushes !== 0
          || runtimeDelta.preparedBatches !== preparedWrites.batches
          || runtimeDelta.preparedPaints !== preparedWrites.batchPaints
          || preparedWrites.batches > preparedWrites.sourceFrames) {
          throw new Error(`prepared direct-batch invariant failed: ${JSON.stringify({
            trailingPreparedPaints,
            preparedWrites,
            runtimeDelta,
          })}`);
        }
      }
      trials.push(result);
      await waitFrames(3);
      return result;
    },
    summary() {
      const intervals = trials.flatMap((trial) => trial.frameIntervalsMs);
      const sourceFrameCount = trials.reduce((sum, trial) => sum + trial.sourceTiming.count, 0);
      const sourceElapsedMs = trials.reduce((sum, trial) => sum + trial.sourceTiming.elapsedMs, 0);
      return Object.freeze({
        schema: TRACE_SCHEMA,
        mode,
        userAgent: navigator.userAgent,
        visibilityState: document.visibilityState,
        devicePixelRatio,
        faceCount: leaves.length,
        setupMs,
        backendCounts,
        computedBackendFaces,
        setupVisibility,
        setupReconciliationPaints,
        setupBridgeCoverage,
        supportedPerformanceEntries: Object.freeze([
          ...(globalThis.PerformanceObserver?.supportedEntryTypes ?? []),
        ]),
        aggregateFrameTiming: summarize(intervals),
        aggregateSourceTiming: Object.freeze({
          count: sourceFrameCount,
          elapsedMs: sourceElapsedMs,
          effectiveFps: sourceElapsedMs > 0 ? sourceFrameCount * 1000 / sourceElapsedMs : 0,
        }),
        trials: Object.freeze([...trials]),
        runtime: runtimeStats(controller),
        teardown,
      });
    },
    dispose() {
      if (teardown) return teardown;
      const errors = [];
      const bridgeBefore = preparedBridge?.snapshot() ?? null;
      try { preparedBridge?.dispose(); } catch (error) { errors.push(error); }
      for (const handle of handles) {
        try { handle.dispose(); } catch (error) { errors.push(error); }
      }
      try { controller?.destroy(); } catch (error) { errors.push(error); }
      teardown = Object.freeze({
        bridgeBefore,
        bridgeInstalled: globalThis[PREPARED_BRIDGE_GLOBAL] !== undefined,
        ownedElements: document.querySelectorAll(`[data-cornerfill-owned]`).length,
        liveImageProperties: leaves.filter((element) => (
          element.style.getPropertyValue("--cornerfill-live-image") !== ""
        )).length,
        runtime: runtimeStats(controller),
        errors: Object.freeze(errors.map((error) => `${error.name}: ${error.message}`)),
      });
      if (globalThis.__CORNERFILL_MARIO_TRACE__ === trace) delete globalThis.__CORNERFILL_MARIO_TRACE__;
      if (errors.length > 0) throw new AggregateError(errors, "Mario Cornerfill teardown failed");
      return teardown;
    },
  };
  globalThis.__CORNERFILL_MARIO_TRACE__ = trace;
  return trace.summary();
}
