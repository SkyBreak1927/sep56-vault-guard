#!/bin/sh
set -e

# The CLI shells out to `stellar contract invoke`/`deploy` using two named
# identities (alice, bob). A fresh container has no local identity store, so
# generate and fund them against testnet (via Friendbot) on first start.
# `stellar keys address` succeeds silently if the identity already exists,
# so this is a no-op on subsequent restarts within the same container.
ensure_identity() {
  name="$1"
  if ! stellar keys address "$name" >/dev/null 2>&1; then
    echo "Generating and funding testnet identity '$name'..."
    stellar keys generate "$name" --network testnet --fund
  fi
}

ensure_identity alice
ensure_identity bob

exec "$@"
