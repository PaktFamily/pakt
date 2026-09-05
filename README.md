# Pakt

Pakt launches fixed-supply tokens into permanent Uniswap V4 markets on Robinhood Chain.

No bonding curve. No graduation. No liquidity migration. The market is live from block one.

## Protocol

- The complete supply is created at launch.
- Liquidity is permanently locked.
- Markets may be quoted in ETH or another priceable onchain asset.
- The default trading fee is 1%: 70% to the creator and 30% to the protocol.
- Protocol fees received in the launched token are burned.

## Mainnet

Robinhood Chain · chain ID `4663` · deployment block `54838631`

| Contract | Address |
| --- | --- |
| Factory | `0xE4E2827Bf9F5880460Efe612Dd65d17E0d785d05` |
| Router | `0x56326d413925aA06A6BAC68eaa8FD3162eEf1493` |
| Fee escrow | `0xd02B3cc9e31822c16616A263822C7d979565e9bA` |
| Locker | `0xb569fEa21ea7c9564c683ce405EeB6402Bbdb501` |
| Quote pricer | `0xa6AEFA86E44C3B753f618f8E4CbD83eC5a839f2e` |
| Position minter | `0x3397E68a4a5CD92Be0949Da6252CAb1C5E507483` |
| Launch deployer | `0xdB89a1F3166A62CAE6Ed59a9521C23c4f9Eb4552` |

## Source

| Path | Contents |
| --- | --- |
| `contracts/src/` | Core Solidity protocol |
| `web/` | Pakt interface |
| `sdk/` | Typed ABI and transaction builders |
| `docs/PROTOCOL.md` | Protocol mechanics |

## Links

- [pakt.family](https://pakt.family)
- [@Paktdotfamily](https://x.com/Paktdotfamily)

MIT licensed.
