import { qualifyNativeCornerShape } from "../dist/native.mjs";
import { COLOR_PROBE_ATTRIBUTE } from "../dist/colors.mjs";

const backend = new URL(location.href).searchParams.get("backend") ?? "static-data-url";
const results = [];
let installCornerfill;
let installCornerfillAuto;
let rootImportResources = Object.freeze([]);
let rootAutomaticReport = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function options(extra = {}) {
  return {
    document,
    forceFallback: true,
    backend,
    staticFallback: backend === "static-data-url",
    observe: false,
    ...extra,
  };
}

function host(root = document.body, id = "") {
  const element = document.createElement("div");
  if (id) element.id = id;
  Object.assign(element.style, {
    width: "12px",
    height: "10px",
    borderRadius: "5px",
    backgroundColor: "rgb(255, 0, 0)",
  });
  root.append(element);
  return element;
}

function raster(width, height, color = "#0af") {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
}

function preparedConfig(image = raster(32, 32)) {
  return {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: {
      kind: "image",
      image,
      backgroundSize: [32, 32],
      backgroundPosition: [0, 0],
      repeat: "no-repeat",
      opaque: true,
    },
  };
}

async function test(name, operation) {
  await operation();
  results.push(Object.freeze({ name, status: "PASS" }));
}

async function waitFor(predicate, label) {
  const deadline = performance.now() + 10_000;
  while (!predicate()) {
    if (performance.now() >= deadline) {
      throw new Error(`${typeof label === "function" ? label() : label} timed out`);
    }
    await new Promise(requestAnimationFrame);
  }
}

await test("native qualification is isolated from top-layer interception", async () => {
  const qualifyFrame = async (withModal) => {
    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;left:-1000px;top:0;width:160px;height:160px";
    frame.srcdoc = "<!doctype html><body></body>";
    const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
    document.body.append(frame);
    await loaded;
    if (withModal) {
      const dialog = frame.contentDocument.createElement("dialog");
      dialog.style.cssText = "position:fixed;inset:0;width:100%;height:100%;margin:0";
      frame.contentDocument.body.append(dialog);
      dialog.showModal();
    }
    const result = qualifyNativeCornerShape(frame.contentDocument);
    frame.remove();
    return result;
  };
  const unobstructed = await qualifyFrame(false);
  const obstructed = await qualifyFrame(true);
  assert(obstructed.qualified === unobstructed.qualified, "top-layer UI changed native qualification");
  equal(obstructed.unresolved, unobstructed.unresolved, "top-layer UI changed native requirements");
});

await test("compiled CSS drives the production runtime without source reconstruction", async () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/bench/compiled-fixture.css";
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("compiled fixture stylesheet failed")), { once: true });
  });
  const paintMetadataLink = document.createElement("link");
  paintMetadataLink.rel = "stylesheet";
  paintMetadataLink.href = "/bench/compiled-paint-metadata.css";
  const paintMetadataLoaded = new Promise((resolve, reject) => {
    paintMetadataLink.addEventListener("load", resolve, { once: true });
    paintMetadataLink.addEventListener("error", () => reject(new Error("compiled paint metadata stylesheet failed")), { once: true });
  });
  document.head.append(link, paintMetadataLink);
  await Promise.all([loaded, paintMetadataLoaded]);
  const element = document.createElement("div");
  element.className = "cornerfill-compiled-fixture";
  document.body.append(element);
  const beforeResources = performance.getEntriesByType("resource").length;
  const nativeCssSupports = CSS.supports;
  const { installCornerfillCompiled } = await import("../dist/compiled-runtime.mjs");
  const compiled = installCornerfillCompiled({
    document,
    backend,
    staticFallback: backend === "static-data-url",
  });
  const report = await compiled.ready;
  const entry = compiled.explain(element);
  const expectedBackend = backend === "static-data-url" ? "native-corner-shape" : backend;
  assert(report.manifests === 2, `compiled manifest count was ${report.manifests}`);
  assert(report.candidates === 1, `compiled candidate count was ${report.candidates}`);
  assert(report.attached === 1, `compiled attachment count was ${report.attached}`);
  assert(entry?.status === "active", `compiled entry was not active: ${JSON.stringify(entry)}`);
  assert(entry.backend === expectedBackend, `compiled entry selected ${entry.backend}, expected ${expectedBackend}`);

  element.classList.add("cornerfill-compiled-reset");
  let changed = await compiled.refresh();
  assert(changed.attached === 0, "compiled all: unset retained paint ownership");
  assert(compiled.explain(element) === null, "compiled all: unset retained a runtime entry");
  element.classList.remove("cornerfill-compiled-reset");
  changed = await compiled.refresh();
  assert(changed.attached === 1, "compiled shape did not reattach after all reset removal");

  element.classList.add("cornerfill-compiled-round");
  changed = await compiled.refresh();
  assert(changed.attached === 0, "compiled corner-shape: initial retained paint ownership");
  element.classList.remove("cornerfill-compiled-round");
  await compiled.refresh();

  element.classList.add("cornerfill-compiled-important-shape", "cornerfill-compiled-reset");
  changed = await compiled.refresh();
  assert(changed.attached === 1, "normal all reset overrode an important shape");
  element.classList.add("cornerfill-compiled-important-reset");
  changed = await compiled.refresh();
  assert(changed.attached === 0, "important all reset did not override an important shape");
  element.classList.remove(
    "cornerfill-compiled-important-shape",
    "cornerfill-compiled-important-reset",
    "cornerfill-compiled-reset",
  );
  await compiled.refresh();

  element.classList.add("cornerfill-compiled-variable-reset");
  changed = await compiled.refresh();
  assert(changed.attached === 0, "safe all: var(...unset) retained paint ownership");
  assert(changed.errors.length === 0, `safe all substitution failed: ${JSON.stringify(changed.errors)}`);
  element.classList.remove("cornerfill-compiled-variable-reset");
  await compiled.refresh();

  element.classList.add("cornerfill-compiled-logical");
  changed = await compiled.refresh();
  assert(changed.attached === 0, "mixed physical/logical shape retained ambiguous ownership");
  assert(changed.errors.some((message) => message.includes("physical and logical")),
    `mixed physical/logical shape was not diagnosed: ${JSON.stringify(changed.errors)}`);
  element.classList.remove("cornerfill-compiled-logical");
  await compiled.refresh();

  const parent = document.createElement("div");
  parent.className = "cornerfill-compiled-parent";
  const child = document.createElement("div");
  child.className = "cornerfill-compiled-child";
  parent.append(child);
  document.body.append(parent);
  changed = await compiled.refresh();
  assert(compiled.explain(parent)?.status === "active", "compiled parent shape did not attach");
  assert(compiled.explain(child)?.status === "active", "compiled inherited shape did not attach");
  child.classList.add("cornerfill-compiled-child-reset");
  await compiled.refresh();
  assert(compiled.explain(child) === null, "compiled unset child falsely inherited its parent shape");

  const layered = document.createElement("div");
  layered.className = "cornerfill-compiled-layer";
  document.body.append(layered);
  await compiled.refresh();
  assert(compiled.explain(layered) === null, "compiled override-layer initial value retained ownership");
  layered.classList.add("cornerfill-compiled-revert");
  await compiled.refresh();
  assert(compiled.explain(layered)?.status === "active", "compiled revert-layer did not reveal base shape");

  const supported = document.createElement("div");
  supported.className = "cornerfill-compiled-supports";
  document.body.append(supported);
  await compiled.refresh();
  const supportedStyle = getComputedStyle(supported);
  assert(compiled.explain(supported)?.status === "active", "compiled positive support branch did not attach");
  assert(supportedStyle.color === "rgb(1, 2, 3)", "compiled support branch lost an ordinary declaration");
  assert(supportedStyle.getPropertyValue("--cornerfill-compiled-branch").trim() === "positive",
    "compiled support condition selected its negative branch");
  assert(supportedStyle.getPropertyValue("--cornerfill-compiled-mixed").trim() === "active",
    "compiled mixed support condition did not preserve the unrelated test");
  assert(supportedStyle.getPropertyValue("--cornerfill-compiled-nested").trim() === "active",
    "compiled nested Boolean support condition selected the wrong branch");
  const nativeMathSupport = CSS.supports("corner-shape", "superellipse(pow(2, 2))");
  assert(
    supportedStyle.getPropertyValue("--cornerfill-compiled-native-test").trim()
      === (nativeMathSupport ? "active" : "inactive"),
    "compiled unsupported shape test did not preserve native behavior",
  );
  assert(CSS.supports === nativeCssSupports, "compiled mode patched CSS.supports()");

  const dynamic = document.createElement("div");
  dynamic.className = "cornerfill-compiled-dynamic";
  document.body.append(dynamic);
  await new Promise(requestAnimationFrame);
  assert(compiled.explain(dynamic) === null, "dormant compiled class rule created paint ownership");
  const beforeDynamic = compiled.explain().counters;
  dynamic.classList.add("active");
  await waitFor(() => compiled.explain(dynamic)?.status === "active", "compiled class attachment");
  const afterDynamic = compiled.explain().counters;
  assert(afterDynamic.scannedElements - beforeDynamic.scannedElements === 1,
    "compiled class invalidation scanned outside the changed element");
  dynamic.classList.remove("active");
  await waitFor(() => compiled.explain(dynamic) === null, "compiled class detachment");
  dynamic.setAttribute("data-compiled-shape", "on");
  await waitFor(() => compiled.explain(dynamic)?.status === "active", "compiled attribute attachment");
  dynamic.removeAttribute("data-compiled-shape");
  await waitFor(() => compiled.explain(dynamic) === null, "compiled attribute detachment");
  dynamic.id = "cornerfill-compiled-dynamic-id";
  await waitFor(() => compiled.explain(dynamic)?.status === "active", "compiled id attachment");
  dynamic.removeAttribute("id");
  await waitFor(() => compiled.explain(dynamic) === null, "compiled id detachment");

  const hoverState = document.createElement("div");
  hoverState.className = "cornerfill-compiled-hover";
  document.body.append(hoverState);
  const hoverDriver = { stage: "compiled-hover-ready" };
  globalThis.__CORNERFILL_POINTER_DRIVER__ = hoverDriver;
  await waitFor(() => hoverDriver.stage === "compiled-hover-driven", "compiled hover driver");
  await waitFor(() => compiled.explain(hoverState)?.status === "active", "compiled hover attachment");
  hoverDriver.stage = "compiled-hover-out-ready";
  await waitFor(() => hoverDriver.stage === "compiled-hover-out-driven", "compiled hover-out driver");
  await waitFor(() => compiled.explain(hoverState) === null, "compiled hover detachment");

  const hoverCard = document.createElement("section");
  hoverCard.className = "cornerfill-compiled-hover-card";
  const hoverTrigger = document.createElement("span");
  hoverTrigger.className = "cornerfill-compiled-hover-trigger";
  hoverTrigger.style.cssText = "display:block;width:12px;height:10px";
  const hoverFace = document.createElement("div");
  hoverFace.className = "cornerfill-compiled-hover-face";
  hoverCard.append(hoverTrigger, hoverFace);
  document.body.append(hoverCard);
  const ancestorHoverDriver = { stage: "compiled-ancestor-hover-ready" };
  globalThis.__CORNERFILL_POINTER_DRIVER__ = ancestorHoverDriver;
  await waitFor(() => ancestorHoverDriver.stage === "compiled-ancestor-hover-driven",
    "compiled ancestor-hover driver");
  await waitFor(() => compiled.explain(hoverFace)?.status === "active",
    "compiled ancestor hover did not discover a sibling candidate");
  ancestorHoverDriver.stage = "compiled-ancestor-hover-out-ready";
  await waitFor(() => ancestorHoverDriver.stage === "compiled-ancestor-hover-out-driven",
    "compiled ancestor-hover-out driver");
  await waitFor(() => compiled.explain(hoverFace) === null,
    "compiled ancestor hover did not detach its sibling candidate");

  const scopeShell = document.createElement("section");
  const scoped = document.createElement("div");
  scoped.className = "cornerfill-compiled-scoped";
  scopeShell.append(scoped);
  document.body.append(scopeShell);
  await new Promise(requestAnimationFrame);
  assert(compiled.explain(scoped) === null, "inactive @scope attached before its boundary matched");
  scopeShell.setAttribute("data-cornerfill-compiled-scope", "");
  await waitFor(() => compiled.explain(scoped)?.status === "active",
    "@scope boundary activation was not observed");
  scopeShell.removeAttribute("data-cornerfill-compiled-scope");
  await waitFor(() => compiled.explain(scoped) === null,
    "@scope boundary deactivation was not observed");

  const languageParent = document.createElement("section");
  const language = document.createElement("div");
  language.className = "cornerfill-compiled-language";
  languageParent.append(language);
  document.body.append(languageParent);
  languageParent.lang = "fr";
  await waitFor(() => compiled.explain(language)?.status === "active",
    "inherited :lang() activation was not observed");
  languageParent.lang = "en";
  await waitFor(() => compiled.explain(language) === null,
    "inherited :lang() deactivation was not observed");

  const directionParent = document.createElement("section");
  const direction = document.createElement("div");
  direction.className = "cornerfill-compiled-direction";
  directionParent.append(direction);
  document.body.append(directionParent);
  directionParent.dir = "rtl";
  await waitFor(() => compiled.explain(direction)?.status === "active",
    "inherited :dir() activation was not observed");
  directionParent.dir = "ltr";
  await waitFor(() => compiled.explain(direction) === null,
    "inherited :dir() deactivation was not observed");

  const disabledFieldset = document.createElement("fieldset");
  const disabledButton = document.createElement("button");
  disabledButton.className = "cornerfill-compiled-disabled";
  disabledFieldset.append(disabledButton);
  document.body.append(disabledFieldset);
  disabledFieldset.disabled = true;
  await waitFor(() => compiled.explain(disabledButton)?.status === "active",
    "fieldset-disabled state did not invalidate its descendant candidate");
  disabledFieldset.disabled = false;
  await waitFor(() => compiled.explain(disabledButton) === null,
    "fieldset-enabled state did not invalidate its descendant candidate");

  const crossFile = document.createElement("div");
  crossFile.className = "cornerfill-compiled-cross-file";
  document.body.append(crossFile);
  await waitFor(() => compiled.explain(crossFile)?.status === "active",
    "cross-file paint dependency did not attach");
  const compiledPaintColor = (target) => compiled.explain(target)?.paint?.layer?.color
    ?? getComputedStyle(target).backgroundColor;
  const crossFileInitialColor = compiledPaintColor(crossFile);
  assert(/(?:220,\s*40,\s*40|red)/u.test(crossFileInitialColor),
    `cross-file paint dependency started as ${crossFileInitialColor}`);

  const variableShapeParent = document.createElement("section");
  const variableShape = document.createElement("div");
  variableShape.className = "cornerfill-compiled-variable-shape";
  variableShapeParent.append(variableShape);
  document.body.append(variableShapeParent);
  await new Promise(requestAnimationFrame);
  assert(compiled.explain(variableShape) === null,
    "an unresolved variable shape attached before its inline dependency existed");
  variableShapeParent.style.setProperty("--cornerfill-compiled-dynamic-shape", "bevel");
  await waitFor(() => compiled.explain(variableShape)?.status === "active",
    "an inherited inline custom-property change did not activate a potential candidate");
  variableShapeParent.style.removeProperty("--cornerfill-compiled-dynamic-shape");
  await waitFor(() => compiled.explain(variableShape) === null,
    "removing an inherited inline custom property did not detach its candidate");

  const added = document.createElement("div");
  added.className = "cornerfill-compiled-dynamic active";
  const addedTree = document.createElement("section");
  addedTree.append(added);
  document.body.append(addedTree);
  await waitFor(() => compiled.explain(added)?.status === "active", "compiled added-subtree attachment");
  addedTree.remove();
  await waitFor(() => compiled.explain(added) === null, "compiled removed-subtree detachment");

  const media = document.createElement("div");
  media.className = "cornerfill-compiled-media";
  const conditional = document.createElement("div");
  conditional.className = "cornerfill-compiled-conditional";
  const conditionalLink = document.createElement("link");
  conditionalLink.rel = "stylesheet";
  conditionalLink.media = "(prefers-color-scheme: dark)";
  conditionalLink.href = "/bench/compiled-conditional-fixture.css";
  const conditionalLoaded = new Promise((resolve, reject) => {
    conditionalLink.addEventListener("load", resolve, { once: true });
    conditionalLink.addEventListener("error", () => reject(new Error("compiled conditional stylesheet failed")), { once: true });
  });
  document.body.append(media, conditional);
  document.head.append(conditionalLink);
  await conditionalLoaded;
  await new Promise(requestAnimationFrame);
  assert(compiled.explain(media) === null, "dormant compiled media rule created paint ownership");
  assert(compiled.explain(conditional) === null,
    "inactive stylesheet-level media condition attached before activation");
  const mediaCandidatePasses = compiled.explain().counters.candidatePasses;
  const mediaDriver = { stage: "compiled-media-dark-ready" };
  globalThis.__CORNERFILL_POINTER_DRIVER__ = mediaDriver;
  await waitFor(() => mediaDriver.stage === "compiled-media-dark-driven", "compiled dark media driver");
  await waitFor(() => compiled.explain(media)?.status === "active", "compiled media attachment");
  await waitFor(() => compiled.explain(conditional)?.status === "active",
    "stylesheet-level media condition did not discover its manifest on activation");
  await waitFor(() => /20,\s*40,\s*220/u.test(compiledPaintColor(crossFile)),
    "metadata-only custom property media did not repaint its cross-file target");
  mediaDriver.stage = "compiled-media-light-ready";
  await waitFor(() => mediaDriver.stage === "compiled-media-light-driven", "compiled light media driver");
  await waitFor(() => compiled.explain(media) === null, () => (
    `compiled media detachment: carrier=${getComputedStyle(media)
      .getPropertyValue("--cornerfill-corner-top-left-shape")} controller=${JSON.stringify(compiled.explain())} report=${JSON.stringify(compiled.explain(media))}`
  ));
  await waitFor(() => compiled.explain(conditional) === null,
    "stylesheet-level media condition did not detach on deactivation");
  await waitFor(() => /(?:220,\s*40,\s*40|red)/u.test(
    compiledPaintColor(crossFile)
  ), "metadata-only custom property media did not restore its cross-file target");
  assert(compiled.explain().counters.candidatePasses - mediaCandidatePasses <= 6,
    "compiled media and owner activation scheduled redundant candidate passes");
  assert(compiled.explain().counters.sourceReads === 0
    && compiled.explain().counters.sourceFetches === 0
    && compiled.explain().counters.sourceCompiles === 0,
  "compiled invalidation performed source work");

  const manifestProperty = Array.from({ length: getComputedStyle(document.documentElement).length },
    (_value, index) => getComputedStyle(document.documentElement).item(index))
    .find((property) => property.startsWith("--cornerfill-compiled-manifest-"));
  assert(manifestProperty, "compiled recovery fixture could not resolve a manifest property");
  const malformedManifest = document.createElement("style");
  malformedManifest.textContent = `:root{${manifestProperty}:"malformed"!important}`;
  document.head.append(malformedManifest);
  await waitFor(() => compiled.explain().status === "blocked-recoverable",
    "compiled malformed manifest did not enter recoverable fail-close");
  assert(compiled.explain().observing,
    "compiled fail-close disconnected its recovery observer");
  assert(compiled.explain(element) === null,
    "compiled fail-close retained paint ownership");
  malformedManifest.remove();
  await waitFor(() => compiled.explain().status === "active"
    && compiled.explain(element)?.status === "active",
  "compiled fail-close did not recover after the offending stylesheet was removed");

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const idleBefore = {
    compiled: compiled.explain().counters,
    entry: compiled.explain(element).counters,
    runtime: compiled.explain().runtime.counters,
  };
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const idleAfter = {
    compiled: compiled.explain().counters,
    entry: compiled.explain(element).counters,
    runtime: compiled.explain().runtime.counters,
  };
  equal(idleAfter, idleBefore, "compiled idle frames performed runtime work");

  const transformBefore = {
    computedChecks: compiled.explain().counters.computedChecks,
    handleRefreshes: compiled.explain().counters.handleRefreshes,
    entry: compiled.explain(element).counters,
    runtimePaints: compiled.explain().runtime.counters.paints,
    runtimeStyleChecks: compiled.explain().runtime.counters.styleChecks,
  };
  element.style.transform = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,7,9,0,1)";
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const transformAfter = {
    computedChecks: compiled.explain().counters.computedChecks,
    handleRefreshes: compiled.explain().counters.handleRefreshes,
    entry: compiled.explain(element).counters,
    runtimePaints: compiled.explain().runtime.counters.paints,
    runtimeStyleChecks: compiled.explain().runtime.counters.styleChecks,
  };
  equal(transformAfter, transformBefore,
    "compiled transform-only mutation performed style or paint work");

  const carrierBefore = {
    compiled: compiled.explain().counters,
    entry: compiled.explain(element),
  };
  element.classList.add("cornerfill-compiled-scoop");
  if (carrierBefore.entry.backend === "native-corner-shape") {
    await waitFor(() => (
      compiled.explain().counters.handleRefreshes === carrierBefore.compiled.handleRefreshes + 1
    ), "single compiled carrier refresh");
  } else {
    await waitFor(() => compiled.explain(element)?.geometry?.shapeParameters?.[0] === -1,
      "single compiled carrier repaint");
  }
  const carrierAfter = {
    compiled: compiled.explain().counters,
    entry: compiled.explain(element),
  };
  assert(carrierAfter.compiled.computedChecks === carrierBefore.compiled.computedChecks + 1,
    "one carrier change did not perform exactly one computed carrier check");
  assert(carrierAfter.compiled.handleRefreshes === carrierBefore.compiled.handleRefreshes + 1,
    "one carrier change did not perform exactly one handle refresh");
  if (carrierAfter.entry.backend !== "native-corner-shape") {
    assert(carrierAfter.entry.counters.paints === carrierBefore.entry.counters.paints + 1,
      `one carrier change did not repaint exactly once: ${carrierBefore.entry.counters.paints} -> ${carrierAfter.entry.counters.paints}`);
  }

  const resizeBefore = {
    compiled: compiled.explain().counters,
    entry: compiled.explain(element),
  };
  element.style.width = "40px";
  if (resizeBefore.entry.backend === "native-corner-shape") {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  } else {
    await waitFor(() => compiled.explain(element)?.geometry?.width === 40,
      "single compiled resize refresh");
  }
  const resizeAfter = {
    compiled: compiled.explain().counters,
    entry: compiled.explain(element),
  };
  assert(resizeAfter.compiled.computedChecks === resizeBefore.compiled.computedChecks,
    "resize unnecessarily rechecked compiled carriers");
  assert(resizeAfter.compiled.handleRefreshes === resizeBefore.compiled.handleRefreshes,
    "resize unnecessarily invoked compiled attachment refresh");
  if (resizeAfter.entry.backend !== "native-corner-shape") {
    assert(resizeAfter.entry.counters.styleChecks === resizeBefore.entry.counters.styleChecks + 1,
      "one resize did not perform exactly one runtime style check");
    assert(resizeAfter.entry.counters.paints === resizeBefore.entry.counters.paints + 1,
      "one resize did not repaint exactly once");
  }

  const [shadowCss, shadowResetCss] = await Promise.all([
    fetch("/bench/compiled-shadow-fixture.css").then((response) => response.text()),
    fetch("/bench/compiled-shadow-reset.css").then((response) => response.text()),
  ]);
  const theme = document.createElement("section");
  const shadowHost = host(theme);
  shadowHost.classList.add("cornerfill-compiled-shared-host");
  const shadow = shadowHost.attachShadow({ mode: "open" });
  const shadowStyle = document.createElement("style");
  shadowStyle.textContent = shadowCss;
  const shadowElement = document.createElement("div");
  shadowElement.className = "cornerfill-compiled-shadow";
  const shadowHostChild = document.createElement("div");
  shadowHostChild.className = "cornerfill-compiled-shadow-host-child";
  const shadowContext = document.createElement("div");
  shadowContext.className = "cornerfill-compiled-shadow-context";
  shadow.append(shadowStyle, shadowElement, shadowHostChild, shadowContext);
  document.body.append(theme);
  await waitFor(() => compiled.explain(shadowHost)?.status === "active",
    "document scope did not claim the shared shadow host");

  const unregisteredHost = host();
  const unregistered = unregisteredHost.attachShadow({ mode: "open" });
  const unregisteredStyle = document.createElement("style");
  unregisteredStyle.textContent = shadowCss;
  const unregisteredElement = document.createElement("div");
  unregisteredElement.className = "cornerfill-compiled-shadow";
  unregistered.append(unregisteredStyle, unregisteredElement);
  await new Promise(requestAnimationFrame);
  assert(!shadowElement.hasAttribute("data-cornerfill-owned"),
    "compiled mode entered an open shadow root before registration");
  assert(!unregisteredElement.hasAttribute("data-cornerfill-owned"),
    "compiled mode entered an unregistered shadow root");

  let shadowScope = compiled.registerRoot(shadow);
  let shadowReport = await shadowScope.ready;
  assert(shadowReport.root === "shadow", "registered compiled scope did not report a shadow root");
  assert(shadowReport.manifests === 1,
    `registered shadow root inherited a foreign manifest: ${shadowReport.manifests}`);
  assert(shadowScope.explain(shadowElement)?.status === "active",
    "compiled shadow element did not attach");
  assert(shadowScope.explain(shadowHost)?.status === "active", "compiled :host did not attach");
  assert(shadowScope.explain(shadowHostChild) === null, "inactive compiled :host() attached early");
  assert(shadowScope.explain(shadowContext) === null,
    "inactive compiled :host-context() attached early");
  assert(!unregisteredElement.hasAttribute("data-cornerfill-owned"),
    "registered-root discovery leaked into another shadow root");

  shadowHost.classList.add("cornerfill-compiled-shadow-active");
  await waitFor(() => shadowScope.explain(shadowHostChild)?.status === "active",
    "compiled :host() attachment");
  theme.classList.add("cornerfill-compiled-shadow-theme");
  await waitFor(() => shadowScope.explain(shadowContext)?.status === "active",
    "compiled :host-context() attachment");
  const hostContextMarker = [...shadowHost.attributes]
    .find(({ name }) => name.startsWith("data-cornerfill-host-context-"))?.name;
  assert(hostContextMarker, "compiled :host-context() did not install its private marker");
  shadowHost.removeAttribute(hostContextMarker);
  await waitFor(() => shadowHost.getAttribute(hostContextMarker) === "1"
    && shadowScope.explain(shadowContext)?.status === "active",
  "compiled :host-context() marker was not repaired after external removal");
  theme.classList.remove("cornerfill-compiled-shadow-theme");
  await waitFor(() => shadowScope.explain(shadowContext) === null,
    "compiled :host-context() detachment");
  shadowHost.setAttribute(hostContextMarker, "forged");
  await waitFor(() => !shadowHost.hasAttribute(hostContextMarker)
    && shadowScope.explain(shadowContext) === null,
  "compiled :host-context() accepted an external marker while its context was false");

  const shadowManifestProperty = Array.from({ length: getComputedStyle(shadowHost).length },
    (_value, index) => getComputedStyle(shadowHost).item(index))
    .find((property) => property.startsWith("--cornerfill-compiled-manifest-"));
  assert(shadowManifestProperty, "shared-host veto fixture could not resolve its shadow manifest");
  const malformedShadowManifest = document.createElement("style");
  malformedShadowManifest.textContent = `:host{${shadowManifestProperty}:"malformed"!important}`;
  shadow.append(malformedShadowManifest);
  await waitFor(() => shadowScope.explain().status === "blocked-recoverable",
    "malformed shadow manifest did not block its scope");
  assert(compiled.explain(shadowHost) === null,
    "a blocked shadow scope left the document scope's shared host handle active");
  malformedShadowManifest.remove();
  await waitFor(() => shadowScope.explain().status === "active"
    && compiled.explain(shadowHost)?.status === "active",
  "shared host did not recover after the shadow manifest was repaired");

  shadowStyle.remove();
  await waitFor(() => shadowScope.explain(shadowElement) === null
    && shadowScope.explain(shadowHost) === null
    && shadowScope.explain(shadowHostChild) === null,
  "compiled shadow style removal");
  shadow.append(shadowStyle);
  await waitFor(() => shadowScope.explain(shadowElement)?.status === "active",
    "compiled shadow style insertion");
  shadowStyle.remove();
  await waitFor(() => shadowScope.explain(shadowElement) === null,
    "compiled shadow style teardown before link test");

  const shadowLink = document.createElement("link");
  shadowLink.rel = "stylesheet";
  shadowLink.media = "all";
  shadowLink.href = "/bench/compiled-shadow-fixture.css";
  const shadowLinkLoaded = new Promise((resolve, reject) => {
    shadowLink.addEventListener("load", resolve, { once: true });
    shadowLink.addEventListener("error", () => reject(new Error("compiled shadow link failed")),
      { once: true });
  });
  shadow.append(shadowLink);
  await shadowLinkLoaded;
  await waitFor(() => shadowScope.explain(shadowElement)?.status === "active",
    "compiled shadow link insertion");
  shadowLink.media = "not all";
  await waitFor(() => shadowScope.explain(shadowElement) === null,
    "compiled shadow link media deactivation");
  shadowLink.media = "all";
  await waitFor(() => shadowScope.explain(shadowElement)?.status === "active",
    "compiled shadow link media activation");
  shadowLink.remove();

  const adoptedBase = new CSSStyleSheet();
  const adoptedReset = new CSSStyleSheet();
  adoptedBase.replaceSync(shadowCss);
  adoptedReset.replaceSync(shadowResetCss);
  shadow.adoptedStyleSheets = [adoptedBase];
  shadowReport = await shadowScope.refresh();
  assert(shadowReport.manifests === 1, "compiled adopted sheet manifest was not discovered");
  assert(shadowScope.explain(shadowElement)?.status === "active",
    "compiled adopted sheet did not attach");
  shadow.adoptedStyleSheets = [adoptedBase, adoptedReset];
  await shadowScope.refresh();
  assert(shadowScope.explain(shadowElement) === null,
    "compiled adopted sheet order did not apply its reset");
  shadow.adoptedStyleSheets = [adoptedBase];
  shadowReport = await shadowScope.refresh();
  assert(shadowScope.explain(shadowElement)?.status === "active",
    `compiled adopted sheet list refresh did not restore its shape: ${JSON.stringify(shadowReport.errors)}`);
  adoptedBase.replaceSync(".cornerfill-compiled-shadow { corner-shape: bevel }");
  await new Promise(requestAnimationFrame);
  assert(shadowScope.explain(shadowElement)?.status === "active",
    "unobservable CSSOM replacement refreshed without an explicit request");
  await shadowScope.refresh();
  assert(shadowScope.explain(shadowElement) === null,
    "explicit refresh retained an unprocessed CSSOM replacement");
  adoptedBase.replaceSync(shadowCss);
  await shadowScope.refresh();
  assert(shadowScope.explain(shadowElement)?.status === "active",
    "explicit refresh did not restore replaced compiled CSS");

  const disconnectedHost = document.createElement("section");
  const disconnectedRoot = disconnectedHost.attachShadow({ mode: "open" });
  const disconnectedStyle = document.createElement("style");
  disconnectedStyle.textContent = shadowCss;
  const disconnectedElement = document.createElement("div");
  disconnectedElement.className = "cornerfill-compiled-shadow";
  disconnectedRoot.append(disconnectedStyle, disconnectedElement);
  const disconnectedScope = compiled.registerRoot(disconnectedRoot);
  await disconnectedScope.ready;
  assert(disconnectedScope.explain(disconnectedElement) === null,
    "a disconnected compiled root attached before connection");
  document.body.append(disconnectedHost);
  await waitFor(() => disconnectedScope.explain(disconnectedElement)?.status === "active",
    "a registered disconnected root did not start after connection");

  const outerHost = document.createElement("section");
  const outerRoot = outerHost.attachShadow({ mode: "open" });
  const innerHost = document.createElement("article");
  outerRoot.append(innerHost);
  const innerRoot = innerHost.attachShadow({ mode: "open" });
  const innerStyle = document.createElement("style");
  innerStyle.textContent = shadowCss;
  const nestedContext = document.createElement("div");
  nestedContext.className = "cornerfill-compiled-shadow-context";
  innerRoot.append(innerStyle, nestedContext);
  document.body.append(outerHost);
  const innerScope = compiled.registerRoot(innerRoot);
  await innerScope.ready;
  assert(innerScope.explain(nestedContext) === null,
    "nested :host-context() attached before its document ancestor matched");
  document.body.classList.add("cornerfill-compiled-shadow-theme");
  await waitFor(() => innerScope.explain(nestedContext)?.status === "active",
    "nested :host-context() missed an outer-document mutation");
  document.body.classList.remove("cornerfill-compiled-shadow-theme");
  await waitFor(() => innerScope.explain(nestedContext) === null,
    "nested :host-context() missed outer-document deactivation");
  innerScope.destroy();
  disconnectedScope.destroy();
  outerHost.remove();
  disconnectedHost.remove();

  shadowScope.destroy();
  assert(!shadowElement.hasAttribute("data-cornerfill-owned"),
    "compiled shadow scope destroy retained paint ownership");
  shadowScope = compiled.registerRoot(shadow);
  await shadowScope.ready;
  assert(compiled.unregisterRoot(shadow), "compiled shadow root unregister was not acknowledged");
  assert(!shadowElement.hasAttribute("data-cornerfill-owned"),
    "compiled shadow root unregister retained paint ownership");
  shadowScope = compiled.registerRoot(shadow);
  await shadowScope.ready;

  const closedHost = host();
  const closedRoot = closedHost.attachShadow({ mode: "closed" });
  let closedRootError;
  try { compiled.registerRoot(closedRoot); } catch (error) { closedRootError = error; }
  assert(/closed ShadowRoot/u.test(closedRootError?.message ?? ""),
    "compiled closed-root registration did not fail explicitly");

  assert(link.sheet, "compiled stylesheet disabled-state fixture has no CSSStyleSheet");
  link.sheet.disabled = true;
  await waitFor(() => compiled.explain(element) === null,
    "CSSStyleSheet.disabled did not detach compiled ownership");
  link.sheet.disabled = false;
  await waitFor(() => compiled.explain(element)?.status === "active",
    "CSSStyleSheet.disabled did not restore compiled ownership");

  const resources = performance.getEntriesByType("resource").slice(beforeResources)
    .map(({ name }) => new URL(name).pathname);
  assert(!resources.some((path) => /\/(?:auto-runtime|postcss)\.mjs$/u.test(path)),
    `compiled browser route loaded Node or automatic code: ${JSON.stringify(resources)}`);
  compiled.destroy();
  assert(compiled.explain(element) === null, "compiled destroy retained a runtime entry");
  assert(!element.hasAttribute("data-cornerfill-owned"), "compiled destroy retained paint ownership");
  assert(!parent.hasAttribute("data-cornerfill-owned"), "compiled destroy retained inherited ownership");
  assert(!layered.hasAttribute("data-cornerfill-owned"), "compiled destroy retained layered ownership");
  assert(!supported.hasAttribute("data-cornerfill-owned"), "compiled destroy retained conditional ownership");
  assert(!dynamic.hasAttribute("data-cornerfill-owned"), "compiled destroy retained dynamic ownership");
  assert(!hoverState.hasAttribute("data-cornerfill-owned"), "compiled destroy retained state ownership");
  assert(!media.hasAttribute("data-cornerfill-owned"), "compiled destroy retained media ownership");
  assert(!shadowElement.hasAttribute("data-cornerfill-owned"),
    "compiled controller destroy retained registered-root ownership");
  assert(!shadowHost.hasAttribute("data-cornerfill-owned"),
    "compiled controller destroy retained :host ownership");
  assert(!unregisteredElement.hasAttribute("data-cornerfill-owned"),
    "compiled controller destroy touched an unregistered root");
  const destroyedCompiled = compiled.explain();
  assert(destroyedCompiled.attached === 0 && destroyedCompiled.candidates === 0,
    "compiled controller destroy retained candidates or handles");
  assert(destroyedCompiled.runtime.entries === 0
    && destroyedCompiled.runtime.surfaces === 0
    && destroyedCompiled.runtime.surfacePixels === 0,
  "compiled controller destroy retained runtime entries or surfaces");
  assert(destroyedCompiled.runtime.imageCache.entries === 0
    && destroyedCompiled.runtime.imageCache.references === 0,
  "compiled controller destroy retained decoded images");
  assert(destroyedCompiled.runtime.surfaceResources.firefox.registrations === 0
    && destroyedCompiled.runtime.surfaceResources.webkit.activeCanvases === 0
    && destroyedCompiled.runtime.surfaceResources.webkit.activePixels === 0,
  "compiled controller destroy retained live backend resources");

  const budgetFrame = document.createElement("iframe");
  budgetFrame.srcdoc = "<!doctype html><html><head></head><body></body></html>";
  const budgetLoaded = new Promise((resolve) => budgetFrame.addEventListener("load", resolve, { once: true }));
  document.body.append(budgetFrame);
  await budgetLoaded;
  const budgetDocument = budgetFrame.contentDocument;
  const budgetStyle = budgetDocument.createElement("style");
  budgetStyle.textContent = await fetch("/bench/compiled-budget-fixture.css").then((response) => response.text());
  budgetDocument.head.append(budgetStyle);
  for (let index = 0; index < 600; index += 1) {
    const node = budgetDocument.createElement("div");
    if (index === 0) {
      node.className = "cornerfill-compiled-budget-real";
      node.style.cssText = "width:12px;height:10px;border-radius:5px;background:red";
    } else node.className = "cornerfill-compiled-budget-round";
    budgetDocument.body.append(node);
  }
  const budgetController = installCornerfillCompiled({
    document: budgetDocument,
    backend,
    staticFallback: backend === "static-data-url",
    maxCandidateElements: 1,
  });
  const budgetReport = await budgetController.ready;
  assert(budgetReport.candidates === 1 && budgetReport.potentialCandidates > 512,
    "an inactive conditional selector still consumed the active candidate budget");
  budgetController.destroy();
  budgetFrame.remove();

  const traversalLimited = installCornerfillCompiled({
    document,
    backend,
    staticFallback: backend === "static-data-url",
    maxScannedElements: 1,
  });
  await traversalLimited.ready.then(
    () => { throw new Error("compiled traversal budget did not fail closed"); },
    () => undefined,
  );
  assert(traversalLimited.explain().errors.some((message) => message.includes("maximum scanned")),
    "compiled traversal budget was not diagnosed");
  traversalLimited.destroy();

  const candidateLimited = installCornerfillCompiled({
    document,
    backend,
    staticFallback: backend === "static-data-url",
    maxCandidateElements: 1,
  });
  await candidateLimited.ready.then(
    () => { throw new Error("compiled candidate budget did not fail closed"); },
    () => undefined,
  );
  assert(candidateLimited.explain().errors.some((message) => message.includes("maximum candidate")),
    "compiled candidate budget was not diagnosed");
  candidateLimited.destroy();
  element.remove();
  parent.remove();
  layered.remove();
  supported.remove();
  dynamic.remove();
  hoverState.remove();
  hoverCard.remove();
  scopeShell.remove();
  languageParent.remove();
  directionParent.remove();
  disabledFieldset.remove();
  crossFile.remove();
  variableShapeParent.remove();
  media.remove();
  conditional.remove();
  theme.remove();
  unregisteredHost.remove();
  closedHost.remove();
  link.remove();
  paintMetadataLink.remove();
  conditionalLink.remove();
});

