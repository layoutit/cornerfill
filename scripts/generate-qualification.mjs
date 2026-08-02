#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const input = new URL("../oracle/qualification.json", import.meta.url);
const output = new URL("../src/qualification.mts", import.meta.url);
const qualification = JSON.parse(readFileSync(input, "utf8"));

if (qualification?.schema !== "cornerfill-oracle-qualification@1"
  || qualification.nativeCalibration?.status !== "PASS"
  || qualification.nativeCalibration?.approvedTolerance !== true
  || qualification.candidate?.status !== "UNQUALIFIED"
  || qualification.candidate?.approvedTolerance !== false) {
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
