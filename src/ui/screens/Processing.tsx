import type { Progress, Stage } from "../../core/types";
import { Icon } from "../components/Icon";
import { fileSize } from "../format";
import { headline, overallFraction, stepModels, subline } from "../progress";
import "./screens.css";

interface ProcessingProps {
  fileName: string;
  size: number;
  progress: Progress | null;
  /** Details of finished steps, such as the entry count. */
  seen: Partial<Record<Stage, string>>;
  onCancel: () => void;
}

export function Processing({ fileName, size, progress, seen, onCancel }: ProcessingProps) {
  const pct = Math.floor(overallFraction(progress) * 100);
  const title = headline(progress);
  const note = subline(progress);
  const steps = stepModels(progress, seen);

  return (
    <main className="center">
      <div className="status-card card">
        <div className="status-card__file">
          <Icon name="file" size={16} />
          <span title={fileName}>{fileName}</span>
          <span aria-hidden="true">·</span>
          <span>{fileSize(size)}</span>
        </div>
        <div className="process__figure">
          <div className="process__pct" aria-hidden="true">
            {pct}
            <small>%</small>
          </div>
          <div className="process__heading">
            <h1 className="process__headline" tabIndex={-1} aria-live="polite">
              {title}
            </h1>
            <p className="process__note">{note}</p>
          </div>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="progress__fill" style={{ width: `${pct}%` }} />
        </div>
        <ol className="stage-list">
          {steps.map((s) => (
            <li key={s.stage} className={`stage stage--${s.state}`}>
              <span className="stage__mark" aria-hidden="true">
                {s.state === "done" && <Icon name="check" size={14} strokeWidth={2.5} />}
              </span>
              <span>
                {s.label}
                <span className="visually-hidden">
                  {s.state === "done" ? ", done" : s.state === "active" ? ", in progress" : ", waiting"}
                </span>
              </span>
              <span className="stage__detail">{s.detail}</span>
            </li>
          ))}
        </ol>
        <div className="status-card__foot">
          <p className="muted">Video lengths are saved on this PC, so the next run of the same history is quicker.</p>
          <button type="button" className="btn nb-btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </main>
  );
}