await test("automatic install consumes standard corner-shape CSS and tears down", async () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `data:text/css,${encodeURIComponent(`
    .cornerfill-auto-fixture,.cornerfill-auto-dynamic,.cornerfill-auto-inline,.cornerfill-auto-focus,.cornerfill-auto-paint-focus,.cornerfill-auto-font,.cornerfill-auto-media,.cornerfill-auto-zero,.cornerfill-auto-partial {
      width:12px;height:10px;border-radius:6px;background:red;border:0;outline:none
    }
    .cornerfill-auto-fixture { corner-shape:bevel;corner-top-left-shape:round }
    .cornerfill-auto-dynamic { corner-shape:bevel }
    .cornerfill-auto-dynamic.changed { corner-shape:round;background:blue }
    .cornerfill-auto-focus { corner-shape:bevel }
    .cornerfill-auto-focus:focus { corner-shape:bevel;border-radius:4px;background:blue }
    .cornerfill-auto-paint-focus { corner-shape:bevel }
    .cornerfill-auto-paint-focus:focus { background:blue }
    .cornerfill-auto-font { corner-shape:bevel;border-radius:1em;font-size:4px }
    .cornerfill-auto-font:focus { font:8px serif }
    .cornerfill-auto-zero { corner-shape:bevel;border-radius:0 }
    .cornerfill-auto-partial { corner-shape:bevel square scoop notch;border-radius:6px 0 0 0 }
    .cornerfill-auto-attr-observation { --cornerfill-paint-token:attr(data-cornerfill-tone) }
    @media (prefers-color-scheme: dark) { .cornerfill-auto-media { corner-shape:bevel } }
  `)}`;
  document.head.append(link);
  const element = document.createElement("div");
  element.className = "cornerfill-auto-fixture";
  const dynamic = document.createElement("div");
  dynamic.className = "cornerfill-auto-dynamic";
  const inline = document.createElement("div");
  inline.className = "cornerfill-auto-inline";
  const replacedInline = document.createElement("div");
  replacedInline.setAttribute(
    "style",
    "width:12px;height:10px;border-radius:6px;background:red;corner-shape:bevel",
  );
  const focus = document.createElement("div");
  focus.className = "cornerfill-auto-focus";
  focus.tabIndex = 0;
  const paintFocus = document.createElement("div");
  paintFocus.className = "cornerfill-auto-paint-focus";
  paintFocus.tabIndex = 0;
  const fontFocus = document.createElement("div");
  fontFocus.className = "cornerfill-auto-font";
  fontFocus.tabIndex = 0;
  const media = document.createElement("div");
  media.className = "cornerfill-auto-media";
  const zero = document.createElement("div");
  zero.className = "cornerfill-auto-zero";
  const partial = document.createElement("div");
  partial.className = "cornerfill-auto-partial";
  const cssomStyle = document.createElement("style");
  document.head.append(cssomStyle);
  const cssom = host();
  cssom.className = "cornerfill-auto-cssom";
  const byId = host(document.body, "cornerfill-auto-by-id");
  const attributed = host();
  const hover = host();
  hover.className = "cornerfill-auto-hover";
  const toggle = document.createElement("details");
  toggle.className = "cornerfill-auto-toggle";
  Object.assign(toggle.style, { width: "12px", height: "10px", background: "red" });
  const escaped = host();
  escaped.className = "cornerfill:escaped";
  document.body.append(toggle);
  document.body.append(element, dynamic, inline, replacedInline, focus, paintFocus, fontFocus, media, zero, partial);
  const { default: auto } = await import("../dist/auto.mjs");
  await auto.ready;
  rootImportResources = Object.freeze(performance.getEntriesByType("resource")
    .map(({ name }) => new URL(name).pathname));
  const explanation = auto.explain(element);
  rootAutomaticReport = auto.explain();
  const automaticMode = rootAutomaticReport.mode;
  const nativeDecision = qualifyNativeCornerShape(document);
  if (automaticMode === "native") {
    assert(nativeDecision.qualified, "automatic native path was selected without native qualification");
    assert(explanation === null, "automatic native path unnecessarily attached the element");
  } else {
    assert(rootAutomaticReport.automatic.counters.candidatePasses === 1, "initial automatic discovery ran duplicate candidate passes");
    assert(!nativeDecision.qualified, "automatic fallback was selected after native qualification");
    assert(
      explanation?.status === "active",
      `standard CSS element was not attached automatically: ${JSON.stringify(auto.explain())}`,
    );
    equal(explanation.geometry.shapeParameters, [1, 0, 0, 0], "automatic CSS cascade lost shorthand/longhand order");
    const initialObservation = auto.explain().automatic.observation;
    equal(initialObservation.events, ["focusin", "focusout", "resize"], "unused selector-state listeners were installed");
    assert(initialObservation.attributes.includes("class"), "class selector dependency was not observed");
    assert(initialObservation.attributes.includes("data-cornerfill-tone"), "paint attr() dependency was not observed");
    assert(!initialObservation.attributes.includes("data-cornerfill-noise"), "unreferenced attributes were observed");
    assert(initialObservation.mediaQueries.includes("(prefers-color-scheme: dark)"), "media dependency was not observed");
    assert(auto.explain(media) === null, "inactive color-scheme media attached early");
    assert(auto.explain(zero) === null, "zero-radius shape started an unnecessary fallback surface");
    assert(auto.explain(partial)?.status === "active", "one non-round non-zero corner did not attach");
    equal(auto.explain(partial).geometry.radii.slice(1), [
      { rx: 0, ry: 0 }, { rx: 0, ry: 0 }, { rx: 0, ry: 0 },
    ], "zero-area corners were not retained beside the active corner");
    const sourcePassesBeforeIdle = auto.explain().automatic.counters.sourcePasses;
    const paintsBeforeIdle = auto.explain(element).counters.paints;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(auto.explain().automatic.counters.sourcePasses === sourcePassesBeforeIdle, "generated stylesheet writes scheduled another source pass");
    assert(auto.explain(element).counters.paints === paintsBeforeIdle, "generated stylesheet writes repainted an attached element");
    const candidatePassesBeforeNoise = auto.explain().automatic.counters.candidatePasses;
    element.setAttribute("data-cornerfill-noise", "1");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(auto.explain().automatic.counters.candidatePasses === candidatePassesBeforeNoise, "unreferenced attribute churn ran selector reconciliation");
    const countersBeforeState = auto.explain().automatic.counters;
    const focusPaintsBeforeState = auto.explain(focus).counters.paints;
    dynamic.classList.add("changed");
    inline.setAttribute("style", "corner-shape:bevel");
    focus.focus();
    await waitFor(() => (
      auto.explain(dynamic) === null
      && auto.explain(inline)?.status === "active"
      && auto.explain(focus)?.geometry?.radii?.[0]?.rx === 4
      && /(?:blue|0,\s*0,\s*255)/u.test(auto.explain(focus)?.paint?.layer?.color ?? "")
    ), "automatic dynamic CSS refresh");
    assert(auto.explain(focus).counters.paints === focusPaintsBeforeState + 1, "focus-on authored state did not repaint exactly once");
    const countersAfterState = auto.explain().automatic.counters;
    assert(countersAfterState.sourceReads === countersBeforeState.sourceReads, "selector state refetched stylesheets");
    assert(countersAfterState.sourceCompiles === countersBeforeState.sourceCompiles, "selector state reparsed stylesheets");
    const beforeStableSourceRefresh = countersAfterState;
    await auto.refresh();
    const afterStableSourceRefresh = auto.explain().automatic.counters;
    assert(afterStableSourceRefresh.sourcePasses === beforeStableSourceRefresh.sourcePasses + 1, "explicit source pass did not run");
    assert(afterStableSourceRefresh.sourceReads === beforeStableSourceRefresh.sourceReads, "unchanged source was refetched");
    assert(afterStableSourceRefresh.sourceCompiles === beforeStableSourceRefresh.sourceCompiles, "unchanged source was reparsed");
    assert(afterStableSourceRefresh.handleRefreshes === beforeStableSourceRefresh.handleRefreshes, "unchanged source refreshed a handle");
    dynamic.classList.remove("changed");
    await waitFor(() => auto.explain(dynamic)?.status === "active", "round-to-bevel fallback reattachment");
    equal(auto.explain(dynamic).geometry.shapeParameters, [0, 0, 0, 0], "class shape reattachment was not recaptured");
    equal(auto.explain(inline).geometry.shapeParameters, [0, 0, 0, 0], "raw inline corner-shape was not retained");
    inline.setAttribute(
      "style",
      (inline.getAttribute("style") ?? "").replace(/corner-shape\s*:\s*bevel/iu, "corner-shape:scoop"),
    );
    await waitFor(() => auto.explain(inline)?.geometry?.shapeParameters?.[0] === -1, "raw inline read-modify-write refresh");
    equal(auto.explain(focus).geometry.shapeParameters, [0, 0, 0, 0], "focus selector changed the persistent shape");
    element.tabIndex = -1;
    element.focus();
    await waitFor(() => (
      auto.explain(focus)?.geometry?.radii?.[0]?.rx === 5
      && /(?:red|255,\s*0,\s*0)/u.test(auto.explain(focus)?.paint?.layer?.color ?? "")
    ), "persistent authored focus state restoration");
    assert(auto.explain(focus).counters.paints === focusPaintsBeforeState + 2, "focus-off authored state did not repaint exactly once");
    const paintOnlyFocusPaints = auto.explain(paintFocus).counters.paints;
    paintFocus.focus();
    await waitFor(() => (
      /(?:blue|0,\s*0,\s*255)/u.test(auto.explain(paintFocus)?.paint?.layer?.color ?? "")
    ), "paint-only focus selector refresh");
    assert(
      auto.explain(paintFocus).counters.paints === paintOnlyFocusPaints + 1,
      "paint-only focus state did not repaint exactly once",
    );
    element.focus();
    await waitFor(() => (
      /(?:red|255,\s*0,\s*0)/u.test(auto.explain(paintFocus)?.paint?.layer?.color ?? "")
    ), "paint-only focus selector restoration");
    const fontRadius = auto.explain(fontFocus).geometry.radii[0].rx;
    fontFocus.focus();
    await waitFor(
      () => auto.explain(fontFocus)?.geometry.radii[0].rx > fontRadius,
      "font shorthand state changed an em radius",
    );
    const candidatePassesBeforePlacement = auto.explain().automatic.counters.candidatePasses;
    element.style.left = "1px";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(
      auto.explain().automatic.counters.candidatePasses === candidatePassesBeforePlacement,
      "placement-only inline style triggered an automatic candidate pass",
    );
    const inserted = cssomStyle.sheet.insertRule(
      ".cornerfill-auto-cssom{corner-shape:bevel;border-radius:5px;background:green}",
    );
    await waitFor(() => auto.explain(cssom)?.status === "active", "CSSOM insertRule discovery");
    cssomStyle.sheet.deleteRule(inserted);
    await waitFor(() => auto.explain(cssom) === null, "CSSOM deleteRule teardown");

    for (const rule of [
      "#cornerfill-auto-by-id{corner-shape:bevel;border-radius:5px}",
      "[data-cornerfill-trigger]{corner-shape:bevel;border-radius:5px}",
      ".cornerfill-auto-hover:hover{corner-shape:bevel;border-radius:5px}",
      ".cornerfill-auto-toggle:open{corner-shape:bevel;border-radius:5px}",
      ".cornerfill-auto-fullscreen:fullscreen{corner-shape:bevel;border-radius:5px}",
    ]) cssomStyle.sheet.insertRule(rule, cssomStyle.sheet.cssRules.length);
    await waitFor(() => auto.explain(byId)?.status === "active", "id selector attachment");
    const stateObservation = auto.explain().automatic.observation;
    equal(stateObservation.events, [
      "focusin", "focusout", "fullscreenchange", "pointerout", "pointerover", "resize", "toggle",
    ], "selector-derived state listener inventory was wrong");
    assert(stateObservation.attributes.includes("id"), "id selector dependency was not observed");
    assert(stateObservation.attributes.includes("data-cornerfill-trigger"), "attribute selector dependency was not observed");

    if (new URL(location.href).searchParams.has("drivePointer")) {
      const driver = { stage: "hover-ready" };
      globalThis.__CORNERFILL_POINTER_DRIVER__ = driver;
      await waitFor(() => driver.stage === "hover-driven", "hover driver");
      await waitFor(() => auto.explain(hover)?.status === "active", "hover-state selector attachment");
      driver.stage = "media-dark-ready";
      await waitFor(() => driver.stage === "media-dark-driven", "dark media driver");
      await waitFor(() => auto.explain(media)?.status === "active", "non-resize media attachment");
      driver.stage = "media-light-ready";
      await waitFor(() => driver.stage === "media-light-driven", "light media driver");
      await waitFor(() => auto.explain(media) === null, "non-resize media detachment");
      driver.stage = "done";
    }

    attributed.setAttribute("data-cornerfill-trigger", "");
    await waitFor(() => auto.explain(attributed)?.status === "active", "attribute selector attachment");
    attributed.removeAttribute("data-cornerfill-trigger");
    await waitFor(() => auto.explain(attributed) === null, "attribute selector detachment");

    toggle.open = true;
    await waitFor(() => auto.explain(toggle)?.status === "active", "toggle-state selector attachment");

    const escapedRule = cssomStyle.sheet.insertRule(
      String.raw`.cornerfill\:escaped{corner-shape:bevel;border-radius:5px}`,
      cssomStyle.sheet.cssRules.length,
    );
    await waitFor(() => auto.explain(escaped)?.status === "active", "escaped selector attachment");
    assert(!auto.explain().automatic.observation.conservative, "escaped class selector forced conservative observation");
    const passesBeforeEscapedNoise = auto.explain().automatic.counters.candidatePasses;
    escaped.setAttribute("data-unclassified", "1");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(
      auto.explain().automatic.counters.candidatePasses === passesBeforeEscapedNoise,
      "escaped selector observed an unrelated attribute",
    );
    cssomStyle.sheet.deleteRule(escapedRule);
    await waitFor(() => auto.explain(escaped) === null, "escaped selector teardown");
    assert(!auto.explain().automatic.observation.conservative, "removed selector retained conservative observation");

    while (cssomStyle.sheet.cssRules.length > 0) {
      cssomStyle.sheet.deleteRule(cssomStyle.sheet.cssRules.length - 1);
    }
    await waitFor(() => auto.explain(byId) === null, "state selector teardown");
    const noise = document.createElement("div");
    const countersBeforeNoise = auto.explain().automatic.counters;
    document.body.append(noise);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    let countersAfterNoise = auto.explain().automatic.counters;
    assert(countersAfterNoise.candidatePasses === countersBeforeNoise.candidatePasses, "unrelated DOM insertion ran selector reconciliation");
    assert(countersAfterNoise.attachmentPasses === countersBeforeNoise.attachmentPasses, "unrelated DOM insertion ran attachment reconciliation");
    noise.remove();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    countersAfterNoise = auto.explain().automatic.counters;
    assert(countersAfterNoise.candidatePasses === countersBeforeNoise.candidatePasses, "unrelated DOM removal ran selector reconciliation");
    assert(countersAfterNoise.attachmentPasses === countersBeforeNoise.attachmentPasses, "unrelated DOM removal ran attachment reconciliation");
    const insertedCandidate = document.createElement("div");
    insertedCandidate.className = "cornerfill-auto-dynamic";
    document.body.append(insertedCandidate);
    await waitFor(() => auto.explain(insertedCandidate)?.status === "active", "matching subtree insertion");
    insertedCandidate.remove();
    await waitFor(() => auto.explain(insertedCandidate) === null, "matching subtree removal");
    const structuralRule = cssomStyle.sheet.insertRule(
      ".cornerfill-auto-structural:empty{width:12px;height:10px;corner-shape:bevel;border-radius:5px;background:red}",
    );
    const structural = document.createElement("div");
    structural.className = "cornerfill-auto-structural";
    document.body.append(structural);
    await waitFor(() => auto.explain(structural)?.status === "active", "structural selector insertion");
    const structuralChild = document.createElement("span");
    structural.append(structuralChild);
    await waitFor(() => auto.explain(structural) === null, "structural selector invalidation");
    structuralChild.remove();
    await waitFor(() => auto.explain(structural)?.status === "active", "structural selector recovery");
    structural.remove();
    await waitFor(() => auto.explain(structural) === null, "structural selector removal");
    cssomStyle.sheet.deleteRule(structuralRule);
    const transformOnlyElements = [element, dynamic, inline, focus, paintFocus, fontFocus, partial];
    const transformPaints = new Map(transformOnlyElements.map((candidate) => (
      [candidate, auto.explain(candidate).counters.paints]
    )));
    transformOnlyElements.forEach((candidate, index) => {
      candidate.style.transform = `matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,${index + 1},${index + 2},0,1)`;
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (const candidate of transformOnlyElements) {
      assert(
        auto.explain(candidate).counters.paints === transformPaints.get(candidate),
        "automatic element repainted during a transform-only mutation burst",
      );
    }
    inline.style.backgroundColor = "blue";
    await auto.refresh();
  }
  const foreignSheet = new CSSStyleSheet();
  const detachedStyle = document.createElement("style");
  const icon = document.createElement("link");
  icon.rel = "icon";
  const inertStyle = document.createElement("style");
  inertStyle.type = "text/plain";
  const generatedStyle = document.createElement("style");
  generatedStyle.setAttribute("data-cornerfill-auto-styles", "");
  document.head.append(icon, inertStyle, generatedStyle);
  for (const [label, operation, pattern] of [
    [
      "foreign adopted stylesheet",
      () => auto.refreshAdoptedStyleSheet(foreignSheet, ".face{corner-shape:bevel}"),
      /did not opt in to adopted stylesheets/u,
    ],
    [
      "detached stylesheet owner",
      () => auto.replaceStylesheetSource(detachedStyle, ".face{corner-shape:bevel}"),
      /does not belong to this automatic scope/u,
    ],
    [
      "non-stylesheet link owner",
      () => auto.replaceStylesheetSource(icon, ".face{corner-shape:bevel}"),
      /not an automatic stylesheet source/u,
    ],
    [
      "non-CSS style owner",
      () => auto.replaceStylesheetSource(inertStyle, ".face{corner-shape:bevel}"),
      /not an automatic stylesheet source/u,
    ],
    [
      "Cornerfill-owned style owner",
      () => auto.replaceStylesheetSource(generatedStyle, ".face{corner-shape:bevel}"),
      /not an automatic stylesheet source/u,
    ],
  ]) {
    let error = null;
    try { await operation(); } catch (caught) { error = caught; }
    assert(pattern.test(error?.message ?? ""), `${label} passed ${automaticMode} source-handoff validation`);
  }
  icon.remove();
  inertStyle.remove();
  generatedStyle.remove();
  replacedInline.setAttribute("style", "background:green");
  auto.destroy();
  let destroyedSourceError = null;
  try {
    await auto.replaceStylesheetSource(detachedStyle, ".face{corner-shape:bevel}");
  } catch (error) {
    destroyedSourceError = error;
  }
  assert(/controller is destroyed/u.test(destroyedSourceError?.message ?? ""), "destroyed source handoff mutated runtime state");
  assert(!element.hasAttribute("data-cornerfill-owned"), "automatic teardown retained element ownership");
  assert(!document.querySelector("style[data-cornerfill-auto-styles]"), "automatic teardown retained a carrier stylesheet");
  if (automaticMode === "fallback") {
    assert(/corner-shape\s*:\s*scoop/iu.test(inline.getAttribute("style") ?? ""), "automatic teardown lost edited raw inline shape");
    assert(inline.style.backgroundColor === "blue", "automatic teardown overwrote a later author inline edit");
    assert(!/--cornerfill-/iu.test(inline.getAttribute("style") ?? ""), "automatic teardown retained inline carriers");
    assert(!/corner-shape|--cornerfill-/iu.test(replacedInline.getAttribute("style") ?? ""), "automatic teardown resurrected replaced inline shape state");
  }
  element.remove();
  dynamic.remove();
  inline.remove();
  replacedInline.remove();
  focus.remove();
  paintFocus.remove();
  fontFocus.remove();
  media.remove();
  zero.remove();
  partial.remove();
  cssom.remove();
  byId.remove();
  attributed.remove();
  hover.remove();
  toggle.remove();
  escaped.remove();
  cssomStyle.remove();
  link.remove();
});

({ installCornerfill } = await import("../dist/runtime.mjs"));
({ installCornerfillAuto } = await import("../dist/auto-runtime.mjs"));

await test("linked-source base URLs accept URL objects from another realm", async () => {
  const { replacementStylesheetBaseUrl } = await import("../dist/auto-contract.mjs");
  const frame = document.createElement("iframe");
  frame.srcdoc = "<!doctype html><title>cross-realm URL</title>";
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  try {
    await loaded;
    const frameDocument = frame.contentDocument;
    const link = frameDocument.createElement("link");
    link.rel = "stylesheet";
    const baseUrl = new URL("/redirected/main.css", location.href);
    assert(
      replacementStylesheetBaseUrl(link, frameDocument, { baseUrl })
        === new URL("/redirected/main.css", location.href).href,
      "cross-realm URL lost its serialized stylesheet base",
    );
  } finally {
    frame.remove();
  }
});

await test("non-stylesheet link churn does not invalidate fallback paint", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-link-noise{corner-shape:bevel;border-radius:5px;background:red}";
  const icon = document.createElement("link");
  icon.rel = "icon";
  icon.href = "/favicon-a.ico";
  const inertStyle = document.createElement("style");
  inertStyle.type = "text/plain";
  inertStyle.textContent = ".cornerfill-link-noise{corner-shape:scoop}";
  document.head.append(style, icon, inertStyle);
  const automaticElement = host();
  automaticElement.className = "cornerfill-link-noise";
  const explicitElement = host();
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(explicitElement, { cornerShape: "bevel" });
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await Promise.all([handle.ready, auto.ready]);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const automaticBefore = auto.explain().automatic.counters;
    const explicitPaints = handle.explain().counters.paints;
    const automaticPaints = auto.explain(automaticElement).counters.paints;
    icon.href = "/favicon-b.ico";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const automaticAfter = auto.explain().automatic.counters;
    equal(automaticAfter, automaticBefore, "non-stylesheet link mutation ran automatic work");
    assert(handle.explain().counters.paints === explicitPaints, "non-stylesheet link mutation repainted explicit entry");
    assert(
      auto.explain(automaticElement).counters.paints === automaticPaints,
      "non-stylesheet link mutation repainted automatic entry",
    );
    inertStyle.textContent = ".cornerfill-link-noise{corner-shape:notch}";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    equal(
      auto.explain().automatic.counters,
      automaticAfter,
      "non-CSS style mutation ran automatic work",
    );
  } finally {
    auto.destroy();
    handle.dispose();
    controller.destroy();
    style.remove();
    icon.remove();
    inertStyle.remove();
    automaticElement.remove();
    explicitElement.remove();
  }
});

await test("automatic destroy cancels stylesheet readiness before its first poll", async () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  const request = { cancelWait: null, deadline: Date.now() + 10_000 };
  const originalSetTimeout = window.setTimeout.bind(window);
  let destroyed = false;
  let timersAfterDestroy = 0;
  window.setTimeout = (callback, delay, ...args) => {
    if (destroyed) timersAfterDestroy += 1;
    return originalSetTimeout(callback, delay, ...args);
  };
  try {
    const pending = auto._waitForBrowserStylesheet(
      link,
      request,
      '@import url("never-loaded.css");',
    );
    destroyed = true;
    auto.destroy();
    assert(await pending === false, "destroyed stylesheet readiness did not settle inactive");
    await Promise.resolve();
    assert(timersAfterDestroy === 0, "destroyed stylesheet readiness restarted its poll timer");
  } finally {
    window.setTimeout = originalSetTimeout;
    auto.destroy();
  }
});

await test("raw style selectors reconcile transform-only attribute changes", async () => {
  const style = document.createElement("style");
  style.textContent = "[style]{width:12px;height:10px;corner-shape:bevel;border-radius:5px;background:red}";
  document.head.append(style);
  const element = document.createElement("div");
  document.body.append(element);
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    assert(auto.explain(element) === null, "raw style selector matched before the attribute existed");
    element.style.transform = "translateX(1px)";
    await waitFor(() => auto.explain(element)?.status === "active", "raw style selector attachment");
    element.removeAttribute("style");
    await waitFor(() => auto.explain(element) === null, "raw style selector detachment");
  } finally {
    auto.destroy();
    element.remove();
    style.remove();
  }
});

await test("base URL mutations invalidate document and registered-root sources", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-base-document{corner-shape:bevel;border-radius:5px;background:red}";
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-base-document";
  const cssomElement = host();
  cssomElement.className = "cornerfill-base-cssom";
  const shell = host();
  const shadow = shell.attachShadow({ mode: "open" });
  const shadowStyle = document.createElement("style");
  shadowStyle.textContent = ".cornerfill-base-shadow{corner-shape:bevel;border-radius:5px;background:blue}";
  shadow.append(shadowStyle);
  const shadowElement = host(shadow);
  shadowElement.className = "cornerfill-base-shadow";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  const scope = auto.registerRoot(shadow);
  const base = document.createElement("base");
  try {
    await Promise.all([auto.ready, scope.ready]);
    style.sheet.insertRule(
      ".cornerfill-base-cssom{corner-shape:scoop;border-radius:5px;background:green}",
      style.sheet.cssRules.length,
    );
    await waitFor(() => auto.explain(cssomElement)?.status === "active", "base CSSOM fixture attachment");
    const documentCompiles = auto.explain().automatic.counters.sourceCompiles;
    const shadowCompiles = scope.explain().automatic.counters.sourceCompiles;
    base.href = `${location.origin}/cornerfill-base-a/`;
    document.head.prepend(base);
    await waitFor(() => (
      auto.explain().automatic.counters.sourceCompiles > documentCompiles
      && scope.explain().automatic.counters.sourceCompiles > shadowCompiles
    ), "inserted base source invalidation");
    const afterInsert = auto.explain().automatic.counters.sourceCompiles;
    const shadowAfterInsert = scope.explain().automatic.counters.sourceCompiles;
    base.href = `${location.origin}/cornerfill-base-b/`;
    await waitFor(() => (
      auto.explain().automatic.counters.sourceCompiles > afterInsert
      && scope.explain().automatic.counters.sourceCompiles > shadowAfterInsert
    ), "changed base source invalidation");
    const afterChange = auto.explain().automatic.counters.sourceCompiles;
    const shadowAfterChange = scope.explain().automatic.counters.sourceCompiles;
    base.remove();
    await waitFor(() => (
      auto.explain().automatic.counters.sourceCompiles > afterChange
      && scope.explain().automatic.counters.sourceCompiles > shadowAfterChange
    ), "removed base source invalidation");
    assert(auto.explain(element)?.status === "active", "base invalidation lost the document attachment");
    assert(auto.explain(cssomElement)?.status === "active", "base invalidation lost a CSSOM-inserted rule");
    assert(scope.explain(shadowElement)?.status === "active", "base invalidation lost the root attachment");
  } finally {
    scope.destroy();
    auto.destroy();
    base.remove();
    element.remove();
    cssomElement.remove();
    shell.remove();
    style.remove();
  }
});

await test("text-only removals retry refused automatic candidates", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-auto-text-retry{corner-shape:bevel;border-radius:5px;outline:2px solid red;outline-offset:-2px}";
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-auto-text-retry";
  element.textContent = "foreground";
  const errors = [];
  const auto = installCornerfillAuto(options({
    autoObserve: true,
    onError(error) { errors.push(error); },
  }));
  try {
    await auto.ready;
    assert(
      errors.some((error) => /empty, paint-owned host/u.test(error.message)),
      "foreground outline refusal was not reported",
    );
    assert(auto.explain(element) === null, "foreground outline candidate attached before becoming empty");
    element.textContent = "";
    await waitFor(() => auto.explain(element)?.status === "active", "text-only candidate recovery");
  } finally {
    auto.destroy();
    style.remove();
    element.remove();
  }
});

await test("automatic ownership preserves browser keyboard focus indicators", async () => {
  const style = document.createElement("style");
  style.textContent = `
    .cornerfill-focus-indicator {
      appearance:none;border:0;display:inline-block;width:32px;height:20px;border-radius:8px;
      corner-shape:bevel;background:#456
    }
  `;
  document.head.append(style);
  const link = document.createElement("a");
  link.href = "#cornerfill-focus-proof";
  const button = document.createElement("button");
  const tabStop = document.createElement("div");
  tabStop.tabIndex = 0;
  for (const element of [link, button, tabStop]) {
    element.className = "cornerfill-focus-indicator";
    element.textContent = "focus";
    document.body.append(element);
  }
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    for (const element of [link, button, tabStop]) {
      assert(
        auto.explain(element)?.status === "active",
        `focus fixture was not owned: ${JSON.stringify({ entry: auto.explain(element), report: auto.explain() })}`,
      );
      assert(!element.hasAttribute("data-cornerfill-owned-outline"), "unpainted outline was claimed");
      assert(!element.hasAttribute("data-cornerfill-owned-shadow"), "unpainted shadow was claimed");
    }
    for (const element of [link, button]) {
      element.focus({ focusVisible: true });
      assert(document.activeElement === element, "focus did not reach a native focusable fixture");
      const computed = getComputedStyle(element);
      assert(
        computed.outlineStyle !== "none" || computed.boxShadow !== "none",
        "Cornerfill hid a native focusable element's focus indicator",
      );
    }
    if (new URL(location.href).searchParams.has("drivePointer")) {
      link.tabIndex = -1;
      button.tabIndex = -1;
      document.body.tabIndex = -1;
      document.body.focus();
      const driver = { stage: "" };
      globalThis.__CORNERFILL_POINTER_DRIVER__ = driver;
      driver.stage = "keyboard-tab-0-ready";
      await waitFor(() => driver.stage === "keyboard-tab-0-driven", "keyboard focus driver");
      assert(document.activeElement === tabStop, "keyboard focus did not reach the tabindex fixture");
      const computed = getComputedStyle(tabStop);
      assert(
        computed.outlineStyle !== "none" || computed.boxShadow !== "none",
        "Cornerfill hid the browser keyboard focus indicator",
      );
      driver.stage = "done";
      document.body.removeAttribute("tabindex");
    }
  } finally {
    auto.destroy();
    style.remove();
    link.remove();
    button.remove();
    tabStop.remove();
  }
});

await test("automatic CSS fails closed for unobservable selector state", async () => {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-1000px;top:0;width:40px;height:40px";
  frame.srcdoc = `
    <style>
      .cornerfill-state-safe { corner-shape:bevel;border-radius:5px;background:red }
      .cornerfill-state-unsafe:has(input:checked) { corner-shape:scoop }
    </style>
    <div class="cornerfill-state-safe"></div>
  `;
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  await loaded;
  const frameDocument = frame.contentDocument;
  const safe = frameDocument.querySelector(".cornerfill-state-safe");
  let reportedCallbackErrors = 0;
  Object.defineProperty(frame.contentWindow, "reportError", {
    configurable: true,
    value(error) {
      if (/test onError failure/u.test(error?.message ?? "")) reportedCallbackErrors += 1;
    },
  });
  const auto = installCornerfillAuto(options({
    autoObserve: true,
    document: frameDocument,
    onError() { throw new Error("test onError failure"); },
  }));
  try {
    await auto.ready;
    assert(auto.explain(safe) === null, "unobservable state source did not block root ownership");
    assert(
      auto.explain().errors.some(({ message }) => /cannot observe selector state: checked/u.test(message)),
      `unobservable state source was not diagnosed: ${JSON.stringify(auto.explain().errors)}`,
    );
    assert(reportedCallbackErrors > 0, "a throwing onError callback was not isolated and reported");
  } finally {
    auto.destroy();
    frame.remove();
  }
});

