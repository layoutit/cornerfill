import { qualifyNativeCornerShape } from "../dist/native.mjs";

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
    if (performance.now() >= deadline) throw new Error(`${label} timed out`);
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
    @media (prefers-color-scheme: dark) { .cornerfill-auto-media { corner-shape:bevel } }
  `)}`;
  document.head.append(link);
  const element = document.createElement("div");
  element.className = "cornerfill-auto-fixture";
  const dynamic = document.createElement("div");
  dynamic.className = "cornerfill-auto-dynamic";
  const inline = document.createElement("div");
  inline.className = "cornerfill-auto-inline";
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
  const active = host();
  active.className = "cornerfill-auto-active";
  const form = host();
  form.className = "cornerfill-auto-form";
  const formControl = document.createElement("input");
  formControl.type = "checkbox";
  form.append(formControl);
  const toggle = document.createElement("details");
  toggle.className = "cornerfill-auto-toggle";
  Object.assign(toggle.style, { width: "12px", height: "10px", background: "red" });
  const target = host(document.body, "cornerfill-auto-target");
  target.className = "cornerfill-auto-target";
  const escaped = host();
  escaped.className = "cornerfill:escaped";
  document.body.append(toggle);
  document.body.append(element, dynamic, inline, focus, paintFocus, fontFocus, media, zero, partial);
  const { cornerfill: auto } = await import("../dist/auto.mjs");
  await auto.ready;
  rootImportResources = Object.freeze(performance.getEntriesByType("resource")
    .map(({ name }) => new URL(name).pathname));
  const explanation = auto.explain(element);
  rootAutomaticReport = auto.explain();
  const automaticMode = rootAutomaticReport.mode;
  const nativeDecision = qualifyNativeCornerShape(document);
  if (automaticMode === "native") {
    assert(nativeDecision.qualified, "automatic native path was selected without semantic qualification");
    assert(explanation === null, "automatic native path unnecessarily attached the element");
  } else {
    assert(rootAutomaticReport.automatic.counters.candidatePasses === 1, "initial automatic discovery ran duplicate candidate passes");
    assert(!nativeDecision.qualified, "automatic fallback was selected after semantic native qualification");
    assert(
      explanation?.status === "active",
      `standard CSS element was not attached automatically: ${JSON.stringify(auto.explain())}`,
    );
    equal(explanation.geometry.shapeParameters, [1, 0, 0, 0], "automatic CSS cascade lost shorthand/longhand order");
    const initialObservation = auto.explain().automatic.observation;
    equal(initialObservation.events, ["focusin", "focusout", "resize"], "unused selector-state listeners were installed");
    assert(initialObservation.attributes.includes("class"), "class selector dependency was not observed");
    assert(!initialObservation.attributes.includes("data-cornerfill-noise"), "unreferenced attributes were observed");
    assert(initialObservation.mediaQueries.includes("(prefers-color-scheme: dark)"), "media dependency was not observed");
    assert(auto.explain(media) === null, "inactive color-scheme media attached early");
    assert(auto.explain(zero) === null, "zero-radius shape started an unnecessary fallback surface");
    assert(auto.explain(partial)?.status === "active", "one non-round non-zero corner did not attach");
    equal(auto.explain(partial).geometry.radii.slice(1), [
      { rx: 0, ry: 0 }, { rx: 0, ry: 0 }, { rx: 0, ry: 0 },
    ], "zero-area corners were not retained beside the active corner");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
      ".cornerfill-auto-active:active{corner-shape:bevel;border-radius:5px}",
      ".cornerfill-auto-form:has(input:checked){corner-shape:bevel;border-radius:5px}",
      ".cornerfill-auto-toggle:open{corner-shape:bevel;border-radius:5px}",
      ".cornerfill-auto-target:target{corner-shape:bevel;border-radius:5px}",
      ".cornerfill-auto-fullscreen:fullscreen{corner-shape:bevel;border-radius:5px}",
    ]) cssomStyle.sheet.insertRule(rule, cssomStyle.sheet.cssRules.length);
    await waitFor(() => auto.explain(byId)?.status === "active", "id selector attachment");
    const stateObservation = auto.explain().automatic.observation;
    equal(stateObservation.events, [
      "change", "focusin", "focusout", "fullscreenchange", "hashchange", "input", "pointercancel",
      "pointerdown", "pointerout", "pointerover", "pointerup", "popstate", "resize", "toggle",
    ], "selector-derived state listener inventory was wrong");
    assert(stateObservation.attributes.includes("id"), "id selector dependency was not observed");
    assert(stateObservation.attributes.includes("data-cornerfill-trigger"), "attribute selector dependency was not observed");

    if (new URL(location.href).searchParams.has("drivePointer")) {
      const driver = { stage: "hover-ready" };
      globalThis.__CORNERFILL_POINTER_DRIVER__ = driver;
      await waitFor(() => driver.stage === "hover-driven", "hover driver");
      await waitFor(() => auto.explain(hover)?.status === "active", "hover-state selector attachment");
      driver.stage = "active-ready";
      await waitFor(() => driver.stage === "active-driven", "active driver");
      await waitFor(() => auto.explain(active)?.status === "active", "active-state selector attachment");
      driver.stage = "active-release";
      await waitFor(() => driver.stage === "active-released", "active release driver");
      await waitFor(() => auto.explain(active) === null, "active-state selector detachment");
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

    const passesBeforeBurst = auto.explain().automatic.counters.candidatePasses;
    formControl.checked = true;
    formControl.dispatchEvent(new Event("input", { bubbles: true }));
    formControl.dispatchEvent(new Event("input", { bubbles: true }));
    formControl.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => auto.explain(form)?.status === "active", "form-state selector attachment");
    assert(auto.explain().automatic.counters.candidatePasses === passesBeforeBurst + 1, "one state-event burst ran more than one selector pass");

    toggle.open = true;
    await waitFor(() => auto.explain(toggle)?.status === "active", "toggle-state selector attachment");
    location.hash = "cornerfill-auto-target";
    await waitFor(() => auto.explain(target)?.status === "active", "target-state selector attachment");
    location.hash = "cornerfill-no-target";
    await waitFor(() => auto.explain(target) === null, "target-state selector detachment");
    history.replaceState(null, "", `${location.pathname}${location.search}`);

    const escapedRule = cssomStyle.sheet.insertRule(
      String.raw`.cornerfill\:escaped{corner-shape:bevel;border-radius:5px}`,
      cssomStyle.sheet.cssRules.length,
    );
    await waitFor(() => auto.explain(escaped)?.status === "active", "conservative selector attachment");
    assert(auto.explain().automatic.observation.conservative, "unclassifiable selector was not observed conservatively");
    const passesBeforeConservativeAttribute = auto.explain().automatic.counters.candidatePasses;
    escaped.setAttribute("data-unclassified", "1");
    await waitFor(() => auto.explain().automatic.counters.candidatePasses > passesBeforeConservativeAttribute, "conservative attribute observation");
    cssomStyle.sheet.deleteRule(escapedRule);
    await waitFor(() => auto.explain(escaped) === null, "conservative selector teardown");
    assert(!auto.explain().automatic.observation.conservative, "removed selector retained conservative observation");

    while (cssomStyle.sheet.cssRules.length > 0) {
      cssomStyle.sheet.deleteRule(cssomStyle.sheet.cssRules.length - 1);
    }
    await waitFor(() => auto.explain(byId) === null, "state selector teardown");
    const noise = document.createElement("div");
    const refreshesBeforeNoise = auto.explain().automatic.counters.handleRefreshes;
    document.body.append(noise);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(auto.explain().automatic.counters.handleRefreshes === refreshesBeforeNoise, "unrelated DOM mutation refreshed a handle");
    noise.remove();
    const paints = explanation.counters.paints;
    element.style.transform = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,3,4,0,1)";
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(auto.explain(element).counters.paints === paints, "automatic element repainted for a transform-only change");
    inline.style.backgroundColor = "blue";
    await auto.refresh();
  }
  auto.destroy();
  assert(!element.hasAttribute("data-cornerfill-owned"), "automatic teardown retained element ownership");
  assert(!document.querySelector("style[data-cornerfill-auto-styles]"), "automatic teardown retained a carrier stylesheet");
  if (automaticMode === "fallback") {
    assert(/corner-shape\s*:\s*scoop/iu.test(inline.getAttribute("style") ?? ""), "automatic teardown lost edited raw inline shape");
    assert(inline.style.backgroundColor === "blue", "automatic teardown overwrote a later author inline edit");
    assert(!/--cornerfill-/iu.test(inline.getAttribute("style") ?? ""), "automatic teardown retained inline carriers");
  }
  element.remove();
  dynamic.remove();
  inline.remove();
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
  active.remove();
  form.remove();
  toggle.remove();
  target.remove();
  escaped.remove();
  cssomStyle.remove();
  link.remove();
});

