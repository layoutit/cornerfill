import test from "node:test";
import assert from "node:assert/strict";
import {
  MARIO_PREPARED_BRIDGE,
  MARIO_RUNTIME_ERROR,
  MARIO_SOURCE_STATE,
  MARIO_SOURCE_TICK,
  instrumentMarioModule,
} from "../scripts/mario-server.mjs";

const sceneFixture = `function writeStyle(element, property, value) {
  if (element.style[property] !== value) element.style[property] = value;
}
function initial(element, visible, index) {
    element.style.visibility = visible[index] === 1 ? "visible" : "hidden";
}
function update(leaves, index, shouldShow) {
    leaves[index].style.visibility = shouldShow ? "visible" : "hidden";
        leaves[index].style.visibility = "hidden";
        leaves[index].style.visibility = "hidden";
      leaves[index].style.backgroundPositionY = light.positions[face.stateOffset + state];
}`;

const animationFixture = `function frame() {
        tick += 1;
        if (experienceMode === "animation") advanceAnimation();
        else advanceInteraction();
        nextTick += SOURCE_TICK_MS;
}`;

test("Mario scene instrumentation routes prepared paint state without intercepting CSSStyleDeclaration", () => {
  const source = instrumentMarioModule("runtime/scene.js", sceneFixture);
  assert.match(source, new RegExp(`globalThis\\.${MARIO_PREPARED_BRIDGE}\\?\\.setBackgroundPositionY`));
  assert.match(source, new RegExp(`globalThis\\.${MARIO_PREPARED_BRIDGE}\\?\\.setVisibility`));
  assert.match(source, /if \(!handled\) element\.style\.backgroundPositionY = value/u);
  assert.match(source, /element\.style\.visibility = value/u);
  assert.doesNotMatch(source, /Object\.defineProperty|CSSStyleDeclaration|MutationObserver/u);
  assert.equal((source.match(/writePreparedLeafVisibility\(/gu) ?? []).length, 5);
});

test("Mario source ticks bracket one direct prepared batch", () => {
  const source = instrumentMarioModule("runtime/animation.js", animationFixture);
  assert.match(source, new RegExp(`globalThis\\.${MARIO_PREPARED_BRIDGE}`));
  assert.match(source, new RegExp(`globalThis\\.${MARIO_SOURCE_TICK}`));
  assert.match(source, new RegExp(`globalThis\\.${MARIO_SOURCE_STATE}`));
  assert.match(source, new RegExp(`globalThis\\.${MARIO_RUNTIME_ERROR}`));
  assert.match(source, /preparedBridge\?\.beginFrame\?\.\(\)/u);
  assert.match(source, /preparedBridge\?\.endFrame\?\.\(\);/u);
  assert.match(source, /preparedBridge\?\.abortFrame\?\.\(error\);/u);
  assert.ok(
    source.indexOf("preparedBridge?.endFrame?.();")
      < source.indexOf(`globalThis.${MARIO_SOURCE_TICK} = completedTick;`),
    "completed source tick must publish only after frame work and the direct batch succeed",
  );
});

test("Mario instrumentation rejects source drift instead of silently losing the fast path", () => {
  assert.throws(
    () => instrumentMarioModule("runtime/scene.js", "export const changed = true;"),
    /instrumentation expected/u,
  );
  assert.equal(instrumentMarioModule("runtime/other.js", "export const untouched = true;"), "export const untouched = true;");
});