await test("automatic stylesheet disabled state detaches and reattaches without polling", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-disabled-style{corner-shape:bevel;border-radius:5px;background:red}";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `data:text/css,${encodeURIComponent(
    ".cornerfill-disabled-link{corner-shape:bevel;border-radius:5px;background:blue}",
  )}`;
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("disabled-state stylesheet did not load")), { once: true });
  });
  document.head.append(style, link);
  await loaded;
  const styleElement = host();
  styleElement.className = "cornerfill-disabled-style";
  const linkElement = host();
  linkElement.className = "cornerfill-disabled-link";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    assert(auto.explain(styleElement)?.status === "active", "style-disabled fixture did not attach");
    assert(auto.explain(linkElement)?.status === "active", "link-disabled fixture did not attach");
    style.disabled = true;
    await waitFor(() => auto.explain(styleElement) === null, "style.disabled teardown");
    style.disabled = false;
    await waitFor(() => auto.explain(styleElement)?.status === "active", "style.disabled reattachment");
    style.sheet.disabled = true;
    await waitFor(() => auto.explain(styleElement) === null, "style sheet.disabled teardown");
    style.sheet.disabled = false;
    await waitFor(() => auto.explain(styleElement)?.status === "active", "style sheet.disabled reattachment");
    link.sheet.disabled = true;
    await waitFor(() => auto.explain(linkElement) === null, "link sheet.disabled teardown");
    link.sheet.disabled = false;
    await waitFor(() => auto.explain(linkElement)?.status === "active", "link sheet.disabled reattachment");
    link.type = "text/plain";
    await waitFor(() => auto.explain(linkElement) === null, "non-CSS link type teardown");
    link.type = "text/css";
    await waitFor(() => auto.explain(linkElement)?.status === "active", "CSS link type reattachment");
  } finally {
    auto.destroy();
    style.remove();
    link.remove();
    styleElement.remove();
    linkElement.remove();
  }
});

await test("exact source handoff recovers CSSOM-only selector changes", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-source-before{corner-shape:bevel;border-radius:5px;background:red}";
  document.head.append(style);
  const before = host();
  before.className = "cornerfill-source-before";
  const after = host();
  after.className = "cornerfill-source-after";
  const final = host();
  final.className = "cornerfill-source-final";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    assert(auto.explain(before)?.status === "active", "source handoff fixture did not attach");
    style.sheet.cssRules[0].selectorText = ".cornerfill-source-after";
    await auto.refresh();
    assert(auto.explain(before)?.status === "active", "generic refresh pretended to recover CSSOM-only source");
    await auto.replaceStylesheetSource(
      style,
      ".cornerfill-source-after{corner-shape:bevel;border-radius:5px;background:red}",
    );
    assert(auto.explain(before) === null, "exact source handoff retained the old selector");
    assert(auto.explain(after)?.status === "active", "exact source handoff did not attach the new selector");
    style.textContent = ".cornerfill-source-final{corner-shape:notch;border-radius:5px;background:blue}";
    await waitFor(
      () => auto.explain(after) === null && auto.explain(final)?.status === "active",
      "authored source generation after exact handoff",
    );
  } finally {
    auto.destroy();
    style.remove();
    before.remove();
    after.remove();
    final.remove();
  }
});

await test("authored source replacement invalidates a same-text CSSOM generation", async () => {
  const source = ".cornerfill-source-reset-base{color:red}";
  const style = document.createElement("style");
  style.textContent = source;
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-source-reset";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    style.sheet.insertRule(
      ".cornerfill-source-reset{corner-shape:bevel;border-radius:5px;background:red}",
      style.sheet.cssRules.length,
    );
    await waitFor(() => auto.explain(element)?.status === "active", "CSSOM source generation insertion");
    style.textContent = source;
    await auto.refresh();
    assert(auto.explain(element) === null, "same-text authored source generation reset was stale");
  } finally {
    auto.destroy();
    style.remove();
    element.remove();
  }
});

await test("exact source handoff wins over an earlier queued owner mutation", async () => {
  const source = ".cornerfill-source-queued-before{corner-shape:bevel;border-radius:5px;background:red}";
  const style = document.createElement("style");
  style.textContent = source;
  document.head.append(style);
  const before = host();
  before.className = "cornerfill-source-queued-before";
  const after = host();
  after.className = "cornerfill-source-queued-after";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    assert(auto.explain(before)?.status === "active", "queued-source fixture did not attach");
    style.textContent = source;
    style.sheet.cssRules[0].selectorText = ".cornerfill-source-queued-after";
    await auto.replaceStylesheetSource(
      style,
      ".cornerfill-source-queued-after{corner-shape:bevel;border-radius:5px;background:red}",
    );
    assert(auto.explain(before) === null, "exact source handoff retained the prior selector");
    assert(auto.explain(after)?.status === "active", "queued owner mutation invalidated the exact source handoff");
  } finally {
    auto.destroy();
    style.remove();
    before.remove();
    after.remove();
  }
});

await test("a disabled owned CSSStyleSheet accepts exact source for re-enablement", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-disabled-source-before{corner-shape:bevel}";
  document.head.append(style);
  const before = host();
  before.className = "cornerfill-disabled-source-before";
  const after = host();
  after.className = "cornerfill-disabled-source-after";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    assert(auto.explain(before)?.status === "active", "disabled-source fixture did not attach");
    const sheet = style.sheet;
    sheet.disabled = true;
    await waitFor(() => auto.explain(before) === null, "disabled-source fixture teardown");
    sheet.cssRules[0].selectorText = ".cornerfill-disabled-source-after";
    await auto.replaceStylesheetSource(
      sheet,
      ".cornerfill-disabled-source-after{corner-shape:bevel}",
    );
    assert(auto.explain(after) === null, "disabled exact source attached before re-enablement");
    sheet.disabled = false;
    await waitFor(
      () => auto.explain(before) === null && auto.explain(after)?.status === "active",
      "disabled exact source re-enablement",
    );
  } finally {
    auto.destroy();
    style.remove();
    before.remove();
    after.remove();
  }
});

await test("exact linked source handoff expires when the stylesheet URL changes", async () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./imports/root.css", import.meta.url).href;
  const initialLoad = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("source identity fixture did not load")), { once: true });
  });
  document.head.append(link);
  await initialLoad;
  const element = host();
  element.className = "cornerfill-linked-source-identity";
  const source = ".cornerfill-linked-source-identity{corner-shape:bevel;border-radius:5px;background:red}";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    await auto.replaceStylesheetSource(link, source);
    assert(auto.explain(element)?.status === "active", "exact linked source did not attach");
    const readsBeforeSameHref = auto.explain().automatic.counters.sourceReads;
    link.setAttribute("href", link.getAttribute("href"));
    await auto.refresh();
    assert(
      auto.explain().automatic.counters.sourceReads === readsBeforeSameHref + 1,
      "same-href source generation reused a cached linked stylesheet record",
    );
    assert(auto.explain(element) === null, "same-href source generation retained an exact-source override");
    const readsBeforeHrefChange = auto.explain().automatic.counters.sourceReads;
    const nextLoad = new Promise((resolve, reject) => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", () => reject(new Error("replacement source identity fixture did not load")), { once: true });
    });
    link.href = new URL("./imports/child.css", import.meta.url).href;
    await nextLoad;
    await waitFor(
      () => auto.explain().automatic.counters.sourceReads === readsBeforeHrefChange + 1
        && auto.explain(element) === null,
      "linked source generation invalidation",
    );
    assert(
      auto.explain().automatic.counters.sourceReads === readsBeforeHrefChange + 1,
      "a linked exact source reused the previous URL generation",
    );
    assert(auto.explain(element) === null, "linked URL change retained the previous supplied source");
  } finally {
    auto.destroy();
    link.remove();
    element.remove();
  }
});

await test("exact linked source handoff preserves a redirected stylesheet base URL", async () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./imports/redirect-root.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("redirected source fixture did not load")), { once: true });
  });
  document.head.append(link);
  await loaded;
  const element = host();
  element.className = "cornerfill-redirect-relative";
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await auto.ready;
    link.sheet.insertRule('@import "./child.css";', 0);
    await auto.replaceStylesheetSource(link, '@import "./child.css";');
    assert(
      auto.explain(element)?.status === "active",
      `redirected exact source resolved from ${
        auto.sourceState.stylesheetBaseUrls.get(link)
          ?? link.sheet?.href
          ?? "an unavailable CSSStyleSheet href"
      }`,
    );
    equal(
      auto.explain(element).geometry.shapeParameters,
      [0, 0, 0, 0],
      "redirected source did not use its retained response base",
    );
    await auto.replaceStylesheetSource(link, '@import "./child.css";', {
      baseUrl: new URL("./alternate-target/root.css", import.meta.url),
    });
    equal(
      auto.explain(element).geometry.shapeParameters,
      [-1, -1, -1, -1],
      "a changed explicit source base reused the previous compilation",
    );
  } finally {
    auto.destroy();
    link.remove();
    element.remove();
  }
});

await test("multiple automatic controllers share and fully release one CSSOM broker", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-broker-unused{color:red}";
  document.head.append(style);
  const originalInsertRule = style.sheet.insertRule;
  const first = installCornerfillAuto(options({ autoObserve: false }));
  const second = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await Promise.all([first.ready, second.ready]);
    const sharedInsertRule = style.sheet.insertRule;
    assert(sharedInsertRule !== originalInsertRule, "CSSOM broker was not installed");
    const removedRegistration = document.querySelector('style[data-cornerfill-auto-styles="properties"]');
    removedRegistration.remove();
    await first.refresh();
    const repairedRegistration = document.querySelector('style[data-cornerfill-auto-styles="properties"]');
    assert(repairedRegistration?.isConnected, "one controller did not repair the shared carrier registration");
    first.destroy();
    assert(style.sheet.insertRule === sharedInsertRule, "first controller removed the shared CSSOM broker");
    assert(repairedRegistration.isConnected, "first controller removed a registration still owned by the second");
    await second.refresh();
    second.destroy();
    assert(style.sheet.insertRule === originalInsertRule, "last controller retained a dead CSSOM wrapper");
    assert(!repairedRegistration.isConnected, "last controller retained the shared carrier registration");
  } finally {
    first.destroy();
    second.destroy();
    style.remove();
  }
});

await test("failed CSSOM retries release the original broker subscription", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-hook-safe{corner-shape:bevel;border-radius:5px;background:red}";
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-hook-safe";
  const originalInsertRule = style.sheet.insertRule;
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await auto.ready;
    style.sheet.insertRule(".cornerfill-hook-safe:checked{corner-shape:scoop}");
    await waitFor(() => auto.explain().stylesheets === 1 && auto.explain().errors.length > 0, "failed CSSOM mutation");
    await auto.refresh({ retryFailed: true });
  } finally {
    auto.destroy();
    assert(style.sheet.insertRule === originalInsertRule, "failed CSSOM retry retained a broker subscription");
    style.remove();
    element.remove();
  }
});

await test("automatic teardown releases every resource after one disposer fails", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-teardown-a,.cornerfill-teardown-b{corner-shape:bevel;border-radius:5px;background:red}";
  document.head.append(style);
  const first = host();
  first.className = "cornerfill-teardown-a";
  const second = host();
  second.className = "cornerfill-teardown-b";
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  await auto.ready;
  const firstHandle = auto.attachmentState.handles.get(first);
  const firstRecord = auto.handleRegistry.handles.get(first);
  assert(firstHandle && auto.attachmentState.handles.has(second), "teardown fixture did not attach both elements");
  assert(firstRecord, "teardown fixture did not register the shared automatic handle");
  firstRecord.handle = {
    dispose() { throw new Error("injected automatic disposer failure"); },
  };
  let error = null;
  try { auto.destroy(); } catch (caught) { error = caught; }
  assert(error instanceof AggregateError, "automatic teardown did not aggregate the injected failure");
  assert(auto.controller.stats().entries === 0, "automatic teardown left runtime entries after a disposer failed");
  assert(!document.querySelector("style[data-cornerfill-auto-styles]"), "automatic teardown retained generated CSS after a disposer failed");
  firstHandle.dispose();
  first.remove();
  second.remove();
  style.remove();
});

await test("automatic refresh fails closed after one disposer fails", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-refresh-close-a,.cornerfill-refresh-close-b{corner-shape:bevel;border-radius:5px;background:red}";
  document.head.append(style);
  const first = host();
  first.className = "cornerfill-refresh-close-a";
  const second = host();
  second.className = "cornerfill-refresh-close-b";
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await auto.ready;
    const record = auto.handleRegistry.handles.get(first);
    assert(record && auto.explain(second)?.status === "active", "refresh fail-close fixture did not attach both elements");
    const original = record.handle;
    const failingHandle = {
      dispose() {
        original.dispose();
        throw new Error("injected automatic refresh disposer failure");
      },
    };
    record.handle = failingHandle;
    auto.attachmentState.handles.set(first, failingHandle);
    first.className = "";
    second.className = "";
    let failure = null;
    try { await auto.refresh(); } catch (error) { failure = error; }
    assert(failure, "automatic refresh hid its injected disposer failure");
    assert(auto.explain().automatic.ownership === "blocked-root", "failed refresh did not fail ownership closed");
    assert(auto.handleRegistry.handles.size === 0, "failed refresh retained a sibling automatic handle");
    assert(auto.controller.stats().entries === 0, "failed refresh retained a runtime attachment");
    first.className = "cornerfill-refresh-close-a";
    second.className = "cornerfill-refresh-close-b";
    await auto.refresh();
    assert(auto.explain(first)?.status === "active" && auto.explain(second)?.status === "active", "automatic refresh did not recover after fail-close");
  } finally {
    auto.destroy();
    first.remove();
    second.remove();
    style.remove();
  }
});

await test("explicit flow and contextual colors resolve against the Cornerfill host", async () => {
  const element = host();
  Object.assign(element.style, {
    color: "rgb(255, 0, 0)",
    direction: "rtl",
    textOrientation: "upright",
    writingMode: "vertical-rl",
  });
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: {
      shorthand: "round",
      logical: { "start-start": "bevel" },
    },
    paint: {
      kind: "linear-gradient",
      css: "linear-gradient(currentColor, transparent)",
      color: "currentColor",
    },
  });
  const computedElement = host();
  computedElement.style.color = "rgb(0, 128, 0)";
  computedElement.style.backgroundColor = "currentColor";
  computedElement.style.backgroundImage = "linear-gradient(currentColor, transparent)";
  const computedHandle = controller.attach(computedElement, {
    borderRadius: "5px",
    cornerShape: "bevel",
  });
  const preparedElement = host();
  preparedElement.style.color = "rgb(128, 0, 128)";
  preparedElement.style.writingMode = "vertical-rl";
  preparedElement.style.direction = "rtl";
  preparedElement.style.textOrientation = "mixed";
  preparedElement.style.boxShadow = "inset 0 0 0 2px rgb(0, 128, 255)";
  preparedElement.style.outline = "1px solid rgb(255, 165, 0)";
  preparedElement.style.outlineOffset = "-1px";
  const preparedShape = {
    shorthand: "round",
    logical: { "start-start": "bevel" },
  };
  const preparedHandle = controller.attachPrepared(preparedElement, {
    size: [10, 10],
    borderRadius: {
      shorthand: "0",
      logical: { "start-start": "5px" },
    },
    cornerShape: preparedShape,
    paint: { kind: "solid", color: "currentColor" },
  });
  try {
    await Promise.all([handle.ready, computedHandle.ready, preparedHandle.ready]);
    equal(handle.explain().geometry.shapeParameters, [1, 0, 1, 1], "upright flow used the computed rtl direction");
    const paint = controller.entryByElement.get(element).paintSource;
    assert(/rgb\(255,\s*0,\s*0\)/u.test(paint.color), `solid currentColor did not resolve against the host: ${paint.color}`);
    assert(/rgb\(255,\s*0,\s*0\)/u.test(paint.stops[0][1]), `gradient currentColor did not resolve against the host: ${paint.stops[0][1]}`);
    const computedPaint = controller.entryByElement.get(computedElement).paintSource;
    assert(/rgb\(0,\s*128,\s*0\)/u.test(computedPaint.color), "computed background currentColor used the Canvas context");
    assert(/rgb\(0,\s*128,\s*0\)/u.test(computedPaint.stops[0][1]), "computed gradient currentColor used the Canvas context");
    assert(/rgb\(128,\s*0,\s*128\)/u.test(preparedHandle.explain().paint.layer.color), "prepared currentColor did not resolve against the host");
    assert(/rgb\(0,\s*128,\s*255\)/u.test(preparedHandle.explain().effects.shadow.color), "prepared attachment did not capture the authored inset shadow");
    assert(/rgb\(255,\s*165,\s*0\)/u.test(preparedHandle.explain().effects.outline.color), "prepared attachment did not capture the authored contained outline");
    assert(getComputedStyle(preparedElement).boxShadow === "none", "prepared attachment leaked the native inset shadow");
    assert(getComputedStyle(preparedElement).outlineStyle === "none", "prepared attachment leaked the native outline");
    equal(preparedHandle.explain().geometry.shapeParameters, [1, 1, 0, 1], "prepared logical shape ignored vertical RTL flow");
    equal(
      preparedHandle.explain().geometry.radii,
      [{ rx: 0, ry: 0 }, { rx: 0, ry: 0 }, { rx: 5, ry: 5 }, { rx: 0, ry: 0 }],
      "prepared logical radius ignored vertical RTL flow",
    );
    element.style.color = "rgb(0, 0, 255)";
    await waitFor(
      () => /rgb\(0,\s*0,\s*255\)/u.test(controller.entryByElement.get(element).paintSource.color),
      "explicit currentColor host update",
    );
    preparedElement.style.color = "rgb(255, 165, 0)";
    await preparedHandle.resize();
    assert(/rgb\(255,\s*165,\s*0\)/u.test(preparedHandle.explain().paint.layer.color), "prepared currentColor source was lost after attachment");
    preparedElement.style.writingMode = "horizontal-tb";
    await preparedHandle.resize({ cornerShape: preparedShape });
    equal(preparedHandle.explain().geometry.shapeParameters, [1, 0, 1, 1], "prepared shape update ignored changed host flow");
    equal(
      preparedHandle.explain().geometry.radii,
      [{ rx: 0, ry: 0 }, { rx: 5, ry: 5 }, { rx: 0, ry: 0 }, { rx: 0, ry: 0 }],
      "prepared shape update retained radii from the old host flow",
    );
    const paints = handle.explain().counters.paints;
    element.style.textOrientation = "mixed";
    await waitFor(
      () => handle.explain().geometry.shapeParameters[2] === 0,
      "explicit text-orientation invalidation",
    );
    assert(handle.explain().counters.paints === paints + 1, "text-orientation invalidation painted more than once");
  } finally {
    preparedHandle.dispose();
    computedHandle.dispose();
    handle.dispose();
    controller.destroy();
    element.remove();
    computedElement.remove();
    preparedElement.remove();
  }
});

await test("color resolution does not change selector-sensitive authored paint", async () => {
  const style = document.createElement("style");
  style.textContent = `
    body:last-child .cornerfill-color-snapshot-document { background: rgb(255, 0, 0) }
    body:not(:last-child) .cornerfill-color-snapshot-document { background: rgb(0, 0, 255) }
  `;
  document.head.append(style);
  const documentElement = host();
  documentElement.className = "cornerfill-color-snapshot-document";
  documentElement.style.removeProperty("background-color");
  const shell = host();
  const root = shell.attachShadow({ mode: "open" });
  const shadowStyle = document.createElement("style");
  shadowStyle.textContent = `
    .cornerfill-color-snapshot-shadow:last-child { background: rgb(255, 0, 0) }
    .cornerfill-color-snapshot-shadow:not(:last-child) { background: rgb(0, 0, 255) }
  `;
  root.append(shadowStyle);
  const shadowElement = host(root);
  shadowElement.className = "cornerfill-color-snapshot-shadow";
  shadowElement.style.removeProperty("background-color");
  const controller = installCornerfill(options());
  const handles = [documentElement, shadowElement].map((element) => controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
  }));
  try {
    await Promise.all(handles.map(({ ready }) => ready));
    for (const handle of handles) {
      const color = handle.explain().paint.layer.color;
      assert(/rgb\(255,\s*0,\s*0\)/u.test(color), `color probe changed authored selector state: ${color}`);
    }
  } finally {
    for (const handle of handles) handle.dispose();
    controller.destroy();
    style.remove();
    documentElement.remove();
    shell.remove();
  }
});

await test("explicit colors inherit the host custom-property environment", async () => {
  const element = host();
  element.style.setProperty("--cornerfill-accent", "rgb(255, 0, 0)");
  element.style.color = "rgb(0, 0, 255)";
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "var(--cornerfill-accent)" },
  });
  try {
    await handle.ready;
    const color = handle.explain().paint.layer.color;
    assert(/rgb\(255,\s*0,\s*0\)/u.test(color), `host custom property resolved as ${color}`);
  } finally {
    handle.dispose();
    controller.destroy();
    element.remove();
  }
});

await test("automatic signatures include text-orientation", async () => {
  const style = document.createElement("style");
  style.textContent = `
    .cornerfill-auto-upright {
      writing-mode: vertical-rl;
      text-orientation: upright;
      direction: rtl;
      corner-start-start-shape: bevel;
    }
  `;
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-auto-upright";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    equal(
      auto.explain(element)?.geometry.shapeParameters,
      [1, 0, 1, 1],
      `automatic upright flow was incorrect: ${JSON.stringify(auto.controller.entryByElement.get(element)?.initial?.shapeSource)}`,
    );
    element.style.textOrientation = "mixed";
    await waitFor(
      () => auto.explain(element)?.geometry.shapeParameters[2] === 0,
      "automatic text-orientation signature invalidation",
    );
  } finally {
    auto.destroy();
    style.remove();
    element.remove();
  }
});

await test("explicit paint rejects invalid CSS colors before taking ownership", async () => {
  const element = host();
  element.style.setProperty("--cornerfill-invalid-color", "20px");
  const controller = installCornerfill(options());
  assert(controller.capabilities.implementedPaintPaths.cssLinearGradient === true, "implemented gradient path was not reported");
  assert(controller.capabilities.paintInputConstraints.attributeDependentColors === false, "attr() color limitation was not reported");
  assert(controller.capabilities.paintInputConstraints.cssGradientColorParity === false, "gradient color parity was overstated");
  assert(controller.capabilities.paintInputConstraints.rasterUrls === "same-origin-or-cors", "raster URL CORS boundary was omitted");
  assert(controller.capabilities.limitations.gradientColorParity.supported === false, "gradient parity limitation was omitted");
  assert(controller.capabilities.limitations.crossOriginNoCorsRaster.supported === false, "cross-origin raster limitation was omitted");
  for (const color of [
    "definitely-not-a-color",
    "var(--cornerfill-missing-color)",
    "var(--cornerfill-invalid-color)",
    "inherit",
    "unset",
    "revert",
  ]) {
    let error = null;
    try {
      controller.attach(element, {
        borderRadius: "5px",
        cornerShape: "bevel",
        paint: { kind: "solid", color },
      });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof SyntaxError, `invalid explicit color was accepted: ${color}`);
  }
  element.setAttribute("data-cornerfill-accent", "#ff0000");
  element.style.setProperty(
    "--cornerfill-attribute-color",
    "attr(data-cornerfill-accent type(<color>), #0000ff)",
  );
  for (const color of ["attr(data-cornerfill-accent type(<color>), #0000ff)"]) {
    let error = null;
    let rejected = null;
    try {
      rejected = controller.attach(element, {
        borderRadius: "5px",
        cornerShape: "bevel",
        paint: { kind: "solid", color },
      });
      await rejected.ready;
    } catch (caught) {
      error = caught;
    } finally {
      rejected?.dispose();
    }
    assert(error instanceof TypeError && /attr\(\).*host-attribute/u.test(error.message), `attribute-dependent explicit color was accepted: ${color}`);
  }
  const fallbackColor = "var(--cornerfill-safe-color, attr(data-cornerfill-accent type(<color>), #0000ff))";
  element.style.setProperty("--cornerfill-safe-color", "green");
  const fallbackHandle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: fallbackColor },
  });
  await fallbackHandle.ready;
  assert(
    /(?:0,\s*128,\s*0|green)/u.test(fallbackHandle.explain().paint.layer.color),
    "attr() in an unused var() fallback rejected or replaced the selected custom property",
  );
  fallbackHandle.dispose();
  element.style.removeProperty("--cornerfill-safe-color");
  let activeFallbackError = null;
  try {
    const activeFallback = controller.attach(element, {
      borderRadius: "5px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: fallbackColor },
    });
    await activeFallback.ready;
    activeFallback.dispose();
  } catch (error) {
    activeFallbackError = error;
  }
  assert(
    activeFallbackError instanceof TypeError && /attr\(\).*host-attribute/u.test(activeFallbackError.message),
    "an active attr() var fallback bypassed host-attribute refusal",
  );
  element.setAttribute("style", `${element.getAttribute("style") ?? ""};--cornerfill-empty: ;`);
  for (const color of [
    "var(--cornerfill-empty, red)",
    "var(--cornerfill-empty, attr(data-cornerfill-accent type(<color>), red))",
  ]) {
    let emptyError = null;
    try {
      const emptyHandle = controller.attach(element, {
        borderRadius: "5px",
        cornerShape: "bevel",
        paint: { kind: "solid", color },
      });
      await emptyHandle.ready;
      emptyHandle.dispose();
    } catch (error) {
      emptyError = error;
    }
    assert(
      emptyError instanceof SyntaxError,
      `valid empty custom property selected its fallback or wrong failure class: ${color}`,
    );
  }
  element.style.setProperty("--cornerfill-guaranteed-invalid", "initial");
  const invalidFallbackHandle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "var(--cornerfill-guaranteed-invalid, red)" },
  });
  await invalidFallbackHandle.ready;
  assert(
    /(?:255,\s*0,\s*0|red)/u.test(invalidFallbackHandle.explain().paint.layer.color),
    "guaranteed-invalid custom property did not select its var() fallback",
  );
  invalidFallbackHandle.dispose();
  let indirectHandle = null;
  let indirectError = null;
  try {
    indirectHandle = controller.attach(element, {
      borderRadius: "5px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "var(--cornerfill-attribute-color)" },
    });
    await indirectHandle.ready;
    assert(
      /rgb\(255,\s*0,\s*0\)|#ff0000|red/u.test(indirectHandle.explain().paint.layer.color),
      `indirect attr() color used the wrong host state: ${indirectHandle.explain().paint.layer.color}`,
    );
  } catch (caught) {
    indirectError = caught;
  } finally {
    indirectHandle?.dispose();
  }
  assert(!indirectError || indirectError instanceof TypeError, `indirect attr() color failed unsafely: ${indirectError}`);
  assert(controller.stats().entries === 0, "invalid explicit color created a runtime entry");
  assert(!element.hasAttribute("data-cornerfill-owned"), "invalid explicit color took element ownership");
  controller.destroy();
  element.remove();
});

await test("absolute colors bypass contextual DOM probes", async () => {
  const absolute = host();
  const escapedContextual = host();
  const contextual = host();
  escapedContextual.style.setProperty("--cornerfill-red-channel", "12");
  contextual.style.color = "rgb(0, 0, 255)";
  const observedRecords = [];
  const observer = new MutationObserver((records) => observedRecords.push(...records));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const probeMutated = () => {
    const records = [...observedRecords.splice(0), ...observer.takeRecords()];
    return records.some((record) => (
      [...record.addedNodes, ...record.removedNodes].some((node) => (
        node instanceof Element && node.hasAttribute(COLOR_PROBE_ATTRIBUTE)
      ))
    ));
  };
  const controller = installCornerfill(options());
  const absoluteHandle = controller.attach(absolute, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "rgb(12 34 56)" },
  });
  let escapedHandle = null;
  try {
    await absoluteHandle.ready;
    assert(!probeMutated(), "absolute color created a contextual DOM probe");
    escapedHandle = controller.attach(escapedContextual, {
      borderRadius: "5px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: String.raw`rgb(v\61r(--cornerfill-red-channel) 34 56)` },
    });
    await escapedHandle.ready;
    assert(probeMutated(), "escaped var() color bypassed the contextual validity probe");
    assert(
      /rgb\(12,\s*34,\s*56\)/u.test(escapedHandle.explain().paint.layer.color),
      `escaped var() color did not resolve against the host: ${escapedHandle.explain().paint.layer.color}`,
    );
    const contextualHandle = controller.attach(contextual, {
      borderRadius: "5px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "currentColor" },
    });
    try {
      await contextualHandle.ready;
      assert(probeMutated(), "contextual color did not use the validity probe");
    } finally {
      contextualHandle.dispose();
    }
  } finally {
    observer.disconnect();
    escapedHandle?.dispose();
    absoluteHandle.dispose();
    controller.destroy();
    absolute.remove();
    escapedContextual.remove();
    contextual.remove();
  }
});

await test("automatic state observation refuses shaped backdrop-filter paint", async () => {
  const style = document.createElement("style");
  style.textContent = `
    .cornerfill-auto-backdrop { width:12px;height:10px;border-radius:5px;background:red;corner-shape:bevel }
    .cornerfill-auto-backdrop:focus { -webkit-backdrop-filter:blur(1px);backdrop-filter:blur(1px) }
  `;
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-auto-backdrop";
  element.tabIndex = 0;
  element.style.outline = "none";
  const auto = installCornerfillAuto(options({ autoObserve: true, onError() {} }));
  try {
    await auto.ready;
    assert(auto.explain(element)?.status === "active", "backdrop-filter fixture did not attach initially");
    element.focus();
    await waitFor(
      () => auto.explain(element) === null
        && auto.explain().errors.some(({ message }) => /backdrop-filter/u.test(message)),
      "stateful backdrop-filter refusal",
    );
  } finally {
    auto.destroy();
    element.remove();
    style.remove();
  }
});

await test("inset changes retry an unattached zero-size candidate", async () => {
  const style = document.createElement("style");
  style.textContent = `
    .cornerfill-auto-inset-recovery {
      position:absolute;left:0;right:auto;width:auto;height:10px;
      border-radius:5px;background:red;corner-shape:bevel
    }
  `;
  document.head.append(style);
  const containingBlock = document.createElement("div");
  Object.assign(containingBlock.style, { position: "relative", width: "20px", height: "10px" });
  const element = document.createElement("div");
  element.className = "cornerfill-auto-inset-recovery";
  containingBlock.append(element);
  document.body.append(containingBlock);
  const auto = installCornerfillAuto(options({ autoObserve: true, onError() {} }));
  try {
    await auto.ready;
    assert(auto.explain(element) === null, "zero-size inset candidate attached before it was measurable");
    element.style.right = "0px";
    await waitFor(() => auto.explain(element)?.status === "active", "inset-stretched candidate recovery");
  } finally {
    auto.destroy();
    containingBlock.remove();
    style.remove();
  }
});

await test("automatic refresh cannot lose work requested at settlement", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-refresh-settlement{corner-shape:bevel;border-radius:5px;background:red}";
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-refresh-settlement";
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  const explain = auto.explain.bind(auto);
  let armed = true;
  let boundaryRefresh = null;
  auto.explain = (...args) => {
    if (armed && args.length === 0) {
      armed = false;
      style.textContent = ".cornerfill-refresh-settlement{corner-shape:scoop;border-radius:5px;background:blue}";
      boundaryRefresh = auto.refresh();
    }
    return explain(...args);
  };
  try {
    await auto.ready;
    const settled = await boundaryRefresh;
    equal(
      auto.explain(element).geometry.shapeParameters,
      [-1, -1, -1, -1],
      "settlement-boundary refresh was dropped",
    );
    assert(
      settled.automatic.counters.sourcePasses === auto.explain().automatic.counters.sourcePasses,
      "settlement-boundary refresh resolved with a stale explanation",
    );
  } finally {
    auto.destroy();
    style.remove();
    element.remove();
  }
});

await test("automatic stylesheet refresh is serialized, stale-safe, and retryable", async () => {
  globalThis.__CORNERFILL_TEST_STAGE__ = "stylesheet setup";
  const response = (css, status = 200, {
    contentType = "text/css",
    url = "",
  } = {}) => ({
    headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null },
    ok: status >= 200 && status < 300,
    status,
    text: async () => css,
    url,
  });
  const requests = [];
  const originalFetch = window.fetch;
  window.fetch = (url, init = {}) => {
    const promise = new Promise((resolve, reject) => {
      const request = { init, reject, resolve, url: String(url) };
      requests.push(request);
      const aborted = () => { request.aborted = true; };
      if (init.signal?.aborted) aborted();
      else init.signal?.addEventListener("abort", aborted, { once: true });
    });
    promise.catch(() => {});
    return promise;
  };
  const errors = [];
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    onError(error, context) { errors.push({ context, message: error.message }); },
  }));
  const element = host();
  element.className = "cornerfill-auto-remote";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.crossOrigin = "use-credentials";
  link.referrerPolicy = "no-referrer";
  const localStyle = document.createElement("style");
  const localElement = host();
  localElement.className = "cornerfill-auto-local-fast";
  try {
    await auto.ready;
    link.href = `data:text/css,${encodeURIComponent(".cornerfill-auto-remote{corner-shape:bevel;border-radius:5px;background:red}")}`;
    document.head.append(link);
    const first = auto.refresh();
    await waitFor(() => requests.length === 1, "first automatic stylesheet request");
    assert(requests[0].init.credentials === "include", "stylesheet credentials did not mirror crossorigin");
    assert(requests[0].init.mode === "cors", "stylesheet fetch did not require CORS");
    assert(requests[0].init.referrerPolicy === "no-referrer", "stylesheet referrer policy was lost");
    globalThis.__CORNERFILL_TEST_STAGE__ = "stylesheet replacement abort";
    link.href = `data:text/css,${encodeURIComponent(".cornerfill-auto-remote{corner-shape:scoop;border-radius:6px;background:blue}")}`;
    const second = auto.refresh();
    await waitFor(() => requests[0].init.signal.aborted, "obsolete stylesheet abort signal");
    requests[0].resolve(response(".cornerfill-auto-remote{corner-shape:bevel;border-radius:5px;background:red}"));
    await waitFor(() => requests.length === 2, "replacement automatic stylesheet request");
    assert(requests[0].init.signal.aborted, "obsolete stylesheet request was not aborted");
    requests[1].resolve(response(
      ".cornerfill-auto-remote{corner-shape:scoop;border-radius:6px;background:blue}.cornerfill-never{corner-shape:bevel;background-image:url(./sprite.png)}",
      200,
      { url: "https://assets.example/styles/main.css" },
    ));
    await Promise.all([first, second]);
    equal(auto.explain(element).geometry.shapeParameters, [-1, -1, -1, -1], "stale stylesheet won the refresh race");
    assert(document.querySelectorAll('style[data-cornerfill-auto-styles=""]').length === 1, "refresh retained duplicate companion stylesheets");
    assert(
      [...auto.sourceState.stylesheets.values()].some(({ sources }) => sources.includes("https://assets.example/styles/main.css")),
      "stylesheet response URL was not retained in source provenance",
    );

    link.href = `data:text/css,${encodeURIComponent(".cornerfill-auto-remote{corner-shape:notch;border-radius:7px;background:green}")}`;
    globalThis.__CORNERFILL_TEST_STAGE__ = "stylesheet MIME refusal";
    const failed = auto.refresh();
    await waitFor(() => requests.length === 3, "failing automatic stylesheet request");
    requests[2].resolve(response("{}", 200, { contentType: "application/json" }));
    await failed;
    const requestsBeforeQuiescentRefresh = requests.length;
    await auto.refresh();
    assert(requests.length === requestsBeforeQuiescentRefresh, "failed stylesheet identity retried without an explicit request");
    const retry = auto.refresh({ retryFailed: true });
    await waitFor(() => requests.length === 4, "retried automatic stylesheet request");
    requests[3].resolve(response(".cornerfill-auto-remote{corner-shape:notch;border-radius:7px;background:green}"));
    await retry;
    const retried = auto.explain(element);
    assert(retried, `failed stylesheet retry did not reattach: ${JSON.stringify({
      auto: auto.explain(),
      carriers: getComputedStyle(element).getPropertyValue("--cornerfill-corner-top-left-shape"),
      records: [...auto.sourceState.stylesheets.values()].map(({ failed: recordFailed, selectors, companion }) => ({
        failed: recordFailed,
        selectors,
        css: companion?.textContent,
      })),
    })}`);
    assert(
      retried.geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY),
      "failed stylesheet was not retried",
    );
    assert(errors.length === 1 && /invalid CSS MIME/u.test(errors[0].message), "stylesheet MIME failure was not reported exactly once");

    link.href = `data:text/css,${encodeURIComponent(".cornerfill-auto-remote{corner-shape:bevel}")}`;
    globalThis.__CORNERFILL_TEST_STAGE__ = "stylesheet slow parallel teardown";
    localStyle.textContent = ".cornerfill-auto-local-fast{corner-shape:bevel;border-radius:5px;background:red}";
    document.head.append(localStyle);
    const pending = auto.refresh();
    await waitFor(() => requests.length === 5, "in-flight teardown stylesheet request");
    await pending;
    assert(auto.explain(localElement) === null, "timed-out source did not block partial root ownership");
    auto.destroy();
    requests[4].resolve(response(".cornerfill-auto-remote{corner-shape:bevel}"));
    await pending;
    assert(requests[4].init.signal.aborted, "destroy did not abort the exact in-flight stylesheet request");
    assert(auto.explain().attached === 0 && auto.explain().stylesheets === 0, "destroyed discovery repopulated state");
    assert(
      auto.sourceState.requests.size === 0
        && auto.sourceState.pendingFetches.size === 0
        && auto.sourceState.pendingStylesheetWaits.size === 0,
      "stylesheet teardown retained request state",
    );
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    link.remove();
    element.remove();
    localStyle.remove();
    localElement.remove();
  }
  assert(!document.querySelector("style[data-cornerfill-auto-styles]"), "automatic retry teardown retained styles");
  globalThis.__CORNERFILL_TEST_STAGE__ = "";
});

await test("automatic external CSS refuses non-UTF-8 transport declarations", async () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `data:text/css,${encodeURIComponent(".cornerfill-charset{corner-shape:bevel;border-radius:5px}")}`;
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("charset fixture did not load")), { once: true });
  });
  document.head.append(link);
  await loaded;
  const originalFetch = window.fetch;
  window.fetch = () => Promise.resolve({
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css; charset=iso-8859-1" : null },
    ok: true,
    status: 200,
    text: async () => ".cornerfill-charset{corner-shape:bevel;border-radius:5px}",
    url: link.href,
  });
  const errors = [];
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    onError(error) { errors.push(error); },
  }));
  try {
    await auto.ready;
    assert(
      errors.length === 1 && /supports only UTF-8 stylesheets/u.test(errors[0].message),
      "non-UTF-8 stylesheet transport was not refused exactly once",
    );
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    link.remove();
  }
});

await test("automatic external CSS accepts WHATWG UTF-8 aliases", async () => {
  const source = ".cornerfill-charset-alias{corner-shape:bevel;border-radius:5px;background:red}";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(source)}`;
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("charset alias fixture did not load")), { once: true });
  });
  document.head.append(link);
  await loaded;
  const originalFetch = window.fetch;
  window.fetch = () => Promise.resolve({
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css; charset=unicode-1-1-utf-8" : null },
    ok: true,
    status: 200,
    text: async () => source,
    url: link.href,
  });
  const errors = [];
  const element = host();
  element.className = "cornerfill-charset-alias";
  const auto = installCornerfillAuto(options({ autoObserve: false, onError(error) { errors.push(error); } }));
  try {
    await auto.ready;
    assert(errors.length === 0, `UTF-8 alias was rejected: ${errors[0]?.message ?? "unknown error"}`);
    assert(auto.explain(element)?.status === "active", "UTF-8 alias stylesheet did not attach");
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    link.remove();
    element.remove();
  }
});

