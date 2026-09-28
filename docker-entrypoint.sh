#!/bin/sh
set -e

# The CLI shells out to `stellar contract invoke`/`deploy` using seven named
# identities: alice for the sequential positive-conformance checks, grace/bob
# as the donation_attack attacker/victim, and carol/dave/erin/frank for the
# other adversarial checks. The conformance sequence and all adversarial
# checks run concurrently (see cli/src/main.rs), so each gets its own
# account(s) and their transactions don't race on a shared sequence number. A fresh container has no local
# identity store, so generate and fund them against testnet (via Friendbot)
# on first start. `stellar keys address` succeeds silently if the identity
# already exists, so this is a no-op on subsequent restarts within the same
# container.
ensure_identity() {
  name="$1"
  if ! stellar keys address "$name" >/dev/null 2>&1; then
    echo "Generating and funding testnet identity '$name'..."
    stellar keys generate "$name" --network testnet --fund
  fi
}

ensure_identity alice
ensure_identity bob
ensure_identity carol
ensure_identity dave
ensure_identity erin
ensure_identity frank
ensure_identity grace

exec "$@"
