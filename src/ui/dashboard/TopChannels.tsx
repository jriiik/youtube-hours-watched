import { useId } from "react";
import type { ChannelStat } from "../../core/types";
import { channelRows } from "./model";

interface TopChannelsProps {
  channels: ChannelStat[];
  estimateHours: number;
  isUb: boolean;
}

export function TopChannels({ channels, estimateHours, isUb }: TopChannelsProps) {
  const titleId = useId();
  const rows = channelRows(channels, estimateHours);
  return (
    <section aria-labelledby={titleId} className="rank panel">
      <div className="section-head">
        <div className="section-head__text">
          <h2 id={titleId} className="section-title">
            Top channels
          </h2>
          <p className="section-sub">By watch time, with share of the total.</p>
        </div>
        {isUb && <span className="soft-pill">Best estimate</span>}
      </div>
      {rows.length === 0 ? (
        <p className="empty-note">No channels for this period.</p>
      ) : (
        <ol className="rank__list">
          {rows.map((c) => (
            <li key={`${c.rank}-${c.name}`} className={c.lead ? "ch-row ch-row--lead nb-row" : "ch-row nb-row"}>
              <span className="ch-row__rank">{c.rank}</span>
              <span className="ch-row__avatar" aria-hidden="true">
                {c.initials}
              </span>
              <div className="ch-row__main">
                <div className="ch-row__title">
                  <span className="ch-row__name" title={c.name}>
                    {c.name}
                  </span>
                  {c.category && <span className="ch-row__cat">{c.category}</span>}
                </div>
                <div className="bar-track" aria-hidden="true">
                  <div className="bar-fill" style={{ width: `${c.w.toFixed(1)}%` }} />
                </div>
              </div>
              <div className="ch-row__nums">
                <span className="ch-row__hours">{c.hours}</span>
                {c.share && <span className="ch-row__share">{c.share}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
