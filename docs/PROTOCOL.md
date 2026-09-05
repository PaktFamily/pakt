# Protocol

Pakt is a token-and-market primitive for Robinhood Chain. It creates a fixed-supply ERC-20 and its Uniswap V4 market in one launch transaction.

The design goal is simple: reduce the number of things that must go right after a token is created.

## Launch lifecycle

1. The creator chooses token metadata, a fee recipient, a quote asset, and an optional creator fee.
2. `V4LaunchQuotePricer` verifies that the quote asset has a qualifying ETH price path.
3. The factory freezes the current economics in a launch record.
4. `V4LaunchDeployer` creates the token at a predictable CREATE2 address.
5. The complete fixed supply is minted into the launch path.
6. `V4LaunchPositionMinter` initializes the V4 pool and creates a single-sided full-range position.
7. The position NFT is transferred to `V4LaunchLocker` permanently.
8. Trading begins. There is no later graduation or liquidity migration.

The creator may bundle a first buy into the launch transaction. If that transaction reverts, both the launch and the buy revert. Nobody gets a gap between the two.

## Supply and liquidity

Launch tokens have no owner, mint function, pause function, transfer tax, or upgrade hook. The initial supply is the final supply except for tokens later destroyed by the fee mechanism.

The locker has no position-withdrawal function and no arbitrary-call escape hatch. “Locked” is a contract property, not a dashboard label.

## Opening value

The production profile expresses the opening fully diluted value in ETH. For an ERC-20 quote asset, the pricer converts that value using a qualifying onchain reference path immediately before launch.

Clients should call `previewLaunchEconomics` and include the returned digest in `TokenParams.expectedEconomics`. The launch reverts if price or fee inputs change before inclusion.

Reference pricing is spot pricing. It is an admission and initialization mechanism, not a promise of fair value.

## Quote assets

Native ETH is accepted directly. An ERC-20 quote asset qualifies when all of the following are true:

- it has at least six decimals;
- it has a direct ETH/WETH reference pool, or a complete route through USDG;
- every required reference leg clears the configured ETH-equivalent liquidity floor;
- a V4 reference pool is hookless, explicitly approved, or returned by a trusted registry.

The default liquidity floor is 5 ETH equivalent. Governance may change admission rules for future launches. Existing markets remain unchanged.

## Fees

The default base fee is 1%. Its split is 70% to the creator and 30% to the protocol. A creator may add 0–5%; that additional portion goes entirely to the creator.

For either pool asset, the protocol share is:

```text
collected amount × base fee × protocol share
─────────────────────────────────────────────
             base fee + creator fee
```

That formula prevents the protocol from taking a share of the creator's additional fee.

- If the protocol receives the quote asset, it is sent to the snapshotted protocol recipient.
- If the protocol receives the launched token, it is burned immediately.
- Creator proceeds are credited to `V4LaunchFeeEscrow` and claimed by the configured recipient.

Anyone may call `collectFees`. Callers cannot redirect proceeds or change the split. The scheduled keeper merely pays gas to trigger this public accounting path.

## Roles and trust

| Component | Authority |
| --- | --- |
| Launch token | None after creation |
| Locker | Factory binding during setup; no LP withdrawal |
| Factory owner | Future launch configuration and policy |
| Quote pricer owner | Future pricing sources and liquidity floor |
| Creator | Its own future fee-recipient address |
| Keeper | No role; public `collectFees` caller only |
| Indexer | None; read-only and rebuildable |

Production ownership should be accepted by a Safe or timelock before the deployment is declared complete.

## Invariants worth defending

- fixed supply cannot increase;
- locked liquidity cannot be removed;
- existing market economics cannot be rewritten;
- a keeper failure cannot stop trading;
- an indexer failure cannot change chain state;
- a failed creator payout is escrowed rather than silently lost;
- production clients never default to zero slippage protection.
