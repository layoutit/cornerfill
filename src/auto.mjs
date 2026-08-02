import { installCornerfillAuto } from "./auto-runtime.mjs";

export * from "./index.mjs";

export const cornerfill = globalThis.document ? installCornerfillAuto() : null;

cornerfill?.ready.catch((error) => {
  console.error("Cornerfill automatic installation failed", error);
});

export default cornerfill;
