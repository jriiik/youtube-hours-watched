import { useId } from "react";
import type { Summary } from "../../core/types";
import { type Mode, heroModel, modeLabel, periodLabel } from "./model";

interface HeroProps {
  summary: Summary;
  period: string;
  periods: string[];
  mode: Mode;
  onPeriod: (period: string) => void;
  onMode: (mode: Mode) => void;
}

export function Hero({ summary, period, periods, mode, onPeriod, onMode }: HeroProps) {
  const h = heroModel(summary, mode);
  const isUb = mode === "ub";
  const periodId = useId();
  const modeId = useId();

  return (
    <section aria-label="Total watch time" className="hero">
      <div className="hero__main">
        <div className="hero__eyebrow">
          <span>Watch time</span>
          <span className="hero__sep" aria-hidden="true" />
          <span>{periodLabel(period)}</span>
          <span className="hero__sep" aria-hidden="true" />
          <span className={isUb ? "hero__mode hero__mode--ub" : "hero__mode"}>{modeLabel(mode)}</span>
        </div>
        <div className="hero__figure">
          <div className="hero__num">{h.heroNum}</div>
          <div className="hero__unit">hours</div>
        </div>
        <div className="hero__subs">
          <div className="hero__sub">
            <div className="hero__sub-num">{h.heroDays}</div>
            <div className="hero__sub-label">back to back, around the clock</div>
          </div>
          <div className="hero__sub">
            <div className="hero__sub-num">{h.avgText}</div>
            <div className="hero__sub-label">{h.avgSub}</div>
          </div>
        </div>
        <div className={isUb ? "split split--ub" : "split"}>
          <div className="split__bar" aria-hidden="true">
            <div className="split__est" style={{ width: `${h.estPct.toFixed(1)}%` }} />
            <div className="split__ub" />
          </div>
          <div className="split__labels">
            <span className={isUb ? "split__label" : "split__label split__label--on"}>
              <span>Best estimate</span>
              <strong>{h.estTotal}</strong>
            </span>
            <span className={isUb ? "split__label split__label--on" : "split__label"}>
              <span>If you finished every video</span>
              <strong>{h.ubTotal}</strong>
            </span>
          </div>
        </div>
        <p className="hero__note">
          {isUb
            ? "Counts every video at its full length (at most 12 hours), as if you watched each one to the end."
            : "Counts each video until you moved on to the next one, never longer than the video (at most 12 hours)."}
        </p>
      </div>

      <div className="controls card">
        <div className="controls__group">
          <div id={periodId} className="caps">
            Period
          </div>
          <div role="group" aria-labelledby={periodId} className="chips">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                className="chip nb-btn"
                aria-pressed={p === period}
                onClick={() => onPeriod(p)}
              >
                {periodLabel(p)}
              </button>
            ))}
          </div>
        </div>
        <div className="controls__group">
          <div id={modeId} className="caps">
            Count watch time as
          </div>
          <div role="group" aria-labelledby={modeId} className="switch">
            <button type="button" className="switch__btn nb-btn" aria-pressed={!isUb} onClick={() => onMode("est")}>
              Best estimate
            </button>
            <button type="button" className="switch__btn nb-btn" aria-pressed={isUb} onClick={() => onMode("ub")}>
              If you finished every video
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
