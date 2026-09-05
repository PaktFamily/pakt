import { AreaSeries, ColorType, createChart, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";

import type { Market, MarketSwap } from "../lib/types";

function liveSeries(swaps: MarketSwap[]) {
  const bySecond = new Map<number, number>();
  for (const swap of [...swaps].reverse()) {
    const price = Number(swap.priceQuotePerToken);
    if (Number.isFinite(price) && price > 0) bySecond.set(swap.timestamp, price);
  }
  return [...bySecond.entries()].map(([time, value]) => ({ time: time as UTCTimestamp, value }));
}

export function MarketChart({ market, swaps }: { market: Market; swaps: MarketSwap[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const data = useMemo(() => liveSeries(swaps), [swaps]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 380,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#86837d", fontFamily: "Chivo Mono", fontSize: 12 },
      grid: { vertLines: { color: "rgba(255,255,255,.045)" }, horzLines: { color: "rgba(255,255,255,.045)" } },
      rightPriceScale: { borderColor: "rgba(255,255,255,.1)" },
      timeScale: { borderColor: "rgba(255,255,255,.1)", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "rgba(255,90,54,.45)" }, horzLine: { color: "rgba(255,90,54,.45)" } },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#ff5a36",
      topColor: "rgba(255,90,54,.34)",
      bottomColor: "rgba(255,90,54,0)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
    });
    series.setData(data);
    chart.timeScale().fitContent();
    const observer = new ResizeObserver(([entry]) => {
      if (entry) chart.applyOptions({ width: entry.contentRect.width });
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [data]);

  if (!data.length) return <div className="chart-canvas chart-empty"><span>No finalized trades yet.</span></div>;
  return <div ref={ref} className="chart-canvas" aria-label={`${market.symbol} live price chart`} />;
}