await test("automatic root and import fetches settle at the configured timeout", async () => {
  const originalFetch = window.fetch;
  const response = (css) => ({
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css" : null },
    ok: true,
    status: 200,
    text: async () => css,
    url: "https://assets.example/root.css",
  });
  const run = async (rootCss) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    const browserCss = rootCss === null
      ? ".cornerfill-timeout-owner{display:block}"
      : '@import "/bench/imports/child.css";';
    link.href = rootCss === null
      ? `data:text/css,${encodeURIComponent(browserCss)}`
      : `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(browserCss)}`;
    const loaded = new Promise((resolve, reject) => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", () => reject(new Error("timeout owner did not load")), { once: true });
    });
    document.head.append(link);
    await loaded;
    const requests = [];
    window.fetch = (_url, init = {}) => {
      requests.push(init.signal);
      if (rootCss !== null && requests.length === 1) return Promise.resolve(response(rootCss));
      return new Promise(() => {});
    };
    const errors = [];
    const auto = installCornerfillAuto(options({
      autoObserve: false,
      stylesheetTimeoutMs: 25,
      onError(error) { errors.push(error.message); },
    }));
    try {
      await Promise.race([
        auto.ready,
        new Promise((_resolve, reject) => setTimeout(
          () => reject(new Error("automatic stylesheet timeout did not settle readiness")),
          1_000,
        )),
      ]);
      assert(requests.at(-1)?.aborted, "timed-out stylesheet request was not aborted");
      assert(
        errors.some((message) => /exceeded the 25ms source deadline/u.test(message)),
        "stylesheet deadline was not diagnosed",
      );
    } finally {
      auto.destroy();
      link.remove();
    }
  };
  try {
    await run(null);
    await run('@import "https://assets.example/hanging.css";');
  } finally {
    window.fetch = originalFetch;
  }
});

await test("automatic inline imports wait for the browser cascade", async () => {
  const importedCss = ".cornerfill-inline-import-ready{corner-shape:bevel;border-radius:5px;background:rgb(1,2,3)}";
  const importUrl = `/bench/imports/delayed-runtime.css?delay=200&css=${encodeURIComponent(importedCss)}`;
  const style = document.createElement("style");
  style.textContent = `@import ${JSON.stringify(importUrl)};`;
  const started = performance.now();
  document.head.append(style);
  const element = document.createElement("div");
  element.className = "cornerfill-inline-import-ready";
  Object.assign(element.style, { width: "12px", height: "10px" });
  document.body.append(element);
  const errors = [];
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    stylesheetTimeoutMs: 1_000,
    onError(error) { errors.push(error); },
  }));
  try {
    await auto.ready;
    assert(performance.now() - started >= 100, "inline import fixture did not exercise a delayed browser load");
    assert(errors.length === 0, `inline import readiness reported ${errors[0]?.message ?? "an error"}`);
    assert(
      /(?:rgb\(1,\s*2,\s*3\)|#010203)/u.test(auto.explain(element)?.paint?.layer?.color ?? ""),
      "automatic ownership ran before the browser imported paint entered the cascade",
    );
    assert(auto.explain(element)?.status === "active", "loaded inline import did not attach");
  } finally {
    auto.destroy();
    style.remove();
    element.remove();
  }
});

await test("automatic compilation restarts when discovered media changes before commit", async () => {
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:200px;height:120px;border:0";
  frame.srcdoc = "<!doctype html><head></head><body></body>";
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  await loaded;
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  const query = "(min-width: 300px)";
  assert(!frameWindow.matchMedia(query).matches, "media transaction fixture did not start inactive");
  const childUrl = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(
    ".cornerfill-media-transaction{corner-shape:scoop}",
  )}`;
  const rootSource = `@import "${childUrl}" ${query};`;
  const link = frameDocument.createElement("link");
  link.rel = "stylesheet";
  link.href = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(rootSource)}`;
  frameDocument.head.append(link);
  const element = frameDocument.createElement("div");
  element.className = "cornerfill-media-transaction";
  element.style.cssText = "width:12px;height:10px;border-radius:5px;background:red";
  frameDocument.body.append(element);
  const auto = installCornerfillAuto(options({
    document: frameDocument,
    autoObserve: true,
    stylesheetTimeoutMs: 3_000,
  }));
  let releaseCommit;
  const commitGate = new Promise((resolve) => { releaseCommit = resolve; });
  const waitForBrowserStylesheet = auto._waitForBrowserStylesheet.bind(auto);
  auto._waitForBrowserStylesheet = async (...args) => {
    const result = await waitForBrowserStylesheet(...args);
    await commitGate;
    return result;
  };
  try {
    const ready = auto.ready;
    await waitFor(() => auto.automaticCounters.sourceCompiles === 1, "initial media transaction compilation");
    frame.style.width = "400px";
    await waitFor(() => frameWindow.matchMedia(query).matches, "media transaction state change");
    releaseCommit();
    await ready;
    assert(frameWindow.matchMedia(query).matches, "media transaction fixture did not become active");
    const transactionEntry = auto.explain(element);
    assert(
      transactionEntry,
      `media transaction restart did not attach its active import: ${JSON.stringify(auto.explain())}`,
    );
    equal(
      transactionEntry.geometry.shapeParameters,
      [-1, -1, -1, -1],
      "stale media compilation was stamped as current",
    );
    assert(
      auto.explain().automatic.counters.sourceCompiles >= 2,
      "media transition did not restart asynchronous compilation",
    );
  } finally {
    releaseCommit();
    auto.destroy();
    frame.remove();
  }
});

await test("failed media branches recover and conditional layers invalidate paint", async () => {
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:400px;height:120px;border:0";
  frame.srcdoc = "<!doctype html><head></head><body></body>";
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  await loaded;
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  const query = "(min-width: 300px)";
  const baseline = frameDocument.createElement("style");
  baseline.textContent = ".cornerfill-media-recovery{corner-shape:bevel;border-radius:5px;background:red}";
  const failing = frameDocument.createElement("style");
  failing.textContent = `@media ${query}{@container (min-width:1px){.cornerfill-media-recovery{background:blue}}}`;
  frameDocument.head.append(baseline, failing);
  const recoveryElement = frameDocument.createElement("div");
  recoveryElement.className = "cornerfill-media-recovery";
  recoveryElement.style.cssText = "width:12px;height:10px";
  frameDocument.body.append(recoveryElement);
  let auto = installCornerfillAuto(options({ document: frameDocument, autoObserve: true, onError() {} }));
  try {
    await auto.ready;
    assert(auto.explain().automatic.ownership === "blocked-root", "active failing media branch did not block ownership");
    assert(
      auto.explain().automatic.observation.mediaQueries.some((value) => value.replace(/\s+/gu, "") === "(min-width:300px)"),
      "failed compilation discarded its media recovery dependency",
    );
    frame.style.width = "200px";
    await waitFor(() => auto.explain(recoveryElement)?.status === "active", "failed media branch recovery");
    auto.destroy();
    baseline.remove();
    failing.remove();
    recoveryElement.remove();

    const layers = frameDocument.createElement("style");
    layers.textContent = `
      @media ${query} { @layer cornerfill-media-theme; }
      @layer cornerfill-media-base {
        .cornerfill-media-layer-order { corner-shape: bevel; border-radius: 5px; background: red }
      }
      @layer cornerfill-media-theme {
        .cornerfill-media-layer-order { corner-shape: scoop; border-radius: 5px; background: blue }
      }
    `;
    frameDocument.head.append(layers);
    const layerElement = frameDocument.createElement("div");
    layerElement.className = "cornerfill-media-layer-order";
    layerElement.style.cssText = "width:12px;height:10px";
    frameDocument.body.append(layerElement);
    auto = installCornerfillAuto(options({ document: frameDocument, autoObserve: true }));
    await auto.ready;
    equal(
      auto.explain(layerElement)?.geometry.shapeParameters,
      [-1, -1, -1, -1],
      "inactive conditional layer produced the wrong initial order",
    );
    frame.style.width = "400px";
    await waitFor(
      () => auto.explain(layerElement)?.geometry.shapeParameters[0] === 0,
      "conditional layer-order media invalidation",
    );
    equal(
      auto.explain(layerElement)?.geometry.shapeParameters,
      [0, 0, 0, 0],
      "conditional layer-order change left stale fallback paint",
    );
  } finally {
    auto.destroy();
    frame.remove();
  }
});

await test("conditional property registration refreshes carrier values across scopes", async () => {
  const frame = document.createElement("iframe");
  frame.style.cssText = "width:200px;height:120px;border:0";
  frame.srcdoc = "<!doctype html><head></head><body></body>";
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  await loaded;
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  const query = "(min-width: 300px)";
  const style = frameDocument.createElement("style");
  style.textContent = `
    @media ${query} {
      @property --cornerfill-conditional-shape {
        syntax: "*";
        inherits: false;
        initial-value: scoop;
      }
    }
    :root { --cornerfill-conditional-shape: bevel }
    .cornerfill-property-document {
      corner-shape: var(--cornerfill-conditional-shape);
      border-radius: 5px;
      background: red;
    }
  `;
  frameDocument.head.append(style);
  const documentElement = frameDocument.createElement("div");
  documentElement.className = "cornerfill-property-document";
  documentElement.style.cssText = "width:12px;height:10px";
  const shell = frameDocument.createElement("div");
  const root = shell.attachShadow({ mode: "open" });
  const shadowStyle = frameDocument.createElement("style");
  shadowStyle.textContent = `
    .cornerfill-property-shadow {
      corner-shape: var(--cornerfill-conditional-shape);
      border-radius: 5px;
      background: blue;
    }
  `;
  const shadowElement = frameDocument.createElement("div");
  shadowElement.className = "cornerfill-property-shadow";
  shadowElement.style.cssText = "width:12px;height:10px";
  root.append(shadowStyle, shadowElement);
  frameDocument.body.append(documentElement, shell);
  const auto = installCornerfillAuto(options({ document: frameDocument, autoObserve: true }));
  const scope = auto.registerRoot(root);
  try {
    await Promise.all([auto.ready, scope.ready]);
    equal(auto.explain(documentElement)?.geometry.shapeParameters, [0, 0, 0, 0], "inactive registration changed the document carrier");
    equal(scope.explain(shadowElement)?.geometry.shapeParameters, [0, 0, 0, 0], "inactive registration changed the shadow carrier");
    assert(
      auto.explain().automatic.observation.mediaQueries.some((value) => value.replace(/\s+/gu, "") === "(min-width:300px)"),
      "conditional property registration did not install its media dependency",
    );
    frame.style.width = "400px";
    await waitFor(() => frameWindow.matchMedia(query).matches, "property registration media activation");
    await waitFor(
      () => auto.explain(documentElement)?.geometry.shapeParameters[0] === -1
        && scope.explain(shadowElement)?.geometry.shapeParameters[0] === -1,
      "conditional property registration refresh",
    );
  } finally {
    scope.destroy();
    auto.destroy();
    frame.remove();
  }
});

await test("already-loaded empty link and inline imports retain local rules", async () => {
  const importedUrl = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent("/* empty */")}`;
  const source = `@import ${JSON.stringify(importedUrl)};.cornerfill-empty-import{corner-shape:bevel;border-radius:5px;background:red}`;
  const run = async (owner) => {
    const loaded = new Promise((resolve, reject) => {
      owner.addEventListener("load", resolve, { once: true });
      owner.addEventListener("error", () => reject(new Error("empty import fixture did not load")), { once: true });
    });
    document.head.append(owner);
    await loaded;
    const element = host();
    element.className = "cornerfill-empty-import";
    const auto = installCornerfillAuto(options({ autoObserve: false, stylesheetTimeoutMs: 250 }));
    try {
      await auto.ready;
      assert(
        auto.explain(element)?.status === "active",
        `loaded empty ${owner.localName} import discarded local rules: ${JSON.stringify(auto.explain().errors)}`,
      );
    } finally {
      auto.destroy();
      owner.remove();
      element.remove();
    }
  };
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(source)}`;
  await run(link);
  const style = document.createElement("style");
  style.textContent = source;
  await run(style);
});

await test("an empty linked stylesheet still installs its top-level CSSOM hook", async () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent("/* empty root */")}`;
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("empty root stylesheet did not load")), { once: true });
  });
  document.head.append(link);
  await loaded;
  const element = host();
  element.className = "cornerfill-empty-root-cssom";
  const auto = installCornerfillAuto(options({ autoObserve: false, stylesheetTimeoutMs: 250 }));
  try {
    await auto.ready;
    const index = link.sheet.insertRule(
      ".cornerfill-empty-root-cssom{corner-shape:bevel;border-radius:5px;background:red}",
    );
    await waitFor(() => auto.explain(element)?.status === "active", "empty root CSSOM insertion");
    link.sheet.deleteRule(index);
    await waitFor(() => auto.explain(element) === null, "empty root CSSOM deletion");
  } finally {
    auto.destroy();
    link.remove();
    element.remove();
  }
});

await test("top-level CSSOM mutations remain observed while imports rebuild", async () => {
  const style = document.createElement("style");
  style.textContent = '@import "/bench/imports/child.css";';
  document.head.append(style);
  const first = host();
  first.className = "cornerfill-import-cssom-first";
  const second = host();
  second.className = "cornerfill-import-cssom-second";
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  const originalFetch = window.fetch;
  const requests = [];
  try {
    await auto.ready;
    window.fetch = (input, init = {}) => {
      const url = String(input);
      if (!url.includes("/bench/imports/child.css")) return originalFetch(input, init);
      return new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException("aborted", "AbortError"));
        init.signal?.addEventListener("abort", abort, { once: true });
        requests.push({ init, resolve, url });
      });
    };
    style.sheet.insertRule(
      ".cornerfill-import-cssom-first{corner-shape:scoop;border-radius:5px;background:green}",
      style.sheet.cssRules.length,
    );
    await waitFor(() => requests.length === 1, "first imported CSSOM rebuild");
    style.sheet.insertRule(
      ".cornerfill-import-cssom-second{corner-shape:bevel;border-radius:5px;background:blue}",
      style.sheet.cssRules.length,
    );
    await waitFor(() => requests[0].init.signal.aborted, "obsolete imported CSSOM rebuild abort");
    await waitFor(() => requests.length === 2, "replacement imported CSSOM rebuild");
    requests[1].resolve({
      headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css" : null },
      ok: true,
      status: 200,
      text: async () => ".cornerfill-import-child{color:red}",
      url: requests[1].url,
    });
    await waitFor(
      () => auto.explain(first)?.status === "active" && auto.explain(second)?.status === "active",
      "complete imported CSSOM mutation model",
    );
  } finally {
    window.fetch = originalFetch;
    auto.destroy();
    style.remove();
    first.remove();
    second.remove();
  }
});

await test("automatic source budgets fail closed and deep conditional sources stay bounded", async () => {
  for (const name of [
    "maxStylesheetBytes",
    "maxImportDepth",
    "maxImportCount",
    "maxCandidateElements",
    "maxCompiledSelectors",
    "maxScannedElements",
  ]) {
    let error = null;
    try {
      installCornerfillAuto(options({ [name]: Number.MAX_SAFE_INTEGER + 1 }));
    } catch (caught) {
      error = caught;
    }
    assert(/positive safe integer/u.test(error?.message ?? ""), `${name} accepted an unsafe integer`);
  }
  const run = async (source, limits, expected) => {
    const styles = (Array.isArray(source) ? source : [source]).map((text) => {
      const style = document.createElement("style");
      style.textContent = text;
      document.head.append(style);
      return style;
    });
    const element = host();
    element.className = "cornerfill-source-budget";
    const auto = installCornerfillAuto(options({ autoObserve: false, onError() {}, ...limits }));
    try {
      await auto.ready;
      assert(auto.explain(element) === null, `${expected} did not block ownership`);
      assert(auto.explain().automatic.ownership === "blocked-root", `${expected} did not expose blocked-root state`);
      const diagnostics = auto.explain().errors;
      assert(
        diagnostics.some(({ message }) => message.includes(expected)),
        `${expected} was not diagnosed: ${JSON.stringify(diagnostics)}`,
      );
    } finally {
      auto.destroy();
      for (const style of styles) style.remove();
      element.remove();
    }
  };
  await run(
    ".cornerfill-source-budget{corner-shape:bevel;border-radius:5px;background:red}",
    { maxStylesheetBytes: 32 },
    "32-byte stylesheet source budget",
  );
  await run(
    ".cornerfill-source-budget{corner-shape:bevel;border-radius:5px}.cornerfill-source-budget.other{corner-shape:scoop}",
    { maxCompiledSelectors: 1 },
    "maximum compiled selector count of 1",
  );
  await run(
    ".cornerfill-source-budget{corner-shape:bevel}.cornerfill-source-budget{corner-shape:bevel}",
    { maxCompiledSelectors: 1 },
    "maximum compiled selector count of 1",
  );
  await run(
    ".unused-selector,.cornerfill-source-budget{corner-shape:bevel;border-radius:5px}",
    { maxCompiledSelectors: 1 },
    "maximum compiled selector count of 1",
  );
  await run(
    ".cornerfill-source-budget:is(.first,.second){corner-shape:bevel;border-radius:5px}",
    { maxCompiledSelectors: 1 },
    "maximum compiled selector count of 1",
  );
  await run(
    [
      ".cornerfill-source-budget{corner-shape:bevel;border-radius:5px}",
      ".cornerfill-source-budget.other{corner-shape:scoop}",
    ],
    { maxCompiledSelectors: 1 },
    "maximum aggregate compiled selector count of 1",
  );
  await run(
    "body,.cornerfill-source-budget{corner-shape:bevel;border-radius:5px}",
    { maxCandidateElements: 1 },
    "maximum candidate element count of 1",
  );
  await run(
    ".cornerfill-never-matches{corner-shape:bevel;border-radius:5px}",
    { maxScannedElements: 1 },
    "maximum scanned element count of 1",
  );
  await run(
    '@import "data:text/css,.one%7Bcolor:red%7D";@import "data:text/css,.two%7Bcolor:blue%7D";.cornerfill-source-budget{corner-shape:bevel;border-radius:5px}',
    { maxImportCount: 1 },
    "maximum @import count of 1",
  );
  const depth = 120;
  const nestedStyle = document.createElement("style");
  nestedStyle.textContent = `.cornerfill-deep-source{corner-shape:bevel;border-radius:5px;background:red}${"@media all{".repeat(depth)}.cornerfill-deep-inert{color:red}${"}".repeat(depth)}`;
  document.head.append(nestedStyle);
  const nestedElement = host();
  nestedElement.className = "cornerfill-deep-source";
  const nestedAuto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await nestedAuto.ready;
    assert(nestedAuto.explain(nestedElement)?.status === "active", "accepted deep conditional tree overflowed source compilation");
  } finally {
    nestedAuto.destroy();
    nestedStyle.remove();
    nestedElement.remove();
  }
});

await test("inactive source contexts stay observable without owning or consuming source work", async () => {
  const originalFetch = window.fetch;
  const linkedCss = ".cornerfill-inactive-link{corner-shape:scoop;border-radius:5px;background:blue}";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.media = "not all";
  link.href = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(linkedCss)}`;
  let linkedFetches = 0;
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === link.href) linkedFetches += 1;
    return originalFetch(input, init);
  };
  const inactive = document.createElement("style");
  inactive.media = "not all";
  inactive.textContent = "@layer{.cornerfill-inactive-owner{corner-shape:notch}}";
  const active = document.createElement("style");
  active.textContent = `
    @media not all { @layer { .cornerfill-false-media { corner-shape: notch } } }
    @supports (display: __cornerfill_impossible__) {
      @layer { .cornerfill-false-supports { corner-shape: notch } }
    }
    @supports (content: "{") {
      .cornerfill-header-string { corner-shape: bevel; border-radius: 5px; background: red }
    }
    .cornerfill-inactive-baseline { corner-shape: bevel; border-radius: 5px; background: red }
  `;
  document.head.append(link, inactive, active);
  const linked = host();
  linked.className = "cornerfill-inactive-link";
  const baseline = host();
  baseline.className = "cornerfill-inactive-baseline";
  const headerString = host();
  headerString.className = "cornerfill-header-string";
  const auto = installCornerfillAuto(options({
    autoObserve: true,
    maxCompiledSelectors: 3,
    onError() {},
  }));
  try {
    await auto.ready;
    assert(linkedFetches === 0, "inactive linked source was fetched by Cornerfill");
    assert(auto.sourceState.stylesheets.get(link)?.applicable === false, "inactive link was not recorded as inactive");
    assert(auto.sourceState.stylesheets.get(inactive)?.applicable === false, "inactive style was not recorded as inactive");
    assert(auto.explain().automatic.ownership === "active", "false conditional descendants blocked ownership");
    assert(auto.explain(baseline)?.status === "active", "inactive source disturbed an active source");
    assert(auto.explain(headerString)?.status === "active", "a brace inside a support-condition string truncated the rule header");
    assert(auto.explain(linked) === null, "inactive linked source attached an element");

    link.media = "all";
    await waitFor(() => auto.explain(linked)?.status === "active", "inactive link activation");
    assert(linkedFetches === 1, `activated linked source was fetched ${linkedFetches} times`);

    inactive.media = "all";
    await waitFor(() => auto.explain().automatic.ownership === "blocked-root", "inactive unsafe owner activation");
    assert(auto.explain(baseline) === null, "activated unsafe source retained fallback ownership");
    inactive.media = "not all";
    await waitFor(() => auto.explain(baseline)?.status === "active", "inactive unsafe owner recovery");
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    link.remove();
    inactive.remove();
    active.remove();
    linked.remove();
    baseline.remove();
    headerString.remove();
  }
});

await test("inactive conditional imports do not establish their named layer", async () => {
  const importUrl = "data:text/css,/*cornerfill-empty-conditional*/";
  const originalFetch = window.fetch;
  let requests = 0;
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== importUrl) return originalFetch(input, init);
    requests += 1;
    return Promise.resolve({
      headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css" : null },
      ok: true,
      status: 200,
      text: async () => "",
      url: importUrl,
    });
  };
  const imported = document.createElement("style");
  imported.textContent = `@import "${importUrl}" layer(cornerfill-conditional-theme) (max-width: 1px);`;
  const cascade = document.createElement("style");
  cascade.textContent = `
    @layer cornerfill-conditional-base, cornerfill-conditional-theme;
    @layer cornerfill-conditional-base {
      .cornerfill-conditional-layer { corner-shape: bevel; background: red }
    }
    @layer cornerfill-conditional-theme {
      .cornerfill-conditional-layer { corner-shape: scoop; background: blue }
    }
  `;
  document.head.append(imported, cascade);
  const element = host();
  element.className = "cornerfill-conditional-layer";
  element.style.removeProperty("background-color");
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await auto.ready;
    equal(
      auto.explain(element)?.geometry.shapeParameters,
      [-1, -1, -1, -1],
      "inactive layered import inverted later layer order",
    );
    assert(
      /(?:blue|0,\s*0,\s*255)/u.test(auto.explain(element)?.paint?.layer?.color ?? ""),
      "inactive layered import inverted later layer paint",
    );
    assert(requests === 0, "media-inactive import was fetched by Cornerfill");
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    imported.remove();
    cascade.remove();
    element.remove();
  }
});

await test("best-effort source policy preserves local rules after an active unreadable import", async () => {
  const importUrl = "data:text/css,/*cornerfill-missing-import*/";
  const originalFetch = window.fetch;
  let requests = 0;
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== importUrl) return originalFetch(input, init);
    requests += 1;
    return Promise.reject(new Error("intentional missing import"));
  };
  const style = document.createElement("style");
  style.textContent = `
    @import "${importUrl}";
    .cornerfill-local-after-failed-import {
      corner-shape: bevel;
      border-radius: 5px;
      background: red;
    }
  `;
  const loaded = new Promise((resolve, reject) => {
    style.addEventListener("load", resolve, { once: true });
    style.addEventListener("error", () => reject(new Error("active import fixture did not load")), { once: true });
  });
  document.head.append(style);
  await loaded;
  Object.defineProperty(style.sheet.cssRules[0], "styleSheet", {
    configurable: true,
    value: null,
  });
  const element = host();
  element.className = "cornerfill-local-after-failed-import";
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    onError() {},
    unreadableStylesheetPolicy: "best-effort",
  }));
  try {
    await auto.ready;
    assert(auto.explain(element)?.status === "active", "failed import discarded a later local rule");
    assert(requests === 1, "failed import was requested more than once during initial discovery");
    const record = auto.sourceState.stylesheets.get(style);
    assert(record?.failed === true, "partially compiled import owner was not retained as retryable");
    assert(record?.sources.includes(importUrl), "failed import was absent from source provenance");
    assert(
      auto.explain().errors.some(({ message }) => /intentional missing import/u.test(message)),
      "failed import was not diagnosed",
    );
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    style.remove();
    element.remove();
  }
});

await test("automatic source recovery handles comments and CSS identifier escapes", async () => {
  const style = document.createElement("style");
  style.textContent = String.raw`
    .cornerfill-token-comment { corner-shape/**/: bevel }
    .cornerfill-token-property { corner-\73hape: bevel }
    @layer c\61 fé {
      .cornerfill-token-value { corner-shape: b\65 vel }
    }
  `;
  document.head.append(style);
  const elements = [
    "cornerfill-token-comment",
    "cornerfill-token-property",
    "cornerfill-token-value",
  ].map((className) => {
    const element = host();
    element.className = className;
    return element;
  });
  const inline = document.createElement("div");
  inline.setAttribute(
    "style",
    String.raw`width:12px;height:10px;border-radius:5px;background:red;corner-\73 hape:bevel`,
  );
  document.body.append(inline);
  elements.push(inline);
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await auto.ready;
    for (const element of elements) {
      equal(
        auto.explain(element)?.geometry.shapeParameters,
        [0, 0, 0, 0],
        `automatic source scanner lost ${element.className || "escaped inline declaration"}`,
      );
    }
  } finally {
    auto.destroy();
    style.remove();
    for (const element of elements) element.remove();
  }
});

await test("supports- and media-false imports are filtered before fetch and source budgets", async () => {
  const skippedUrl = new URL("/bench/imports/conditional-skipped.css", location.href).href;
  const mediaSkippedUrl = new URL("/bench/imports/conditional-media-skipped.css", location.href).href;
  const activeUrl = new URL("/bench/imports/conditional-active.css", location.href).href;
  const originalFetch = window.fetch;
  const requests = [];
  window.fetch = (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== skippedUrl && url !== mediaSkippedUrl && url !== activeUrl) return originalFetch(input, init);
    requests.push(url);
    if (url === skippedUrl || url === mediaSkippedUrl) {
      return Promise.reject(new Error("inactive import was fetched"));
    }
    return Promise.resolve({
      headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css" : null },
      ok: true,
      status: 200,
      text: async () => ".cornerfill-import-condition-active{corner-shape:scoop}",
      url,
    });
  };
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("/bench/imports/conditional-root.css", location.href).href;
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("conditional import fixture did not load")), { once: true });
  });
  document.head.append(link);
  await loaded;
  const local = host();
  local.className = "cornerfill-import-condition-local";
  const imported = host();
  imported.className = "cornerfill-import-condition-active";
  const auto = installCornerfillAuto(options({ autoObserve: false, maxImportCount: 1 }));
  try {
    await auto.ready;
    assert(auto.explain(local)?.status === "active", "supports-false import discarded a local rule");
    equal(
      auto.explain(imported)?.geometry.shapeParameters,
      [-1, -1, -1, -1],
      "Cornerfill-transformed import support condition stayed false",
    );
    equal(requests, [activeUrl], "inactive import participated in fetch or import budgets");
    assert(
      [...auto.sourceState.stylesheets.values()].some(({ mediaQueries }) => mediaQueries.some((query) => (
        query.replace(/\s+/gu, "") === "(max-width:1px)"
      ))),
      "media-inactive import did not retain its activation dependency",
    );
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    link.remove();
    local.remove();
    imported.remove();
  }
});

await test("native-true carrier-false imports are audited before fallback ownership", async () => {
  const safeCss = ".cornerfill-negative-imported{corner-shape:bevel}";
  const unsafeCss = ".cornerfill-negative-unsafe{corner-shape:bevel;background:blue}";
  const safeUrl = new URL(
    `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(safeCss)}`,
    location.href,
  ).href;
  const unsafeUrl = new URL(
    `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(unsafeCss)}`,
    location.href,
  ).href;
  const originalFetch = window.fetch;
  const requests = [];
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === safeUrl || url === unsafeUrl) {
      requests.push(url);
    }
    return originalFetch(input, init);
  };
  const safe = document.createElement("style");
  safe.textContent = `
    @import "${safeUrl}" supports(not (corner-shape: bevel));
    .cornerfill-negative-local { corner-shape: scoop; border-radius: 5px; background: red }
  `;
  document.head.append(safe);
  const local = host();
  local.className = "cornerfill-negative-local";
  const imported = host();
  imported.className = "cornerfill-negative-imported";
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    onError() {},
    unreadableStylesheetPolicy: "best-effort",
  }));
  const nativeShapeSyntax = CSS.supports("corner-shape", "bevel");
  const unsafe = document.createElement("style");
  try {
    await auto.ready;
    assert(
      auto.explain(local)?.status === "active",
      `safe negative import blocked a local carrier: ${JSON.stringify(auto.explain().errors)}`,
    );
    assert(auto.explain(imported) === null, "carrier-false negative import emitted fallback carriers");
    assert(
      requests.filter((url) => url === safeUrl).length === (nativeShapeSyntax ? 0 : 1),
      "negative import did not follow native applicability for its safety audit",
    );

    unsafe.textContent = `@import "${unsafeUrl}" supports(not (corner-shape: bevel));`;
    document.head.append(unsafe);
    await auto.refresh();
    if (nativeShapeSyntax) {
      assert(auto.explain(local)?.status === "active", "native-false negative import blocked fallback ownership");
    } else {
      assert(auto.explain().automatic.ownership === "blocked-root", "unsafe negative import did not fail closed");
      assert(auto.explain(local) === null, "unsafe negative import retained fallback ownership");
      assert(
        auto.explain().errors.some(({ message }) => /also declares: background/u.test(message)),
        `unsafe negative import was not diagnosed: ${JSON.stringify(auto.explain().errors)}`,
      );
    }
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    safe.remove();
    unsafe.remove();
    local.remove();
    imported.remove();
  }
});

await test("automatic imports decode escaped control identifiers", async () => {
  const style = document.createElement("style");
  style.textContent = String.raw`
    @im\70ort/**/ /* before URL */ url("/bench/imports/escaped-control-child.css")
      s\75pports(\63orner-shape: bevel);
    .cornerfill-escaped-import-local { corner-shape: bevel }
  `;
  document.head.append(style);
  const imported = host();
  imported.className = "cornerfill-escaped-import";
  const local = host();
  local.className = "cornerfill-escaped-import-local";
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await auto.ready;
    equal(
      auto.explain(imported)?.geometry.shapeParameters,
      [-1, -1, -1, -1],
      "escaped import controls did not compile the imported shape",
    );
    equal(
      auto.explain(local)?.geometry.shapeParameters,
      [0, 0, 0, 0],
      "escaped control parsing discarded the local rule",
    );
  } finally {
    auto.destroy();
    style.remove();
    imported.remove();
    local.remove();
  }
});

await test("nested shape supports activate imports and escaped conditions keep strict semantics", async () => {
  const nestedStyle = document.createElement("style");
  nestedStyle.textContent = `
    @import "/bench/imports/nested-support-child.css" supports(((corner-shape: bevel)));
  `;
  document.head.append(nestedStyle);
  const nested = host();
  nested.className = "cornerfill-nested-support-import";
  const nestedAuto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await nestedAuto.ready;
    equal(
      nestedAuto.explain(nested)?.geometry.shapeParameters,
      [-1, -1, -1, -1],
      "nested shape support condition did not activate its import",
    );
  } finally {
    nestedAuto.destroy();
    nestedStyle.remove();
    nested.remove();
  }

  const strictStyle = document.createElement("style");
  strictStyle.textContent = String.raw`
    @import "/bench/imports/escaped-strict-child.css" supports(\63orner-shape: bevel);
  `;
  document.head.append(strictStyle);
  const strict = host();
  strict.className = "cornerfill-escaped-strict-import";
  const strictAuto = installCornerfillAuto(options({ autoObserve: false, onError() {} }));
  try {
    await strictAuto.ready;
    assert(strictAuto.explain(strict) === null, "escaped shape condition bypassed strict import semantics");
    assert(
      strictAuto.explain().errors.some(({ message }) => /also declares?: display/u.test(message)),
      `escaped strict import was not diagnosed: ${JSON.stringify(strictAuto.explain().errors)}`,
    );
  } finally {
    strictAuto.destroy();
    strictStyle.remove();
    strict.remove();
  }
});

await test("a browser-invalid bare import does not delay valid local carriers", async () => {
  const style = document.createElement("style");
  style.textContent = `
    @import /cornerfill-invalid-bare.css;
    .cornerfill-invalid-import-local { corner-shape:bevel }
  `;
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-invalid-import-local";
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    stylesheetTimeoutMs: 50,
  }));
  try {
    await auto.ready;
    assert(auto.explain(element)?.status === "active", "invalid import discarded a valid local carrier");
    assert(auto.explain().errors.length === 0, `invalid import produced diagnostics: ${JSON.stringify(auto.explain().errors)}`);
  } finally {
    auto.destroy();
    style.remove();
    element.remove();
  }
});

await test("CSSOM reconfiguration preserves queued stylesheet mutations", async () => {
  const source = document.createElement("style");
  source.textContent = ".cornerfill-queued-source{corner-shape:bevel}";
  const other = document.createElement("style");
  other.textContent = ".cornerfill-queued-other{color:red}";
  document.head.append(source, other);
  const element = host();
  element.className = "cornerfill-queued-source";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    equal(auto.explain(element)?.geometry.shapeParameters, [0, 0, 0, 0], "queued fixture did not start as bevel");
    source.textContent = ".cornerfill-queued-source{corner-shape:notch}";
    other.sheet.insertRule(
      ".cornerfill-queued-other:hover{corner-shape:bevel}",
      other.sheet.cssRules.length,
    );
    await waitFor(
      () => auto.explain(element)?.geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY),
      "queued source mutation after CSSOM observation reconfiguration",
    );
  } finally {
    auto.destroy();
    source.remove();
    other.remove();
    element.remove();
  }
});

await test("a hanging raster times out without holding automatic readiness", async () => {
  const originalDecode = Image.prototype.decode;
  Image.prototype.decode = () => new Promise(() => {});
  const style = document.createElement("style");
  const imageUrl = raster(2, 2, "#0af").toDataURL();
  style.textContent = `
    .cornerfill-hanging-image {
      corner-shape: bevel;
      border-radius: 5px;
      background-image: url("${imageUrl}");
    }
  `;
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-hanging-image";
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    imageTimeoutMs: 25,
    onError() {},
  }));
  try {
    await Promise.race([
      auto.ready,
      new Promise((_resolve, reject) => setTimeout(
        () => reject(new Error("hanging raster held automatic readiness")),
        1_000,
      )),
    ]);
    assert(auto.explain(element) === null, "timed-out raster retained a failed attachment");
    assert(
      auto.explain().errors.some(({ message }) => /image load timed out after 25ms/u.test(message)),
      "timed-out raster was not diagnosed",
    );
    assert(auto.explain().runtime.imageCache.loading === 0, "timed-out raster retained a loading cache record");
  } finally {
    auto.destroy();
    Image.prototype.decode = originalDecode;
    style.remove();
    element.remove();
  }
});

