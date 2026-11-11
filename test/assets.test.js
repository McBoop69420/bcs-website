import assert from "node:assert/strict";
import test from "node:test";
import { stampAssets } from "../scripts/stamp-assets.mjs";

test("every CSS/JS link carries the current content hash", async () => {
  const stale = await stampAssets({ write: false });
  assert.deepEqual(stale, [], "a css/ or js/ file changed: run `npm run stamp` and commit the pages");
});
