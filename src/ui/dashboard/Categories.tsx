import { useId } from "react";
import type { CategoryStat } from "../../core/types";
import { categoryRows } from "./model";

export function Categories({ categories, isUb }: { categories: CategoryStat[]; isUb: boolean }) {
  const titleId = useId();
  const rows = categoryRows(categories);
  return (
    <section aria-labelledby={titleId} className="cats panel">
      <div className="section-head">
        <div className="section-head__text">
          <h2 id={titleId} className="section-title">
            Categories
          </h2>
          <p className="section-sub">Share of watch time by video category.</p>
        </div>
        {isUb && <span className="soft-pill">Best estimate</span>}
      </div>
      {rows.length === 0 ? (
        <p className="empty-note">No categories for this period.</p>
      ) : (
        <ul className="cat-list">
          {rows.map((c) => (
            <li key={c.name} className="cat">
              <div className="cat__line">
                <span className="cat__name" title={c.name}>
                  {c.name}
                </span>
                <span className="cat__nums">
                  <span className="cat__hours">{c.hours}</span>
                  <span className="cat__pct">{c.pct}</span>
                </span>
              </div>
              <div className="bar-track" aria-hidden="true">
                <div
                  className={c.isOther ? "bar-fill bar-fill--other" : "bar-fill"}
                  style={{ width: `${c.w.toFixed(1)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
