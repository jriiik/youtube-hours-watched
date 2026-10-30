import type { Summary } from "../../core/types";
import { Icon } from "../components/Icon";
import { dataNotes } from "./model";

/**
 * Quiet notes under the dashboard. A real analysis brings its own warnings, which already say
 * when the history starts and how many videos have no known length, so they replace the
 * design's two notes rather than repeat them. The sample has none and shows the design's.
 */
export function DataNotes({ summary, warnings }: { summary: Summary; warnings: string[] }) {
  const notes = warnings.length ? warnings : dataNotes(summary);
  return (
    <section aria-label="Data notes" className="notes">
      {notes.map((text, i) => (
        <p key={i}>
          <Icon name="info" size={16} />
          <span>{text}</span>
        </p>
      ))}
    </section>
  );
}

export function DashboardFooter() {
  return (
    <footer className="dash-footer">
      <div className="dash-footer__actions">
        <button type="button" className="btn" disabled>
          <Icon name="download" />
          Export CSV
          <span className="soon">Coming soon</span>
        </button>
        <button type="button" className="btn" disabled>
          <Icon name="image" />
          Share image
          <span className="soon">Coming soon</span>
        </button>
      </div>
      <p className="dash-footer__about">Not affiliated with YouTube or Google.</p>
    </footer>
  );
}
