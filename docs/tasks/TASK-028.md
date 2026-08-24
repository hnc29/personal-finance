# TASK-028 — Verified bank branding and local account bootstrap

This task extends the current bank catalog and account setup.

## A. Bank icons from verified official web sources

The user explicitly requested the correct icon/logo for each bank.

Rules:
- Prefer a brand icon/favicon/logo linked by each bank's own official website.
- Assets are fetched by the HOST runner before Codex, never from an unverified
  logo pack.
- Store successful assets locally under `apps/web/public/banks/` so the daily app
  stays local/offline.
- Keep source attribution metadata in `apps/web/lib/bank-catalog.ts` or a nearby
  manifest: bank key, display name, official website, local asset path.
- Do not hotlink at runtime.
- If an official site does not expose a usable icon, use the existing original
  monogram/CSS fallback; never substitute a random third-party logo.
- Show the bank icon in:
  - bank template picker
  - account list/card
  - transfer source/destination selectors
  - credit-card account presentation when issuing bank can be matched
- keep accessible alt labels; decorative duplicates may be aria-hidden.

Catalog should cover at least:
Vietcombank, BIDV, VietinBank, Agribank, MB, Techcombank, ACB, VPBank,
TPBank, VIB, Sacombank, HDBank, OCB, MSB, SHB, SeABank, LPBank,
Eximbank, Nam A Bank, Bac A Bank, plus Other/Custom.

Do not claim affiliation with the banks.

## B. Create local accounts from existing imported/current data

The user explicitly asked to create cash/bank/card accounts based on data
already present in the local application.

This must be LOCAL deterministic logic. Never send existing finance data to
Codex or any network service.

Implement a backend account-bootstrap command/service:
- inspect only the local application's own persisted account/import metadata at
  runtime when invoked by the user/host runner
- reuse existing immutable Money Lover import metadata/wallet/account names if
  such fields exist
- detect already-existing accounts and never duplicate them
- preserve all existing accounts unchanged
- create missing accounts only when account name/type can be determined
  deterministically from source metadata
- supported targets:
  CASH
  BANK
  CREDIT_CARD
  EWALLET if explicitly represented
- match known bank aliases against the verified bank catalog
- credit-card detection must require explicit source type or unambiguous card
  metadata; do not turn a normal bank account into a credit card just because
  its name contains a bank
- ambiguous candidates are skipped and counted for review; do not guess
- do NOT create opening-balance ledger entries automatically; this avoids
  double-counting imported historical transactions
- do NOT alter balances
- do NOT create one account for every bank in the catalog
- do NOT print account names, balances, card numbers, statement text, or other
  sensitive data to logs
- print aggregate counts only:
  existing, created_cash, created_bank, created_credit_card, created_ewallet,
  skipped_ambiguous

Idempotency:
- running twice creates zero duplicates
- matching should use normalized deterministic identifiers/names supported by
  the current schema
- no schema migration

Provide:
- `check` mode: aggregate preview only, no writes
- `apply` mode: create missing deterministic accounts in one transaction
- a small marker file such as `apps/api/.account-bootstrap-cli` containing the
  Python module path for the host runner

## C. Bank/icon association without schema migration

Inspect the existing Account model first.

If there is no institution/bank-id column:
- do not add a migration
- infer display icon from account name using bank catalog aliases
- newly created account templates should use canonical bank display names so
  matching is reliable
- user-custom account names remain unchanged

If an existing metadata field already supports institution identity, reuse it.

## D. Tests

Synthetic/disposable tests only:
- bank alias matching
- each bank catalog row has official website metadata
- icon path resolves to either verified local asset or documented fallback
- account bootstrap empty source -> no writes
- source with explicit cash/bank/card metadata -> correct types created
- second apply -> zero duplicates
- pre-existing account preserved
- ambiguous source skipped
- no balance/ledger entry is created by bootstrap
- API/account UI still passes existing tests
- transfer selectors show bank icon mapping
- all i18n remains complete

## E. Real local DB action

Codex/tests must never read real `data/**`.

Only AFTER full disposable validation and commit, the HOST runner may execute:
1. bootstrap `check`
2. bootstrap `apply`
3. bootstrap `check`
against the normal configured local DB, because the user explicitly requested
creation of missing accounts from existing local data.

The command must log aggregate counts only.

## F. Safety

No migration.
No dependency upgrades.
Never npm audit fix --force.
No real finance data in Codex prompts/logs/tests.
No network call from the application at runtime for logos.
No account balances are synthesized.
No destructive account changes.
