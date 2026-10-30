import { type FormEvent, type MouseEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { cacheStats, clearCache } from "../../core/cache";
import { cleanApiKey } from "../../core/settings";
import type { ApiKeyProblem } from "../../core/types";
import { testApiKey } from "../../core/youtubeApi";
import { ExternalLink } from "../components/ExternalLink";
import { Icon } from "../components/Icon";
import { keyProblemText } from "../errors";
import { int } from "../format";
import "../screens/screens.css";
import "./settings.css";

const CREDENTIALS_URL = "https://console.cloud.google.com/apis/credentials";

type KeyStatus =
  | { kind: "idle" }
  | { kind: "saved"; removed: boolean }
  | { kind: "testing" }
  | { kind: "ok" }
  | { kind: "problem"; reason: ApiKeyProblem; message: string }
  | { kind: "empty" };

type CacheInfo = { state: "loading" } | { state: "ready"; videos: number; oldest: number | null } | { state: "error" };

interface SettingsDialogProps {
  apiKey: string;
  /** True when a development proxy adds the key, so an empty field is fine. */
  keyFromProxy: boolean;
  onSaveKey: (key: string) => void;
  onClose: () => void;
}

/** Mounted only while open: opening it is mounting it, closing it unmounts it. */
export function SettingsDialog({ apiKey, keyFromProxy, onSaveKey, onClose }: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  const inputId = useId();
  const statusId = useId();
  const [draft, setDraft] = useState(apiKey);
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<KeyStatus>({ kind: "idle" });
  const [cache, setCache] = useState<CacheInfo>({ state: "loading" });
  const [clearing, setClearing] = useState(false);
  /** The key test still running, if any: editing, saving or closing drops it. */
  const testing = useRef<AbortController | null>(null);
  // Captured during the first render, before the dialog takes focus (an effect could run twice in dev).
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    inputRef.current?.focus();
    // Unmounting removes the dialog from the top layer, so there is nothing to close here.
    return () => {
      // Give focus back to whatever opened the dialog (the gear, or "Add API key"),
      // or to the screen's heading when that button has gone.
      const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>("main h1");
      target?.focus();
    };
  }, [opener]);

  const refreshCache = useCallback(async () => {
    try {
      const s = await cacheStats();
      setCache({ state: "ready", videos: s.videos, oldest: s.oldestFetchedAt });
    } catch {
      setCache({ state: "error" });
    }
  }, []);

  useEffect(() => {
    void refreshCache();
  }, [refreshCache]);

  // A result that arrives after the dialog has closed is dropped, like one for an edited key.
  const dropTest = () => {
    testing.current?.abort();
    testing.current = null;
  };
  useEffect(() => dropTest, []);

  const save = (e: FormEvent) => {
    e.preventDefault();
    dropTest();
    const key = cleanApiKey(draft);
    onSaveKey(key);
    setDraft(key);
    setStatus({ kind: "saved", removed: key === "" });
  };

  const test = async () => {
    const key = cleanApiKey(draft);
    if (!key && !keyFromProxy) {
      setStatus({ kind: "empty" });
      inputRef.current?.focus();
      return;
    }
    dropTest();
    const run = new AbortController();
    testing.current = run;
    setStatus({ kind: "testing" });
    try {
      const res = await testApiKey(key, { signal: run.signal });
      if (run.signal.aborted) return;
      if (res.ok) {
        // A key that works is worth keeping without a second click.
        onSaveKey(key);
        setDraft(key);
        setStatus({ kind: "ok" });
      } else {
        setStatus({ kind: "problem", reason: res.reason, message: res.message });
      }
    } catch (err) {
      if (run.signal.aborted) return;
      setStatus({ kind: "problem", reason: "unknown", message: err instanceof Error ? err.message : String(err) });
    } finally {
      if (testing.current === run) testing.current = null;
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await clearCache();
    } finally {
      setClearing(false);
      await refreshCache();
    }
  };

  const onBackdropDown = (e: MouseEvent<HTMLDialogElement>) => {
    pressedBackdrop.current = e.target === e.currentTarget;
  };
  const onBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
    // Only a press that started and ended on the backdrop closes; dragging out of the field does not.
    if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
    pressedBackdrop.current = false;
  };

  const dirty = cleanApiKey(draft) !== apiKey;

  return (
    <dialog
      ref={dialogRef}
      className="settings"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={() => {
        // Only a close the browser forced on us needs syncing; ignore stale events while still open.
        if (!dialogRef.current?.open) onClose();
      }}
      onMouseDown={onBackdropDown}
      onClick={onBackdropClick}
    >
      <div className="settings__inner">
        <div className="settings__head">
          <h2 id={titleId} className="settings__title">
            Settings
          </h2>
          <button type="button" className="icon-btn nb-btn" aria-label="Close settings" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <section className="settings__section" aria-labelledby={`${titleId}-key`}>
          <h3 id={`${titleId}-key`} className="settings__h">
            YouTube API key
          </h3>
          <p className="settings__text">
            Used only to look up how long each video is. The key is saved on this PC and sent to YouTube, nowhere else.
          </p>
          <form className="key-form" onSubmit={save}>
            <label htmlFor={inputId} className="field-label">
              API key
            </label>
            <div className="key-field">
              <input
                ref={inputRef}
                id={inputId}
                type={reveal ? "text" : "password"}
                value={draft}
                onChange={(e) => {
                  dropTest();
                  setDraft(e.target.value);
                  setStatus({ kind: "idle" });
                }}
                placeholder={keyFromProxy ? "Optional here: the dev proxy adds a key" : "Paste your key, it starts with AIza"}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={statusId}
              />
              <button
                type="button"
                className="key-field__toggle"
                aria-label="Show key"
                aria-pressed={reveal}
                onClick={() => setReveal((r) => !r)}
              >
                <Icon name={reveal ? "eyeOff" : "eye"} />
              </button>
            </div>
            <div className="btn-row">
              <button type="submit" className="btn btn--primary nb-btn">
                Save key
              </button>
              <button type="button" className="btn nb-btn" onClick={test} disabled={status.kind === "testing"}>
                {status.kind === "testing" ? "Testing…" : "Test key"}
              </button>
            </div>
            <KeyStatusLine id={statusId} status={status} dirty={dirty} />
          </form>
          <details className="key-help disclosure" open={!apiKey || undefined}>
            <summary>
              <Icon name="chevronDown" size={16} />
              How to get a free key
            </summary>
            <ol className="steps steps--compact">
              <li>
                <span>
                  Open the <ExternalLink href={CREDENTIALS_URL}>Google Cloud credentials page</ExternalLink>, sign in
                  and create a project if it asks for one.
                </span>
              </li>
              <li>
                <span>
                  Under <strong>APIs &amp; Services → Library</strong>, find <strong>YouTube Data API v3</strong> and
                  click <strong>Enable</strong>.
                </span>
              </li>
              <li>
                <span>
                  Back on the credentials page, choose <strong>Create credentials → API key</strong>, copy the key and
                  paste it above.
                </span>
              </li>
            </ol>
            <p className="muted key-help__note">
              It's free: the daily quota covers about 500,000 videos, far more than a typical history.
            </p>
          </details>
        </section>

        <section className="settings__section" aria-labelledby={`${titleId}-cache`}>
          <h3 id={`${titleId}-cache`} className="settings__h">
            Saved video lengths
          </h3>
          <div className="cache-row">
            <p className="settings__text" aria-live="polite">
              {cacheText(cache)}
            </p>
            <button
              type="button"
              className="btn nb-btn"
              onClick={clear}
              disabled={clearing || cache.state !== "ready" || cache.videos === 0}
            >
              <Icon name="trash" />
              {clearing ? "Clearing…" : "Clear saved lengths"}
            </button>
          </div>
        </section>

        <section className="settings__section" aria-labelledby={`${titleId}-about`}>
          <h3 id={`${titleId}-about`} className="settings__h">
            About
          </h3>
          <p className="settings__text">
            YouTube Watch Stats estimates your watch time from your own Google Takeout history. Not affiliated with
            YouTube or Google.
          </p>
        </section>
      </div>
    </dialog>
  );
}

