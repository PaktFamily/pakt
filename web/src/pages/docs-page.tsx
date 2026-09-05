import { ArrowUpRight } from "lucide-react";

import { appConfig } from "../lib/config";

const economics = [
  ["Opening FDV", "1.5 ETH equivalent"],
  ["Supply", "1,000,000,000 fixed"],
  ["Base fee", "1.00%"],
  ["Base split", "70% creator / 30% protocol"],
  ["Creator fee", "0–5%"],
  ["Reference depth", "5 ETH equivalent"],
] as const;

export function DocsPage() {
  return (
    <div className="docs-page page-width">
      <header className="docs-hero">
        <p className="eyebrow">Pakt protocol / v0.1</p>
        <h1>A market from block one.</h1>
        <p>
          Pakt launches fixed-supply tokens directly into permanent Uniswap V4 markets on Robinhood Chain. No bonding-curve waiting room. No graduation. No liquidity migration.
        </p>
        <div className="docs-status-row">
          <span>MAINNET CANDIDATE</span>
          <a href={`${appConfig.githubUrl}/blob/main/docs/PROTOCOL.md`} target="_blank" rel="noreferrer">
            Full source docs <ArrowUpRight size={13} />
          </a>
        </div>
      </header>

      <div className="docs-layout">
        <aside className="docs-toc">
          <span>On this page</span>
          <a href="#mechanism">Mechanism</a>
          <a href="#economics">Economics</a>
          <a href="#assets">Quote assets</a>
          <a href="#fees">Fee path</a>
          <a href="#trust">Trust boundary</a>
          <a href="#developers">Developers</a>
        </aside>

        <article className="docs-content">
          <section id="mechanism">
            <p className="docs-kicker">01 / Mechanism</p>
            <h2>Remove the awkward middle.</h2>
            <p>
              A launch creates the token, initializes its pool, mints one single-sided V4 position, and locks that position permanently. Trading starts in the same lifecycle. There is no second pool to migrate into and no liquidity key waiting in an operator wallet.
            </p>
            <ol>
              <li>Validate the quote asset and freeze launch economics.</li>
              <li>Create a predictable fixed-supply token.</li>
              <li>Initialize its V4 market and mint permanent liquidity.</li>
              <li>Optionally execute the creator's first buy atomically.</li>
            </ol>
          </section>

          <section id="economics">
            <p className="docs-kicker">02 / Economics</p>
            <h2>Defaults should be legible.</h2>
            <div className="docs-economics">
              {economics.map(([label, value]) => (
                <div key={label}><span>{label}</span><strong>{value}</strong></div>
              ))}
            </div>
            <p className="docs-note">Opening FDV is a contract parameter used to initialize the market. It is not a valuation claim and is not shown as a promise to creators.</p>
          </section>

          <section id="assets">
            <p className="docs-kicker">03 / Quote assets</p>
            <h2>Any priceable asset. Not any random address.</h2>
            <p>
              Native ETH works directly. ERC-20 quote assets need a qualifying ETH/WETH reference pool or a complete path through USDG, and every required leg must clear the liquidity floor. Hooked V4 references require explicit trust or registry support.
            </p>
          </section>

          <section id="fees">
            <p className="docs-kicker">04 / Fee path</p>
            <h2>Creators earn. The launched token gets scarcer.</h2>
            <div className="docs-flow-grid">
              <div><span>BUY</span><strong>Quote asset fees</strong><p>Creator share → escrow<br />Protocol share → treasury</p></div>
              <div><span>SELL</span><strong>Launch token fees</strong><p>Creator share → escrow<br />Protocol share → burn</p></div>
            </div>
            <p>
              Anyone can trigger collection, but nobody can redirect it. The scheduled keeper is deliberately unprivileged: it pays gas and calls the same public function available to every account.
            </p>
          </section>

          <section id="trust">
            <p className="docs-kicker">05 / Trust boundary</p>
            <h2>Small roles. Sharp edges.</h2>
            <ul>
              <li>Launch tokens have no owner, mint, pause, or upgrade path.</li>
              <li>The locker exposes no LP withdrawal or arbitrary-call path.</li>
              <li>Fee and recipient terms are snapshotted per market.</li>
              <li>The indexer is rebuildable and cannot change chain state.</li>
              <li>The keeper owns nothing and cannot stop trading.</li>
            </ul>
          </section>

          <section id="developers">
            <p className="docs-kicker">06 / Developers</p>
            <h2>Build against the contracts, not the interface.</h2>
            <p>
              The public SDK prepares launches without requesting wallet access. The event index can be rebuilt from chain history. Hookless pools remain available to compatible V4 routers even if Pakt's interface is offline.
            </p>
            <div className="docs-links">
              <a href={`${appConfig.githubUrl}/blob/main/docs/INTEGRATION.md`} target="_blank" rel="noreferrer">Integration guide <ArrowUpRight size={13} /></a>
              <a href={`${appConfig.githubUrl}/tree/main/sdk`} target="_blank" rel="noreferrer">SDK <ArrowUpRight size={13} /></a>
              <a href={`${appConfig.githubUrl}/blob/main/SECURITY.md`} target="_blank" rel="noreferrer">Security <ArrowUpRight size={13} /></a>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
