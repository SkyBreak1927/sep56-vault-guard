/**
 * The 11 checks the backend runs. Names and descriptions are the corrected
 * copy from design-reference/CORRECTED_CONTENT.md — the backend only ever
 * supplies id/group/status/detail, never human-readable copy.
 */
export type CheckGroup = 'conformance' | 'security'
/**
 * "inconclusive" (a prerequisite was not met, so no verdict) and
 * "not_applicable" (the check does not fit this vault's design) are final,
 * like pass/fail/warn.
 */
export type CheckStatus = 'pending' | 'running' | 'pass' | 'fail' | 'warn' | 'inconclusive' | 'not_applicable'

export const CHECK_STATUSES: readonly CheckStatus[] = ['pending', 'running', 'pass', 'fail', 'warn', 'inconclusive', 'not_applicable']

export interface CheckDef {
  id: string
  group: CheckGroup
  name: string
  description: string
}

export const CHECK_DEFS: CheckDef[] = [
  { id: 'total_assets', group: 'conformance', name: 'Total assets accounting', description: 'Vault reports total assets accurately and consistently.' },
  { id: 'deposit', group: 'conformance', name: 'Deposit conformance', description: 'Deposit function behaves per SEP-56 spec.' },
  { id: 'mint', group: 'conformance', name: 'Mint conformance', description: 'Mint function behaves per SEP-56 spec.' },
  { id: 'withdraw', group: 'conformance', name: 'Withdraw conformance', description: 'Withdraw function behaves per SEP-56 spec.' },
  { id: 'redeem', group: 'conformance', name: 'Redeem conformance', description: 'Redeem function behaves per SEP-56 spec.' },
  { id: 'convert_to_shares', group: 'conformance', name: 'Convert to shares accuracy', description: 'Asset→share conversion math is correct.' },
  { id: 'convert_to_assets', group: 'conformance', name: 'Convert to assets accuracy', description: 'Share→asset conversion math is correct.' },
  { id: 'donation_attack', group: 'security', name: 'Donation / inflation attack resistance', description: 'Tests vulnerability to direct-donation share-price manipulation.' },
  { id: 'overflow_protection', group: 'security', name: 'Overflow protection', description: 'Tests handling of extreme values without overflow/crash.' },
  { id: 'rounding_direction', group: 'security', name: 'Rounding direction safety', description: 'Confirms rounding always favors the vault, never the attacker.' },
  { id: 'access_control_probing', group: 'security', name: 'Access control probing', description: 'Confirms sensitive functions are properly authorization-gated.' },
]

export const CHECK_GROUPS: { id: CheckGroup; title: string }[] = [
  { id: 'security', title: 'Security checks' },
  { id: 'conformance', title: 'Conformance checks' },
]

export const FINAL_STATUSES: ReadonlySet<CheckStatus> = new Set(['pass', 'fail', 'warn', 'inconclusive', 'not_applicable'])

/** Stellar contract address: "C" + 55 base32 characters. */
export const VAULT_ADDRESS_RE = /^C[A-Z2-7]{55}$/

/** Testnet vaults used to validate the checker itself. */
export const SHOWCASE_VAULTS: { label: string; address: string; note: string }[] = [
  { label: 'Demo Vault', address: 'CAPH3KBZTQQCCP6QD5DRXFFFRAMTQVAGBTW5TLHEHLNJMXY7GKGIJBNQ', note: 'Reference vault config, deployed for public demos' },
  { label: 'Hardened Vault', address: 'CCVC5VLAH2RNCPWLR76P3IP6PCLOGG4AIOXXIQ5RNNG3DCKJ3ULBJUVG', note: 'Reference vault + a real dead-shares donation-attack mitigation' },
  { label: 'Blind Vault', address: 'CCW5GTIFMGRPURESMVVFDFRQHX5ZBW3BTDKVPFNV2KFWY6Q7MVZLHGV7', note: 'Unmodified vault clone with a custom non-native asset, decimals_offset=3' },
  { label: 'Vault A', address: 'CAWUBSRHD4DUDWAJENO7XHI3QVEXKIU3ZZ4HRM3RFZ4PNBSCCYXH4VTA', note: 'Reference vault with decimals_offset=6' },
  { label: 'Vault B', address: 'CAZBXMYP5TQWEHCFMUD6ZEON7DUWAC2BCKNCKKVBIRX7GZN7M6I2P6HV', note: "Deliberately buggy vault — rounds in the user's favor" },
]
