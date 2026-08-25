import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// --- Guards against the exact bug reported in TASK-035: "khi bấm vào sửa
// [category] menu vẫn hiện tiếng anh" (editing a category still shows
// English). Root cause: `categoryLabel()` in lib/i18n.ts translates a
// category's canonical (English) name to Vietnamese via a closed,
// hand-maintained dictionary (`defaultCategoryLabels`) keyed by exact
// string match -- any category name present in the backend seed taxonomy
// (apps/api/app/services/default_categories.py) but missing from that
// dictionary silently renders as raw English in every category picker
// (ParentPicker, CategoryPicker, the category tree row list) whenever the
// UI is in Vietnamese mode. This audit fails loudly the moment the two
// fall out of sync, instead of letting it surface as a live English leak
// the next time someone edits a category. ---

const seedSrc = readFileSync("../api/app/services/default_categories.py", "utf8");
const i18nSrc = readFileSync("lib/i18n.ts", "utf8");

const treeMatch = seedSrc.match(/DEFAULT_CATEGORIES: Sequence\[CategoryNode\] = \((.*?)\n\)\n/s);
assert.ok(treeMatch, "TASK-035: could not locate DEFAULT_CATEGORIES tuple in apps/api/app/services/default_categories.py -- audit's extraction regex needs updating");
const seedNames = new Set([...treeMatch[1].matchAll(/"([^"]+)"/g)].map(m => m[1]));
assert.ok(seedNames.size > 60, "TASK-035: extracted suspiciously few category names from the backend seed tree -- extraction regex likely broke");

const labelsMatch = i18nSrc.match(/export const defaultCategoryLabels = \{([\s\S]*?)\} as const;/);
assert.ok(labelsMatch, "TASK-035: could not locate defaultCategoryLabels in lib/i18n.ts");
const labelKeys = new Set([...labelsMatch[1].matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map(m => m[1].replace(/\\"/g, '"')));

const missing = [...seedNames].filter(name => !labelKeys.has(name));
assert.deepEqual(missing, [], `TASK-035: these backend seed category names have no Vietnamese translation in defaultCategoryLabels (lib/i18n.ts) -- editing them in Vietnamese mode will leak raw English: ${missing.join(", ")}`);

console.log(`TASK-035 category i18n audit passed (${seedNames.size} seed category names, all translated)`);