await test("automatic imports preserve cascade and idle selector state", async () => {
  const originalFetch = window.fetch;
  const fetched = [];
  const fetchCredentials = [];
  window.fetch = (input, init) => {
    fetched.push(new URL(input instanceof Request ? input.url : String(input), location.href).pathname);
    fetchCredentials.push(init.credentials);
    return originalFetch(input, init);
  };
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.crossOrigin = "anonymous";
  link.href = new URL("./imports/root.css", import.meta.url).href;
  const loaded = new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("import fixture did not load")), { once: true });
  });
  document.head.append(link);
  await loaded;
  const root = host();
  root.className = "cornerfill-import-root";
  const child = host();
  child.className = "cornerfill-import-child";
  const grandchild = host();
  grandchild.className = "cornerfill-import-grandchild";
  const ordered = host();
  ordered.className = "cornerfill-import-order";
  ordered.style.removeProperty("background-color");
  const focused = host();
  focused.className = "cornerfill-import-focus";
  focused.tabIndex = 0;
  focused.style.outline = "none";
  const unsafeSupports = document.createElement("link");
  unsafeSupports.rel = "stylesheet";
  unsafeSupports.href = new URL("./imports/unsafe-supports.css", import.meta.url).href;
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    assert(auto.explain(root)?.status === "active", "root stylesheet declarations were not attached");
    equal(auto.explain(root).geometry.shapeParameters, [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ], "root stylesheet shape changed");
    assert(auto.explain(child)?.status === "active", "qualified imported declarations were not attached");
    equal(auto.explain(grandchild).geometry.shapeParameters, [2, 2, 2, 2], "nested import shape changed");
    equal(auto.explain(ordered).geometry.shapeParameters, [-1, -1, -1, -1], "import layer lost root-local cascade order");
    assert(/(?:blue|0,\s*0,\s*255)/u.test(auto.explain(ordered).paint.layer.color), "import layer lost root-local paint order");
    equal(fetched, [
      "/bench/imports/root.css",
      "/bench/imports/child.css",
      "/bench/imports/grandchild.css",
    ], "identical active imports were fetched more than once or out of order");
    equal(
      fetchCredentials,
      ["same-origin", "same-origin", "same-origin"],
      "same-origin anonymous stylesheet recovery omitted credentials",
    );
    const record = [...auto.sourceState.stylesheets.values()].find(({ owner }) => owner === link);
    assert(record, "root import stylesheet record was unavailable");
    equal(record.sources.map((source) => new URL(source).pathname), fetched, "import provenance was incomplete");
    const fetchedBeforeState = [...fetched];
    focused.focus();
    await waitFor(() => auto.explain(focused)?.status === "active", "imported focus selector did not attach");
    equal(fetched, fetchedBeforeState, "selector state restarted the import graph");

    const unsafeLoaded = new Promise((resolve, reject) => {
      unsafeSupports.addEventListener("load", resolve, { once: true });
      unsafeSupports.addEventListener("error", () => reject(new Error("unsafe import fixture did not load")), { once: true });
    });
    document.head.append(unsafeSupports);
    await unsafeLoaded;
    await auto.refresh();
    assert(auto.explain(root) === null, "corner-shape import condition did not fail ownership closed");
    assert(
      auto.explain().errors.some(({ message }) => /semantic rule.*@font-face/u.test(message)),
      "conditional import semantic split was not diagnosed",
    );
    unsafeSupports.remove();
    await auto.refresh();
    assert(auto.explain(root)?.status === "active", "conditional import removal did not recover ownership");
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    link.remove();
    unsafeSupports.remove();
    root.remove();
    child.remove();
    grandchild.remove();
    ordered.remove();
    focused.remove();
  }
  assert(
    auto.sourceState.importRequests.size === 0 && auto.sourceState.requests.size === 0,
    "import teardown retained request state",
  );
});

await test("automatic import requests are stale-safe, cycle-bounded, and failure-quiescent", async () => {
  const response = (css, url) => ({
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css" : null },
    ok: true,
    status: 200,
    text: async () => css,
    url,
  });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  const loadLink = (css, sameOrigin = false) => new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("mock import owner did not load")), { once: true });
    link.href = sameOrigin
      ? `/bench/imports/delayed-runtime.css?css=${encodeURIComponent(css)}`
      : `data:text/css,${encodeURIComponent(css)}`;
    if (!link.isConnected) document.head.append(link);
  });
  await loadLink('@import "/bench/imports/child.css";.cornerfill-import-stale{width:12px;height:10px;border-radius:5px;background:red}', true);
  const originalFetch = window.fetch;
  const requests = [];
  window.fetch = (url, init = {}) => new Promise((resolve) => {
    requests.push({ init, resolve, url: String(url) });
  });
  const element = host();
  element.className = "cornerfill-import-stale";
  const errors = [];
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    onError(error) { errors.push(error.message); },
  }));
  try {
    await waitFor(() => requests.length === 1, "mock root stylesheet request");
    requests[0].resolve(response('@import "./old.css";', "https://assets.example/root.css"));
    await waitFor(() => requests.length === 2, "mock stale import request");
    await loadLink(".cornerfill-import-stale{width:12px;height:10px;border-radius:5px;background:green}");
    const replacement = auto.refresh();
    await waitFor(() => requests[1].init.signal.aborted, "obsolete import abort signal");
    requests[1].resolve(response(
      ".cornerfill-import-stale{corner-shape:bevel;border-radius:5px;background:red}",
      "https://assets.example/old.css",
    ));
    await waitFor(() => requests.length === 3, "replacement root stylesheet request");
    requests[2].resolve(response(
      ".cornerfill-import-stale{corner-shape:notch;border-radius:5px;background:green}",
      "https://assets.example/new.css",
    ));
    await Promise.all([auto.ready, replacement]);
    assert(auto.explain(element)?.geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY), "stale imported declarations won replacement");

    await loadLink('@import "/bench/imports/child.css";.cornerfill-import-stale{width:12px;height:10px;border-radius:5px;background:blue}', true);
    const cycle = auto.refresh();
    await waitFor(() => requests.length === 4, "cycle root stylesheet request");
    requests[3].resolve(response('@import "./a.css";', "https://assets.example/cycle/root.css"));
    await waitFor(() => requests.length === 5, "cycle first import request");
    requests[4].resolve(response(
      '@import "./b.css";.cornerfill-import-stale{corner-shape:scoop;border-radius:5px;background:purple}',
      "https://assets.example/cycle/a.css",
    ));
    await waitFor(() => requests.length === 6, "cycle second import request");
    requests[5].resolve(response('@import "./a.css";', "https://assets.example/cycle/b.css"));
    await cycle;
    assert(errors.some((message) => /@import cycle/u.test(message)), "import cycle was not diagnosed");
    equal(
      auto.explain(element)?.geometry.shapeParameters,
      [-1, -1, -1, -1],
      "cyclic import edge discarded the importing source's local carriers",
    );
    const requestCount = requests.length;
    await auto.refresh();
    assert(requests.length === requestCount, "failed import graph retried without an explicit retry");

    await loadLink('@import "/bench/imports/child.css";.cornerfill-import-stale{width:12px;height:10px;border-radius:5px;background:purple}', true);
    const siblingCycle = auto.refresh();
    await waitFor(() => requests.length === requestCount + 1, "sibling-cycle root stylesheet request");
    requests[requestCount].resolve(response(
      '@import "./a.css";@import "./b.css";',
      "https://assets.example/sibling-cycle/root.css",
    ));
    await waitFor(() => requests.length === requestCount + 3, "sibling-cycle branch requests");
    const siblingRequests = requests.slice(requestCount + 1);
    const requestFor = (suffix) => siblingRequests.find(({ url }) => url.endsWith(suffix));
    requestFor("/a.css").resolve(response(
      '@import "./b.css";',
      "https://assets.example/sibling-cycle/a.css",
    ));
    requestFor("/b.css").resolve(response(
      '@import "./a.css";',
      "https://assets.example/sibling-cycle/b.css",
    ));
    await Promise.race([
      siblingCycle,
      new Promise((_resolve, reject) => setTimeout(
        () => reject(new Error("sibling import cycle deadlocked automatic readiness")),
        1_000,
      )),
    ]);
    assert(errors.some((message) => /@import cycle/u.test(message)), "sibling import cycle was not diagnosed");

    const redirectStart = requests.length;
    await loadLink('@import "/bench/imports/child.css";.cornerfill-import-stale{width:12px;height:10px;corner-shape:bevel;border-radius:5px;background:orange}', true);
    const redirectCycle = auto.refresh();
    await waitFor(() => requests.length === redirectStart + 1, "redirect-cycle root request");
    requests[redirectStart].resolve(response(
      '@import "./alias.css";.cornerfill-import-stale{width:12px;height:10px;corner-shape:bevel;border-radius:5px;background:orange}',
      "https://assets.example/redirect-cycle/root.css",
    ));
    await waitFor(() => requests.length === redirectStart + 2, "redirect-cycle import request");
    requests[redirectStart + 1].resolve(response(
      ".ignored{color:red}",
      "https://assets.example/redirect-cycle/root.css",
    ));
    await redirectCycle;
    equal(
      auto.explain(element)?.geometry.shapeParameters,
      [0, 0, 0, 0],
      "redirect-created import cycle discarded the parent source's local carriers",
    );
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    link.remove();
    element.remove();
  }
  assert(
    auto.sourceState.importRequests.size === 0 && auto.sourceState.requests.size === 0,
    "failed import teardown retained request state",
  );
});

await test("automatic open-root scopes own local, inline, and opted-in adopted CSS", async () => {
  let documentAdoptedError = null;
  try {
    installCornerfillAuto(options({ adoptedStyleSheets: true }));
  } catch (error) {
    documentAdoptedError = error;
  }
  assert(
    /limited to registered shadow roots/u.test(documentAdoptedError?.message ?? ""),
    "document-level adopted stylesheet ownership was not refused",
  );
  const disconnectedShell = document.createElement("div");
  const disconnectedRoot = disconnectedShell.attachShadow({ mode: "open" });
  const disconnectedStyle = document.createElement("style");
  disconnectedStyle.textContent = ".cornerfill-disconnected-root{corner-shape:bevel;border-radius:5px;background:red}";
  const disconnectedElement = host(disconnectedRoot);
  disconnectedElement.className = "cornerfill-disconnected-root";
  disconnectedRoot.prepend(disconnectedStyle);
  const nonObservingParent = installCornerfillAuto(options({ autoObserve: false }));
  let observingChildError = null;
  try { nonObservingParent.registerRoot(disconnectedRoot, { autoObserve: true }); } catch (error) { observingChildError = error; }
  assert(/requires an observing parent/u.test(observingChildError?.message ?? ""), "observing child under a non-observing parent was accepted");
  nonObservingParent.destroy();
  const connectionAuto = installCornerfillAuto(options({ autoObserve: true }));
  const disconnectedScope = connectionAuto.registerRoot(disconnectedRoot);
  try {
    await Promise.all([connectionAuto.ready, disconnectedScope.ready]);
    assert(disconnectedScope.explain(disconnectedElement) === null, "disconnected root attached before its host connected");
    document.body.append(disconnectedShell);
    await waitFor(
      () => disconnectedScope.explain(disconnectedElement)?.status === "active",
      "registered disconnected root connection",
    );
    disconnectedShell.remove();
    await waitFor(
      () => disconnectedScope.explain(disconnectedElement) === null,
      "registered root disconnection teardown",
    );
  } finally {
    disconnectedScope.destroy();
    connectionAuto.destroy();
    disconnectedShell.remove();
  }
  const shellA = host();
  const shellB = host();
  const rootA = shellA.attachShadow({ mode: "open" });
  const rootB = shellB.attachShadow({ mode: "open" });
  const localStyle = document.createElement("style");
  localStyle.textContent = `
    .cornerfill-scope-local,.cornerfill-scope-order {
      corner-shape: bevel;
      border-radius: 5px;
      background: red;
    }
  `;
  rootA.append(localStyle);
  const local = host(rootA);
  local.className = "cornerfill-scope-local";
  const inline = host(rootA);
  inline.setAttribute("style", "width:12px;height:10px;background:red;border-radius:5px;corner-shape:scoop");
  const ordered = host(rootA);
  ordered.className = "cornerfill-scope-order";
  const adoptedA = host(rootA);
  adoptedA.className = "cornerfill-scope-adopted";
  const adoptedB = host(rootB);
  adoptedB.className = "cornerfill-scope-adopted";
  const shared = new CSSStyleSheet();
  const initialAdoptedSource = `
    .cornerfill-scope-adopted,.cornerfill-scope-order {
      corner-shape: notch;
      border-radius: 5px;
      background: blue;
    }
  `;
  shared.replaceSync(initialAdoptedSource);
  rootA.adoptedStyleSheets = [shared];
  rootB.adoptedStyleSheets = [shared];
  const closedShell = host();
  const closed = closedShell.attachShadow({ mode: "closed" });
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  let directRootError = null;
  try { installCornerfillAuto(options({ root: rootA })); } catch (error) { directRootError = error; }
  assert(
    /Register open shadow roots through a document automatic controller/u.test(directRootError?.message ?? ""),
    "direct shadow-root installation bypassed containing-tree observation",
  );
  let scopeA;
  let scopeB;
  try {
    await auto.ready;
    assert(auto.explain(local) === null, "document discovery crossed an unregistered shadow boundary");
    let closedError = null;
    try { auto.registerRoot(closed); } catch (error) { closedError = error; }
    assert(/closed ShadowRoot/u.test(closedError?.message ?? ""), "closed root registration did not fail explicitly");
    const bypassShell = document.createElement("div");
    rootA.append(bypassShell);
    const bypassRoot = bypassShell.attachShadow({ mode: "open" });
    let bypassError = null;
    try { auto.registerRoot(bypassRoot); } catch (error) { bypassError = error; }
    assert(
      /directly nested open ShadowRoot/u.test(bypassError?.message ?? ""),
      "document scope bypassed an unregistered containing shadow root",
    );
    bypassShell.remove();
    scopeA = auto.registerRoot(rootA, { adoptedStyleSheets: true });
    let unrelatedRootError = null;
    try { scopeA.registerRoot(rootB); } catch (error) { unrelatedRootError = error; }
    assert(
      /directly nested open ShadowRoot/u.test(unrelatedRootError?.message ?? ""),
      "a shadow scope registered an unrelated root",
    );
    scopeB = auto.registerRoot(rootB, { adoptedStyleSheets: true });
    assert(auto.registerRoot(rootA, { adoptedStyleSheets: true }) === scopeA, "duplicate root registration created another scope");
    await Promise.all([scopeA.ready, scopeB.ready]);
    await Promise.all([
      scopeA.refreshAdoptedStyleSheet(shared, initialAdoptedSource),
      scopeB.refreshAdoptedStyleSheet(shared, initialAdoptedSource),
    ]);
    let adoptedBaseError = null;
    try {
      await scopeA.replaceStylesheetSource(shared, initialAdoptedSource, {
        baseUrl: document.baseURI,
      });
    } catch (error) {
      adoptedBaseError = error;
    }
    assert(
      /baseUrl is available only for linked stylesheets/u.test(adoptedBaseError?.message ?? ""),
      "an adopted stylesheet silently ignored a linked-source base URL",
    );
    assert(scopeA.explain(local)?.status === "active", "registered root stylesheet did not attach");
    equal(scopeA.explain(inline).geometry.shapeParameters, [-1, -1, -1, -1], "registered root inline declaration changed");
    assert(scopeA.explain(adoptedA)?.status === "active", "opted-in adopted stylesheet did not attach in first root");
    assert(scopeB.explain(adoptedB)?.status === "active", "shared adopted stylesheet did not attach in second root");
    assert(scopeA.explain(ordered).geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY), "adopted stylesheet lost root-local cascade order");
    assert(rootA.querySelectorAll('style[data-cornerfill-auto-styles="adopted"]').length === 1, "first root omitted or duplicated its adopted companion");
    assert(rootB.querySelectorAll('style[data-cornerfill-auto-styles="adopted"]').length === 1, "second root omitted or duplicated its adopted companion");
    rootB.append(inline);
    await scopeA.refresh();
    assert(scopeA.explain(inline) === null, "source root retained a moved inline candidate");
    await scopeB.refresh();
    equal(scopeB.explain(inline).geometry.shapeParameters, [-1, -1, -1, -1], "destination root did not claim moved inline CSS");
    rootA.append(inline);
    await scopeB.refresh();
    assert(scopeB.explain(inline) === null, "destination root retained an inline candidate moved back out");
    await scopeA.refresh();
    equal(scopeA.explain(inline).geometry.shapeParameters, [-1, -1, -1, -1], "source root did not reclaim returned inline CSS");
    const adoptedCompanion = rootA.querySelector('style[data-cornerfill-auto-styles="adopted"]');
    adoptedCompanion.removeAttribute("data-cornerfill-auto-styles");
    adoptedCompanion.setAttribute("media", "not all");
    adoptedCompanion.setAttribute("nonce", "tampered");
    await scopeA.refresh();
    assert(
      adoptedCompanion.matches('style[data-cornerfill-auto-styles="adopted"]')
        && !adoptedCompanion.hasAttribute("media")
        && !adoptedCompanion.hasAttribute("nonce"),
      "registered-root refresh did not restore adopted companion applicability",
    );

    const replacedAdoptedSource = `
      .cornerfill-scope-adopted,.cornerfill-scope-order {
        corner-shape: scoop;
        border-radius: 5px;
        background: green;
      }
    `;
    shared.replaceSync(replacedAdoptedSource);
    assert(scopeA.explain(adoptedA).geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY), "adopted replacement was observed by a prototype patch");
    await Promise.all([
      scopeA.refreshAdoptedStyleSheet(shared, replacedAdoptedSource),
      scopeB.refreshAdoptedStyleSheet(shared, replacedAdoptedSource),
    ]);
    equal(scopeA.explain(adoptedA).geometry.shapeParameters, [-1, -1, -1, -1], "explicit adopted refresh did not update first root");
    equal(scopeB.explain(adoptedB).geometry.shapeParameters, [-1, -1, -1, -1], "explicit adopted refresh did not update second root");

    const adoptedOverride = new CSSStyleSheet();
    const adoptedOverrideSource = ".cornerfill-scope-adopted{corner-shape:bevel;border-radius:5px}";
    adoptedOverride.replaceSync(adoptedOverrideSource);
    rootA.adoptedStyleSheets = [shared, adoptedOverride];
    await scopeA.refreshAdoptedStyleSheet(adoptedOverride, adoptedOverrideSource);
    equal(scopeA.explain(adoptedA).geometry.shapeParameters, [0, 0, 0, 0], "later adopted companion did not win the carrier cascade");
    rootA.adoptedStyleSheets = [adoptedOverride, shared];
    await scopeA.refresh();
    equal(scopeA.explain(adoptedA).geometry.shapeParameters, [-1, -1, -1, -1], "adopted companion order ignored the current platform array");
    rootA.adoptedStyleSheets = [shared];
    await scopeA.refresh();

    const unsafeAdoptedSource = `
      @supports (corner-shape: bevel) {
        .cornerfill-scope-adopted { corner-shape: bevel; background: red }
      }
    `;
    shared.replaceSync(unsafeAdoptedSource);
    await scopeA.refreshAdoptedStyleSheet(shared, unsafeAdoptedSource);
    assert(scopeA.explain(local) === null, "failed adopted source did not block ownership");
    shared.replaceSync(replacedAdoptedSource);
    await scopeA.refreshAdoptedStyleSheet(shared, replacedAdoptedSource);
    assert(scopeA.explain(local)?.status === "active", "corrected adopted source did not recover without retryFailed");

    shared.disabled = true;
    shared.replaceSync(unsafeAdoptedSource);
    await scopeA.refreshAdoptedStyleSheet(shared, unsafeAdoptedSource);
    assert(scopeA.explain(local)?.status === "active", "disabled adopted source blocked unrelated ownership");
    shared.disabled = false;
    await scopeA.refreshAdoptedStyleSheet(shared, unsafeAdoptedSource);
    assert(scopeA.explain(local) === null, "enabled unsafe adopted source was not compiled");
    shared.replaceSync(replacedAdoptedSource);
    await scopeA.refreshAdoptedStyleSheet(shared, replacedAdoptedSource);
    assert(scopeA.explain(local)?.status === "active", "repaired re-enabled adopted source did not recover");

    Object.defineProperty(rootA, "adoptedStyleSheets", {
      configurable: true,
      get() { throw new Error("injected adopted stylesheet list failure"); },
    });
    let adoptedListError = null;
    try { await scopeA.refresh(); } catch (error) { adoptedListError = error; }
    assert(
      /injected adopted stylesheet list failure/u.test(adoptedListError?.message ?? ""),
      "an unreadable adopted stylesheet list did not reject discovery",
    );
    assert(scopeA.explain(local) === null, "an unreadable adopted stylesheet list retained shaped ownership");
    assert(
      scopeA.explain().automatic.ownership === "blocked-root",
      "an unreadable adopted stylesheet list did not fail ownership closed",
    );
    delete rootA.adoptedStyleSheets;
    await scopeA.refresh();
    assert(scopeA.explain(local)?.status === "active", "adopted stylesheet discovery did not recover");

    assert(auto.unregisterRoot(rootA), "registered root removal was not acknowledged");
    assert(!rootA.querySelector("style[data-cornerfill-auto-styles],style[data-cornerfill-ownership-styles]"), "root removal retained generated styles");
    assert(/corner-shape\s*:\s*scoop/iu.test(inline.getAttribute("style") ?? ""), "root removal lost authored inline CSS");
    assert(scopeB.explain(adoptedB)?.status === "active", "removing one root disturbed a shared adopted sheet in another root");
    rootB.adoptedStyleSheets = [];
    await scopeB.refresh();
    assert(scopeB.explain(adoptedB) === null, "removed adopted stylesheet retained ownership");
    assert(auto.unregisterRoot(rootB), "second registered root removal was not acknowledged");
    assert(auto.explain().scopes === 0 && auto.explain().runtime.entries === 0, "scope teardown retained automatic or runtime entries");
  } finally {
    scopeA?.destroy();
    scopeB?.destroy();
    auto.destroy();
    shellA.remove();
    shellB.remove();
    closedShell.remove();
  }
});

await test("nested automatic scopes release ownership when their host changes containing roots", async () => {
  const shellA = host();
  const shellB = host();
  const rootA = shellA.attachShadow({ mode: "open" });
  const rootB = shellB.attachShadow({ mode: "open" });
  const nestedHost = host(rootA);
  const nestedRoot = nestedHost.attachShadow({ mode: "open" });
  const descendantHost = host(nestedRoot);
  const descendantRoot = descendantHost.attachShadow({ mode: "open" });
  const descendantStyle = document.createElement("style");
  descendantStyle.textContent = ".cornerfill-descendant-root-move{corner-shape:bevel;border-radius:5px;background:blue}";
  descendantRoot.append(descendantStyle);
  const descendant = host(descendantRoot);
  descendant.className = "cornerfill-descendant-root-move";
  const style = document.createElement("style");
  style.textContent = ".cornerfill-nested-root-move{corner-shape:bevel;border-radius:5px;background:red}";
  nestedRoot.append(style);
  const element = host(nestedRoot);
  element.className = "cornerfill-nested-root-move";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  const scopeA = auto.registerRoot(rootA);
  const scopeB = auto.registerRoot(rootB);
  let nestedScope = scopeA.registerRoot(nestedRoot);
  let descendantScope = nestedScope.registerRoot(descendantRoot);
  try {
    await Promise.all([auto.ready, scopeA.ready, scopeB.ready, nestedScope.ready, descendantScope.ready]);
    assert(nestedScope.explain(element)?.status === "active", "nested root did not attach in its registered parent");
    assert(descendantScope.explain(descendant)?.status === "active", "descendant root did not attach in its registered chain");
    rootB.append(nestedHost);
    await waitFor(
      () => nestedScope.explain(element) === null,
      "nested scope ownership release after containing-root migration",
    );
    await waitFor(
      () => descendantScope.explain(descendant) === null,
      "descendant scope ownership release after ancestor-root migration",
    );
    let duplicateRegistrationError = null;
    try { scopeB.registerRoot(nestedRoot); } catch (error) { duplicateRegistrationError = error; }
    assert(
      /already registered by another automatic scope/u.test(duplicateRegistrationError?.message ?? ""),
      "moved nested root acquired two parent registrations",
    );
    assert(scopeA.unregisterRoot(nestedRoot), "old parent did not unregister the moved nested root");
    nestedScope = scopeB.registerRoot(nestedRoot);
    descendantScope = nestedScope.registerRoot(descendantRoot);
    await nestedScope.ready;
    await descendantScope.ready;
    assert(nestedScope.explain(element)?.status === "active", "moved nested root did not attach under its new parent");
    assert(descendantScope.explain(descendant)?.status === "active", "descendant root did not reattach under its new registered chain");
  } finally {
    descendantScope.destroy();
    nestedScope.destroy();
    scopeA.destroy();
    scopeB.destroy();
    auto.destroy();
    shellA.remove();
    shellB.remove();
  }
});

await test("failed adopted stylesheets retain media recovery dependencies", async () => {
  const query = "(cornerfill-adopted-recovery)";
  const originalMatchMedia = window.matchMedia;
  const listeners = new Set();
  let matches = true;
  window.matchMedia = function matchMedia(value) {
    if (value !== query) return originalMatchMedia.call(this, value);
    return {
      get matches() { return matches; },
      media: value,
      onchange: null,
      addEventListener(type, listener) { if (type === "change") listeners.add(listener); },
      removeEventListener(type, listener) { if (type === "change") listeners.delete(listener); },
      addListener(listener) { listeners.add(listener); },
      removeListener(listener) { listeners.delete(listener); },
      dispatchEvent() { return true; },
    };
  };
  const shell = host();
  const root = shell.attachShadow({ mode: "open" });
  const local = document.createElement("style");
  local.textContent = ".cornerfill-adopted-recovery{corner-shape:bevel;border-radius:5px;background:red}";
  root.append(local);
  const element = host(root);
  element.className = "cornerfill-adopted-recovery";
  const adopted = new CSSStyleSheet();
  adopted.replaceSync(`
    @media ${query} {
      @container (min-width: 1px) { .cornerfill-adopted-recovery { background: blue } }
    }
  `);
  root.adoptedStyleSheets = [adopted];
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  const scope = auto.registerRoot(root, { adoptedStyleSheets: true });
  try {
    await Promise.all([auto.ready, scope.ready]);
    assert(scope.explain().automatic.ownership === "blocked-root", "failed adopted media branch did not block ownership");
    assert(
      scope.explain().automatic.observation.mediaQueries.includes(query),
      "failed adopted compilation discarded its media recovery dependency",
    );
    const compiles = scope.explain().automatic.counters.sourceCompiles;
    await scope.refresh();
    assert(
      scope.explain().automatic.counters.sourceCompiles === compiles,
      "stable failed adopted stylesheet was recompiled without retryFailed",
    );
    matches = false;
    for (const listener of [...listeners]) listener({ matches: false, media: query });
    await waitFor(() => scope.explain(element)?.status === "active", "failed adopted stylesheet media recovery");
  } finally {
    window.matchMedia = originalMatchMedia;
    scope.destroy();
    auto.destroy();
    shell.remove();
  }
});

await test("containing styles refresh inherited paint inside registered roots", async () => {
  const outerStyle = document.createElement("style");
  outerStyle.textContent = ".cornerfill-inherited-host{--cornerfill-inherited-color:red}";
  document.head.append(outerStyle);
  const shell = host();
  shell.className = "cornerfill-inherited-host";
  const root = shell.attachShadow({ mode: "open" });
  const localStyle = document.createElement("style");
  localStyle.textContent = `
    .cornerfill-inherited-paint {
      corner-shape: bevel;
      border-radius: 5px;
      background: var(--cornerfill-inherited-color);
    }
  `;
  root.append(localStyle);
  const element = host(root);
  element.className = "cornerfill-inherited-paint";
  element.style.removeProperty("background-color");
  element.style.removeProperty("border-radius");
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  const scope = auto.registerRoot(root);
  try {
    await Promise.all([auto.ready, scope.ready]);
    assert(/(?:255,\s*0,\s*0|red)/u.test(scope.explain(element)?.paint?.layer?.color ?? ""), "inherited shadow paint did not start red");
    outerStyle.textContent = ".cornerfill-inherited-host{--cornerfill-inherited-color:blue}";
    await waitFor(
      () => /(?:0,\s*0,\s*255|blue)/u.test(scope.explain(element)?.paint?.layer?.color ?? ""),
      "containing stylesheet refresh in registered root",
    );
  } finally {
    scope.destroy();
    auto.destroy();
    outerStyle.remove();
    shell.remove();
  }

  const runtimeStyle = document.createElement("style");
  runtimeStyle.textContent = ".cornerfill-runtime-inherited-host{--cornerfill-runtime-color:red}";
  document.head.append(runtimeStyle);
  const runtimeShell = host();
  runtimeShell.className = "cornerfill-runtime-inherited-host";
  const runtimeRoot = runtimeShell.attachShadow({ mode: "open" });
  const runtimeLocal = document.createElement("style");
  runtimeLocal.textContent = ".cornerfill-runtime-inherited{background:var(--cornerfill-runtime-color)}";
  runtimeRoot.append(runtimeLocal);
  const runtimeElement = host(runtimeRoot);
  runtimeElement.className = "cornerfill-runtime-inherited";
  runtimeElement.style.removeProperty("background-color");
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(runtimeElement, {
    borderRadius: "5px",
    cornerShape: "bevel",
  });
  try {
    await handle.ready;
    assert(/(?:255,\s*0,\s*0|red)/u.test(handle.explain().paint?.layer?.color ?? ""), "explicit inherited paint did not start red");
    runtimeStyle.firstChild.data = ".cornerfill-runtime-inherited-host{--cornerfill-runtime-color:blue}";
    await waitFor(
      () => /(?:0,\s*0,\s*255|blue)/u.test(handle.explain().paint?.layer?.color ?? ""),
      "containing stylesheet refresh in explicit runtime",
    );
  } finally {
    handle.dispose();
    controller.destroy();
    runtimeStyle.remove();
    runtimeShell.remove();
  }
});

