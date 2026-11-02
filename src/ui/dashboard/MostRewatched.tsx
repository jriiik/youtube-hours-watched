import { useId } from "react";
import type { VideoStat } from "../../core/types";
import { videoRows } from "./model";

export function MostRewatched({ videos, isUb }: { videos: VideoStat[]; isUb: boolean }) {
  const titleId = useId();
  const rows = videoRows(videos);
  return (
    <section aria-labelledby={titleId} className="rank panel">
      <div className="section-head">
        <div className="section-head__text">
          <h2 id={titleId} className="section-title">
            Most rewatched
          </h2>
          <p className="section-sub">Times watched, and total hours spent on each.</p>
        </div>
        {isUb && <span className="soft-pill">Best estimate</span>}
      </div>
      {rows.length === 0 ? (
        <p className="empty-note">No video was watched more than once in this period.</p>
      ) : (
        <ol className="rank__list">
          {rows.map((x, i) => (
            <li key={`${i}-${x.title}`} className={x.lead ? "vid-row vid-row--lead nb-row" : "vid-row nb-row"}>
              <div className="thumb" aria-hidden="true" style={{ background: x.thumb.base }}>
                <div className="thumb__band" style={{ background: x.thumb.band }} />
                <div
                  className="thumb__orb"
                  style={{
                    left: `${x.thumb.orbX}%`,
                    top: `${x.thumb.orbY}%`,
                    width: x.thumb.orbSize,
                    height: x.thumb.orbSize,
                    background: x.thumb.orb,
                  }}
                />
                {x.dur && <span className="thumb__dur">{x.dur}</span>}
              </div>
              <div className="vid-row__main">
                <span className="vid-row__title" title={x.title}>
                  {x.title}
                </span>
                <span className="vid-row__channel">{x.channel}</span>
              </div>
              <div className="vid-row__nums">
                <span className="vid-row__times">{x.times}</span>
                <span className="vid-row__hours">{x.hours}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
