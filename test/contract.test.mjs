import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CORNERFILL_ORACLE_QUALIFICATION } from "../dist/qualification.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("production sources contain none of the prohibited CSS renderers", () => {
  const source = readdirSync(join(root, "src"))
    .filter((name) => name.endsWith(".mjs") || name.endsWith(".mts"))
    .map((name) => readFileSync(join(root, "src", name), "utf8"))
    .join("\n");
  for (const prohibited of ["clip-path", "mask-image", "-webkit-mask", "data:image/svg", "<svg"]) {
    assert.equal(source.includes(prohibited), false, `production source contains prohibited renderer ${prohibited}`);
  }
  assert.doesNotMatch(source, /setProperty\(["']transform["']/u);
});

test("generated oracle qualification stays consistent with tracked tolerances", () => {
  const source = JSON.parse(readFileSync(join(root, "oracle", "qualification.json"), "utf8"));
  const tolerances = JSON.parse(readFileSync(join(root, "oracle", "tolerances.json"), "utf8"));
  assert.deepEqual(CORNERFILL_ORACLE_QUALIFICATION, source);
  assert.equal(CORNERFILL_ORACLE_QUALIFICATION.nativeCalibration.status, "PASS");
  assert.equal(CORNERFILL_ORACLE_QUALIFICATION.nativeCalibration.approvedTolerance, true);
  assert.equal(CORNERFILL_ORACLE_QUALIFICATION.nativeCalibration.exactZeroTolerance, true);
  assert.equal(tolerances.calibration.approved, true);
  assert.equal(
    CORNERFILL_ORACLE_QUALIFICATION.candidate.approvedTolerance,
    tolerances.candidate.approved,
  );
  const { approvedTolerance, status } = CORNERFILL_ORACLE_QUALIFICATION.candidate;
  assert.ok(["UNQUALIFIED", "PASS", "FAIL", "INVALID"].includes(status));
  if (status === "UNQUALIFIED") assert.equal(approvedTolerance, false);
  if (status === "PASS" || status === "FAIL") assert.equal(approvedTolerance, true);
});
