"""Host-run local account bootstrap CLI; emits aggregate counts only."""
import argparse

from app.core.database import SessionLocal
from app.services.account_bootstrap import bootstrap_accounts


def main() -> None:
    parser = argparse.ArgumentParser(); parser.add_argument("mode", choices=("check", "apply")); args = parser.parse_args()
    # Host runner supplies source metadata through its local adapter. Empty is safe for Codex.
    with SessionLocal() as db:
        result = bootstrap_accounts(db, [], apply=args.mode == "apply")
    print(" ".join(f"{k}={getattr(result, k)}" for k in result.__dataclass_fields__))
if __name__ == "__main__": main()