function cacheText(cache: CacheInfo): string {
  if (cache.state === "loading") return "Checking…";
  if (cache.state === "error") return "Couldn't read the saved lengths.";
  if (cache.videos === 0) return "No video lengths saved yet. They are saved here after your first run.";
  const oldest =
    cache.oldest !== null
      ? `, the oldest from ${new Date(cache.oldest).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : "";
  return `${int(cache.videos)} video ${cache.videos === 1 ? "length" : "lengths"} saved on this PC${oldest}. YouTube allows keeping them for 30 days, so older ones are looked up again.`;
}

function KeyStatusLine({ id, status, dirty }: { id: string; status: KeyStatus; dirty: boolean }) {
  let icon: "check" | "alert" | null = null;
  let text = "";
  let tone = "";
  switch (status.kind) {
    case "saved":
      icon = "check";
      tone = "ok";
      text = status.removed ? "Key removed from this PC." : "Saved on this PC.";
      break;
    case "testing":
      text = "Asking YouTube about one video…";
      break;
    case "ok":
      icon = "check";
      tone = "ok";
      text = "The key works, and it's saved.";
      break;
    case "problem":
      icon = "alert";
      tone = "problem";
      text = keyProblemText(status.reason, status.message);
      break;
    case "empty":
      icon = "alert";
      tone = "problem";
      text = "Paste a key first.";
      break;
    default:
      text = dirty ? "Not saved yet." : "";
  }
  return (
    <p id={id} className={tone ? `key-status key-status--${tone}` : "key-status"} role="status">
      {icon && <Icon name={icon} size={16} />}
      {tone === "problem" ? <span>{text}</span> : text}
    </p>
  );
}
