#!/usr/bin/env bash
# Testnet regression of the 9 fixture vaults, with an automatic top-up of the
# Blind test token.
#
#   scripts/regress-testnet.sh --before <old-binary> --after <new-binary> \
#       [--only reference,blind] [--no-topup] [--out <dir>]
#
# Each fixture is run with the "before" binary and then the "after" binary
# (`--output json`), and the two runs are compared by scripts/regress-compare.mjs.
# The "after" run is also checked against the expected counts and exit code.
#
# Safety:
#   * Testnet only. The CLI hard-codes testnet, every `stellar` call here passes
#     `--network testnet`, and the script aborts when STELLAR_NETWORK,
#     STELLAR_RPC_URL or STELLAR_NETWORK_PASSPHRASE point anywhere else.
#   * Only identity NAMES are used (`stellar keys address <name>`). No secret key
#     or seed is read, printed or stored.
#   * The top-up only touches the Blind test token (no monetary value), only
#     from the identity `alice`, only for the shortfall (idempotent), and one
#     mint never exceeds MAX_MINT. Balances are printed before and after.
#   * Conformance checks change the state of the fixture vaults. Run it only
#     against these fixtures.
set -u -o pipefail

NETWORK=testnet
TESTNET_PASSPHRASE='Test SDF Network ; September 2015'
BLIND_TOKEN=CCNIPWVKCN225GVSFC77LBI6Y4TZLQRR3LUTS7JLGBXED3Y2PMDI6SSG
MINT_ADMIN=alice
MAX_MINT=500000000   # smallest-unit cap for one mint call

# name|vault|expected PASS|FAIL|INCONCLUSIVE|exit code
FIXTURES=(
  "reference|CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF|10|1|0|1"
  "demo|CAPH3KBZTQQCCP6QD5DRXFFFRAMTQVAGBTW5TLHEHLNJMXY7GKGIJBNQ|10|1|0|1"
  "vault-a|CAWUBSRHD4DUDWAJENO7XHI3QVEXKIU3ZZ4HRM3RFZ4PNBSCCYXH4VTA|10|1|0|1"
  "vault-b|CAZBXMYP5TQWEHCFMUD6ZEON7DUWAC2BCKNCKKVBIRX7GZN7M6I2P6HV|9|2|0|1"
  "hardened|CCVC5VLAH2RNCPWLR76P3IP6PCLOGG4AIOXXIQ5RNNG3DCKJ3ULBJUVG|10|1|0|1"
  "blind|CCW5GTIFMGRPURESMVVFDFRQHX5ZBW3BTDKVPFNV2KFWY6Q7MVZLHGV7|10|1|0|1"
  "positive-control|CAHMH3VSMNCYDCRTCZBJOKJE65HT2LJBZQFQULMRH6E2OGGGPMSNG376|11|0|0|0"
  "reverting-max|CBMB3D7H22CARRIQX3CXEABXBY7QXSYCG4JJ5LL5DD3T3DHE46GNH5O4|6|1|4|1"
  "sep41-names|CDTVHZ2EGTROAUVERX2YVN6GF7PTRWBMHHLKSWCQYQEYXIUTPXILUEIM|11|0|0|0"
)

# account|balance needed at the start of one Blind run|spent by one run
# (spent is a safe upper bound; it decides how much extra a second run needs)
BLIND_NEEDS=(
  "alice|10000000|0"
  "bob|5000000|5000000"
  "dave|100000|10000"
  "erin|10000000|10000000"
  "grace|100000001|60000000"
)

die() { echo "ABORT: $*" >&2; exit 2; }

BEFORE=""; AFTER=""; ONLY=""; TOPUP=1
OUT="$(cd "$(dirname "$0")/.." && pwd)/target/regress"
while [ $# -gt 0 ]; do
  case "$1" in
    --before) BEFORE="${2:-}"; shift 2 ;;
    --after) AFTER="${2:-}"; shift 2 ;;
    --only) ONLY="${2:-}"; shift 2 ;;
    --no-topup) TOPUP=0; shift ;;
    --out) OUT="${2:-}"; shift 2 ;;
    *) die "unknown argument: $1" ;;
  esac
done
[ -x "$BEFORE" ] && [ -x "$AFTER" ] || die "give --before and --after as paths of executable binaries"
command -v stellar >/dev/null || die "stellar CLI not found on PATH"
command -v node >/dev/null || die "node not found on PATH"

# --- Testnet guard -----------------------------------------------------------
[ -z "${STELLAR_NETWORK:-}" ] || [ "${STELLAR_NETWORK}" = "$NETWORK" ] || die "STELLAR_NETWORK is '${STELLAR_NETWORK}', not testnet"
[ -z "${STELLAR_NETWORK_PASSPHRASE:-}" ] || [ "${STELLAR_NETWORK_PASSPHRASE}" = "$TESTNET_PASSPHRASE" ] || die "STELLAR_NETWORK_PASSPHRASE is not the testnet passphrase"
case "${STELLAR_RPC_URL:-}" in ""|*testnet*) ;; *) die "STELLAR_RPC_URL does not look like a testnet endpoint" ;; esac

