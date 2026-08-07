import { getOracleCase, ORACLE_CASE_SCHEMA } from "./cases.mjs";
import {
  attachProductionCandidate,
  CANDIDATE_PAINTER_SCHEMA,
  createCompiledLifecycleProof,
  createRasterUpdateProof,
  nativeBackgroundCss,
} from "./painter.mjs";

const query = new URLSearchParams(location.search);
const caseId = query.get("case") ?? "bevel";
const mode = query.get("mode") ?? "native";
const oracleCase = getOracleCase(caseId);
const capture = document.querySelector("#capture");
const face = document.querySelector("#face");

function applyStyles(element, declarations) {
  for (const [property, value] of Object.entries(declarations)) {
    if (value !== undefined && value !== null) element.style[property] = String(value);
  }
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function applyBorder(element, border) {
  if (!border) return;
  const widths = Array.isArray(border.width)
    ? border.width
    : [border.width, border.width, border.width, border.width];
  element.style.borderStyle = "solid";
  element.style.borderWidth = widths.map((width) => `${width}px`).join(" ");
  element.style.borderColor = border.color;
}

function applyEffects(element, oracleCase) {
  if (oracleCase.boxShadow) element.style.boxShadow = oracleCase.boxShadow;
  if (oracleCase.outline) {
    element.style.outlineWidth = `${oracleCase.outline.width}px`;
    element.style.outlineStyle = oracleCase.outline.style;
    element.style.outlineColor = oracleCase.outline.color;
    element.style.outlineOffset = `${oracleCase.outline.offset}px`;
  }
}

async function render() {
  if (!oracleCase) throw new Error(`unknown oracle case: ${caseId}`);
  if (!new Set(["native", "candidate"]).has(mode)) throw new Error(`unknown oracle mode: ${mode}`);

  const [width, height] = oracleCase.size;
  const [captureWidth, captureHeight] = oracleCase.captureSize;
  applyStyles(capture, {
    width: `${captureWidth}px`,
    height: `${captureHeight}px`,
    perspective: oracleCase.perspective ? `${oracleCase.perspective}px` : "none",
  });
  applyStyles(face, {
    width: `${width}px`,
    height: `${height}px`,
    padding: oracleCase.padding ?? "0",
    borderRadius: oracleCase.radiusCss,
    transform: oracleCase.transform ?? "none",
  });
  applyEffects(face, oracleCase);

  let backend;
  let candidate;
  if (mode === "native") {
    backend = "native-corner-shape";
    face.style.setProperty("corner-shape", oracleCase.shapeCss);
    applyStyles(face, nativeBackgroundCss(oracleCase.paint));
    applyBorder(face, oracleCase.border);
  } else {
    applyStyles(face, nativeBackgroundCss(oracleCase.paint));
    applyBorder(face, oracleCase.border);
    const production = await attachProductionCandidate(face, oracleCase);
    backend = production.backend;
    candidate = production.metadata;
    globalThis.__cornerfillOracleController = production.controller;
    globalThis.__cornerfillOracleHandle = production.handle;
    if (caseId === "bevel") {
      globalThis.__cornerfillOracleRunLifecycle = createCompiledLifecycleProof({
        ...production,
        element: face,
        oracleCase,
      });
    } else if (caseId === "mario-texel-face") {
      globalThis.__cornerfillOracleRunLifecycle = createRasterUpdateProof({
        ...production,
        element: face,
        oracleCase,
      });
    }
  }

  await document.fonts.ready;
  await nextPaint();
  const computed = getComputedStyle(face);
  const nativeSupported = CSS.supports("corner-shape", oracleCase.shapeCss);
  globalThis.__cornerfillOracle = Object.freeze({
    ready: true,
    schema: "cornerfill-browser-fixture@1",
    caseSchema: ORACLE_CASE_SCHEMA,
    candidateSchema: CANDIDATE_PAINTER_SCHEMA,
    caseId,
    description: oracleCase.description,
    mode,
    backend,
    nativeSupported,
    expectedCandidateLimitation: oracleCase.expectedCandidateLimitation ?? null,
    nativeOracleLimitation: oracleCase.nativeOracleLimitation ?? null,
    candidate: candidate ?? null,
    userAgent: navigator.userAgent,
    devicePixelRatio,
    captureSize: Object.freeze([captureWidth, captureHeight]),
    faceSize: Object.freeze([width, height]),
    computed: Object.freeze({
      backgroundImage: computed.backgroundImage,
      backgroundPosition: computed.backgroundPosition,
      backgroundSize: computed.backgroundSize,
      borderRadius: computed.borderRadius,
      borderWidths: Object.freeze([
        computed.borderTopWidth,
        computed.borderRightWidth,
        computed.borderBottomWidth,
        computed.borderLeftWidth,
      ]),
      boxShadow: computed.boxShadow,
      outline: `${computed.outlineWidth} ${computed.outlineStyle} ${computed.outlineColor} / ${computed.outlineOffset}`,
      cornerShape: computed.getPropertyValue("corner-shape"),
      transform: computed.transform,
    }),
    sourceEvidence: oracleCase.sourceEvidence ?? null,
  });
  document.documentElement.dataset.ready = "true";
  document.documentElement.dataset.case = caseId;
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.backend = backend;
}

render().catch((error) => {
  globalThis.__cornerfillOracle = Object.freeze({
    ready: false,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
  document.documentElement.dataset.error = globalThis.__cornerfillOracle.error;
  throw error;
});
