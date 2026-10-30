import type { Summary } from "../../core/types";
import { keyStatsModel } from "./model";

interface StatProps {
  label: string;
  value: string;
  sub: string;
  /** Marks numbers that stay on the best estimate in "finished every video" mode. */
  estimateTag?: boolean;
}

function Stat({ label, value, sub, estimateTag }: StatProps) {
  return (
    <div className="stat">
      <div className="stat__label">
        <span>{label}</span>
        {estimateTag && <span className="est-tag">Estimate</span>}
      </div>
      <div className="stat__value">{value}</div>
      <div className="stat__sub">{sub}</div>
    </div>
  );
}

export function KeyStats({ summary, isUb }: { summary: Summary; isUb: boolean }) {
  const k = keyStatsModel(summary);
  return (
    <section aria-label="Key stats" className="stats">
      <div className="stat-pair">
        <Stat label="Videos watched" value={k.entries} sub="Every entry in your history" />
        <Stat label="Unique videos" value={k.unique} sub="Each counted once" />
      </div>
      <div className="stat-pair">
        <Stat label="Channels" value={k.channels} sub="Different channels" />
        <Stat label="Longest daily streak" value={k.streak} sub="In a row, at least one video" />
      </div>
      <div className="stat-pair">
        <Stat label="Longest binge" value={k.bingeDur} sub={k.bingeSub} estimateTag={isUb} />
        <Stat label="Busiest day" value={k.busyDur} sub={k.busyDate} estimateTag={isUb} />
      </div>
    </section>
  );
}
