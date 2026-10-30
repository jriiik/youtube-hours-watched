import {
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MonthPoint } from "../../core/types";
import { type Mode, monthTip, monthlyAria, monthlyModel, tipPlacement } from "./model";

interface MonthlyChartProps {
  monthly: MonthPoint[];
  isAll: boolean;
  mode: Mode;
  period: string;
}

export function MonthlyChart({ monthly, isAll, mode, period }: MonthlyChartProps) {
  const titleId = useId();
  const model = useMemo(() => monthlyModel(monthly, isAll), [monthly, isAll]);
  const aria = monthlyAria(model.rows, mode, period);
  const [active, setActive] = useState(-1);
  const [spoken, setSpoken] = useState("");
  const barsRef = useRef<HTMLDivElement>(null);

  const n = model.rows.length;
  const gap = model.gap;
  const current = active >= 0 && active < n ? active : -1;

  // The bars never depend on hover, so moving the pointer only re-renders the overlay.
  const bars = useMemo(
    () =>
      model.bars.map((b) => (
        <div key={b.key} className="mc__col">
          {b.yearLine && <div className="mc__year-line" />}
          <div className="mc__stack">
            <div className="mc__ub" style={{ height: `${b.ubH.toFixed(2)}%` }} />
            <div className="mc__est" style={{ height: `${b.estH.toFixed(2)}%` }} />
          </div>
          {b.label && <div className="mc__label">{b.label}</div>}
        </div>
      )),
    [model.bars],
  );

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = barsRef.current;
    if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const pitch = (rect.width + gap) / n;
    const i = Math.min(n - 1, Math.max(0, Math.floor((e.clientX - rect.left) / pitch)));
    if (i !== active) setActive(i);
  };

  const announce = (i: number) => {
    const t = monthTip(model.rows[i]);
    setSpoken(`${t.month}: best estimate ${t.est}, if finished ${t.ub}, ${t.n}.`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    const from = current < 0 ? n - 1 : current;
    let next = -2;
    if (e.key === "ArrowRight") next = Math.min(n - 1, from + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, from - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") next = -1;
    if (next === -2) return;
    e.preventDefault();
    setActive(next);
    if (next >= 0) announce(next);
  };

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (n > 0 && current < 0 && e.currentTarget.matches(":focus-visible")) {
      setActive(n - 1);
      announce(n - 1);
    }
  };

  const colWidth = `((100% - ${(n - 1) * gap}px) / ${n})`;
  const tip = current >= 0 ? monthTip(model.rows[current]) : null;
  const place = current >= 0 ? tipPlacement(current, n) : null;
  const classes = ["mc", model.style === "years" ? "mc--years" : "mc--months", mode === "ub" ? "mc--ub" : ""];

  return (
    <section aria-labelledby={titleId} className="monthly panel">
      <div className="monthly__head">
        <div className="section-head__text">
          <h2 id={titleId} className="section-title">
            Watch time over time
          </h2>
          <p className="section-sub">Hours per month. Hover a month for details.</p>
        </div>
        <div className="legend">
          <span className="legend__item">
            <span className="legend__swatch" />
            Best estimate
          </span>
          <span className="legend__item">
            <span className="legend__swatch legend__swatch--ub" />
            If you finished every video
          </span>
        </div>
      </div>
      <div
        className={classes.join(" ").trim()}
        role="img"
        aria-label={`${aria} Use the arrow keys to read each month.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={() => setActive(-1)}
      >
        <div className="mc__plot">
          {model.ticks.map((t) => (
            <div key={t.label} className="mc__tick" style={{ bottom: `${t.pct.toFixed(2)}%` }}>
              <span className="mc__tick-label">{t.label}</span>
              <span className="mc__tick-line" />
            </div>
          ))}
          <div
            ref={barsRef}
            className="mc__bars"
            style={{ "--gap": `${gap}px` } as CSSProperties}
            onMouseMove={onMove}
            onMouseLeave={() => setActive(-1)}
          >
            {current >= 0 && (
              <div
                className="mc__hover"
                style={{ width: `calc${colWidth}`, left: `calc((${colWidth} + ${gap}px) * ${current})` }}
              />
            )}
            {bars}
          </div>
          {tip && place && (
            <div className="mc__tip" style={{ left: `${place.left.toFixed(2)}%`, transform: `translateX(${place.shift})` }}>
              <div className="mc__tip-month">{tip.month}</div>
              <div className="tip-row">
                <span className="tip-row__swatch" />
                <span className="tip-row__name">Best estimate</span>
                <span className="tip-row__val">{tip.est}</span>
              </div>
              <div className="tip-row">
                <span className="tip-row__swatch tip-row__swatch--ub" />
                <span className="tip-row__name">If finished</span>
                <span className="tip-row__val">{tip.ub}</span>
              </div>
              <div className="mc__tip-n">{tip.n}</div>
            </div>
          )}
        </div>
      </div>
      <div className="visually-hidden" aria-live="polite">
        {spoken}
      </div>
    </section>
  );
}
