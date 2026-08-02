import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { comparePngImages, readPng, writePng } from "./png.mjs";

export const COMPARE_REPORT_SCHEMA = "cornerfill-oracle-compare@1";

function listFrames(directory) {
  return readdirSync(directory)
    .filter((file) => /^frame_\d{4}\.png$/u.test(file))
    .sort((a, b) => a.localeCompare(b));
}

function fixed(value) {
  return Number(value.toFixed(8));
}

function compactMetrics(metrics) {
  return Object.freeze({
    ...metrics,
    changedPixelRatio: fixed(metrics.changedPixelRatio),
    meanAlpha: fixed(metrics.meanAlpha),
    meanPremultipliedRgb: fixed(metrics.meanPremultipliedRgb),
    maxPremultipliedRgb: fixed(metrics.maxPremultipliedRgb),
    boundaryChangedPixelRatio: fixed(metrics.boundaryChangedPixelRatio),
    interiorMeanAlpha: fixed(metrics.interiorMeanAlpha),
    interiorMeanPremultipliedRgb: fixed(metrics.interiorMeanPremultipliedRgb),
    connectedRegions: metrics.connectedRegions.slice(0, 32),
    omittedConnectedRegions: Math.max(0, metrics.connectedRegions.length - 32),
  });
}

function withinTolerance(metrics, tolerance) {
  return metrics.meanAlpha <= tolerance.maxMeanAlpha
    && metrics.meanPremultipliedRgb <= tolerance.maxMeanPremultipliedRgb
    && metrics.changedPixelRatio <= tolerance.maxChangedPixelRatio;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function reportCsv(frames) {
  const columns = [
    "frame",
    "caseId",
    "status",
    "meanAlpha",
    "meanPremultipliedRgb",
    "changedPixelRatio",
    "boundaryChangedPixelRatio",
    "interiorMeanAlpha",
    "interiorMeanPremultipliedRgb",
    "connectedRegionCount",
    "largestRegionPixels",
  ];
  const rows = frames.map((frame) => [
    frame.frame,
    frame.caseId,
    frame.status,
    frame.metrics.meanAlpha,
    frame.metrics.meanPremultipliedRgb,
    frame.metrics.changedPixelRatio,
    frame.metrics.boundaryChangedPixelRatio,
    frame.metrics.interiorMeanAlpha,
    frame.metrics.interiorMeanPremultipliedRgb,
    frame.metrics.connectedRegions.length + frame.metrics.omittedConnectedRegions,
    frame.metrics.connectedRegions[0]?.pixels ?? 0,
  ]);
  return `${[columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function reportMarkdown(report) {
  const lines = [
    `# ${report.label}`,
    "",
    `Status: **${report.status}**`,
    "",
    `Expected: \`${report.expectedDirectory}\``,
    "",
    `Actual: \`${report.actualDirectory}\``,
    "",
    `Tolerance: ${report.tolerance.approved ? "approved" : "not approved"} — ${report.tolerance.note}`,
    "",
    "| Frame | Case | Status | Mean alpha | Mean premultiplied RGB | Changed pixels |",
    "| --- | --- | --- | ---: | ---: | ---: |",
  ];
  for (const frame of report.frames) {
    lines.push(
      `| ${frame.frame} | ${frame.caseId} | ${frame.status} | `
      + `${frame.metrics.meanAlpha} | ${frame.metrics.meanPremultipliedRgb} | `
      + `${(frame.metrics.changedPixelRatio * 100).toFixed(4)}% |`,
    );
  }
  lines.push(
    "",
    `Worst frame by mean alpha: ${report.summary.worstMeanAlpha?.frame ?? "none"}`,
    "",
    `Worst frame by changed ratio: ${report.summary.worstChangedPixelRatio?.frame ?? "none"}`,
    "",
  );
  return lines.join("\n");
}

export function compareFrameDirectories({
  expectedDirectory,
  actualDirectory,
  outputDirectory,
  label,
  tolerance,
  caseByFrame = new Map(),
}) {
  const expectedFiles = listFrames(expectedDirectory);
  const actualFiles = listFrames(actualDirectory);
  const missingExpected = actualFiles.filter((file) => !expectedFiles.includes(file));
  const missingActual = expectedFiles.filter((file) => !actualFiles.includes(file));
  mkdirSync(outputDirectory, { recursive: true });
  const diffDirectory = join(outputDirectory, "diffs");
  mkdirSync(diffDirectory, { recursive: true });
  const paired = expectedFiles.filter((file) => actualFiles.includes(file));
  const frames = [];
  for (const file of paired) {
    const expected = readPng(join(expectedDirectory, file));
    const actual = readPng(join(actualDirectory, file));
    const comparison = comparePngImages(expected, actual, {
      channelThreshold: tolerance.channelThreshold,
    });
    const metrics = compactMetrics(comparison.metrics);
    const qualifiedPass = withinTolerance(metrics, tolerance);
    const status = tolerance.approved ? (qualifiedPass ? "PASS" : "FAIL") : "UNQUALIFIED";
    const caseId = caseByFrame.get(file) ?? basename(file, ".png");
    writePng(join(diffDirectory, file), comparison.heatmap);
    frames.push(Object.freeze({ frame: file, caseId, status, metrics }));
  }
  const worst = (key) => frames.length === 0 ? null : frames.reduce(
    (current, frame) => frame.metrics[key] > current.metrics[key] ? frame : current,
  );
  const structurallyValid = missingExpected.length === 0 && missingActual.length === 0
    && expectedFiles.length > 0 && actualFiles.length > 0;
  const status = !structurallyValid
    ? "INVALID"
    : !tolerance.approved
      ? "UNQUALIFIED"
      : frames.every((frame) => frame.status === "PASS")
        ? "PASS"
        : "FAIL";
  const report = Object.freeze({
    schema: COMPARE_REPORT_SCHEMA,
    label,
    status,
    expectedDirectory,
    actualDirectory,
    tolerance,
    structure: Object.freeze({
      expectedFrames: expectedFiles.length,
      actualFrames: actualFiles.length,
      comparedFrames: paired.length,
      missingExpected,
      missingActual,
    }),
    summary: Object.freeze({
      worstMeanAlpha: worst("meanAlpha"),
      worstMeanPremultipliedRgb: worst("meanPremultipliedRgb"),
      worstChangedPixelRatio: worst("changedPixelRatio"),
    }),
    frames: Object.freeze(frames),
  });
  writeFileSync(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outputDirectory, "report.csv"), reportCsv(frames));
  writeFileSync(join(outputDirectory, "summary.md"), reportMarkdown(report));
  return report;
}

export function readTolerances(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value?.schema !== "cornerfill-oracle-tolerances@1") {
    throw new Error(`unexpected tolerance schema: ${value?.schema ?? "missing"}`);
  }
  for (const key of ["calibration", "candidate"]) {
    const entry = value[key];
    if (typeof entry?.approved !== "boolean" || !Number.isFinite(entry.maxMeanAlpha)
      || !Number.isFinite(entry.maxMeanPremultipliedRgb)
      || !Number.isFinite(entry.maxChangedPixelRatio)
      || !Number.isInteger(entry.channelThreshold)) {
      throw new Error(`invalid ${key} tolerance`);
    }
  }
  return Object.freeze(value);
}
