#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const input = new URL("../oracle/qualification.json", import.meta.url);
const tolerancesInput = new URL("../oracle/tolerances.json", import.meta.url);
const output = new URL("../src/qualification.mts", import.meta.url);
const qualification = JSON.parse(readFileSync(input, "utf8"));
const tolerances = JSON.parse(readFileSync(tolerancesInput, "utf8"));
const candidateStatuses = new Set(["UNQUALIFIED", "PASS", "FAIL", "INVALID"]);
const exactCalibration = [
  "maxMeanAlpha",
  "maxMeanPremultipliedRgb",
  "maxChangedPixelRatio",
  "channelThreshold",
].every((key) => tolerances.calibration?.[key] === 0);
const candidateStatus = qualification.candidate?.status;
const candidateApproved = qualification.candidate?.approvedTolerance;
const candidateStateIsConsistent = candidateStatus === "UNQUALIFIED"
  ? candidateApproved === false
  : candidateStatus === "PASS" || candidateStatus === "FAIL"
    ? candidateApproved === true
    : candidateStatus === "INVALID";
const candidateEvidence = qualification.candidate?.evidence;
const nonEmptyRecord = (value) => value && typeof value === "object"
  && !Array.isArray(value) && Object.keys(value).length > 0;
const approvedCandidateHasEvidence = candidateApproved !== true || (
  typeof candidateEvidence?.sourceCommit === "string" && candidateEvidence.sourceCommit.length > 0
  && typeof candidateEvidence?.specRevision === "string" && candidateEvidence.specRevision.length > 0
  && nonEmptyRecord(candidateEvidence?.browserVersions)
  && Array.isArray(candidateEvidence?.cases) && candidateEvidence.cases.length > 0
  && nonEmptyRecord(candidateEvidence?.fixtureHashes)
  && typeof candidateEvidence?.artifactHash === "string" && candidateEvidence.artifactHash.length > 0
  && typeof candidateEvidence?.generatedAt === "string" && !Number.isNaN(Date.parse(candidateEvidence.generatedAt))
  && typeof candidateEvidence?.reviewedBy === "string" && candidateEvidence.reviewedBy.length > 0
);

if (qualification?.schema !== "cornerfill-oracle-qualification@1"
  || tolerances?.schema !== "cornerfill-oracle-tolerances@1"
  || qualification.nativeCalibration?.status !== "PASS"
  || qualification.nativeCalibration?.approvedTolerance !== true
  || qualification.nativeCalibration?.exactZeroTolerance !== true
  || tolerances.calibration?.approved !== true
  || !exactCalibration
  || !candidateStatuses.has(candidateStatus)
  || !candidateStateIsConsistent
  || !approvedCandidateHasEvidence
  || candidateApproved !== tolerances.candidate?.approved) {
  throw new TypeError("oracle/qualification.json does not satisfy the release qualification contract");
}

function frozen(value) {
  if (Array.isArray(value)) return `Object.freeze([${value.map(frozen).join(",")}])`;
  if (value && typeof value === "object") {
    return `Object.freeze({${Object.entries(value).map(([key, entry]) => (
      `${JSON.stringify(key)}:${frozen(entry)}`
    )).join(",")}})`;
  }
  return JSON.stringify(value);
}

writeFileSync(
  output,
  `// Generated from oracle/qualification.json. Do not edit.\nexport const CORNERFILL_ORACLE_QUALIFICATION = ${frozen(qualification)};\n`,
);