mkdir -p "$OUT" || die "cannot create $OUT"

addr() { stellar keys address "$1" 2>/dev/null; }
for n in alice bob carol dave erin frank grace; do
  [ -n "$(addr "$n")" ] || die "identity '$n' is missing (stellar keys generate $n --network testnet --fund)"
done

# --- Blind token helpers -----------------------------------------------------
balance() { # <identity name> -> integer, or empty when it cannot be read
  local out
  out=$(stellar contract invoke --id "$BLIND_TOKEN" --source-account "$MINT_ADMIN" --network "$NETWORK" \
        --quiet --send=no -- balance --account "$(addr "$1")" 2>/dev/null | tr -d '"') || return 1
  case "$out" in ''|*[!0-9]*) return 1 ;; esac
  echo "$out"
}

print_balances() { # <label>
  local line="$1:" row n b
  for row in "${BLIND_NEEDS[@]}"; do
    n=${row%%|*}; b=$(balance "$n") || b="?"
    line="$line $n=$b"
  done
  echo "$line"
}

topup_blind() { # <number of Blind runs still to do>
  local runs=$1 row n base spend target have short
  balance "$MINT_ADMIN" >/dev/null || die "cannot read the Blind token on testnet (is $BLIND_TOKEN there?)"
  print_balances "Blind balances before top-up"
  for row in "${BLIND_NEEDS[@]}"; do
    IFS='|' read -r n base spend <<<"$row"
    target=$(( base + spend * (runs - 1) ))
    have=$(balance "$n") || die "cannot read the Blind balance of $n"
    [ "$have" -ge "$target" ] && continue
    short=$(( target - have ))
    [ "$short" -le "$MAX_MINT" ] || die "$n would need a mint of $short, above the cap $MAX_MINT; mint by hand if intended"
    echo "  minting $short to $n (had $have, target $target)"
    stellar contract invoke --id "$BLIND_TOKEN" --source-account "$MINT_ADMIN" --network "$NETWORK" --quiet \
      -- mint --to "$(addr "$n")" --amount "$short" >/dev/null 2>&1 || die "mint to $n failed (is $MINT_ADMIN the token admin?)"
    have=$(balance "$n") || die "cannot re-read the Blind balance of $n"
    [ "$have" -ge "$target" ] || die "after the mint $n holds $have, below the target $target"
  done
  print_balances "Blind balances after top-up "
}

# --- Run ---------------------------------------------------------------------
summary() { # <json file> -> "P F I"
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
    const c = s => Array.isArray(r) ? r.filter(x => x.status === s).length : 0
    console.log(c("PASS"), c("FAIL"), c("INCONCLUSIVE"))' "$1"
}

failures=0
rows=()
for fixture in "${FIXTURES[@]}"; do
  IFS='|' read -r name vault ep ef ei ex <<<"$fixture"
  if [ -n "$ONLY" ] && [[ ",$ONLY," != *",$name,"* ]]; then continue; fi
  echo "=== $name ($vault)"
  if [ "$name" = "blind" ]; then
    if [ "$TOPUP" -eq 1 ]; then topup_blind 2; else print_balances "Blind balances (no top-up)"; fi
  fi
  "$BEFORE" --vault "$vault" --output json >"$OUT/$name.before.json" 2>"$OUT/$name.before.err"; bx=$?
  [ "$name" = "blind" ] && print_balances "Blind balances after the before-run"
  "$AFTER" --vault "$vault" --output json >"$OUT/$name.after.json" 2>"$OUT/$name.after.err"; ax=$?
  [ "$name" = "blind" ] && print_balances "Blind balances after the after-run "
  cmp_out=$(node "$(dirname "$0")/regress-compare.mjs" "$OUT/$name.before.json" "$OUT/$name.after.json" "$bx" "$ax"); same=$?
  read -r p f i <<<"$(summary "$OUT/$name.after.json")"
  expected_ok="yes"
  if [ "$p" != "$ep" ] || [ "$f" != "$ef" ] || [ "$i" != "$ei" ] || [ "$ax" != "$ex" ]; then expected_ok="NO"; fi
  [ "$same" -eq 0 ] || failures=$((failures + 1))
  [ "$expected_ok" = "yes" ] || failures=$((failures + 1))
  rows+=("$name | before exit $bx, after exit $ax | after ${p}P ${f}F ${i}I | expected ${ep}P ${ef}F ${ei}I exit $ex: $expected_ok | before vs after: $(echo "$cmp_out" | head -1)")
  [ "$same" -eq 0 ] || echo "$cmp_out"
done

echo
echo "=== summary (JSON in $OUT)"
printf '%s\n' "${rows[@]}"
[ "$failures" -eq 0 ] && { echo "RESULT: all compared fixtures identical and as expected"; exit 0; }
echo "RESULT: $failures difference(s), see above"
exit 1
