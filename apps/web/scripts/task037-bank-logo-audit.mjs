import assert from "node:assert/strict";
import { readFileSync, existsSync, statSync } from "node:fs";

// --- TASK-037: (1) real bank logo artwork (sourced from
// diadiembank.com/logo-ngan-hang-tai-viet-nam, per an explicit user
// request naming that URL) for the banks actually present in this user's
// accounts, replacing the colored-monogram fallback for those banks only;
// (2) the composer's .row-icon slots (account row / category row / note
// row) render their icon content at the SAME size (26px) so a real bank
// logo image doesn't look mismatched next to a category glyph in the same
// 32px slot. ---

const logosSrc = readFileSync("lib/account-logos.tsx", "utf8");
const page = readFileSync("app/page.tsx", "utf8");

// --- Every BANKS entry that declares a `logo:` key must have a matching
// PNG actually present in public/bank-logos -- an orphaned key would 404
// in the browser. ---
const logoKeyMatches = [...logosSrc.matchAll(/logo:\s*"([a-z0-9-]+)"/g)].map(m => m[1]);
assert.ok(logoKeyMatches.length >= 9, `TASK-037: expected at least 9 banks with real logo artwork, found ${logoKeyMatches.length}`);
for (const key of logoKeyMatches) {
  const path = `public/bank-logos/${key}.png`;
  assert.ok(existsSync(path), `TASK-037: BANKS entry references logo "${key}" but ${path} does not exist`);
  const { size } = statSync(path);
  assert.ok(size > 500 && size < 200_000, `TASK-037: ${path} has a suspicious file size (${size}B) -- expected a small normalized PNG`);
}

// --- Real banks with accounts in this app: SHB, VPBank, BIDV,
// Techcombank, PVcomBank, SCB, Eximbank, VIB, Shinhan -- every one must
// actually be wired to a logo key, not just present in the registry. ---
const expectedLogoBanks = ["SHB", "VPB", "BIDV", "TECH", "PVCOMBANK", "SCB", "EXIM", "VIB", "SHINHAN"];
for (const bankKey of expectedLogoBanks) {
  const re = new RegExp(`${bankKey}:\\s*\\{[^}]*logo:\\s*"[a-z0-9-]+"`);
  assert.ok(re.test(logosSrc), `TASK-037: BANKS["${bankKey}"] has no logo key wired up`);
}

// --- AccountLogo must render the real image (not just store the key) --
// this guards against wiring the data but forgetting the render branch. ---
assert.ok(/brand\?\.logo/.test(logosSrc) && /<img src=\{`\/bank-logos\/\$\{brand\.logo\}\.png`\}/.test(logosSrc), "TASK-037: AccountLogo no longer renders a real <img> for banks with a logo key");
assert.ok(logosSrc.includes("account-logo-image"), "TASK-037: account-logo-image wrapper class (for the white-card image styling) is missing");

// --- CSS: the image wrapper must exist so real logos get a consistent
// white card + object-fit:contain instead of stretching/cropping. ---
const css = readFileSync("app/styles.css", "utf8");
assert.ok(css.includes(".account-logo-image"), "TASK-037: .account-logo-image styling missing from styles.css");
assert.ok(/\.account-logo-image img\s*\{[^}]*object-fit:contain/.test(css), "TASK-037: bank logo <img> is not set to object-fit:contain -- risks stretched/cropped logos");

// --- Size sync: the three .row-icon slots in the transaction composer
// (account picker trigger, category picker trigger, note row) must all
// render their icon content at the same size so a real bank-logo image
// doesn't look mismatched next to a category glyph in the same 32px
// container. ---
assert.ok(/<AccountLogo name=\{chosen\.name\} accountType=\{chosen\.account_type\} size=\{26\} \/> : <IconGlyph iconKey="Wallet" size=\{26\} \/>/.test(page), "TASK-037: AccountRow trigger's logo/fallback sizes are no longer synced to 26");
assert.ok(/<CategoryIcon name=\{chosen\?\.name \?\? "Other"\} icon=\{chosen\?\.icon\} size=\{26\} \/>/.test(page), "TASK-037: CategoryPicker trigger icon size is no longer synced to 26");
assert.ok(/<IconGlyph iconKey="Notebook" size=\{26\} \/>/.test(page), "TASK-037: note row icon size is no longer synced to 26");
assert.ok(/<AccountLogo name=\{a\.name\} accountType=\{a\.account_type\} size=\{26\} \/>/.test(page), "TASK-037: AccountRow popover option logo size changed away from 26");

console.log(`TASK-037 bank logo audit passed (${logoKeyMatches.length} real bank logos wired, composer row-icon sizes synced at 26px)`);
