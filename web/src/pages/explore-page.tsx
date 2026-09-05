import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { MarketCard } from "../components/market-card";
import { Button, buttonVariants } from "../components/ui/button";
import { getMarkets } from "../lib/api";
import { cn, compactNumber } from "../lib/utils";

type Filter = "hot" | "new" | "volume";

function marketColumns() {
  if (window.innerWidth <= 1_000) return 3;
  if (window.innerWidth <= 1_160) return 4;
  return 5;
}

export function ExplorePage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("hot");
  const [columns, setColumns] = useState(marketColumns);
  const [page, setPage] = useState(1);
  const { data: markets = [], error, isLoading, refetch } = useQuery({
    queryKey: ["markets"],
    queryFn: ({ signal }) => getMarkets(signal),
    refetchInterval: 5_000,
  });
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = markets.filter((market) => !needle || `${market.name} ${market.symbol} ${market.token}`.toLowerCase().includes(needle));
    return [...next].sort((a, b) => {
      return filter === "new" ? b.createdAt - a.createdAt : filter === "volume" ? b.volume - a.volume : b.marketCap - a.marketCap;
    });
  }, [filter, markets, query]);
  const pageSize = columns * 10;
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const pageMarkets = visible.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    const updateColumns = () => setColumns(marketColumns());
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  useEffect(() => setPage(1), [filter, query, columns]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="page-width explore-page">
      <div className="market-search-row">
        <label className="market-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tokens by name, ticker or address" /><kbd>⌘K</kbd></label>
        <Link className={buttonVariants({ size: "lg" })} to="/create">+ Create</Link>
      </div>

      <section id="markets" className="market-section">
        <div className="section-heading">
          <div className="market-section-title"><h1>Explore</h1><span>{compactNumber(markets.length)} launched</span></div>
          <div className="filter-pills" role="group" aria-label="Sort markets">
            {(["hot", "volume", "new"] as Filter[]).map((value) => <Button key={value} variant="ghost" className={cn(filter === value && "selected")} onClick={() => setFilter(value)}>{value === "hot" ? "Trending" : value === "new" ? "New" : "Market cap"}</Button>)}
          </div>
        </div>
          {isLoading ? (
            <div className="empty-market"><h3>Reading live markets…</h3><p>Waiting for finalized Robinhood Chain data.</p></div>
          ) : error ? (
            <div className="empty-market"><h3>Live data is unavailable.</h3><p>{error instanceof Error ? error.message : "The market indexer did not respond."}</p><Button onClick={() => void refetch()}>Retry</Button></div>
          ) : visible.length ? (
            <>
              <div className="market-grid">{pageMarkets.map((market) => <MarketCard key={market.token} market={market} />)}</div>
              {pageCount > 1 && (
                <nav className="market-pagination" aria-label="Market pages">
                  <Button variant="ghost" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} /> Previous</Button>
                  <span>Page <b>{page}</b> of {pageCount}</span>
                  <Button variant="ghost" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next <ChevronRight size={15} /></Button>
                </nav>
              )}
            </>
          ) : (
            <div className="empty-market"><h3>{markets.length ? "No market found." : "No markets yet."}</h3><p>{markets.length ? "Try another name, ticker or address." : "The first real market will appear here after it finalizes."}</p><Link className={buttonVariants()} to="/create">Create it</Link></div>
          )}
      </section>
    </div>
  );
}
