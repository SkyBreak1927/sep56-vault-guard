import { table, text, verified } from '../blocks'
import type { DocsPage } from '../types'

export const testVaults: DocsPage = {
  slug: 'test-vaults',
  tag: 'Reference',
  title: 'Test vaults',
  lead: 'Vaults the project deployed on Testnet to test the checker itself, with the results each one gives.',
  sections: [
    {
      id: 'vaults',
      title: 'Deployed test vaults',
      blocks: [
        table(
          ['Vault', 'Address', 'Configuration', 'Result'],
          [
            [
              'Reference vault (default)',
              '`CAMDXP2QABDOUMU6F6WPQ5HVKVXCD4MOWPLBZF4KHIBXAD7NT3AGYTNF`',
              'Reference code, `decimals_offset = 0`, native XLM',
              '10 PASS, 1 FAIL (`donation_attack`)',
            ],
            [
              'Demo Vault',
              '`CAPH3KBZTQQCCP6QD5DRXFFFRAMTQVAGBTW5TLHEHLNJMXY7GKGIJBNQ`',
              'Same code, `decimals_offset = 0`',
              '10 PASS, 1 FAIL (`donation_attack`)',
            ],
            [
              'Vault A',
              '`CAWUBSRHD4DUDWAJENO7XHI3QVEXKIU3ZZ4HRM3RFZ4PNBSCCYXH4VTA`',
              'Same code, `decimals_offset = 6`',
              '10 PASS, 1 FAIL (`donation_attack`)',
            ],
            [
              'Vault B',
              '`CAZBXMYP5TQWEHCFMUD6ZEON7DUWAC2BCKNCKKVBIRX7GZN7M6I2P6HV`',
              'Deliberate rounding bug',
              '9 PASS, 2 FAIL (`donation_attack`, `rounding_direction`)',
            ],
            [
              'Hardened Vault',
              '`CCVC5VLAH2RNCPWLR76P3IP6PCLOGG4AIOXXIQ5RNNG3DCKJ3ULBJUVG`',
              'Burns 1,000 shares to itself in the constructor',
              '10 PASS, 1 FAIL (`donation_attack`)',
            ],
            [
              'Blind Vault',
              '`CCW5GTIFMGRPURESMVVFDFRQHX5ZBW3BTDKVPFNV2KFWY6Q7MVZLHGV7`',
              'Custom token asset, `decimals_offset = 3`',
              '10 PASS, 1 FAIL (`donation_attack`)',
            ],
            [
              'Positive Control Vault',
              '`CAHMH3VSMNCYDCRTCZBJOKJE65HT2LJBZQFQULMRH6E2OGGGPMSNG376`',
              'Hardened Vault code with `DEAD_SHARES = 100_000_000`, `decimals_offset = 0`, native XLM',
              '11 PASS, 0 FAIL',
            ],
          ],
        ),
        verified('Results as recorded in `VAULT_CHECKS.md`.'),
        text(
          "Vault B is the negative control: it shows `rounding_direction` catches a real, injected bug. The Hardened Vault raised the victim's shares in `donation_attack` from 0 to 100, still far below the 90% threshold.",
        ),
        text(
          "The Positive Control Vault is a control for `donation_attack` only, not a recommended design. Its dead-shares value was chosen after the parameters of that check were known, and only one donation size was tested.",
        ),
      ],
    },
    {
      id: 'using',
      title: 'Using them',
      blocks: [
        verified(
          "The conformance checks change these vaults' state. Use them for trying the checker. Do not run the checker against vaults you do not own.",
        ),
      ],
    },
  ],
}
