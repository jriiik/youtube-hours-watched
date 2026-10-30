import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ExternalLink } from "../components/ExternalLink";
import { Icon } from "../components/Icon";
import "./screens.css";

export type KeyState = "missing" | "saved" | "proxy";

interface WelcomeProps {
  keyState: KeyState;
  /** Opens "How to get your history" right away, e.g. after a wrong file. */
  showHowTo: boolean;
  onFile: (file: File) => void;
  onSample: () => void;
  onOpenSettings: () => void;
}

const ACCEPTED = /\.(html?|json|zip)$/i;

/** Prefers a file with a known extension when several are dropped at once. */
function pickFile(files: FileList | null | undefined): File | undefined {
  const list = Array.from(files ?? []);
  return list.find((f) => ACCEPTED.test(f.name)) ?? list[0];
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

export function Welcome({ keyState, showHowTo, onFile, onSample, onOpenSettings }: WelcomeProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;

  // The whole window accepts a dropped file while this screen is open.
  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth += 1;
      setOver(true);
    };
    const overHandler = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const file = pickFile(e.dataTransfer?.files);
      if (file) onFileRef.current(file);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", overHandler);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", overHandler);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = pickFile(e.target.files);
    // Reset so choosing the same file again still counts as a change.
    e.target.value = "";
    if (file) onFile(file);
  };

  return (
    <main className="welcome">
      <div className="welcome__intro">
        <h1 className="welcome__title" tabIndex={-1}>
          How much YouTube have you watched?
        </h1>
        <p className="welcome__lede">
          Load the watch history from your Google Takeout export. YouTube Watch Stats adds up your watch time, finds
          your longest binges and shows when you watch.
        </p>
      </div>

      <div className="welcome__grid">
        <div className="welcome__main">
          <div className={over ? "dropzone dropzone--over" : "dropzone"}>
            <div className="tile" aria-hidden="true">
              <Icon name="upload" size={24} />
            </div>
            <p className="dropzone__title">
              Drop your <code>watch-history.html</code>, <code>watch-history.json</code> or Takeout .zip here
            </p>
            <span className="dropzone__or">or</span>
            <button type="button" className="btn btn--primary nb-btn" onClick={() => inputRef.current?.click()}>
              <Icon name="file" />
              Choose file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".html,.htm,.json,.zip"
              className="visually-hidden"
              tabIndex={-1}
              aria-label="Choose your watch history file"
              onChange={onChange}
            />
            <p className="muted">The .zip from Google works as it is, no need to unpack it.</p>
          </div>

          <details className="howto card" open={showHowTo || undefined}>
            <summary>
              <Icon name="chevronDown" className="howto__chevron" />
              How to get your history
              <span className="howto__hint">A few minutes with Google Takeout</span>
            </summary>
            <div className="howto__body">
              <ol className="steps">
                <li>
                  <span>
                    Open <ExternalLink href="https://takeout.google.com">takeout.google.com</ExternalLink> and sign in to
                    the Google account you use for YouTube.
                  </span>
                </li>
                <li>
                  <span>
                    Click <strong>Deselect all</strong>.
                  </span>
                </li>
                <li>
                  <span>
                    Scroll down and tick <strong>YouTube and YouTube Music</strong>.
                  </span>
                </li>
                <li>
                  <span>
                    Click <strong>Multiple formats</strong> and set <strong>History</strong> to <strong>JSON</strong>.
                    HTML exports work too.
                  </span>
                </li>
                <li>
                  <span>
                    Click <strong>All YouTube data included</strong>, keep only <strong>history</strong>, then OK.
                  </span>
                </li>
                <li>
                  <span>
                    Click <strong>Next step</strong>, then <strong>Create export</strong>.
                  </span>
                </li>
                <li>
                  <span>When Google emails you the link, download the .zip and drop it here.</span>
                </li>
              </ol>
            </div>
          </details>
        </div>

        <aside className="welcome__side" aria-label="Before you start">
          <KeyCard keyState={keyState} onOpenSettings={onOpenSettings} />
          <div className="side-card card">
            <div className="side-card__head">
              <div className="tile" aria-hidden="true">
                <Icon name="chart" />
              </div>
              <h2 className="side-card__title">Just looking?</h2>
            </div>
            <p className="side-card__text">See the whole dashboard with invented sample data first.</p>
            <button type="button" className="btn nb-btn" onClick={onSample}>
              Try with sample data
            </button>
          </div>
        </aside>
      </div>

      <p className="privacy">
        <Icon name="lock" size={16} />
        <span>Everything stays on your PC; only video IDs are sent to YouTube to look up lengths.</span>
      </p>
    </main>
  );
}

function KeyCard({ keyState, onOpenSettings }: { keyState: KeyState; onOpenSettings: () => void }) {
  if (keyState === "missing") {
    return (
      <div className="side-card card">
        <div className="side-card__head">
          <div className="tile tile--warn" aria-hidden="true">
            <Icon name="key" />
          </div>
          <h2 className="side-card__title">Add a free API key</h2>
        </div>
        <p className="side-card__text">
          Your history lists the videos you opened, but not how long they are. The app asks YouTube for each video's
          length, and YouTube needs a free key from your Google account for that. Making one takes about five minutes.
        </p>
        <button type="button" className="btn nb-btn" onClick={onOpenSettings} aria-haspopup="dialog">
          <Icon name="key" />
          Add API key
        </button>
      </div>
    );
  }
  return (
    <div className="side-card card">
      <div className="side-card__head">
        <div className="tile" aria-hidden="true">
          <Icon name="check" />
        </div>
        <h2 className="side-card__title">{keyState === "proxy" ? "Key added by the dev proxy" : "API key added"}</h2>
      </div>
      <p className="side-card__text">
        {keyState === "proxy"
          ? "This development build sends requests without a key; the network proxy adds one."
          : "Video lengths will be looked up with your key. You can change or test it in Settings."}
      </p>
      <button type="button" className="btn nb-btn" onClick={onOpenSettings} aria-haspopup="dialog">
        Open settings
      </button>
    </div>
  );
}