await test("registered shadow scopes discover and observe host selectors", async () => {
  const theme = host();
  theme.id = "cornerfill-shadow-theme-id";
  theme.className = "cornerfill-shadow-theme cornerfill-shadow-theme-a cornerfill-shadow-theme-b";
  const shell = host(theme);
  shell.className = "cornerfill-shadow-host-active cornerfill-shadow-invalid-wrapper";
  const root = shell.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host, .cornerfill-shadow-host-child {
      corner-shape: bevel;
      border-radius: 5px;
      background: red;
    }
    :host(.cornerfill-shadow-host-active) { corner-top-right-shape: scoop }
    :host > .cornerfill-shadow-direct-child {
      corner-shape: square;
      border-radius: 5px;
      background: green;
    }
    :host-context(.cornerfill-shadow-theme) .cornerfill-shadow-context-child {
      corner-shape: notch;
      border-radius: 5px;
      background: blue;
    }
    :host-context(#cornerfill-shadow-theme-id) .cornerfill-shadow-specific-id { corner-shape: bevel }
    :host(.cornerfill-shadow-host-active) .cornerfill-shadow-specific-id { corner-shape: scoop }
    :host-context(.cornerfill-shadow-theme-a.cornerfill-shadow-theme-b) .cornerfill-shadow-specific-classes { corner-shape: bevel }
    :host(.cornerfill-shadow-host-active) .cornerfill-shadow-specific-classes { corner-shape: scoop }
    :host(.cornerfill-shadow-host-active) .cornerfill-shadow-specific-type { corner-shape: scoop }
    :host-context(div) .cornerfill-shadow-specific-type { corner-shape: bevel }
    :host-context(:is(#cornerfill-shadow-theme-id,.cornerfill-unused-theme)) .cornerfill-shadow-specific-functional { corner-shape: bevel }
    :host(.cornerfill-shadow-host-active) .cornerfill-shadow-specific-functional { corner-shape: scoop }
    :host-context(.cornerfill-shadow-theme .cornerfill-shadow-invalid-wrapper) .cornerfill-shadow-invalid-context { corner-shape: bevel }
    :host-context(.cornerfill-shadow-theme >) .cornerfill-shadow-malformed-context { corner-shape: bevel }
    [data-cornerfill-selector-literal=":host"] {
      corner-shape: scoop;
      border-radius: 5px;
      background: purple;
    }
    [data-cornerfill-state-literal=":checked .fake #fake"] {
      corner-shape: bevel;
      border-radius: 5px;
      background: purple;
    }
  `;
  root.append(style);
  const child = host(root);
  child.className = "cornerfill-shadow-host-child";
  const contextual = host(root);
  contextual.className = "cornerfill-shadow-context-child";
  const direct = host(root);
  direct.className = "cornerfill-shadow-direct-child";
  const specificId = host(root);
  specificId.className = "cornerfill-shadow-specific-id";
  const specificClasses = host(root);
  specificClasses.className = "cornerfill-shadow-specific-classes";
  const specificType = host(root);
  specificType.className = "cornerfill-shadow-specific-type";
  const specificFunctional = host(root);
  specificFunctional.className = "cornerfill-shadow-specific-functional";
  const invalidContext = host(root);
  invalidContext.className = "cornerfill-shadow-invalid-context";
  const malformedContext = host(root);
  malformedContext.className = "cornerfill-shadow-malformed-context";
  const literal = host(root);
  literal.dataset.cornerfillSelectorLiteral = ":host";
  const stateLiteral = host(root);
  stateLiteral.dataset.cornerfillStateLiteral = ":checked .fake #fake";
  const nestedShell = host(root);
  const nestedRoot = nestedShell.attachShadow({ mode: "open" });
  const nestedStyle = document.createElement("style");
  nestedStyle.textContent = `
    :host-context(.cornerfill-shadow-theme) .cornerfill-shadow-nested-context {
      corner-shape: square;
      border-radius: 5px;
      background: teal;
    }
  `;
  nestedRoot.append(nestedStyle);
  const nestedContextual = host(nestedRoot);
  nestedContextual.className = "cornerfill-shadow-nested-context";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  const scope = auto.registerRoot(root);
  const nestedScope = scope.registerRoot(nestedRoot);
  try {
    await Promise.all([auto.ready, scope.ready, nestedScope.ready]);
    equal(scope.explain(shell)?.geometry.shapeParameters, [0, -1, 0, 0], ":host() cascade was not owned");
    assert(scope.explain(child)?.status === "active", "normal branch beside :host was not discovered");
    assert(scope.explain(contextual)?.status === "active", ":host-context() descendant was not discovered");
    assert(scope.explain(direct)?.status === "active", ":host child combinator was not discovered");
    equal(scope.explain(specificId)?.geometry.shapeParameters, [0, 0, 0, 0], ":host-context() ID specificity drifted");
    equal(scope.explain(specificClasses)?.geometry.shapeParameters, [0, 0, 0, 0], ":host-context() class specificity drifted");
    equal(scope.explain(specificType)?.geometry.shapeParameters, [-1, -1, -1, -1], ":host-context() type specificity drifted");
    equal(scope.explain(specificFunctional)?.geometry.shapeParameters, [0, 0, 0, 0], ":host-context() functional specificity drifted");
    assert(scope.explain(invalidContext) === null, "invalid complex :host-context() argument became active");
    assert(scope.explain(malformedContext) === null, "malformed :host-context() argument became active");
    equal(scope.explain(literal)?.geometry.shapeParameters, [-1, -1, -1, -1], "host text inside an attribute value was parsed as a pseudo");
    assert(scope.explain(stateLiteral)?.status === "active", "state text inside an attribute value blocked selector observation");
    assert(nestedScope.explain(nestedContextual)?.status === "active", "nested :host-context() was not discovered");
    const marker = [...shell.attributes].find(({ name }) => name.startsWith("data-cornerfill-host-context-"));
    assert(marker?.value, "shadow host-context marker was not installed");
    const markerValue = marker.value;
    shell.removeAttribute(marker.name);
    await waitFor(
      () => shell.getAttribute(marker.name) === markerValue,
      "externally removed host-context marker repair",
    );
    assert(scope.explain(contextual)?.status === "active", "marker repair lost the contextual attachment");
    theme.classList.remove("cornerfill-shadow-theme");
    await waitFor(() => scope.explain(contextual) === null, ":host-context() ancestor removal");
    await waitFor(() => nestedScope.explain(nestedContextual) === null, "nested :host-context() ancestor removal");
    shell.classList.remove("cornerfill-shadow-host-active");
    await waitFor(
      () => scope.explain(shell)?.geometry.shapeParameters.every((value) => value === 0),
      ":host() class mutation",
    );
  } finally {
    nestedScope.destroy();
    scope.destroy();
    auto.destroy();
    theme.remove();
  }
});

await test("document and shadow scopes share one host attachment across cascade changes", async () => {
  const shell = document.createElement("x-cornerfill-shared-host");
  shell.setAttribute(
    "style",
    "display:block;width:12px;height:10px;border-radius:5px;background:red;corner-shape:bevel",
  );
  document.body.append(shell);
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  let scope = null;
  let documentBlocker = null;
  try {
    await auto.ready;
    equal(auto.explain(shell)?.geometry.shapeParameters, [0, 0, 0, 0], "document scope did not attach the host");
    const root = shell.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = ":host{corner-shape:scoop!important}";
    root.append(style);
    scope = auto.registerRoot(root);
    await scope.ready;
    equal(scope.explain(shell)?.geometry.shapeParameters, [-1, -1, -1, -1], "shadow scope did not refresh the shared host");
    equal(auto.explain(shell)?.geometry.shapeParameters, [-1, -1, -1, -1], "document scope retained stale host paint");
    assert(auto.controller.stats().entries === 1, "scope overlap created duplicate runtime entries");

    style.textContent = `
      :host{corner-shape:scoop!important}
      @layer{.cornerfill-never-matches{corner-shape:notch}}
    `;
    await scope.refresh();
    assert(scope.explain().automatic.ownership === "blocked-root", "blocked shadow scope did not report unknown ownership");
    assert(scope.explain(shell) === null && auto.explain(shell) === null, "blocked shadow scope retained another scope's shared host paint");
    assert(auto.controller.stats().entries === 0, "blocked shadow scope retained a shared runtime entry");

    style.textContent = ":host{corner-shape:scoop!important}";
    await scope.refresh();
    await waitFor(
      () => scope.explain(shell)?.geometry.shapeParameters.every((value) => value === -1)
        && auto.explain(shell)?.geometry.shapeParameters.every((value) => value === -1),
      "shared host recovery after shadow ownership veto",
    );

    documentBlocker = document.createElement("style");
    documentBlocker.textContent = "@layer{.cornerfill-never-matches{corner-shape:notch}}";
    document.head.append(documentBlocker);
    await auto.refresh();
    assert(auto.explain().automatic.ownership === "blocked-root", "blocked document scope did not report unknown ownership");
    assert(scope.explain(shell) === null && auto.explain(shell) === null, "blocked document scope retained the shadow scope's shared host paint");
    assert(auto.controller.stats().entries === 0, "blocked document scope retained a shared runtime entry");
    documentBlocker.remove();
    documentBlocker = null;
    await auto.refresh();
    await waitFor(
      () => scope.explain(shell)?.geometry.shapeParameters.every((value) => value === -1)
        && auto.explain(shell)?.geometry.shapeParameters.every((value) => value === -1),
      "shared host recovery after document ownership veto",
    );

    style.textContent = ":host{corner-shape:round!important}";
    await waitFor(
      () => scope.explain(shell) === null && auto.explain(shell) === null,
      "shared host round override detachment",
    );
    assert(auto.controller.stats().entries === 0, "round override retained the shared runtime entry");

    style.textContent = ":host{corner-shape:scoop!important}";
    await waitFor(
      () => scope.explain(shell)?.geometry.shapeParameters.every((value) => value === -1)
        && auto.explain(shell)?.geometry.shapeParameters.every((value) => value === -1),
      "shared host fallback reattachment",
    );
    assert(auto.controller.stats().entries === 1, "shared fallback reattached more than one runtime entry");

    scope.destroy();
    scope = null;
    await waitFor(
      () => auto.explain(shell)?.geometry.shapeParameters.every((value) => value === 0),
      "document host recovery after shadow scope teardown",
    );
    assert(auto.controller.stats().entries === 1, "shadow teardown disposed the remaining document claim");
  } finally {
    documentBlocker?.remove();
    scope?.destroy();
    auto.destroy();
    shell.remove();
  }
});

await test("direct refresh propagates queued base and direction changes to shadow scopes", async () => {
  const originalFetch = window.fetch;
  const requests = [];
  window.fetch = (input, init = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!/\/cornerfill-shadow-base-[ab]\/theme\.css$/u.test(url)) return originalFetch(input, init);
    requests.push(url);
    return Promise.resolve({
      headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css" : null },
      ok: true,
      status: 200,
      text: async () => ".cornerfill-shadow-base{corner-shape:bevel}",
      url,
    });
  };
  const base = document.createElement("base");
  base.href = new URL("/cornerfill-shadow-base-a/", location.href).href;
  document.head.prepend(base);
  const shell = host();
  shell.dir = "ltr";
  const root = shell.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    @import "./theme.css" supports(corner-shape: bevel);
    .cornerfill-shadow-flow { corner-start-start-shape: bevel }
  `;
  root.append(style);
  const imported = host(root);
  imported.className = "cornerfill-shadow-base";
  const logical = host(root);
  logical.className = "cornerfill-shadow-flow";
  const auto = installCornerfillAuto(options({ autoObserve: true }));
  const scope = auto.registerRoot(root);
  try {
    await Promise.all([auto.ready, scope.ready]);
    assert(requests.some((url) => url.includes("cornerfill-shadow-base-a")), "initial shadow import used the wrong base URL");
    equal(scope.explain(logical)?.geometry.shapeParameters, [0, 1, 1, 1], "shadow flow did not start ltr");
    base.href = new URL("/cornerfill-shadow-base-b/", location.href).href;
    shell.dir = "rtl";
    await auto.refresh();
    await waitFor(
      () => requests.some((url) => url.includes("cornerfill-shadow-base-b")),
      "shadow import base propagation",
    );
    await waitFor(
      () => scope.explain(logical)?.geometry.shapeParameters[1] === 0,
      "shadow inherited direction propagation",
    );
  } finally {
    scope.destroy();
    auto.destroy();
    window.fetch = originalFetch;
    base.remove();
    shell.remove();
  }
});

await test("automatic diagnostics belong to the current source generation", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-diagnostic{corner-shape:superellipse(sin(1));border-radius:5px;background:red}";
  document.head.append(style);
  const element = host(document.body, "cornerfill-diagnostic-owner");
  element.className = "cornerfill-diagnostic";
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await auto.ready;
    let report = auto.explain();
    assert(report.decision.selected === "fallback", "fallback decision was not machine-readable");
    if (report.decision.reason === "native-requirements-unresolved") {
      assert(report.nativeQualification.unresolved.length > 0, "fallback report omitted unresolved native requirements");
    } else {
      assert(report.decision.reason === "fallback-forced" && report.nativeQualification.qualified, "forced fallback reason was not machine-readable");
    }
    assert(report.implementation.fallbackRenderer === "IMPLEMENTED", "implemented fallback was not reported separately");
    assert(report.oracleQualification.nativeCalibration.status === "PASS", "native A/A calibration status changed");
    assert(report.oracleQualification.candidate.status === "UNQUALIFIED", "candidate was mislabeled as oracle PASS");
    assert(report.errors.length === 1, "invalid source generation did not produce one current diagnostic");
    const [diagnostic] = report.errors;
    assert(/#cornerfill-inline-style-\d+$/u.test(diagnostic.owner), "diagnostic omitted the inline source identity");
    assert(diagnostic.source === diagnostic.owner, "diagnostic source diverged from its owner");
    assert(diagnostic.selector === ".cornerfill-diagnostic", "diagnostic omitted the matched selector");
    assert(/corner-shape/u.test(diagnostic.declaration ?? ""), "diagnostic omitted the declaration");

    style.textContent = ".cornerfill-diagnostic{corner-shape:bevel;border-radius:5px;background:green}";
    await auto.refresh();
    report = auto.explain();
    assert(report.errors.length === 0, "repaired stylesheet retained a stale diagnostic");
    const explanation = auto.explain(element);
    assert(explanation?.status === "active" && explanation.implementationStatus === "IMPLEMENTED", "repaired stylesheet did not expose implemented entry state");
    assert(explanation.oracleQualification.candidate.status === "UNQUALIFIED", "entry explanation mislabeled oracle qualification");
    assert(explanation.limitations.descendantOverflowClipping.supported === false, "fallback entry omitted descendant clipping limitation");
    assert(explanation.limitations.shapedHitTesting.supported === false, "fallback entry omitted shaped hit-testing limitation");

    style.textContent = ".cornerfill-diagnostic{corner-shape:superellipse(calc(1 * 2));border-radius:5px;background:blue}";
    await auto.refresh();
    assert(auto.explain().errors.length === 1, "new failed generation did not replace recovered state");
    style.remove();
    await auto.refresh();
    assert(auto.explain().errors.length === 0, "removed source retained a diagnostic reference");
    assert(auto.explain(element) === null, "removed source retained element ownership");
  } finally {
    auto.destroy();
    style.remove();
    element.remove();
  }
});

await test("feature-query truth mismatches audit native branches and reject layer-order changes", async () => {
  const baseline = document.createElement("style");
  baseline.textContent = ".cornerfill-query-mismatch{corner-shape:bevel;border-radius:5px;background:red}";
  document.head.append(baseline);
  const element = host();
  element.className = "cornerfill-query-mismatch";
  const errors = [];
  const auto = installCornerfillAuto(options({ autoObserve: false, onError(error) { errors.push(error.message); } }));
  const nativeShapeSyntax = CSS.supports("corner-shape", "bevel");
  const run = async (source, expectedMessage) => {
    const style = document.createElement("style");
    style.textContent = source;
    document.head.append(style);
    errors.length = 0;
    await auto.refresh();
    if (nativeShapeSyntax) {
      assert(auto.explain(element)?.status === "active", `native-equivalent feature query was refused: ${errors.join("\n")}`);
    } else {
      assert(auto.explain().automatic.ownership === "blocked-root", "feature-query truth mismatch retained partial ownership");
      assert(auto.explain(element) === null, "feature-query truth mismatch retained fallback paint");
      assert(errors.some((message) => expectedMessage.test(message)), `feature-query mismatch lacked ${expectedMessage}: ${errors.join("\n")}`);
    }
    style.remove();
    await auto.refresh();
    assert(auto.explain(element)?.status === "active", "feature-query mismatch removal did not recover ownership");
  };
  try {
    await auto.ready;
    await run(`
      @supports not (corner-shape: bevel) {
        .cornerfill-query-mismatch { corner-shape: scoop; background: blue }
      }
    `, /also declares: background/u);
    await run(`
      @supports (corner-shape: bevel) { @layer cornerfill-query-layer; }
    `, /cannot preserve cascade-layer order/u);
    const emptyUrl = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent("/* empty */")}`;
    await run(`
      @import "${emptyUrl}" layer(cornerfill-query-import) supports(corner-shape: bevel);
    `, /cannot preserve cascade-layer order/u);
    const layeredUrl = `/bench/imports/delayed-runtime.css?css=${encodeURIComponent("@layer cornerfill-imported-layer;")}`;
    await run(`
      @import "${layeredUrl}" supports(corner-shape: bevel);
    `, /cannot preserve cascade-layer order/u);
  } finally {
    auto.destroy();
    baseline.remove();
    element.remove();
  }
});

await test("automatic cascade contexts preserve supported CSS and refuse unsafe transport", async () => {
  const validStyle = document.createElement("style");
  validStyle.textContent = `
    @layer base, theme;
    @layer base {
      .cornerfill-layer-normal { corner-shape: bevel; background: red }
      .cornerfill-layer-important { corner-shape: bevel !important; background: red }
      .cornerfill-all-layer { corner-shape: bevel }
      .cornerfill-all-var-layer { corner-shape: bevel }
    }
    @layer theme {
      .cornerfill-layer-normal { corner-shape: scoop; background: blue }
      .cornerfill-layer-important { corner-shape: scoop !important; background: blue }
      .cornerfill-all-layer { all: unset; display: block }
      .cornerfill-all-var-layer { all: var(--cornerfill-missing-layer, revert-layer); display: block }
    }
    .cornerfill-var-inherit { corner-shape: var(--cornerfill-test-shape, bevel) }
    .cornerfill-var-fallback { corner-shape: var(--cornerfill-missing-shape, scoop) }
    .cornerfill-var-conflict { --shape: bevel; corner-top-left-shape: round; corner-shape: var(--shape) }
    .cornerfill-logical { corner-start-start-shape: bevel }
    .cornerfill-media-duplicate { corner-shape: round }
    @media (min-width: 1px) { .cornerfill-media { corner-shape: notch } }
    @media (min-width: 1px) { .cornerfill-media-duplicate { corner-shape: bevel } }
    @supports (corner-shape: bevel) {
      .cornerfill-supports-positive { corner-shape: bevel }
      @media not all {
        @layer cornerfill-dormant-layer {
          .cornerfill-dormant-layer-never { corner-shape: notch }
        }
      }
      .cornerfill-dormant-layer { corner-shape: bevel }
    }
    @supports not (corner-shape: bevel) { .cornerfill-supports-negative { corner-shape: bevel } }
    @supports not (corner-shape: unknown-shape) { .cornerfill-supports-invalid-negative { corner-shape: bevel } }
    @supports (corner-shape: r\\65vert-rule) { .cornerfill-supports-revert-rule { corner-shape: bevel } }
    .cornerfill-mixed { corner-top-left-shape: bevel; corner-start-start-shape: scoop }
    .cornerfill-all-base { corner-shape: bevel }
    .cornerfill-all-base.cornerfill-all-reset { all: unset; display: block }
    .cornerfill-all-before { all: unset; corner-shape: bevel; display: block }
    .cornerfill-all-after { corner-shape: bevel; all: u\\6eset; display: block }
    .cornerfill-all-important { corner-shape: bevel !important; all: unset !important; display: block !important }
    .cornerfill-all-var { --cornerfill-all-value: unset; corner-shape: bevel; all: var(--cornerfill-all-value); display: block }
    .cornerfill-all-var-fallback { corner-shape: bevel; all: v\\61r(--cornerfill-missing-all, unset); display: block }
    .cornerfill-all-var-important { --cornerfill-all-important-value: unset; corner-shape: bevel !important; all: var(--cornerfill-all-important-value) !important; display: block !important }
    .cornerfill-env { corner-shape: env(cornerfill-test-shape, bevel) }
    .cornerfill-all-env { corner-shape: bevel; all: env(cornerfill-missing-all, unset); display: block }
    .cornerfill-invalid-low { corner-shape: potato }
    #cornerfill-valid-high { corner-shape: bevel }
    #cornerfill-invalid-important { corner-shape: potato !important }
    .cornerfill-valid-normal { corner-shape: scoop }
    .cornerfill-radius-em { corner-shape: bevel; border-radius: 1em; font-size: 20px }
    .cornerfill-radius-vw { corner-shape: bevel; border-radius: 5vw }
    .cornerfill-radius-min { corner-shape: bevel; border-radius: min(20%, 2rem); font-size: 20px }
    .cornerfill-radius-calc { corner-shape: bevel; border-radius: calc(1em + 5%); font-size: 20px }
  `;
  const anonymousLayer = document.createElement("style");
  anonymousLayer.textContent = "@layer{.cornerfill-anonymous{corner-shape:bevel}}";
  const nestedStyle = document.createElement("style");
  nestedStyle.textContent = `
    .cornerfill-nesting {
      corner-shape: bevel;
      & .cornerfill-nested { corner-shape: scoop }
      corner-shape: notch;
      @media (min-width: 1px) {
        corner-shape: square;
        & .cornerfill-nested-media { corner-shape: bevel }
      }
      corner-shape: superellipse(3);
    }
  `;
  const complexSupports = document.createElement("style");
  complexSupports.textContent = "@supports selector([corner-shape]){.cornerfill-complex-supports{corner-shape:bevel}}";
  const splitSupports = document.createElement("style");
  splitSupports.textContent = "@supports (corner-shape:bevel){.cornerfill-split-supports{corner-shape:bevel;background:red}}";
  const customSupports = document.createElement("style");
  customSupports.textContent = "@supports (corner-shape:bevel){.cornerfill-supports-custom{--cornerfill-test-shape:bevel;corner-shape:var(--cornerfill-test-shape)}}";
  const negativeCustomSupports = document.createElement("style");
  negativeCustomSupports.textContent = "@supports not (corner-shape:bevel){.cornerfill-supports-negative-custom{--cornerfill-test-shape:bevel;corner-shape:var(--cornerfill-test-shape)}}";
  const containerPaint = document.createElement("style");
  containerPaint.textContent = "@container (min-width:1px){.cornerfill-container-paint{background:red}}";
  const inertStyle = document.createElement("style");
  inertStyle.type = "text/less";
  inertStyle.textContent = ".cornerfill-inert-source{corner-shape:bevel}";
  const alternate = document.createElement("link");
  alternate.rel = "alternate stylesheet";
  alternate.title = "Cornerfill inactive alternate";
  alternate.href = `data:text/css,${encodeURIComponent(".cornerfill-alternate-source{corner-shape:bevel}")}`;
  document.head.append(
    validStyle,
    nestedStyle,
    inertStyle,
    alternate,
  );

  const layerNormal = host();
  layerNormal.className = "cornerfill-layer-normal";
  layerNormal.style.removeProperty("background-color");
  const layerImportant = host();
  layerImportant.className = "cornerfill-layer-important";
  layerImportant.style.removeProperty("background-color");
  const varParent = document.createElement("div");
  varParent.style.setProperty("--cornerfill-test-shape", "notch");
  const varInherit = host(varParent);
  varInherit.className = "cornerfill-var-inherit";
  document.body.append(varParent);
  const varFallback = host();
  varFallback.className = "cornerfill-var-fallback";
  const varConflict = host();
  varConflict.className = "cornerfill-var-conflict";
  const logical = host();
  logical.className = "cornerfill-logical";
  logical.dir = "rtl";
  const media = host();
  media.className = "cornerfill-media";
  const mediaDuplicate = host();
  mediaDuplicate.className = "cornerfill-media-duplicate";
  const supportsPositive = host();
  supportsPositive.className = "cornerfill-supports-positive";
  const dormantLayer = host();
  dormantLayer.className = "cornerfill-dormant-layer";
  const supportsCustom = host();
  supportsCustom.className = "cornerfill-supports-custom";
  const supportsNegativeCustom = host();
  supportsNegativeCustom.className = "cornerfill-supports-negative-custom";
  const supportsNegative = host();
  supportsNegative.className = "cornerfill-supports-negative";
  const supportsInvalidNegative = host();
  supportsInvalidNegative.className = "cornerfill-supports-invalid-negative";
  const supportsRevertRule = host();
  supportsRevertRule.className = "cornerfill-supports-revert-rule";
  const conditionalCrossSource = host();
  conditionalCrossSource.setAttribute(
    "style",
    "width:12px;height:10px;border-radius:5px;background:red;corner-shape:bevel",
  );
  const mixed = host();
  mixed.className = "cornerfill-mixed";
  const anonymous = host();
  anonymous.className = "cornerfill-anonymous";
  const nesting = host();
  nesting.className = "cornerfill-nesting";
  const nested = host(nesting);
  nested.className = "cornerfill-nested";
  const nestedMedia = host(nesting);
  nestedMedia.className = "cornerfill-nested-media";
  const complex = host();
  complex.className = "cornerfill-complex-supports";
  const split = host();
  split.className = "cornerfill-split-supports";
  const inert = host();
  inert.className = "cornerfill-inert-source";
  const alternateElement = host();
  alternateElement.className = "cornerfill-alternate-source";
  const allReset = host();
  allReset.className = "cornerfill-all-base cornerfill-all-reset";
  const allBefore = host();
  allBefore.className = "cornerfill-all-before";
  const allAfter = host();
  allAfter.className = "cornerfill-all-after";
  const allLayer = host();
  allLayer.className = "cornerfill-all-layer";
  const allImportant = host();
  allImportant.className = "cornerfill-all-important";
  const allVar = host();
  allVar.className = "cornerfill-all-var";
  const allVarFallback = host();
  allVarFallback.className = "cornerfill-all-var-fallback";
  const allVarImportant = host();
  allVarImportant.className = "cornerfill-all-var-important";
  const envShape = host();
  envShape.className = "cornerfill-env";
  const allEnv = host();
  allEnv.className = "cornerfill-all-env";
  const allVarLayer = host();
  allVarLayer.className = "cornerfill-all-var-layer";
  const validHigh = host(document.body, "cornerfill-valid-high");
  validHigh.className = "cornerfill-invalid-low";
  const validBelowInvalidImportant = host(document.body, "cornerfill-invalid-important");
  validBelowInvalidImportant.className = "cornerfill-valid-normal";
  const relativeRadii = [
    ["cornerfill-radius-em", [{ rx: 20, ry: 20 }]],
    ["cornerfill-radius-vw", [{ rx: 40, ry: 40 }]],
    ["cornerfill-radius-min", [{ rx: 32, ry: 20 }]],
    ["cornerfill-radius-calc", [{ rx: 30, ry: 25 }]],
  ].map(([className, expected]) => {
    const target = host();
    target.className = className;
    target.style.removeProperty("border-radius");
    target.style.width = "200px";
    target.style.height = "100px";
    return { target, expected };
  });

  const auto = installCornerfillAuto(options({ autoObserve: true }));
  try {
    await auto.ready;
    const registration = document.querySelector('style[data-cornerfill-auto-styles="properties"]');
    const validCompanion = validStyle.nextElementSibling;
    assert(registration?.sheet, "carrier registration stylesheet was unavailable");
    assert(
      validCompanion?.matches('style[data-cornerfill-auto-styles=""]'),
      "compiled carrier companion was unavailable",
    );
    const registrationCss = registration.textContent;
    const companionCss = validCompanion.textContent;
    registration.textContent = "";
    registration.removeAttribute("data-cornerfill-auto-styles");
    registration.setAttribute("media", "not all");
    registration.setAttribute("nonce", "tampered");
    registration.setAttribute("type", "text/plain");
    registration.setAttribute("title", "tampered");
    registration.disabled = true;
    validCompanion.textContent = "";
    validCompanion.removeAttribute("data-cornerfill-auto-styles");
    validCompanion.setAttribute("media", "not all");
    validCompanion.setAttribute("nonce", "tampered");
    validCompanion.setAttribute("type", "text/plain");
    validCompanion.setAttribute("title", "tampered");
    validCompanion.disabled = true;
    await auto.refresh();
    assert(registration.textContent === registrationCss, "refresh did not restore the carrier registration stylesheet");
    assert(registration.matches('style[data-cornerfill-auto-styles="properties"]'), "refresh did not restore the registration marker");
    assert(
      !registration.hasAttribute("media")
        && !registration.hasAttribute("nonce")
        && !registration.hasAttribute("type")
        && !registration.hasAttribute("title")
        && !registration.disabled
        && !registration.sheet.disabled,
      "refresh did not restore registration applicability",
    );
    assert(validCompanion.textContent === companionCss, "refresh did not restore a compiled carrier stylesheet");
    assert(validCompanion.matches('style[data-cornerfill-auto-styles=""]'), "refresh did not restore the companion marker");
    assert(
      !validCompanion.hasAttribute("media")
        && !validCompanion.hasAttribute("nonce")
        && !validCompanion.hasAttribute("type")
        && !validCompanion.hasAttribute("title")
        && !validCompanion.disabled
        && !validCompanion.sheet.disabled,
      "refresh did not restore companion applicability",
    );
    assert(
      [...document.querySelectorAll('style[data-cornerfill-auto-styles=""]')]
        .some((style) => /@layer\s+base,\s*theme\s*;/u.test(style.textContent ?? "")),
      "carrier stylesheet dropped the named layer-order statement",
    );
    assert(auto.explain(layerNormal), `baseline cascade ownership was blocked: ${JSON.stringify(auto.explain().errors)}`);
    equal(auto.explain(layerNormal).geometry.shapeParameters, [-1, -1, -1, -1], "named layer order changed");
    assert(/(?:blue|0,\s*0,\s*255)/u.test(auto.explain(layerNormal).paint.layer.color), "named layer paint order changed");
    equal(auto.explain(layerImportant).geometry.shapeParameters, [0, 0, 0, 0], "important layer order changed");
    assert(/(?:blue|0,\s*0,\s*255)/u.test(auto.explain(layerImportant).paint.layer.color), "normal paint layer order changed beside important shape");
    assert(auto.explain(varInherit).geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY), "inherited var() shape was not resolved");
    equal(auto.explain(varFallback).geometry.shapeParameters, [-1, -1, -1, -1], "var() fallback shape was not resolved");
    assert(auto.explain(varConflict) === null, "variable shorthand/longhand conflict was partially owned");
    equal(auto.explain(logical).geometry.shapeParameters, [1, 0, 1, 1], "logical shape did not follow RTL writing direction");
    logical.dir = "ltr";
    await waitFor(() => auto.explain(logical)?.geometry.shapeParameters[0] === 0, "logical direction mutation");
    equal(auto.explain(logical).geometry.shapeParameters, [0, 1, 1, 1], "logical shape did not follow an LTR dir mutation");
    logical.dir = "rtl";
    await waitFor(() => auto.explain(logical)?.geometry.shapeParameters[1] === 0, "logical direction restoration");
    assert(auto.explain(media).geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY), "media context was lost");
    assert(auto.explain(mediaDuplicate)?.status === "active", "duplicate-selector media shape did not attach");
    assert(
      auto.explain().automatic.observation.mediaQueries.some((query) => (
        query.replace(/\s+/gu, "") === "(min-width:1px)"
      )),
      `duplicate selector suppressed its media listener: ${JSON.stringify(auto.explain().automatic.observation.mediaQueries)}`,
    );
    assert(auto.explain(supportsPositive)?.status === "active", "positive corner-shape support condition stayed false");
    assert(auto.explain(dormantLayer)?.status === "active", "inactive nested layer blocked a safe support branch");
    assert(auto.explain(supportsNegative) === null, "negative corner-shape support condition stayed true");
    assert(auto.explain(supportsInvalidNegative)?.status === "active", "invalid negative support condition stayed false");
    assert(
      Boolean(auto.explain(supportsRevertRule)) === CSS.supports("all", "revert-rule"),
      "revert-rule shape support did not follow the engine's cascade support",
    );
    assert(auto.explain(conditionalCrossSource)?.status === "active", "cross-source inline shape did not attach before a conditional refusal");
    assert(auto.explain(mixed) === null, "mixed physical/logical declarations were partially owned");
    assert(auto.explain(anonymous) === null, "unmatched anonymous-layer fixture was owned");
    equal(auto.explain(nesting).geometry.shapeParameters, [3, 3, 3, 3], "interleaved nested declarations lost cascade order");
    equal(auto.explain(nested).geometry.shapeParameters, [-1, -1, -1, -1], "nested selector was not discovered");
    equal(auto.explain(nestedMedia).geometry.shapeParameters, [0, 0, 0, 0], "nested media selector was not discovered");
    assert(auto.explain(inert) === null, "non-CSS style source was activated");
    assert(auto.explain(alternateElement) === null, "inactive alternate stylesheet was activated");
    assert(auto.explain(allReset) === null, "all: unset retained an earlier shape carrier");
    assert(auto.explain(allBefore), "shape after all: unset did not attach");
    equal(auto.explain(allBefore).geometry.shapeParameters, [0, 0, 0, 0], "shape after all: unset did not win");
    assert(auto.explain(allAfter) === null, "escaped all: unset after shape did not reset the carrier");
    assert(auto.explain(allLayer) === null, "all: unset did not reset a shape from an earlier layer");
    assert(auto.explain(allImportant) === null, "important all: unset did not reset an important shape");
    assert(auto.explain(allVar) === null, "all: var() did not transport its resolved carrier reset");
    assert(auto.explain(allVarFallback) === null, "escaped all: var() fallback did not reset shape carriers");
    assert(auto.explain(allVarImportant) === null, "important all: var() did not reset important shape carriers");
    equal(auto.explain(envShape).geometry.shapeParameters, [0, 0, 0, 0], "env() fallback shape disappeared");
    assert(auto.explain(allEnv) === null, "all: env() fallback did not reset shape carriers");
    assert(auto.explain(allVarLayer) === null, "all: var(..., revert-layer) was partially owned");
    equal(auto.explain(validHigh).geometry.shapeParameters, [0, 0, 0, 0], "losing invalid shape poisoned a valid winner");
    equal(auto.explain(validBelowInvalidImportant).geometry.shapeParameters, [-1, -1, -1, -1], "invalid important shape participated in the cascade");
    for (const { target: radiusTarget, expected } of relativeRadii) {
      equal(
        auto.explain(radiusTarget).geometry.radii,
        Array.from({ length: 4 }, () => expected[0]),
        `${radiusTarget.className} did not use the browser-resolved radius`,
      );
    }
    const baseMessages = auto.explain().errors.map(({ message }) => message).join("\n");
    assert(/variable corner-shape shorthand combined with longhands/u.test(baseMessages), "variable shorthand conflict was not reported");
    assert(/mixed physical and logical/u.test(baseMessages), "mixed declaration refusal was not reported");
    assert(/cannot safely transport this all: var/u.test(baseMessages), "unsafe all: var() result was not reported");
    const allVarErrors = auto.explain().errors.filter(({ message }) => (
      /cannot safely transport this all: var/u.test(message)
    ));
    assert(allVarErrors.length === 1, `supported all: var() resets were refused: ${JSON.stringify(allVarErrors)}`);
    const ownership = document.querySelector("style[data-cornerfill-ownership-styles]");
    const paintsBeforeRepair = auto.explain(layerNormal).counters.paints;
    const repairsBefore = auto.explain().runtime.counters.ownershipRepairs;
    ownership.remove();
    await auto.refresh();
    assert(document.querySelector("style[data-cornerfill-ownership-styles]"), "explicit refresh did not restore ownership stylesheet");
    assert(auto.explain(layerNormal).counters.paints === paintsBeforeRepair, "ownership repair repainted pixels");
    assert(auto.explain().runtime.counters.ownershipRepairs === repairsBefore + 1, "ownership repair was not counted exactly once");

    document.head.append(anonymousLayer);
    await auto.refresh();
    assert(auto.explain(layerNormal) === null, "anonymous layer did not fail automatic ownership closed");
    assert(auto.explain().automatic.ownership === "blocked-root", "anonymous layer did not expose blocked-root ownership");
    assert(
      auto.explain().errors.some(({ message }) => /anonymous cascade layer/u.test(message)),
      "anonymous layer refusal was not reported",
    );
    anonymousLayer.remove();
    await auto.refresh();
    assert(auto.explain(layerNormal)?.status === "active", "anonymous layer removal did not recover ownership");

    document.head.append(complexSupports);
    await auto.refresh();
    assert(auto.explain(complex)?.status === "active", "selector() support condition was mistaken for a corner-shape feature query");
    assert(
      !auto.explain().errors.some(({ message }) => /complex corner-shape support condition/u.test(message)),
      "selector() support condition produced a false corner-shape diagnostic",
    );

    document.head.append(
      splitSupports,
      customSupports,
      negativeCustomSupports,
      containerPaint,
    );
    await auto.refresh();
    assert(auto.explain(layerNormal) === null, "unsafe conditional source did not fail automatic ownership closed");
    assert(auto.explain(conditionalCrossSource) === null, "unsafe conditional source leaked through an inline shape source");
    assert(auto.explain(supportsCustom) === null, "support-condition custom property split semantics were admitted");
    assert(auto.explain(supportsNegativeCustom) === null, "negative support custom property leaked from the authored sheet");
    assert(auto.explain(split) === null, "split-semantics support rule was partially owned");
    const conditionalMessages = auto.explain().errors.map(({ message }) => message).join("\n");
    assert(/also declares: background/u.test(conditionalMessages), "split-semantics support rule was not refused explicitly");
    assert(/also declares: --cornerfill-test-shape/u.test(conditionalMessages), "support custom-property split was not refused explicitly");
    assert(/container-query paint dependencies/u.test(conditionalMessages), "container-query paint dependency was not refused explicitly");
    complexSupports.remove();
    splitSupports.remove();
    customSupports.remove();
    negativeCustomSupports.remove();
    containerPaint.remove();
    await auto.refresh();
    assert(auto.explain(layerNormal)?.status === "active", "conditional source removal did not recover automatic ownership");
    assert(auto.explain(conditionalCrossSource)?.status === "active", "conditional source removal did not recover inline ownership");
  } finally {
    auto.destroy();
    validStyle.remove();
    anonymousLayer.remove();
    nestedStyle.remove();
    complexSupports.remove();
    splitSupports.remove();
    customSupports.remove();
    negativeCustomSupports.remove();
    containerPaint.remove();
    inertStyle.remove();
    alternate.remove();
    for (const element of [
      layerNormal, layerImportant, varParent, varFallback, varConflict, logical, media, mediaDuplicate,
      supportsPositive, dormantLayer, supportsCustom, supportsNegativeCustom, supportsNegative, supportsInvalidNegative,
      supportsRevertRule,
      conditionalCrossSource, mixed,
      anonymous, nesting, nested, nestedMedia, complex, split, inert, alternateElement,
      allReset, allBefore, allAfter, allLayer, allImportant, allVar, allVarFallback,
      allVarImportant, envShape, allEnv, allVarLayer,
      validHigh, validBelowInvalidImportant,
      ...relativeRadii.map(({ target: radiusTarget }) => radiusTarget),
    ]) element.remove();
  }
});

await test("unpreservable cascade and namespace contexts fail ownership closed", async () => {
  const baseline = document.createElement("style");
  baseline.textContent = ".cornerfill-context-baseline{corner-shape:bevel}";
  document.head.append(baseline);
  const element = host();
  element.className = "cornerfill-context-baseline";
  const auto = installCornerfillAuto(options({ autoObserve: true, onError() {} }));
  const expectBlocked = async (source, expected) => {
    const style = document.createElement("style");
    style.textContent = source;
    document.head.append(style);
    await auto.refresh();
    assert(auto.explain(element) === null, `${expected} did not fail root ownership closed`);
    assert(auto.explain().automatic.ownership === "blocked-root", `${expected} did not expose blocked-root ownership`);
    assert(
      auto.explain().errors.some(({ message }) => message.includes(expected)),
      `${expected} did not produce its ownership diagnostic`,
    );
    style.remove();
    await auto.refresh();
    assert(auto.explain(element)?.status === "active", `${expected} removal did not recover ownership`);
  };
  try {
    await auto.ready;
    await expectBlocked(
      "@scope (.cornerfill-scope-root){.cornerfill-scoped-shape{corner-shape:scoop}}",
      "cannot preserve at-rule context: @scope",
    );
    await expectBlocked(
      '@import "data:text/css,.cornerfill-import-layer%7Bcorner-shape:scoop%7D" layer (min-width:1px);',
      "cannot preserve an anonymous @import layer",
    );
    await expectBlocked(
      '@namespace h "http://www.w3.org/1999/xhtml";h|div.cornerfill-namespaced{corner-shape:scoop}',
      "cannot preserve @namespace selector bindings",
    );
    await expectBlocked(
      "*|div.cornerfill-namespaced-unbound{corner-shape:scoop}",
      "cannot discover namespace-qualified selector matches",
    );
  } finally {
    auto.destroy();
    baseline.remove();
    element.remove();
  }
});

await test("automatic CSP nonce keeps every generated stylesheet active", async () => {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-1000px;top:0;width:40px;height:40px";
  const linkedCss = encodeURIComponent(
    ".cornerfill-csp-linked{width:12px;height:10px;background:green;border-radius:5px;corner-shape:scoop}",
  );
  frame.srcdoc = `
    <meta http-equiv="Content-Security-Policy" content="style-src 'nonce-cornerfill-csp' 'self'">
    <link id="cornerfill-csp-link" rel="stylesheet" nonce="cornerfill-csp"
      href="/bench/imports/delayed-runtime.css?css=${linkedCss}">
    <style nonce="cornerfill-csp">
      .cornerfill-csp-fixture{width:12px;height:10px;background:red;border-radius:5px;corner-shape:bevel}
    </style>
    <style id="cornerfill-csp-unavailable" nonce="cornerfill-csp">
      @import "/bench/imports/child.css" supports(display: cornerfill-impossible);
      .cornerfill-csp-unavailable{width:12px;height:10px;background:blue;border-radius:5px;corner-shape:notch}
    </style>
    <div class="cornerfill-csp-fixture"></div>
    <div class="cornerfill-csp-linked"></div>
    <div class="cornerfill-csp-unavailable"></div>
  `;
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  await loaded;
  const frameDocument = frame.contentDocument;
  const element = frameDocument.querySelector(".cornerfill-csp-fixture");
  const linkedElement = frameDocument.querySelector(".cornerfill-csp-linked");
  const linkedOwner = frameDocument.querySelector("#cornerfill-csp-link");
  linkedOwner.nonce = "stale-owner-nonce";
  const unavailableStyle = frameDocument.querySelector("#cornerfill-csp-unavailable");
  const unavailableElement = frameDocument.querySelector(".cornerfill-csp-unavailable");
  // CSP-blocked style elements expose this same observable state. Override the
  // getter so the regression can exercise that authority gate without making
  // an intentional CSP violation fail the strict console-error harness.
  Object.defineProperty(unavailableStyle, "sheet", { configurable: true, value: null });
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    document: frameDocument,
    nativeQualification: qualifyNativeCornerShape(frameDocument),
    nonce: "cornerfill-csp",
    stylesheetTimeoutMs: 25,
  }));
  try {
    await auto.ready;
    assert(auto.explain(element)?.status === "active", "nonce-authorized automatic fixture was not owned");
    assert(auto.explain(linkedElement)?.status === "active", "explicit nonce did not override the stale link nonce");
    assert(
      linkedOwner.nextElementSibling?.nonce === "cornerfill-csp",
      "linked carrier companion preferred the owner nonce over the explicit nonce",
    );
    assert(unavailableStyle.sheet === null, "unavailable authored stylesheet fixture exposed a sheet");
    assert(auto.explain(unavailableElement) === null, "a sheet-unavailable authored stylesheet was laundered through the generated nonce");
    const reads = auto.explain().automatic.counters.sourceReads;
    await auto.refresh();
    assert(
      auto.explain().automatic.counters.sourceReads === reads,
      "a known sheet-unavailable source repeated its readiness wait without retryFailed",
    );
    const generated = [...frameDocument.querySelectorAll("style[data-cornerfill-auto-styles]")];
    assert(generated.length === 3 && generated.every((style) => style.nonce === "cornerfill-csp" && style.sheet), "generated automatic styles lost the CSP nonce");
    assert(frameDocument.querySelector("style[data-cornerfill-ownership-styles]")?.nonce === "cornerfill-csp", "ownership stylesheet lost the CSP nonce");
  } finally {
    auto.destroy();
    frame.remove();
  }
});

await test("failed carrier registration does not poison a later controller", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLStyleElement.prototype, "sheet");
  assert(descriptor?.get, "HTMLStyleElement.sheet getter was unavailable");
  Object.defineProperty(HTMLStyleElement.prototype, "sheet", {
    configurable: true,
    get() {
      if (this.nonce === "cornerfill-bad-registration"
        && this.getAttribute("data-cornerfill-auto-styles") === "properties") return null;
      return descriptor.get.call(this);
    },
  });
  const bad = installCornerfillAuto(options({
    autoObserve: false,
    nonce: "cornerfill-bad-registration",
  }));
  let failure = null;
  try {
    await bad.ready;
  } catch (error) {
    failure = error;
  } finally {
    Object.defineProperty(HTMLStyleElement.prototype, "sheet", descriptor);
  }
  assert(failure, "injected carrier registration failure was not observed");
  let refreshFailure = null;
  try { await bad.refresh(); } catch (error) { refreshFailure = error; }
  assert(/controller is destroyed/u.test(refreshFailure?.message ?? ""), "failed automatic startup remained live");
  assert(
    ![...document.querySelectorAll('style[data-cornerfill-auto-styles="properties"]')]
      .some((style) => style.nonce === "cornerfill-bad-registration"),
    "failed automatic startup retained its carrier registration",
  );
  const good = installCornerfillAuto(options({
    autoObserve: false,
    nonce: "cornerfill-good-registration",
  }));
  try {
    await good.ready;
    const registration = [...document.querySelectorAll('style[data-cornerfill-auto-styles="properties"]')]
      .find((style) => style.nonce === "cornerfill-good-registration");
    assert(registration?.sheet, "later valid controller reused poisoned registration state");
  } finally {
    good.destroy();
    bad.destroy();
  }
});

await test("generic authored CSS changes repaint and unsupported semantics fail closed", async () => {
  const style = document.createElement("style");
  style.textContent = `
    .cornerfill-authored-dynamic{width:12px;height:10px;border-radius:6px;background:red}
    .cornerfill-authored-dynamic.changed{border-radius:0;background:blue}
  `;
  document.head.append(style);
  const element = document.createElement("div");
  element.className = "cornerfill-authored-dynamic";
  document.body.append(element);
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(element, { cornerShape: "bevel" });
  await handle.ready;
  element.classList.add("changed");
  await waitFor(() => /(?:blue|0,\s*0,\s*255)/u.test(
    handle.explain().paint?.layer?.color ?? "",
  ), "generic authored paint refresh");
  assert(handle.explain().geometry.radii.every(({ rx, ry }) => rx === 0 && ry === 0), "generic authored radius stayed frozen");
  const paintsBeforeStylesheetEdit = handle.explain().counters.paints;
  style.textContent = `
    .cornerfill-authored-dynamic{width:12px;height:10px;border-radius:6px;background:red}
    .cornerfill-authored-dynamic.changed{border-radius:0;background:green}
  `;
  await waitFor(() => /(?:green|0,\s*128,\s*0)/u.test(
    handle.explain().paint?.layer?.color ?? "",
  ), "generic stylesheet source refresh");
  assert(handle.explain().counters.paints === paintsBeforeStylesheetEdit + 1, "stylesheet source edit did not repaint exactly once");

  const gradient = document.createElement("div");
  gradient.className = "cornerfill-gradient-position";
  Object.assign(gradient.style, {
    width: "12px",
    height: "10px",
    backgroundImage: "linear-gradient(to right, red, blue)",
    backgroundPosition: "0px 0px",
  });
  document.body.append(gradient);
  const gradientHandle = controller.attach(gradient, {
    borderRadius: "5px",
    cornerShape: "bevel",
  });
  await gradientHandle.ready;
  const gradientPaints = gradientHandle.explain().counters.paints;
  gradient.style.backgroundPositionX = "3px";
  await waitFor(() => gradientHandle.explain().counters.paints === gradientPaints + 1, "gradient position-axis refresh");
  gradientHandle.dispose();
  gradient.remove();

  element.style.overflow = "hidden";
  const child = document.createElement("span");
  child.textContent = "foreground";
  element.append(child);
  await waitFor(() => /descendant overflow clip/u.test(handle.explain().error ?? ""), "dynamic overflow refusal");
  assert(!element.hasAttribute("data-cornerfill-owned"), "unsupported overflow retained false fallback paint");
  let verifyError = null;
  try { handle.verify(); } catch (error) { verifyError = error; }
  assert(/descendant overflow clip/u.test(verifyError?.message ?? ""), "verify hid the current dynamic error");
  const unrelated = document.createElement("div");
  document.body.append(unrelated);
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  assert(!element.hasAttribute("data-cornerfill-owned"), "lifecycle repair reattached stale pixels after a failed refresh");
  unrelated.remove();
  child.remove();
  element.style.overflow = "visible";
  await waitFor(() => handle.explain().status === "active", "overflow refusal recovery");

  element.style.border = "2px solid transparent";
  element.style.borderImageSource = "linear-gradient(red, blue)";
  await waitFor(() => /border-image/u.test(handle.explain().error ?? ""), "border-image refusal");
  element.style.borderImageSource = "none";
  await waitFor(() => handle.explain().status === "active", "border-image refusal recovery");

  element.textContent = "foreground";
  element.style.outline = "1px solid red";
  element.style.outlineOffset = "-1px";
  await waitFor(() => /empty, paint-owned host/u.test(handle.explain().error ?? ""), "foreground outline refusal");
  handle.dispose();
  controller.destroy();
  element.remove();
  style.remove();
});

await test("disposed generic initialization cannot resurrect", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#f00" },
  });
  handle.dispose();
  const explanation = await handle.ready;
  assert(explanation.status === "disposed", "generic ready must resolve disposed");
  assert(controller.stats().entries === 0 && controller.stats().surfaces === 0, "generic dispose leaked runtime state");
  assert(!element.hasAttribute("data-cornerfill-owned"), "generic dispose resurrected ownership");
  controller.destroy();
  element.remove();
});

await test("failed initialization releases its entry claim and budget", async () => {
  const failedElement = host();
  const recoveredElement = host();
  const controller = installCornerfill(options({
    maxActiveEntries: 1,
    maxTotalSurfacePixels: 100,
  }));
  const failed = controller.attachPrepared(failedElement, {
    size: [11, 10],
    dpr: 1,
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  });
  let error = null;
  try { await failed.ready; } catch (caught) { error = caught; }
  assert(/aggregate surface allocation/u.test(error?.message ?? ""), "initialization fixture did not exhaust the pixel budget");
  assert(
    controller.stats().entries === 0 && controller.stats().activeFallbackEntries === 0,
    "failed initialization retained an entry or fallback budget claim",
  );
  assert(failed.explain().status === "disposed" && failed.explain().error, "failed handle lost its terminal error");
  const recovered = controller.attachPrepared(recoveredElement, {
    size: [10, 10],
    dpr: 1,
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "blue" },
  });
  await recovered.ready;
  assert(recovered.explain().status === "active", "released entry budget did not admit later valid work");
  recovered.dispose();
  controller.destroy();
  failedElement.remove();
  recoveredElement.remove();
});

await test("deferred prepared ownership failure rolls back its live surface", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    ...preparedConfig(),
    paintActive: false,
    deferInactiveSurface: true,
  });
  await handle.ready;
  assert(controller.stats().surfaces === 0, "deferred prepared fixture allocated early");
  const originalAssert = controller.ownership.assertStylesApplied;
  controller.ownership.assertStylesApplied = () => {
    throw new Error("injected deferred ownership verification failure");
  };
  let error = null;
  try {
    controller.updatePreparedBatch([{ element, paintActive: true }]);
  } catch (caught) {
    error = caught;
  } finally {
    controller.ownership.assertStylesApplied = originalAssert;
  }
  assert(/injected deferred ownership/u.test(error?.message ?? ""), "deferred ownership failure was hidden");
  assert(
    controller.stats().surfaces === 0 && controller.stats().surfacePixels === 0,
    "failed deferred ownership retained an accounted surface",
  );
  assert(
    controller.ownership.surfaces.size === 0 && controller.ownership.surfaceRules.size === 0,
    "failed deferred ownership retained a live-image record",
  );
  assert(!element.hasAttribute("data-cornerfill-owned"), "failed deferred ownership retained host ownership");
  await handle.resize({ size: [13, 10] });
  assert(handle.explain().status === "active", "deferred ownership rollback could not recover through resize");
  assert(
    controller.stats().counters.deferredSurfaceEntries === 0,
    "resize recovery retained stale deferred-surface accounting",
  );
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("failed prepared in-place paint releases ownership and reuses its surface", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const image = raster(12, 10);
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    border: { width: 2, color: "blue" },
    paint: {
      kind: "image",
      image,
      backgroundSize: [12, 10],
      backgroundPosition: [0, 0],
      clip: "content-box",
      box: { border: 2, padding: 2 },
      repeat: "no-repeat",
      opaque: true,
    },
  });
  await handle.ready;
  const entry = controller.entryByElement.get(element);
  const context = entry.surface.context;
  const descriptor = Object.getOwnPropertyDescriptor(context, "drawImage");
  const originalDrawImage = context.drawImage;
  Object.defineProperty(context, "drawImage", {
    configurable: true,
    value() { throw new Error("injected prepared in-place paint failure"); },
  });
  const surfaceId = handle.explain().surface.id;
  let error = null;
  try {
    await handle.refresh();
  } catch (caught) {
    error = caught;
  } finally {
    if (descriptor) Object.defineProperty(context, "drawImage", descriptor);
    else delete context.drawImage;
  }
  assert(/injected prepared in-place/u.test(error?.message ?? ""), "prepared paint failure was hidden");
  assert(!element.hasAttribute("data-cornerfill-owned"), "failed prepared paint retained ownership");
  assert(
    controller.ownership.surfaces.size === 0 && controller.ownership.surfaceRules.size === 0,
    "failed prepared paint retained a live-image ownership record",
  );
  assert(
    controller.stats().surfaces === 1 && handle.explain().surface.id === surfaceId,
    "failed prepared paint discarded its retry surface",
  );
  await handle.refresh();
  assert(handle.explain().status === "active", "prepared paint did not recover on its retained surface");
  assert(element.hasAttribute("data-cornerfill-owned"), "prepared recovery did not restore ownership");
  assert(
    context.getImageData(6, 1, 1, 1).data[3] > 0,
    "prepared retry retained a stale content-box clip over its border",
  );
  assert(context.drawImage === originalDrawImage, "prepared paint test did not restore the Canvas method");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("prepared verification cannot join a batch after its final check", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const originalAssert = controller.ownership.assertStylesApplied;
  let checks = 0;
  let lateVerification = null;
  controller.ownership.assertStylesApplied = (entry) => {
    checks += 1;
    const result = originalAssert.call(controller.ownership, entry);
    if (checks === 1) {
      queueMicrotask(() => {
        lateVerification = controller.ownership.verifyPrepared(entry, () => true);
      });
    }
    return result;
  };
  const handle = controller.attachPrepared(element, preparedConfig());
  try {
    await handle.ready;
    await waitFor(() => lateVerification !== null, "late prepared verification registration");
    await lateVerification;
    assert(checks === 2, "late prepared verification joined an already-settled batch");
  } finally {
    controller.ownership.assertStylesApplied = originalAssert;
    handle.dispose();
    controller.destroy();
    element.remove();
  }
});

await test("destroy settles WebKit verification while animation frames are suspended", async () => {
  if (backend !== "webkit-canvas") return;
  const element = host();
  const controller = installCornerfill(options());
  const originalAssert = controller.ownership.assertStylesApplied;
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalSetTimeout = window.setTimeout.bind(window);
  let releaseFirstAttempt;
  const firstAttempt = new Promise((resolve) => { releaseFirstAttempt = resolve; });
  let attempts = 0;
  controller.ownership.assertStylesApplied = (entry) => {
    attempts += 1;
    if (attempts === 1) {
      releaseFirstAttempt();
      throw new Error("injected first WebKit verification failure");
    }
    return originalAssert.call(controller.ownership, entry);
  };
  window.requestAnimationFrame = () => 1;
  const handle = controller.attachPrepared(element, preparedConfig());
  try {
    await firstAttempt;
    controller.destroy();
    const explanation = await Promise.race([
      handle.ready,
      new Promise((_, reject) => originalSetTimeout(
        () => reject(new Error("destroyed prepared verification did not settle")),
        100,
      )),
    ]);
    assert(explanation.status === "disposed", "destroyed verification did not resolve disposed");
  } finally {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    controller.ownership.assertStylesApplied = originalAssert;
    controller.destroy();
    element.remove();
  }
});

await test("prepared entries do not retain dynamic root observation", async () => {
  const dynamicElement = host();
  const preparedElement = host();
  const controller = installCornerfill(options({ observe: true }));
  const prepared = controller.attachPrepared(preparedElement, preparedConfig());
  const dynamic = controller.attach(dynamicElement, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  });
  await Promise.all([prepared.ready, dynamic.ready]);
  assert(controller.rootObservers.has(document), "dynamic attachment did not install root observation");
  dynamic.dispose();
  assert(!controller.rootObservers.has(document), "prepared attachment retained dynamic root observation");
  assert(controller.observedRootCounts.size === 0, "dynamic root reference survived its last dynamic entry");
  assert(controller.ownershipRootCounts.get(document) === 1, "prepared ownership root reference was lost");
  const replacement = controller.attach(dynamicElement, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "blue" },
  });
  await replacement.ready;
  assert(controller.rootObservers.has(document), "dynamic root observation was not reinstallable");
  replacement.dispose();
  prepared.dispose();
  controller.destroy();
  dynamicElement.remove();
  preparedElement.remove();
});

await test("physical and logical declaration carriers resolve on the retained element", async () => {
  const element = host();
  element.style.direction = "rtl";
  element.style.setProperty("--cornerfill-border-radius", "2px");
  element.style.setProperty("--cornerfill-border-top-left-radius", "3px 4px");
  element.style.setProperty("--cornerfill-border-start-start-radius", "5px 6px");
  element.style.setProperty("--cornerfill-corner-shape", "round");
  element.style.setProperty("--cornerfill-corner-top-left-shape", "bevel");
  element.style.setProperty("--cornerfill-corner-start-start-shape", "scoop");
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(element, {
    paint: { kind: "solid", color: "#f00" },
  });
  await handle.ready;
  const geometry = handle.explain().geometry;
  equal(geometry.radii, [
    { rx: 3, ry: 4 },
    { rx: 5, ry: 6 },
    { rx: 2, ry: 2 },
    { rx: 2, ry: 2 },
  ], "declaration radius carriers mapped incorrectly");
  equal(geometry.shapeParameters, [0, -1, 1, 1], "declaration shape carriers mapped incorrectly");
  const paintsBeforeInterpolation = handle.explain().counters.paints;
  await handle.interpolateCornerShape("scoop", "squircle", 0.5);
  const interpolated = handle.explain();
  assert(interpolated.geometry.shapeParameters.every((value) => (
    Math.abs(value - 0.28833415474651186) < 1e-12
  )), "interpolated shape did not use diagonal coordinates");
  assert(interpolated.counters.paints === paintsBeforeInterpolation + 1, "changed interpolation did not repaint once");
  await handle.interpolateCornerShape("scoop", "squircle", 0.5);
  assert(handle.explain().counters.paints === interpolated.counters.paints, "unchanged interpolation repainted");
  const dataShape = host();
  dataShape.setAttribute("data-cornerfill-shape", "bevel");
  const dataHandle = controller.attach(dataShape, {
    borderRadius: "5px",
    paint: { kind: "solid", color: "#0af" },
  });
  await dataHandle.ready;
  dataShape.setAttribute("data-cornerfill-shape", "scoop");
  await waitFor(
    () => dataHandle.explain().geometry.shapeParameters.every((value) => value === -1),
    "data corner-shape refresh without an initial carrier",
  );
  dataShape.removeAttribute("data-cornerfill-shape");
  await waitFor(
    () => dataHandle.explain().geometry.shapeParameters.every((value) => value === 1),
    "data corner-shape removal",
  );
  dataHandle.dispose();
  dataShape.remove();
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("raster repeat respects content-box origin and clip", async () => {
  const element = host();
  Object.assign(element.style, { boxSizing: "border-box", padding: "2px" });
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "4px",
    cornerShape: "bevel",
    paint: {
      kind: "image",
      image: raster(2, 2),
      backgroundSize: [2, 2],
      backgroundPosition: [0, 0],
      backgroundOrigin: "content-box",
      backgroundClip: "content-box",
      repeat: "repeat",
    },
  });
  await handle.ready;
  const layer = handle.explain().paint.layer;
  assert(layer.tilesDrawn === 12, `content-box repeat drew ${layer.tilesDrawn} tiles instead of 12`);
  equal(layer.destinationRect, [2, 2, 2, 2], "content-box tile origin was wrong");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("mixed raster and CSS gradient layers paint in one owned surface", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "4px",
    cornerShape: "bevel",
    paint: {
      kind: "layers",
      color: "#102030",
      layers: [
        { kind: "linear-gradient", css: "linear-gradient(to right, rgba(255,0,0,.6), rgba(0,0,255,.2))" },
        { kind: "radial-gradient", css: "radial-gradient(circle closest-side at 30% 60%, white 0%, transparent 100%)" },
        { kind: "conic-gradient", css: "conic-gradient(from 45deg, red 0deg, lime 120deg, blue 1turn)" },
        {
          kind: "image",
          image: raster(2, 2),
          backgroundSize: [2, 2],
          backgroundPosition: [0, 0],
          repeat: "repeat",
        },
      ],
    },
  });
  await handle.ready;
  const painted = handle.explain().paint.layer;
  equal(painted.layers.map(({ kind }) => kind), [
    "linear-gradient",
    "radial-gradient",
    "conic-gradient",
    "image",
  ], "background layer order changed");
  assert(painted.layers[3].tilesDrawn === 30, "bottom raster layer did not repeat across the surface");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("unequal solid borders use the shaped inner contour", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "5px 4px 3px 2px",
    cornerShape: "squircle bevel scoop notch",
    paint: { kind: "solid", color: "#246" },
    border: { width: [1, 2, 3, 1], color: "#fed" },
  });
  await handle.ready;
  const explanation = handle.explain();
  equal(explanation.border.widths, [1, 2, 3, 1], "unequal border widths were not retained");
  assert(explanation.paint.border.kind === "solid-shaped-ring", "border did not use the shaped ring painter");
  handle.dispose();

  const unsupported = host();
  let rejection = null;
  try {
    controller.attach(unsupported, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
      border: { width: 1, color: ["red", "blue", "red", "blue"] },
    });
  } catch (error) {
    rejection = error;
  }
  assert(/per-side colors/u.test(rejection?.message ?? ""), "per-side border colors did not fail explicitly");
  controller.destroy();
  element.remove();
  unsupported.remove();
});

await test("contained inset shadow and outline are owned shaped rings", async () => {
  const element = host();
  element.style.boxShadow = "inset 0 0 0 2px rgba(255, 0, 0, 0.7)";
  element.style.outline = "2px solid rgb(0, 255, 255)";
  element.style.outlineOffset = "-2px";
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "scoop",
    paint: { kind: "solid", color: "#246" },
  });
  await handle.ready;
  const explanation = handle.explain();
  assert(explanation.paint.shadow.kind === "inset-solid-ring", "inset shadow was not painted as a ring");
  assert(explanation.paint.outline.kind === "contained-solid-ring", "outline was not painted as a ring");
  assert(element.hasAttribute("data-cornerfill-owned-shadow"), "painted shadow was not claimed");
  assert(element.hasAttribute("data-cornerfill-owned-outline"), "painted outline was not claimed");
  assert(getComputedStyle(element).boxShadow === "none", "native box shadow remained visible");
  assert(getComputedStyle(element).outlineStyle === "none", "native outline remained visible");
  handle.dispose();
  assert(!element.hasAttribute("data-cornerfill-owned-shadow"), "shadow ownership survived teardown");
  assert(!element.hasAttribute("data-cornerfill-owned-outline"), "outline ownership survived teardown");

  const unsupported = host();
  unsupported.style.boxShadow = "0 0 2px red";
  let rejection = null;
  try {
    controller.attach(unsupported, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    rejection = error;
  }
  assert(/cannot paint beyond the border box/u.test(rejection?.message ?? ""), "outer shadow did not fail explicitly");
  controller.destroy();
  element.remove();
  unsupported.remove();
});

await test("overlapping animations with the same name retain independent activity", async () => {
  const element = host();
  Object.defineProperty(element, "getAnimations", {
    configurable: true,
    value: () => [{
      animationName: "cornerfill-shared-name",
      effect: { getKeyframes: () => [{ "background-color": "red" }] },
    }],
  });
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  });
  await handle.ready;
  const entry = controller.entryByElement.get(element);
  const animationEvent = (type) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "animationName", { value: "cornerfill-shared-name" });
    return event;
  };
  element.dispatchEvent(animationEvent("animationstart"));
  element.dispatchEvent(animationEvent("animationstart"));
  assert(
    controller.activeAnimations.get(entry)?.get("animation:cornerfill-shared-name") === 2,
    "same-name animation starts collapsed into one activity token",
  );
  element.dispatchEvent(animationEvent("animationend"));
  assert(
    controller.activeAnimations.get(entry)?.get("animation:cornerfill-shared-name") === 1,
    "the first same-name animation end stopped the remaining animation",
  );
  element.dispatchEvent(animationEvent("animationend"));
  assert(!controller.activeAnimations.has(entry), "the final same-name animation token was retained");
  await new Promise(requestAnimationFrame);
  controller.destroy();
  element.remove();
});

await test("transform-only animation completion does not repaint after engine animation eviction", async () => {
  const element = host();
  let running = true;
  Object.defineProperty(element, "getAnimations", {
    configurable: true,
    value: () => running ? [{
      animationName: "cornerfill-transform-only",
      effect: { getKeyframes: () => [{ transform: "translateX(0)" }, { transform: "translateX(1px)" }] },
    }] : [],
  });
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  });
  await handle.ready;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const before = handle.explain().counters;
  const event = (type) => {
    const value = new Event(type, { bubbles: true });
    Object.defineProperty(value, "animationName", { value: "cornerfill-transform-only" });
    return value;
  };
  element.dispatchEvent(event("animationstart"));
  running = false;
  element.dispatchEvent(event("animationend"));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  equal(handle.explain().counters, before, "transform-only animation lifecycle ran fallback work");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("an unobserved custom-property transition end refreshes final pixels", async () => {
  const element = host();
  element.style.setProperty("--cornerfill-test-paint", "red");
  element.style.background = "var(--cornerfill-test-paint)";
  const controller = installCornerfill(options({ observe: false }));
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
  });
  await handle.ready;
  const paints = handle.explain().counters.paints;
  element.style.setProperty("--cornerfill-test-paint", "blue");
  controller._onAnimationEnd({
    target: element,
    type: "transitionend",
    propertyName: "--cornerfill-test-paint",
  });
  await waitFor(() => (
    handle.explain().counters.paints === paints + 1
    && /(?:blue|0,\s*0,\s*255)/u.test(handle.explain().paint?.layer?.color ?? "")
  ), "custom-property transition final refresh");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("logical box and admissibility transition ends refresh final state", async () => {
  const element = host();
  element.style.backgroundOrigin = "content-box";
  element.style.paddingInlineStart = "1px";
  const controller = installCornerfill(options({ observe: false }));
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  });
  await handle.ready;
  const initialPaints = handle.explain().counters.paints;
  element.style.paddingInlineStart = "3px";
  controller._onAnimationEnd({
    target: element,
    type: "transitionend",
    propertyName: "padding-inline-start",
  });
  await waitFor(
    () => handle.explain().counters.paints === initialPaints + 1,
    "logical padding transition final refresh",
  );
  element.style.backdropFilter = "blur(1px)";
  controller._onAnimationEnd({
    target: element,
    type: "transitionend",
    propertyName: "backdrop-filter",
  });
  await waitFor(
    () => /backdrop-filter/u.test(handle.explain().error ?? ""),
    "admissibility transition final refusal",
  );
  element.style.removeProperty("backdrop-filter");
  controller._onAnimationEnd({
    target: element,
    type: "transitionend",
    propertyName: "backdrop-filter",
  });
  await waitFor(() => handle.explain().status === "active", "admissibility transition recovery");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("native composition stays on the host and semantic-only boxes refuse fallback", async () => {
  const style = document.createElement("style");
  style.textContent = ".cornerfill-composition::before{content:'';position:absolute;inset:2px;background:rgba(255,255,255,.1)}.cornerfill-composition.checked{isolation:isolate}";
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-composition";
  Object.assign(element.style, {
    position: "relative",
    opacity: "0.7",
    filter: "opacity(0.9)",
    mixBlendMode: "multiply",
    isolation: "isolate",
    zIndex: "3",
    transform: "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,2,3,0,1)",
  });
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(element, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#246" },
  });
  await handle.ready;
  const initial = handle.explain();
  const computed = getComputedStyle(element);
  assert(computed.opacity === "0.7", "host opacity was overwritten");
  assert(computed.filter === "opacity(0.9)", "host filter was overwritten");
  assert(computed.mixBlendMode === "multiply", "host blend context was overwritten");
  assert(getComputedStyle(element, "::before").content !== "none", "host pseudo-element disappeared");
  assert(initial.composition.transform === "browser-compositor", "composition capability was not reported");

  element.style.transform = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,4,5,0,1)";
  element.style.opacity = "0.6";
  element.style.filter = "opacity(0.8)";
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  assert(handle.explain().counters.paints === initial.counters.paints, "compositor-only style changes repainted");
  const checksBeforeClass = handle.explain().counters.styleChecks;
  element.classList.add("checked");
  await waitFor(() => handle.explain().counters.styleChecks > checksBeforeClass, "composition class check");
  assert(handle.explain().counters.paints === initial.counters.paints, "composition-only class change repainted");
  handle.dispose();

  const replaced = document.createElement("img");
  Object.assign(replaced.style, { width: "12px", height: "10px" });
  document.body.append(replaced);
  let replacedError = null;
  try {
    controller.attach(replaced, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    replacedError = error;
  }
  assert(/replaced-element pixels/u.test(replacedError?.message ?? ""), "replaced host did not fail explicitly");

  const overflow = host();
  overflow.style.overflow = "hidden";
  let overflowError = null;
  try {
    controller.attach(overflow, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    overflowError = error;
  }
  assert(/descendant overflow clip/u.test(overflowError?.message ?? ""), "overflow host did not fail explicitly");

  const shadowOverflow = host();
  shadowOverflow.style.overflow = "hidden";
  shadowOverflow.attachShadow({ mode: "open" });
  let shadowOverflowError = null;
  try {
    controller.attach(shadowOverflow, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    shadowOverflowError = error;
  }
  assert(/descendant overflow clip/u.test(shadowOverflowError?.message ?? ""), "an open shadow root bypassed overflow refusal");

  const shadowOutline = host();
  shadowOutline.attachShadow({ mode: "open" });
  let shadowOutlineError = null;
  try {
    const shadowOutlineHandle = controller.attach(shadowOutline, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
      outline: { width: 2, offset: -2, color: "red", style: "solid" },
    });
    await shadowOutlineHandle.ready;
  } catch (error) {
    shadowOutlineError = error;
  }
  assert(/empty, paint-owned host/u.test(shadowOutlineError?.message ?? ""), "an empty open shadow root bypassed contained-outline refusal");

  const marker = document.createElement("li");
  Object.assign(marker.style, { width: "12px", height: "10px", overflow: "hidden" });
  document.body.append(marker);
  let markerError = null;
  try {
    controller.attach(marker, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    markerError = error;
  }
  assert(/descendant overflow clip/u.test(markerError?.message ?? ""), "list marker bypassed overflow refusal");

  const fragmentContainer = document.createElement("div");
  fragmentContainer.style.width = "42px";
  const fragmented = document.createElement("span");
  fragmented.textContent = "one two three four";
  fragmentContainer.append(fragmented);
  document.body.append(fragmentContainer);
  assert(fragmented.getClientRects().length > 1, "fragment fixture did not create multiple boxes");
  let fragmentError = null;
  try {
    controller.attach(fragmented, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    fragmentError = error;
  }
  assert(/multi-fragment/u.test(fragmentError?.message ?? ""), "fragmented host did not fail explicitly");

  const button = document.createElement("button");
  Object.assign(button.style, { width: "12px", height: "10px", appearance: "auto" });
  document.body.append(button);
  let appearanceError = null;
  try {
    controller.attach(button, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    appearanceError = error;
  }
  assert(/root\/body propagation, native appearance/u.test(appearanceError?.message ?? ""), "native appearance host did not fail explicitly");

  const table = document.createElement("table");
  Object.assign(table.style, { width: "12px", height: "10px", borderCollapse: "collapse" });
  const collapsedCell = table.insertRow().insertCell();
  collapsedCell.textContent = "x";
  document.body.append(table);
  let collapsedBorderError = null;
  try {
    controller.attach(table, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    collapsedBorderError = error;
  }
  assert(/collapsed-table border painting/u.test(collapsedBorderError?.message ?? ""), "collapsed-border host did not fail explicitly");
  const ordinaryTableDescendant = host(collapsedCell);
  const ordinaryDescendantHandle = controller.attach(ordinaryTableDescendant, {
    borderRadius: "4px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#246" },
  });
  await ordinaryDescendantHandle.ready;
  assert(ordinaryDescendantHandle.explain().status === "active", "inherited border-collapse rejected an ordinary descendant");
  ordinaryDescendantHandle.dispose();

  const frame = document.createElement("iframe");
  frame.srcdoc = "<!doctype html><body style='width:12px;height:10px'></body>";
  const frameLoaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  await frameLoaded;
  const frameController = installCornerfill({
    document: frame.contentDocument,
    forceFallback: true,
    backend: "static-data-url",
    staticFallback: true,
    observe: false,
  });
  let bodyError = null;
  try {
    frameController.attach(frame.contentDocument.body, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    bodyError = error;
  }
  assert(/root\/body propagation/u.test(bodyError?.message ?? ""), "body background propagation host did not fail explicitly");
  frameController.destroy();

  controller.destroy();
  style.remove();
  element.remove();
  replaced.remove();
  overflow.remove();
  shadowOverflow.remove();
  shadowOutline.remove();
  marker.remove();
  fragmentContainer.remove();
  button.remove();
  table.remove();
  frame.remove();
});

await test("disposed prepared initialization cannot resurrect", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#f00" },
  });
  handle.dispose();
  const explanation = await handle.ready;
  assert(explanation.status === "disposed", "prepared ready must resolve disposed");
  assert(controller.stats().entries === 0 && controller.stats().surfaces === 0, "prepared dispose leaked runtime state");
  assert(!element.hasAttribute("data-cornerfill-owned"), "prepared dispose resurrected ownership");
  controller.destroy();
  element.remove();
});

await test("pre-ready prepared operations serialize immutable caller input", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const borderRadius = [
    { rx: 6, ry: 6 },
    { rx: 6, ry: 6 },
    { rx: 6, ry: 6 },
    { rx: 6, ry: 6 },
  ];
  const initialPosition = [0, 0];
  const initialSize = [32, 32];
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius,
    cornerShape: [0, 0, 0, 0],
    paint: {
      kind: "image",
      image: raster(32, 32),
      backgroundSize: initialSize,
      backgroundPosition: initialPosition,
      repeat: "no-repeat",
      opaque: true,
    },
  });
  const crop = [-1, 0];
  const update = handle.update({ backgroundPosition: crop });
  const refresh = handle.refresh();
  const nextSize = [13, 13];
  const nextShape = [0, 0, 0, 0];
  const resize = handle.resize({ size: nextSize, cornerShape: nextShape });

  borderRadius[0].rx = 99;
  initialPosition[0] = 99;
  initialSize[0] = 99;
  crop[0] = 99;
  nextSize[0] = 99;
  nextShape[0] = 1;

  await Promise.all([handle.ready, update, refresh, resize]);
  const explanation = handle.explain();
  equal(
    [explanation.geometry.width, explanation.geometry.height],
    [13, 13],
    "queued resize read a later caller mutation",
  );
  equal(explanation.geometry.shapeParameters, [0, 0, 0, 0], "queued shape read a later caller mutation");
  equal(explanation.prepared.backgroundPosition, [-1, 0], "queued crop read a later caller mutation");
  assert(explanation.geometry.radii[0].rx === 6, "initial radius read a later caller mutation");

  const disposedElement = host();
  const disposedHandle = controller.attachPrepared(disposedElement, preparedConfig());
  const queuedResize = disposedHandle.resize({ size: [13, 10] });
  disposedHandle.dispose();
  const disposedResize = await queuedResize;
  assert(disposedResize.status === "disposed", "cancelled queued resize rejected instead of settling disposed");

  handle.dispose();
  controller.destroy();
  element.remove();
  disposedElement.remove();
});

await test("async refresh commits only the newest revision", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#f00" },
  });
  await handle.ready;
  const originalDecode = Image.prototype.decode;
  const gates = new Map();
  Image.prototype.decode = function decodeWithGate() {
    const image = this;
    return originalDecode.call(image).then(() => new Promise((resolve) => gates.set(image.src, resolve)));
  };
  try {
    const firstUrl = raster(2, 2, "#f00").toDataURL();
    const secondUrl = raster(3, 3, "#0f0").toDataURL();
    const paint = (url) => ({
      kind: "image",
      url,
      backgroundSize: [12, 10],
      backgroundPosition: [0, 0],
      repeat: "no-repeat",
      opaque: true,
    });
    const first = handle.update({ paint: paint(firstUrl) });
    await waitFor(() => gates.has(firstUrl), "first image decode gate");
    const second = handle.update({ paint: paint(secondUrl) });
    gates.get(firstUrl)();
    await waitFor(() => gates.has(secondUrl), "second image decode gate");
    gates.get(secondUrl)();
    await Promise.all([first, second]);
    equal(handle.explain().paint.layer.imageSize, [3, 3], "stale image revision won");
    assert(handle.explain().counters.paints === 2, "stale refresh performed a visible paint");
  } finally {
    Image.prototype.decode = originalDecode;
    handle.dispose();
    controller.destroy();
    element.remove();
  }
});

await test("position invalidation cannot downgrade an in-flight full refresh", async () => {
  const element = host();
  const firstUrl = raster(2, 2, "#f00").toDataURL();
  const secondUrl = raster(3, 3, "#0f0").toDataURL();
  Object.assign(element.style, {
    backgroundColor: "transparent",
    backgroundImage: `url(${JSON.stringify(firstUrl)})`,
    backgroundPosition: "0px 0px",
    backgroundRepeat: "no-repeat",
    backgroundSize: "12px 10px",
  });
  const controller = installCornerfill(options({ observe: true }));
  const handle = controller.attach(element, {
    borderRadius: "6px",
    cornerShape: "bevel",
    rasterIsOpaque: true,
  });
  await handle.ready;
  const originalDecode = Image.prototype.decode;
  const gates = new Map();
  Image.prototype.decode = function decodeWithGate() {
    const image = this;
    return originalDecode.call(image).then(() => new Promise((resolve) => gates.set(image.src, resolve)));
  };
  try {
    element.style.backgroundImage = `url(${JSON.stringify(secondUrl)})`;
    const refresh = handle.refresh();
    await waitFor(() => gates.has(secondUrl), "full-refresh image decode gate");
    const revision = controller.entryByElement.get(element).revision;
    element.style.backgroundPositionX = "-1px";
    await waitFor(
      () => controller.entryByElement.get(element).revision > revision,
      "position invalidation during full refresh",
    );
    gates.get(secondUrl)();
    await refresh;
    const explanation = handle.explain();
    equal(explanation.paint.layer.imageSize, [3, 3], "position update discarded the new image");
    assert(explanation.paint.layer.sourceRect[0] > 0, "new image lost the later background position");
  } finally {
    Image.prototype.decode = originalDecode;
    handle.dispose();
    controller.destroy();
    element.remove();
  }
});

await test("a failed image lease can retry the same URL", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attach(element, {
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#f00" },
  });
  await handle.ready;
  const originalAcquire = controller.images.acquire.bind(controller.images);
  const decoded = raster(12, 10, "#0f0");
  let attempts = 0;
  controller.images.acquire = (url, acquireOptions) => {
    if (!String(url).endsWith("/retry-image.png")) return originalAcquire(url, acquireOptions);
    attempts += 1;
    let released = false;
    return Object.freeze({
      key: `retry-${attempts}`,
      url: String(url),
      promise: attempts === 1 ? Promise.reject(new Error("synthetic decode failure")) : Promise.resolve(decoded),
      release() { released = true; },
      get released() { return released; },
    });
  };
  const paint = {
    kind: "image",
    url: "/retry-image.png",
    sourceSize: [12, 10],
    backgroundSize: [12, 10],
    backgroundPosition: [0, 0],
    repeat: "no-repeat",
  };
  let firstError = null;
  try { await handle.update({ paint }); } catch (error) { firstError = error; }
  assert(/synthetic decode failure/u.test(firstError?.message ?? ""), "first same-URL image failure was not reported");
  await handle.update({ paint });
  assert(attempts === 2, "same-URL refresh reused a rejected image lease");
  equal(handle.explain().paint.layer.imageSize, [12, 10], "same-URL retry did not paint the decoded image");
  controller.images.acquire = originalAcquire;
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("prepared batches validate before mutating", async () => {
  const element = host();
  const unattached = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, preparedConfig());
  await handle.ready;
  const before = handle.explain();
  let error = null;
  try {
    controller.updatePreparedBatch([
      { element, backgroundPosition: [-1, 0] },
      { element: unattached, paintActive: false },
    ]);
  } catch (caught) {
    error = caught;
  }
  assert(error, "invalid prepared batch was accepted");
  equal(handle.explain().prepared.backgroundPosition, before.prepared.backgroundPosition, "failed batch mutated crop state");
  assert(handle.explain().counters.paints === before.counters.paints, "failed batch painted");
  handle.dispose();
  controller.destroy();
  element.remove();
  unattached.remove();
});

await test("prepared errors do not poison later successful state", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, preparedConfig());
  await handle.ready;
  let error = null;
  try {
    controller.updatePreparedBatch([{ element, backgroundPosition: [1, 0] }]);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof RangeError, "invalid crop did not fail before mutation");
  controller.updatePreparedBatch([{ element, backgroundPosition: [-1, 0] }]);
  assert(handle.explain().status === "active" && handle.explain().error === null, "successful crop retained current error state");
  const solid = host();
  solid.style.border = "2px solid red";
  const solidHandle = controller.attachPrepared(solid, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "rgba(0, 128, 255, .5)" },
    border: null,
  });
  await solidHandle.ready;
  assert(
    [
      getComputedStyle(solid).borderTopColor,
      getComputedStyle(solid).borderRightColor,
      getComputedStyle(solid).borderBottomColor,
      getComputedStyle(solid).borderLeftColor,
    ].every((color) => /rgba\([^)]*,\s*0\)|transparent/u.test(color)),
    "explicitly unpainted border leaked the native rectangular border",
  );
  const solidPaints = solidHandle.explain().counters.paints;
  await solidHandle.refresh();
  assert(solidHandle.explain().counters.paints === solidPaints + 1, "solid prepared refresh did not perform one full repaint");
  assert(solidHandle.explain().status === "active", "solid prepared refresh entered an error state");
  solidHandle.dispose();
  solid.remove();
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("failed prepared image replacement keeps the committed atlas program", async () => {
  const element = host();
  const controller = installCornerfill(options({ maxImageCacheEntries: 0 }));
  const imagePaint = (url, backgroundPosition = [0, 0], sourceSize = [32, 32]) => ({
    kind: "image",
    url,
    sourceSize,
    backgroundSize: [32, 32],
    backgroundPosition,
    repeat: "no-repeat",
    opaque: true,
  });
  const firstUrl = raster(32, 32, "#f00").toDataURL();
  const secondUrl = raster(32, 32, "#0f0").toDataURL();
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: imagePaint(firstUrl),
  });
  await handle.ready;
  let replacementError = null;
  try {
    await handle.resize({ paint: imagePaint(secondUrl, [0, 0], [31, 32]) });
  } catch (error) {
    replacementError = error;
  }
  assert(
    /image dimensions changed/u.test(replacementError?.message ?? ""),
    "invalid replacement image was accepted",
  );
  const paintsBeforeRecovery = handle.explain().counters.paints;
  controller.updatePreparedBatch([{ element, backgroundPosition: [-1, 0] }]);
  assert(handle.explain().counters.paints === paintsBeforeRecovery + 1, "failed replacement poisoned the committed atlas program");
  assert(controller.stats().imageCache.references === 1, "failed replacement displaced the committed image lease");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("prepared crop wins over an earlier in-flight image replacement", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, preparedConfig());
  await handle.ready;
  const originalDecode = Image.prototype.decode;
  const gates = new Map();
  Image.prototype.decode = function decodeWithGate() {
    const image = this;
    return originalDecode.call(image).then(() => new Promise((resolve) => gates.set(image.src, resolve)));
  };
  try {
    const replacementUrl = raster(40, 32, "#0f0").toDataURL();
    const replacement = handle.resize({
      paint: {
        kind: "image",
        url: replacementUrl,
        sourceSize: [40, 32],
        backgroundSize: [40, 32],
        backgroundPosition: [0, 0],
        repeat: "no-repeat",
        opaque: true,
      },
    });
    await waitFor(() => gates.has(replacementUrl), "prepared replacement decode gate");
    controller.updatePreparedBatch([{ element, backgroundPosition: [-2, 0] }]);
    gates.get(replacementUrl)();
    await replacement;
    const explanation = handle.explain();
    equal(explanation.prepared.backgroundPosition, [-2, 0], "prepared replacement overwrote the later crop");
    equal(explanation.paint.layer.imageSize, [40, 32], "prepared crop retained the old image");
  } finally {
    Image.prototype.decode = originalDecode;
    handle.dispose();
    controller.destroy();
    element.remove();
  }
});

await test("failed prepared paint leaves the committed layout and surface intact", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [100, 10],
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
    border: null,
  });
  await handle.ready;
  const before = handle.explain();
  const crossingLayout = {
    size: [39.105241601622424, 211.3169662447694],
    borderRadius: [
      { rx: 1.3225144041088894, ry: 153.08962407738628 },
      { rx: 5.57310388412243, ry: 184.650892110809 },
      { rx: 16.512622098688556, ry: 39.40128968658898 },
      { rx: 7.304793159782682, ry: 87.42960496571885 },
    ],
    cornerShape: [8, -2, 2, -2],
    border: {
      width: [8.34886265579794, 5.063831898145306, 65.41168509124148, 20.733630000645288],
      color: "#abcdef",
    },
  };
  let error = null;
  try {
    await handle.resize(crossingLayout);
  } catch (caught) {
    error = caught;
  }
  assert(/self-intersects/u.test(error?.message ?? ""), "crossing prepared paint did not fail");
  const failed = handle.explain();
  assert(failed.surface.id === before.surface.id, "failed prepared paint replaced the committed surface");
  equal(failed.geometry.shapeParameters, before.geometry.shapeParameters, "failed prepared paint replaced committed geometry");
  assert(failed.paint.layer.color === before.paint.layer.color, "failed prepared paint replaced committed paint");
  await handle.update({ paintActive: false });
  let hiddenError = null;
  try {
    await handle.resize(crossingLayout);
  } catch (caught) {
    hiddenError = caught;
  }
  assert(/self-intersects/u.test(hiddenError?.message ?? ""), "inactive crossing paint committed without validation");
  await handle.update({ paintActive: true });
  assert(handle.explain().surface.id === before.surface.id, "inactive failed resize poisoned the revealed surface");
  await handle.resize({ borderRadius: "5px", cornerShape: "round", border: null });
  assert(handle.explain().status === "active", "successful prepared resize did not recover after a failed paint");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("failed dynamic paint cannot repair ownership from uncommitted metadata", async () => {
  const element = host();
  Object.assign(element.style, {
    boxSizing: "border-box",
    width: "39.105241601622424px",
    height: "211.3169662447694px",
    borderStyle: "solid",
    borderColor: "#abcdef",
    borderWidth: "0",
  });
  const controller = installCornerfill(options({ observe: false }));
  const handle = controller.attach(element, {
    borderRadius: [
      { rx: 1.3225144041088894, ry: 153.08962407738628 },
      { rx: 5.57310388412243, ry: 184.650892110809 },
      { rx: 16.512622098688556, ry: 39.40128968658898 },
      { rx: 7.304793159782682, ry: 87.42960496571885 },
    ],
    cornerShape: [8, -2, 2, -2],
    paint: { kind: "solid", color: "#123456" },
  });
  await handle.ready;
  const before = handle.explain();
  element.style.borderTopWidth = "8.34886265579794px";
  element.style.borderRightWidth = "5.063831898145306px";
  element.style.borderBottomWidth = "65.41168509124148px";
  element.style.borderLeftWidth = "20.733630000645288px";
  let firstError = null;
  try { await handle.refresh(); } catch (error) { firstError = error; }
  assert(/self-intersects/u.test(firstError?.message ?? ""), "dynamic topology fixture did not fail paint");
  assert(!element.hasAttribute("data-cornerfill-owned"), "failed dynamic paint retained ownership");
  assert(handle.explain().counters.paints === before.counters.paints, "failed dynamic paint incremented paint state");
  let retryError = null;
  try { await handle.refresh(); } catch (error) { retryError = error; }
  assert(/self-intersects/u.test(retryError?.message ?? ""), "failed dynamic paint repaired ownership without repainting");
  assert(!element.hasAttribute("data-cornerfill-owned"), "failed dynamic retry restored stale ownership");
  element.style.borderWidth = "0";
  await handle.refresh();
  assert(handle.explain().status === "active", "valid dynamic state did not recover after paint failure");
  assert(element.hasAttribute("data-cornerfill-owned"), "recovered dynamic paint did not restore ownership");
  assert(handle.explain().counters.paints === before.counters.paints + 1, "dynamic recovery did not repaint exactly once");
  controller.destroy();
  element.remove();
});

await test("prepared layout resize rebuilds once and crop remains paint-only", async () => {
  const element = host();
  element.style.setProperty("--cornerfill-live-image", "author-value");
  element.style.transform = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,4,5,0,1)";
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, preparedConfig());
  await handle.ready;
  const ownershipStyle = document.querySelector("style[data-cornerfill-ownership-styles]");
  const ownershipText = ownershipStyle.textContent;
  const sibling = host();
  const siblingHandle = controller.attachPrepared(sibling, preparedConfig());
  await siblingHandle.ready;
  assert(ownershipStyle.textContent === ownershipText, "adding a surface rewrote the ownership stylesheet");
  assert(!ownershipText.includes("data-cornerfill-owned-surface"), "ownership stylesheet retained per-surface rules");
  const before = handle.explain().counters.paints;
  await handle.resize({ size: [15, 11], dpr: 2 });
  const resized = handle.explain();
  equal([resized.geometry.width, resized.geometry.height, resized.geometry.dpr], [15, 11, 2], "prepared geometry did not resize");
  equal([resized.surface.size.backingWidth, resized.surface.size.backingHeight], [30, 22], "prepared backing did not resize for DPR");
  const siblingSurface = siblingHandle.explain().surface.size;
  assert(
    controller.stats().surfacePixels
      === 30 * 22 + siblingSurface.backingWidth * siblingSurface.backingHeight,
    "surface ledger drifted across a transactional resize",
  );
  assert(resized.counters.paints === before + 1, "prepared layout change did not repaint exactly once");
  const afterLayout = resized.counters.paints;
  controller.updatePreparedBatch([{ element, backgroundPosition: [-1, 0] }]);
  assert(handle.explain().counters.paints === afterLayout + 1, "prepared crop did not use one retained repaint");
  assert(element.style.transform.startsWith("matrix3d("), "Cornerfill modified the original transform");
  siblingHandle.dispose();
  sibling.remove();
  handle.dispose();
  assert(element.style.getPropertyValue("--cornerfill-live-image") === "author-value", "teardown lost the authored live-image property");
  controller.destroy();
  element.remove();
});

await test("ownership release quarantines a rule when CSSOM mutation fails", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  });
  await handle.ready;
  const entry = controller.entryByElement.get(element);
  const rule = controller.ownership.surfaceRules.get(entry)?.rule;
  assert(rule, "ownership release fixture could not find its live-image rule");
  const originalRemoveProperty = CSSStyleDeclaration.prototype.removeProperty;
  CSSStyleDeclaration.prototype.removeProperty = function removeProperty(property) {
    if (this === rule.style && property === "--cornerfill-live-image") {
      throw new Error("injected ownership rule release failure");
    }
    return originalRemoveProperty.call(this, property);
  };
  let error = null;
  try {
    handle.dispose();
  } catch (caught) {
    error = caught;
  } finally {
    CSSStyleDeclaration.prototype.removeProperty = originalRemoveProperty;
  }
  assert(
    error instanceof AggregateError
      && error.errors.some((failure) => /injected ownership rule release/u.test(failure?.message ?? "")),
    "ownership release failure was hidden",
  );
  assert(controller.ownership.surfaces.size === 0, "failed ownership release retained a surface record");
  assert(controller.ownership.surfaceRules.size === 0, "failed ownership release retained rule bookkeeping");
  assert(rule.parentStyleSheet === null, "failed ownership release left its quarantined CSS rule installed");
  assert(controller.stats().entries === 0 && controller.stats().surfaces === 0, "failed ownership release retained runtime resources");
  const recoveredElement = host();
  const recovered = controller.attachPrepared(recoveredElement, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "blue" },
  });
  await recovered.ready;
  assert(recovered.explain().status === "active", "ownership manager did not recover after a release failure");
  recovered.dispose();
  controller.destroy();
  element.remove();
  recoveredElement.remove();
});

await test("explicit prepared geometry refuses partial geometry-source updates", async () => {
  const { buildCornerGeometry } = await import("../dist/geometry.mjs");
  const element = host();
  const geometry = buildCornerGeometry({
    width: 12,
    height: 10,
    dpr: 1,
    borderRadius: "5px",
    cornerShape: "bevel",
  });
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    dpr: 1,
    geometry,
    paint: { kind: "solid", color: "red" },
  });
  try {
    await handle.ready;
    const before = handle.explain();
    for (const operation of [
      () => handle.resize({ cornerShape: "scoop" }),
      () => handle.resize({ borderRadius: "2px" }),
      () => handle.interpolateCornerShape("bevel", "scoop", 0.5),
    ]) {
      let error = null;
      try { await operation(); } catch (caught) { error = caught; }
      assert(
        /requires new geometry or reusable radius and shape sources/u.test(error?.message ?? ""),
        "partial explicit-geometry update was not refused",
      );
      equal(
        handle.explain().geometry.shapeParameters,
        before.geometry.shapeParameters,
        "refused explicit-geometry update changed retained geometry",
      );
      assert(handle.explain().counters.paints === before.counters.paints, "refused explicit-geometry update repainted");
    }
    await handle.resize({ paint: { kind: "solid", color: "blue" } });
    assert(/(?:0,\s*0,\s*255|blue)/u.test(handle.explain().paint.layer.color), "paint-only explicit-geometry update did not recover");
  } finally {
    handle.dispose();
    controller.destroy();
    element.remove();
  }
});

await test("shadow-root ownership paints and verifies", async () => {
  const shell = host();
  const shadow = shell.attachShadow({ mode: "open" });
  const destinationShell = host();
  const destination = destinationShell.attachShadow({ mode: "open" });
  const element = host(shadow);
  const controller = installCornerfill(options({ nonce: "cornerfill-test-nonce" }));
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#08f" },
  });
  await handle.ready;
  assert(getComputedStyle(element).backgroundImage !== "none", "shadow-root live image did not paint");
  assert(handle.verify().ownershipVerified, "shadow-root ownership did not verify");
  assert(shadow.querySelector("style[data-cornerfill-ownership-styles]")?.nonce === "cornerfill-test-nonce", "ownership style lost CSP nonce");
  const paints = handle.explain().counters.paints;
  destination.append(element);
  assert(handle.verify().ownershipVerified, "prepared ownership did not migrate roots");
  assert(handle.explain().counters.paints === paints, "prepared root migration repainted pixels");
  assert(!shadow.querySelector("style[data-cornerfill-ownership-styles]"), "prepared root migration retained old ownership style");
  assert(destination.querySelector("style[data-cornerfill-ownership-styles]"), "prepared root migration omitted new ownership style");
  handle.dispose();
  controller.destroy();
  shell.remove();
  destinationShell.remove();
});

await test("prepared rollback disposes its replacement when ownership restoration fails", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#08f" },
  });
  await handle.ready;
  const before = controller.stats();
  const previousId = handle.explain().surface.id;
  const owner = element.getAttribute("data-cornerfill-owned");
  const ownershipStyle = [...document.querySelectorAll("style[data-cornerfill-ownership-styles]")]
    .find((style) => style.getAttribute("data-cornerfill-ownership-styles") === owner);
  assert(ownershipStyle, "prepared rollback fixture could not find its ownership stylesheet");
  ownershipStyle.remove();
  const originalInsertRule = CSSStyleSheet.prototype.insertRule;
  CSSStyleSheet.prototype.insertRule = function insertRule(rule, index) {
    if (String(rule).includes("--cornerfill-live-image")) {
      throw new Error("injected ownership rule failure");
    }
    return originalInsertRule.call(this, rule, index);
  };
  let error = null;
  try {
    await handle.resize({ cornerShape: "round" });
  } catch (caught) {
    error = caught;
  } finally {
    CSSStyleSheet.prototype.insertRule = originalInsertRule;
  }
  assert(error instanceof AggregateError, "prepared rollback did not preserve both ownership failures");
  const after = controller.stats();
  assert(after.surfaces === before.surfaces, "failed rollback retained an accounted replacement surface");
  assert(after.surfacePixels === before.surfacePixels, "failed rollback corrupted the surface pixel ledger");
  assert(
    after.surfaceResources.webkit.activeCanvases === before.surfaceResources.webkit.activeCanvases,
    "failed rollback leaked a WebKit replacement canvas",
  );
  assert(
    after.surfaceResources.firefox.registrations === before.surfaceResources.firefox.registrations,
    "failed rollback leaked a Firefox replacement registration",
  );
  assert(handle.explain().surface.id === previousId, "failed rollback displaced the previous surface");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("generic lifecycle migrates roots and defers hidden paint", async () => {
  const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const shellA = document.createElement("div");
  const shellB = document.createElement("div");
  document.body.append(shellA, shellB);
  const rootA = shellA.attachShadow({ mode: "open" });
  const rootB = shellB.attachShadow({ mode: "open" });
  const moved = host(rootA);
  const migration = installCornerfill(options({ observe: true }));
  const movedHandle = migration.attach(moved, {
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#f00" },
  });
  await movedHandle.ready;
  await settle();
  const beforeMove = movedHandle.explain();
  rootB.append(moved);
  await waitFor(() => (
    rootA.querySelectorAll("style[data-cornerfill-ownership-styles]").length === 0
    && rootB.querySelectorAll("style[data-cornerfill-ownership-styles]").length === 1
  ), "same-document ownership-root migration");
  const afterMove = movedHandle.verify();
  assert(afterMove.surface.id === beforeMove.surface.id, "root migration replaced the live surface");
  assert(afterMove.counters.paints === beforeMove.counters.paints, "root migration repainted unchanged pixels");
  shellB.remove();
  await waitFor(() => migration.stats().entries === 0, "removed shadow-host teardown");
  assert(migration.stats().surfaces === 0, "removed shadow host retained a surface");
  migration.destroy();
  shellA.remove();

  const wrapper = document.createElement("div");
  const hidden = host(wrapper);
  document.body.append(wrapper);
  const visibility = installCornerfill(options({ observe: true }));
  const hiddenHandle = visibility.attach(hidden, {
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  });
  await hiddenHandle.ready;
  await settle();
  const baseline = hiddenHandle.explain();
  hidden.style.transform = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,2,3,0,1)";
  await settle();
  const transformed = hiddenHandle.explain();
  assert(transformed.counters.paints === baseline.counters.paints, "transform-only mutation repainted");
  assert(transformed.counters.styleChecks === baseline.counters.styleChecks, "transform-only mutation caused a style refresh");
  wrapper.style.transform = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,3,4,0,1)";
  await settle();
  assert(hiddenHandle.explain().counters.paints === baseline.counters.paints, "ancestor transform-only mutation repainted");
  assert(hiddenHandle.explain().counters.styleChecks === baseline.counters.styleChecks, "ancestor transform-only mutation caused a style refresh");
  wrapper.style.visibility = "hidden";
  await waitFor(() => hiddenHandle.explain().paintActive === false, "inherited visibility concealment");
  const paintsBeforeHiddenUpdate = hiddenHandle.explain().counters.paints;
  await hiddenHandle.update({ paint: { kind: "solid", color: "blue" } });
  assert(hiddenHandle.explain().counters.paints === paintsBeforeHiddenUpdate, "hidden paint update touched the surface");
  wrapper.style.visibility = "visible";
  await waitFor(() => (
    hiddenHandle.explain().paintActive === true
    && hiddenHandle.explain().counters.paints === paintsBeforeHiddenUpdate + 1
  ), "deferred reveal paint");
  assert(
    /^(?:blue|rgb\(0,\s*0,\s*255\))$/u.test(hiddenHandle.explain().paint.layer.color),
    "reveal painted stale pixels",
  );
  const paintsBeforeDirectVisibility = hiddenHandle.explain().counters.paints;
  await hiddenHandle.update({ paintActive: false });
  await hiddenHandle.update({ paintActive: true });
  assert(
    hiddenHandle.explain().counters.paints === paintsBeforeDirectVisibility + 1,
    "direct visibility reveal did not repaint exactly once",
  );
  hiddenHandle.dispose();
  visibility.destroy();
  wrapper.remove();
});

await test("higher-specificity author important ownership is rejected", async () => {
  const style = document.createElement("style");
  style.textContent = "#important-owner{background-image:none,none!important;background-color:red!important}";
  document.head.append(style);
  const element = host(document.body, "important-owner");
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#08f" },
  });
  let error = null;
  try { await handle.ready; } catch (caught) { error = caught; }
  assert(error instanceof TypeError, "author !important conflict was not rejected");
  assert(
    handle.explain().status === "disposed" && /important/u.test(handle.explain().error ?? ""),
    "terminal ownership conflict was not retained on the disposed handle",
  );
  handle.dispose();
  controller.destroy();
  element.remove();
  style.remove();
});

await test("live-image verification requires the exact CSS image token", async () => {
  if (backend === "static-data-url") return;
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#08f" },
  });
  await handle.ready;
  const id = handle.explain().surface.id;
  const decoySvg = `<svg xmlns="http://www.w3.org/2000/svg" id="${id}" width="1" height="1"/>`;
  element.style.setProperty(
    "background-image",
    `url("data:image/svg+xml,${encodeURIComponent(decoySvg)}")`,
    "important",
  );
  let error = null;
  try { handle.verify(); } catch (caught) { error = caught; }
  assert(error instanceof TypeError, "a URL containing the surface ID passed exact live-image verification");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("controllers reject conflicts and stale handles cannot detach replacements", async () => {
  const element = host();
  const firstController = installCornerfill(options());
  const secondController = installCornerfill(options());
  const first = firstController.attachPrepared(element, preparedConfig());
  await first.ready;
  let conflict = null;
  try { secondController.attachPrepared(element, preparedConfig()); } catch (error) { conflict = error; }
  assert(conflict, "second controller claimed an already-owned element");
  first.dispose();
  const second = secondController.attachPrepared(element, preparedConfig());
  await second.ready;
  first.dispose();
  assert(secondController.stats().entries === 1, "stale handle detached a replacement entry");
  second.dispose();
  firstController.destroy();
  secondController.destroy();
  element.remove();
});

await test("fallback entry and aggregate surface budgets refuse new work", async () => {
  const firstElement = host();
  const secondElement = host();
  const entryController = installCornerfill(options({ maxActiveEntries: 1 }));
  const first = entryController.attachPrepared(firstElement, preparedConfig());
  await first.ready;
  let entryError = null;
  try { entryController.attachPrepared(secondElement, preparedConfig()); } catch (error) { entryError = error; }
  assert(/active fallback entry budget/u.test(entryError?.message ?? ""), "active fallback entry budget did not refuse new work");
  first.dispose();
  entryController.destroy();

  const pixelController = installCornerfill(options({
    maxActiveEntries: 2,
    maxTotalSurfacePixels: 128,
  }));
  const pixelConfig = {
    size: [8, 8],
    dpr: 1,
    borderRadius: "4px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  };
  const firstPixels = pixelController.attachPrepared(firstElement, pixelConfig);
  await firstPixels.ready;
  assert(pixelController.stats().surfacePixels === 64, "surface ledger missed the initial allocation");
  assert(pixelController.stats().surfaces === 1, "surface ledger missed the initial surface");
  let replacementError = null;
  try { await firstPixels.resize({ size: [9, 8] }); } catch (error) { replacementError = error; }
  assert(/aggregate surface allocation/u.test(replacementError?.message ?? ""), "transactional replacement exceeded the peak surface budget");
  assert(pixelController.stats().surfacePixels === 64, "refused replacement corrupted the retained surface ledger");
  await firstPixels.resize({ cornerShape: "round" });
  assert(pixelController.stats().surfacePixels === 64, "replacement corrupted steady-state surface accounting");
  const secondPixels = pixelController.attachPrepared(secondElement, {
    ...pixelConfig,
    size: [9, 8],
  });
  let pixelError = null;
  try { await secondPixels.ready; } catch (error) { pixelError = error; }
  assert(/aggregate surface allocation/u.test(pixelError?.message ?? ""), "aggregate surface budget did not refuse new work");
  firstPixels.dispose();
  secondPixels.dispose();
  assert(pixelController.stats().surfacePixels === 0, "surface ledger retained pixels after teardown");
  assert(pixelController.stats().surfaces === 0, "surface ledger retained a surface after teardown");
  pixelController.destroy();
  firstElement.remove();
  secondElement.remove();
});

await test("handle operations reject fields unsupported by the selected runtime mode", async () => {
  const detectedNative = qualifyNativeCornerShape(document);
  const supportedRequirement = (requirement) => Object.freeze({
    ...requirement,
    supported: true,
    observable: true,
  });
  const nativeQualification = Object.freeze({
    ...detectedNative,
    qualified: true,
    unresolved: Object.freeze([]),
    requirements: Object.freeze({
      syntax: supportedRequirement(detectedNative.requirements.syntax),
      computedValues: supportedRequirement(detectedNative.requirements.computedValues),
      shapedHitTesting: supportedRequirement(detectedNative.requirements.shapedHitTesting),
    }),
  });
  const nativeElement = host();
  const nativeController = installCornerfill(options({
    forceFallback: false,
    nativeQualification,
  }));
  const nativeHandle = nativeController.attach(nativeElement, {
    borderRadius: {
      kind: "longhands",
      values: ["1px", "2px", "3px", "4px"],
    },
  });
  await nativeHandle.ready;
  equal([
    nativeElement.style.borderTopLeftRadius,
    nativeElement.style.borderTopRightRadius,
    nativeElement.style.borderBottomRightRadius,
    nativeElement.style.borderBottomLeftRadius,
  ], ["1px", "2px", "3px", "4px"], "native longhand radius source was ignored");
  let nativeUpdateError = null;
  try { nativeHandle.update({ paint: { kind: "solid", color: "red" } }); } catch (error) { nativeUpdateError = error; }
  assert(/paint update is unavailable on a native handle/u.test(nativeUpdateError?.message ?? ""), "native paint update was silently ignored");
  let nativeResizeError = null;
  try { nativeHandle.resize(); } catch (error) { nativeResizeError = error; }
  assert(/only for attachPrepared/u.test(nativeResizeError?.message ?? ""), "native resize was silently ignored");
  nativeHandle.dispose();
  nativeController.destroy();
  nativeElement.remove();

  const nativeNoopElement = host();
  const nativeNoopController = installCornerfill(options({
    forceFallback: false,
    nativeQualification,
  }));
  const nativeNoopHandle = nativeNoopController.attach(nativeNoopElement);
  await nativeNoopHandle.ready;
  nativeNoopElement.style.borderTopLeftRadius = "9px";
  nativeNoopHandle.dispose();
  assert(nativeNoopElement.style.borderTopLeftRadius === "9px", "native no-op teardown clobbered an author radius change");
  nativeNoopController.destroy();
  nativeNoopElement.remove();

  const nativeRestoreElement = host();
  nativeRestoreElement.style.removeProperty("border-radius");
  nativeRestoreElement.style.borderTopLeftRadius = "3px";
  const nativeRestoreController = installCornerfill(options({
    forceFallback: false,
    nativeQualification,
  }));
  const nativeRestoreHandle = nativeRestoreController.attach(nativeRestoreElement, { borderRadius: "7px" });
  await nativeRestoreHandle.ready;
  nativeRestoreHandle.dispose();
  assert(
    nativeRestoreElement.style.borderTopLeftRadius === "3px",
    `native teardown lost an original radius longhand: ${nativeRestoreElement.style.cssText}`,
  );
  assert(
    !Array.from(nativeRestoreElement.style).includes("border-radius"),
    "native teardown invented an original radius shorthand",
  );
  nativeRestoreController.destroy();
  nativeRestoreElement.remove();

  const nativeAuthorEditElement = host();
  const nativeAuthorEditController = installCornerfill(options({
    forceFallback: false,
    nativeQualification,
  }));
  const nativeAuthorEditHandle = nativeAuthorEditController.attach(nativeAuthorEditElement, { borderRadius: "7px" });
  await nativeAuthorEditHandle.ready;
  nativeAuthorEditElement.style.borderTopLeftRadius = "9px";
  nativeAuthorEditHandle.dispose();
  assert(nativeAuthorEditElement.style.borderTopLeftRadius === "9px", "native teardown clobbered an author edit to an owned radius group");
  nativeAuthorEditController.destroy();
  nativeAuthorEditElement.remove();

  if (CSS.supports("corner-shape", "bevel")) {
    const transactionalElement = host();
    const transactionalController = installCornerfill(options({
      forceFallback: false,
      nativeQualification,
    }));
    const transactionalHandle = transactionalController.attach(transactionalElement, {
      borderRadius: "5px",
      cornerShape: "round",
    });
    await transactionalHandle.ready;
    const beforeShape = transactionalElement.style.getPropertyValue("corner-shape");
    let transactionalError = null;
    try {
      transactionalHandle.update({ cornerShape: "bevel", borderRadius: "potato" });
    } catch (error) {
      transactionalError = error;
    }
    assert(transactionalError instanceof SyntaxError, "invalid mixed native update did not fail");
    assert(
      transactionalElement.style.getPropertyValue("corner-shape") === beforeShape,
      "failed mixed native update partially committed its shape",
    );
    transactionalHandle.dispose();
    transactionalController.destroy();
    transactionalElement.remove();
  }

  const preparedElement = host();
  const dynamicElement = host();
  const fallbackController = installCornerfill(options());
  const preparedHandle = fallbackController.attachPrepared(preparedElement, preparedConfig());
  const dynamicHandle = fallbackController.attach(dynamicElement, {
    borderRadius: "5px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "red" },
  });
  await Promise.all([preparedHandle.ready, dynamicHandle.ready]);
  let preparedUpdateError = null;
  try { preparedHandle.update({ cornerShape: "scoop" }); } catch (error) { preparedUpdateError = error; }
  assert(/cornerShape update is unavailable on a prepared handle/u.test(preparedUpdateError?.message ?? ""), "prepared shape update was silently ignored");
  let dynamicUpdateError = null;
  try { dynamicHandle.update({ backgroundPosition: [0, 0] }); } catch (error) { dynamicUpdateError = error; }
  assert(/backgroundPosition update is unavailable on a dynamic fallback handle/u.test(dynamicUpdateError?.message ?? ""), "dynamic position update was silently ignored");
  const beforePaint = dynamicHandle.explain().paint.layer.color;
  let mixedDynamicError = null;
  try {
    dynamicHandle.update({
      paint: { kind: "solid", color: "blue" },
      outline: { width: 2, offset: 0, color: "red", style: "solid" },
    });
  } catch (error) {
    mixedDynamicError = error;
  }
  assert(mixedDynamicError instanceof TypeError, "invalid mixed dynamic update did not fail");
  assert(dynamicHandle.explain().paint.layer.color === beforePaint, "failed mixed dynamic update partially committed paint");
  dynamicElement.textContent = "foreground";
  let foregroundOutlineError = null;
  try {
    dynamicHandle.update({
      paint: { kind: "solid", color: "blue" },
      outline: { width: 2, offset: -2, color: "red", style: "solid" },
    });
  } catch (error) {
    foregroundOutlineError = error;
  }
  assert(/empty, paint-owned host/u.test(foregroundOutlineError?.message ?? ""), "foreground outline update was not prevalidated");
  assert(dynamicHandle.explain().paint.layer.color === beforePaint, "foreground outline failure partially committed paint");
  dynamicElement.textContent = "";
  let invalidRadiusError = null;
  try {
    dynamicHandle.update({
      borderRadius: "potato",
      paint: { kind: "solid", color: "blue" },
    });
  } catch (error) {
    invalidRadiusError = error;
  }
  assert(invalidRadiusError instanceof SyntaxError, "invalid mixed dynamic radius update did not fail synchronously");
  assert(dynamicHandle.explain().paint.layer.color === beforePaint, "failed radius update partially committed paint");
  preparedHandle.dispose();
  dynamicHandle.dispose();
  fallbackController.destroy();
  preparedElement.remove();
  dynamicElement.remove();
});

await test("solid prepared visibility batches do not require an image program", async () => {
  const element = host();
  const controller = installCornerfill(options());
  const handle = controller.attachPrepared(element, {
    size: [12, 10],
    borderRadius: "6px",
    cornerShape: "bevel",
    paint: { kind: "solid", color: "#08f" },
    paintActive: false,
  });
  await handle.ready;
  assert(controller.stats().surfaces === 1, "hidden prepared entry did not preallocate its surface");
  assert(controller.stats().counters.deferredSurfaceEntries === 0, "hidden prepared entry deferred by default");
  controller.updatePreparedBatch([{ element, paintActive: true }]);
  controller.updatePreparedBatch([{ element, paintActive: false }]);
  controller.updatePreparedBatch([{ element, paintActive: true }]);
  assert(handle.explain().status === "active", "solid visibility batch failed");
  handle.dispose();
  controller.destroy();
  element.remove();
});

await test("ineligible opaque prepared rasters use generic painting", async () => {
  const controller = installCornerfill(options());
  const image = raster(8, 8);
  const paints = [
    { backgroundSize: [0, 0], backgroundPosition: [0, 0], repeat: "no-repeat" },
    { backgroundSize: [4, 4], backgroundPosition: [0, 0], repeat: "repeat" },
    { backgroundSize: [4, 4], backgroundPosition: [0, 0], repeat: "no-repeat" },
  ];
  const entries = [];
  try {
    for (const paint of paints) {
      const element = host();
      const handle = controller.attachPrepared(element, {
        size: [12, 10],
        borderRadius: "6px",
        cornerShape: "bevel",
        paint: { kind: "image", image, opaque: true, ...paint },
      });
      entries.push({ element, handle });
      await handle.ready;
      assert(handle.explain().status === "active", "valid generic opaque raster was rejected by the fast path");
    }
  } finally {
    for (const { element, handle } of entries) {
      handle.dispose();
      element.remove();
    }
    controller.destroy();
  }
});

const report = Object.freeze({
  schema: "cornerfill-runtime-browser-regressions@1",
  backend,
  nativeQualification: qualifyNativeCornerShape(document),
  rootAutomaticReport,
  rootImportResources,
  userAgent: navigator.userAgent,
  tests: Object.freeze(results),
});
globalThis.__CORNERFILL_RUNTIME_REGRESSIONS__ = report;
document.querySelector("#status").textContent = `PASS ${results.length}`;
document.documentElement.dataset.runtimeRegressions = "pass";