({ installCornerfill } = await import("../dist/runtime.mjs"));
({ installCornerfillAuto } = await import("../dist/auto-runtime.mjs"));

await test("explicit paint rejects invalid CSS colors before taking ownership", async () => {
  const element = host();
  const controller = installCornerfill(options());
  let error = null;
  try {
    controller.attach(element, {
      borderRadius: "5px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "definitely-not-a-color" },
    });
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof SyntaxError, "invalid explicit color was accepted");
  assert(controller.stats().entries === 0, "invalid explicit color created a runtime entry");
  assert(!element.hasAttribute("data-cornerfill-owned"), "invalid explicit color took element ownership");
  controller.destroy();
  element.remove();
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
      [...auto.stylesheets.values()].some(({ sources }) => sources.includes("https://assets.example/styles/main.css")),
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
      records: [...auto.stylesheets.values()].map(({ failed: recordFailed, selectors, companion }) => ({
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
    try {
      await waitFor(() => auto.explain(localElement)?.status === "active", "local stylesheet did not recover after slow link timeout");
    } catch (error) {
      throw new Error(`${error.message}: ${JSON.stringify({
        auto: auto.explain(),
        local: auto.explain(localElement),
        records: [...auto.stylesheets.values()].map(({ failed: recordFailed, owner, selectors }) => ({
          failed: recordFailed,
          owner: owner.localName,
          selectors,
        })),
      })}`, { cause: error });
    }
    auto.destroy();
    requests[4].resolve(response(".cornerfill-auto-remote{corner-shape:bevel}"));
    await pending;
    assert(requests[4].init.signal.aborted, "destroy did not abort the exact in-flight stylesheet request");
    assert(auto.explain().attached === 0 && auto.explain().stylesheets === 0, "destroyed discovery repopulated state");
    assert(
      auto.sourceRequests.size === 0 && auto.pendingFetches.size === 0 && auto.pendingStylesheetWaits.size === 0,
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
    link.href = `data:text/css,${encodeURIComponent(".cornerfill-timeout-owner{display:block}")}`;
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
      assert(errors.some((message) => /timed out after 25ms/u.test(message)), "stylesheet timeout was not diagnosed");
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

await test("inactive conditional imports do not establish their named layer", async () => {
  const importUrl = "data:text/css,/*cornerfill-empty-conditional*/";
  const originalFetch = window.fetch;
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url !== importUrl) return originalFetch(input, init);
    return Promise.resolve({
      headers: { get: (name) => name.toLowerCase() === "content-type" ? "text/css" : null },
      ok: true,
      status: 200,
      text: async () => "",
      url: importUrl,
    });
  };
  const imported = document.createElement("style");
  imported.textContent = `@import "${importUrl}" layer(cornerfill-conditional-theme) not all;`;
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
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    imported.remove();
    cascade.remove();
    element.remove();
  }
});

await test("a failed import preserves later local corner rules", async () => {
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
    @import "${importUrl}" not all;
    .cornerfill-local-after-failed-import {
      corner-shape: bevel;
      border-radius: 5px;
      background: red;
    }
  `;
  document.head.append(style);
  const element = host();
  element.className = "cornerfill-local-after-failed-import";
  const auto = installCornerfillAuto(options({ autoObserve: false, onError() {} }));
  try {
    await auto.ready;
    assert(auto.explain(element)?.status === "active", "failed import discarded a later local rule");
    assert(requests === 1, "failed import was requested more than once during initial discovery");
    const record = auto.stylesheets.get(style);
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
  const auto = installCornerfillAuto(options({ autoObserve: false }));
  try {
    await auto.ready;
    for (const element of elements) {
      equal(
        auto.explain(element)?.geometry.shapeParameters,
        [0, 0, 0, 0],
        `automatic source scanner lost ${element.className}`,
      );
    }
  } finally {
    auto.destroy();
    style.remove();
    for (const element of elements) element.remove();
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
    const record = [...auto.stylesheets.values()].find(({ owner }) => owner === link);
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
  assert(auto.importRequests.size === 0 && auto.sourceRequests.size === 0, "import teardown retained request state");
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
  const loadLink = (css) => new Promise((resolve, reject) => {
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("mock import owner did not load")), { once: true });
    link.href = `data:text/css,${encodeURIComponent(css)}`;
    if (!link.isConnected) document.head.append(link);
  });
  await loadLink(".cornerfill-import-stale{width:12px;height:10px;border-radius:5px;background:red}");
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

    await loadLink(".cornerfill-import-stale{width:12px;height:10px;border-radius:5px;background:blue}");
    const cycle = auto.refresh();
    await waitFor(() => requests.length === 4, "cycle root stylesheet request");
    requests[3].resolve(response('@import "./a.css";', "https://assets.example/cycle/root.css"));
    await waitFor(() => requests.length === 5, "cycle first import request");
    requests[4].resolve(response('@import "./b.css";', "https://assets.example/cycle/a.css"));
    await waitFor(() => requests.length === 6, "cycle second import request");
    requests[5].resolve(response('@import "./a.css";', "https://assets.example/cycle/b.css"));
    await cycle;
    assert(errors.some((message) => /@import cycle/u.test(message)), "import cycle was not diagnosed");
    assert(auto.explain(element) === null, "cyclic source retained stale ownership");
    const requestCount = requests.length;
    await auto.refresh();
    assert(requests.length === requestCount, "failed import graph retried without an explicit retry");
  } finally {
    auto.destroy();
    window.fetch = originalFetch;
    link.remove();
    element.remove();
  }
  assert(auto.importRequests.size === 0 && auto.sourceRequests.size === 0, "failed import teardown retained request state");
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
  let scopeA;
  let scopeB;
  try {
    await auto.ready;
    assert(auto.explain(local) === null, "document discovery crossed an unregistered shadow boundary");
    let closedError = null;
    try { auto.registerRoot(closed); } catch (error) { closedError = error; }
    assert(/closed ShadowRoot/u.test(closedError?.message ?? ""), "closed root registration did not fail explicitly");
    scopeA = auto.registerRoot(rootA, { adoptedStyleSheets: true });
    scopeB = auto.registerRoot(rootB, { adoptedStyleSheets: true });
    assert(auto.registerRoot(rootA, { adoptedStyleSheets: true }) === scopeA, "duplicate root registration created another scope");
    await Promise.all([scopeA.ready, scopeB.ready]);
    await Promise.all([
      scopeA.refreshAdoptedStyleSheet(shared, initialAdoptedSource),
      scopeB.refreshAdoptedStyleSheet(shared, initialAdoptedSource),
    ]);
    assert(scopeA.explain(local)?.status === "active", "registered root stylesheet did not attach");
    equal(scopeA.explain(inline).geometry.shapeParameters, [-1, -1, -1, -1], "registered root inline declaration changed");
    assert(scopeA.explain(adoptedA)?.status === "active", "opted-in adopted stylesheet did not attach in first root");
    assert(scopeB.explain(adoptedB)?.status === "active", "shared adopted stylesheet did not attach in second root");
    assert(scopeA.explain(ordered).geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY), "adopted stylesheet lost root-local cascade order");
    assert(rootA.querySelectorAll('style[data-cornerfill-auto-styles="adopted"]').length === 1, "first root omitted or duplicated its adopted companion");
    assert(rootB.querySelectorAll('style[data-cornerfill-auto-styles="adopted"]').length === 1, "second root omitted or duplicated its adopted companion");

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
    .cornerfill-logical { corner-start-start-shape: bevel; direction: rtl }
    .cornerfill-media-duplicate { corner-shape: round }
    @media (min-width: 1px) { .cornerfill-media { corner-shape: notch } }
    @media (min-width: 1px) { .cornerfill-media-duplicate { corner-shape: bevel } }
    @supports (corner-shape: bevel) {
      @layer cornerfill-empty-conditional {}
      .cornerfill-supports-positive { corner-shape: bevel }
    }
    @supports not (corner-shape: bevel) { .cornerfill-supports-negative { corner-shape: bevel } }
    @supports not (corner-shape: unknown-shape) { .cornerfill-supports-invalid-negative { corner-shape: bevel } }
    .cornerfill-mixed { corner-top-left-shape: bevel; corner-start-start-shape: scoop }
    .cornerfill-all-base { corner-shape: bevel }
    .cornerfill-all-base.cornerfill-all-reset { all: unset; display: block }
    .cornerfill-all-before { all: unset; corner-shape: bevel; display: block }
    .cornerfill-all-after { corner-shape: bevel; all: unset; display: block }
    .cornerfill-all-important { corner-shape: bevel !important; all: unset !important; display: block !important }
    .cornerfill-all-var { --cornerfill-all-value: unset; corner-shape: bevel; all: var(--cornerfill-all-value); display: block }
    .cornerfill-all-var-fallback { corner-shape: bevel; all: var(--cornerfill-missing-all, unset); display: block }
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
  nestedStyle.textContent = ".cornerfill-nesting{& .cornerfill-nested{corner-shape:bevel}}";
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
    anonymousLayer,
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
  const media = host();
  media.className = "cornerfill-media";
  const mediaDuplicate = host();
  mediaDuplicate.className = "cornerfill-media-duplicate";
  const supportsPositive = host();
  supportsPositive.className = "cornerfill-supports-positive";
  const supportsCustom = host();
  supportsCustom.className = "cornerfill-supports-custom";
  const supportsNegativeCustom = host();
  supportsNegativeCustom.className = "cornerfill-supports-negative-custom";
  const supportsNegative = host();
  supportsNegative.className = "cornerfill-supports-negative";
  const supportsInvalidNegative = host();
  supportsInvalidNegative.className = "cornerfill-supports-invalid-negative";
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
  nesting.className = "cornerfill-nested";
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
    equal(auto.explain(layerNormal).geometry.shapeParameters, [-1, -1, -1, -1], "named layer order changed");
    assert(/(?:blue|0,\s*0,\s*255)/u.test(auto.explain(layerNormal).paint.layer.color), "named layer paint order changed");
    equal(auto.explain(layerImportant).geometry.shapeParameters, [0, 0, 0, 0], "important layer order changed");
    assert(/(?:blue|0,\s*0,\s*255)/u.test(auto.explain(layerImportant).paint.layer.color), "normal paint layer order changed beside important shape");
    assert(auto.explain(varInherit).geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY), "inherited var() shape was not resolved");
    equal(auto.explain(varFallback).geometry.shapeParameters, [-1, -1, -1, -1], "var() fallback shape was not resolved");
    assert(auto.explain(varConflict) === null, "variable shorthand/longhand conflict was partially owned");
    equal(auto.explain(logical).geometry.shapeParameters, [1, 0, 1, 1], "logical shape did not follow RTL writing direction");
    assert(auto.explain(media).geometry.shapeParameters.every((value) => value === Number.NEGATIVE_INFINITY), "media context was lost");
    assert(auto.explain(mediaDuplicate)?.status === "active", "duplicate-selector media shape did not attach");
    assert(
      auto.explain().automatic.observation.mediaQueries.some((query) => (
        query.replace(/\s+/gu, "") === "(min-width:1px)"
      )),
      `duplicate selector suppressed its media listener: ${JSON.stringify(auto.explain().automatic.observation.mediaQueries)}`,
    );
    assert(auto.explain(supportsPositive)?.status === "active", "positive corner-shape support condition stayed false");
    assert(auto.explain(supportsNegative) === null, "negative corner-shape support condition stayed true");
    assert(auto.explain(supportsInvalidNegative)?.status === "active", "invalid negative support condition stayed false");
    assert(auto.explain(conditionalCrossSource)?.status === "active", "cross-source inline shape did not attach before a conditional refusal");
    assert(auto.explain(mixed) === null, "mixed physical/logical declarations were partially owned");
    assert(auto.explain(anonymous) === null, "anonymous layer was partially owned");
    assert(auto.explain(nesting) === null, "nested selector rule was partially owned");
    assert(auto.explain(inert) === null, "non-CSS style source was activated");
    assert(auto.explain(alternateElement) === null, "inactive alternate stylesheet was activated");
    assert(auto.explain(allReset) === null, "all: unset retained an earlier shape carrier");
    assert(auto.explain(allBefore), "shape after all: unset did not attach");
    equal(auto.explain(allBefore).geometry.shapeParameters, [0, 0, 0, 0], "shape after all: unset did not win");
    assert(auto.explain(allAfter) === null, "all: unset after shape did not reset the carrier");
    assert(auto.explain(allLayer) === null, "all: unset did not reset a shape from an earlier layer");
    assert(auto.explain(allImportant) === null, "important all: unset did not reset an important shape");
    assert(auto.explain(allVar) === null, "all: var() did not transport its resolved carrier reset");
    assert(auto.explain(allVarFallback) === null, "all: var() fallback did not reset shape carriers");
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
    assert(/anonymous cascade layer/u.test(baseMessages), "anonymous layer refusal was not reported");
    assert(/nested selector rule/u.test(baseMessages), "nested selector refusal was not reported");
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

    document.head.append(
      complexSupports,
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
    assert(auto.explain(complex) === null, "complex support condition was partially owned");
    assert(auto.explain(split) === null, "split-semantics support rule was partially owned");
    const conditionalMessages = auto.explain().errors.map(({ message }) => message).join("\n");
    assert(/complex corner-shape support condition/u.test(conditionalMessages), "complex supports refusal was not reported");
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
      supportsPositive, supportsCustom, supportsNegativeCustom, supportsNegative, supportsInvalidNegative,
      conditionalCrossSource, mixed,
      anonymous, nesting, complex, split, inert, alternateElement,
      allReset, allBefore, allAfter, allLayer, allImportant, allVar, allVarFallback,
      allVarImportant, envShape, allEnv, allVarLayer,
      validHigh, validBelowInvalidImportant,
      ...relativeRadii.map(({ target: radiusTarget }) => radiusTarget),
    ]) element.remove();
  }
});

await test("automatic CSP nonce keeps every generated stylesheet active", async () => {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-1000px;top:0;width:40px;height:40px";
  frame.srcdoc = `
    <meta http-equiv="Content-Security-Policy" content="style-src 'nonce-cornerfill-csp'">
    <style nonce="cornerfill-csp">
      .cornerfill-csp-fixture{width:12px;height:10px;background:red;border-radius:5px;corner-shape:bevel}
    </style>
    <div class="cornerfill-csp-fixture"></div>
  `;
  const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
  document.body.append(frame);
  await loaded;
  const frameDocument = frame.contentDocument;
  const element = frameDocument.querySelector(".cornerfill-csp-fixture");
  const auto = installCornerfillAuto(options({
    autoObserve: false,
    document: frameDocument,
    nativeQualification: qualifyNativeCornerShape(document),
    nonce: "cornerfill-csp",
  }));
  try {
    await auto.ready;
    assert(auto.explain(element)?.status === "active", "nonce-authorized automatic fixture was not owned");
    const generated = [...frameDocument.querySelectorAll("style[data-cornerfill-auto-styles]")];
    assert(generated.length === 2 && generated.every((style) => style.nonce === "cornerfill-csp" && style.sheet), "generated automatic styles lost the CSP nonce");
    assert(frameDocument.querySelector("style[data-cornerfill-ownership-styles]")?.nonce === "cornerfill-csp", "ownership stylesheet lost the CSP nonce");
  } finally {
    auto.destroy();
    frame.remove();
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
  assert(getComputedStyle(element).boxShadow === "none", "native box shadow remained visible");
  assert(getComputedStyle(element).outlineStyle === "none", "native outline remained visible");
  handle.dispose();

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
  overflow.append(document.createElement("span"));
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

  const shadowForeground = host();
  shadowForeground.style.overflow = "hidden";
  shadowForeground.attachShadow({ mode: "open" }).append(document.createElement("span"));
  let shadowForegroundError = null;
  try {
    controller.attach(shadowForeground, {
      borderRadius: "4px",
      cornerShape: "bevel",
      paint: { kind: "solid", color: "#246" },
    });
  } catch (error) {
    shadowForegroundError = error;
  }
  assert(/descendant overflow clip/u.test(shadowForegroundError?.message ?? ""), "shadow foreground bypassed overflow refusal");

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
  shadowForeground.remove();
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
  let error = null;
  try {
    await handle.resize({
      borderRadius: "20px / 80px",
      cornerShape: "scoop",
      border: { width: [1, 2, 5, 1], color: "#abcdef" },
    });
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
    await handle.resize({
      borderRadius: "20px / 80px",
      cornerShape: "scoop",
      border: { width: [1, 2, 5, 1], color: "#abcdef" },
    });
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
  assert(hiddenHandle.explain().paint.layer.color === "blue", "reveal painted stale pixels");
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
  assert(handle.explain().status === "error", "ownership conflict was not reported");
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
    maxTotalSurfacePixels: 100,
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
  let replacementBudgetError = null;
  try { await firstPixels.resize({ cornerShape: "round" }); } catch (error) { replacementBudgetError = error; }
  assert(
    /aggregate surface allocation/u.test(replacementBudgetError?.message ?? ""),
    "transactional replacement exceeded the aggregate peak budget",
  );
  const secondPixels = pixelController.attachPrepared(secondElement, pixelConfig);
  let pixelError = null;
  try { await secondPixels.ready; } catch (error) { pixelError = error; }
  assert(/aggregate surface allocation/u.test(pixelError?.message ?? ""), "aggregate surface budget did not refuse new work");
  firstPixels.dispose();
  secondPixels.dispose();
  pixelController.destroy();
  firstElement.remove();
  secondElement.remove();
});

await test("handle operations reject fields unsupported by the selected runtime mode", async () => {
  const nativeQualification = Object.freeze({
    ...qualifyNativeCornerShape(document),
    qualified: true,
    unresolved: Object.freeze([]),
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
