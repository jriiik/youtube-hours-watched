import { type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, useId, useMemo, useRef, useState } from "react";
import type { Summary } from "../../core/types";
import { WEEKDAYS } from "../format";
import { Icon } from "../components/Icon";
import { heatTip, heatmapAria, heatmapModel, insightText } from "./model";

const HOUR_TICKS = ["12 am", "3 am", "6 am", "9 am", "12 pm", "3 pm", "6 pm", "9 pm"];
const CELL = 24;
const GAP = 3;
const PITCH = CELL + GAP;

interface HeatmapProps {
  heatmap: number[][];
  summary: Summary;
  period: string;
  isUb: boolean;
}

type Cell = { r: number; c: number } | null;

export function Heatmap({ heatmap, summary, period, isUb }: HeatmapProps) {
  const titleId = useId();
  const model = useMemo(() => heatmapModel(heatmap), [heatmap]);
  const [active, setActive] = useState<Cell>(null);
  const [spoken, setSpoken] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  const cells = useMemo(
    () =>
      model.colors.map((row, r) => (
        <div key={WEEKDAYS[r]} className="hm__row">
          {row.map((bg, c) => (
            <div key={c} className="hm__cell" style={{ background: bg }} />
          ))}
        </div>
      )),
    [model.colors],
  );

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = gridRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const r = Math.min(6, Math.max(0, Math.floor((e.clientY - rect.top) / PITCH)));
    const c = Math.min(23, Math.max(0, Math.floor((e.clientX - rect.left) / ((rect.width + GAP) / 24))));
    if (!active || active.r !== r || active.c !== c) setActive({ r, c });
  };

  const move = (r: number, c: number) => {
    setActive({ r, c });
    const t = heatTip(model.grid, r, c);
    setSpoken(`${t.when}: ${t.val}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const { r, c } = active ?? { r: 0, c: 0 };
    const keys: Record<string, [number, number]> = {
      ArrowRight: [r, Math.min(23, c + 1)],
      ArrowLeft: [r, Math.max(0, c - 1)],
      ArrowDown: [Math.min(6, r + 1), c],
      ArrowUp: [Math.max(0, r - 1), c],
      Home: [r, 0],
      End: [r, 23],
    };
    if (e.key === "Escape") {
      e.preventDefault();
      setActive(null);
      return;
    }
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    move(next[0], next[1]);
  };

  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!active && e.currentTarget.matches(":focus-visible")) move(0, 0);
  };

  const tip = active ? heatTip(model.grid, active.r, active.c) : null;
  const colWidth = `((100% - ${23 * GAP}px) / 24)`;
  let tipStyle: CSSProperties | undefined;
  if (active) {
    const left = ((active.c + 0.5) / 24) * 100;
    const shift = active.c < 3 ? "0%" : active.c > 20 ? "-100%" : "-50%";
    // The top row has no room above it inside the scroll box, so its tooltip opens below.
    tipStyle =
      active.r === 0
        ? { top: CELL + 8, left: `${left.toFixed(2)}%`, transform: `translateX(${shift})` }
        : { top: active.r * PITCH, left: `${left.toFixed(2)}%`, transform: `translate(${shift}, calc(-100% - 8px))` };
  }

  return (
    <section aria-labelledby={titleId} className="when panel">
      <div className="section-head">
        <div className="section-head__text">
          <h2 id={titleId} className="section-title">
            When you watch
          </h2>
          <p className="section-sub">Hours watched by weekday and hour of day.</p>
        </div>
        {isUb && <span className="soft-pill">Best estimate</span>}
      </div>
      <div className="hm-scroll">
        <div
          className="hm"
          role="img"
          aria-label={`${heatmapAria(summary, period)} Use the arrow keys to read each hour.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={() => setActive(null)}
        >
          <div />
          <div className="hm__hours">
            {HOUR_TICKS.map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
          <div className="hm__days">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div ref={gridRef} className="hm__grid" onMouseMove={onMove} onMouseLeave={() => setActive(null)}>
            {cells}
            {active && (
              <div
                className="hm__ring"
                style={{
                  top: active.r * PITCH,
                  width: `calc${colWidth}`,
                  left: `calc((${colWidth} + ${GAP}px) * ${active.c})`,
                }}
              />
            )}
            {tip && (
              <div className="hm__tip" style={tipStyle}>
                <span className="hm__tip-when">{tip.when}</span>
                <span className="hm__tip-val">{tip.val}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="hm-foot">
        <div className="hm-legend">
          <span>Less</span>
          <div className="hm-legend__swatches" aria-hidden="true">
            {model.legend.map((bg, i) => (
              <span key={i} className="hm-legend__swatch" style={{ background: bg }} />
            ))}
          </div>
          <span>More</span>
        </div>
        {model.peakText && <span>{model.peakText}</span>}
      </div>
      <p className="insight">
        <Icon name="moon" />
        <span>{insightText(summary)}</span>
      </p>
      <div className="visually-hidden" aria-live="polite">
        {spoken}
      </div>
    </section>
  );
}
