import type { ReactNode } from "react";
import { Icon, type IconName } from "../components/Icon";
import { type UiError, keyProblemText } from "../errors";
import "./screens.css";

interface ErrorStateProps {
  error: UiError;
  fileName?: string;
  hasKey: boolean;
  onRetry?: () => void;
  onBack: () => void;
  onChooseAnother: () => void;
  onOpenSettings: () => void;
}

interface Copy {
  icon: IconName;
  title: string;
  body: string;
  /** Show the raw message under "Technical details". */
  details?: boolean;
}

function copyFor(error: UiError, hasKey: boolean): Copy {
  // Tagged core errors carry a message written for people; prefer it over the generic text.
  const said = (fallback: string) => (error.friendly && error.message ? error.message : fallback);
  switch (error.kind) {
    case "not-history":
      return {
        icon: "file",
        title: "This isn't a watch history file",
        body: said(
          "Choose watch-history.html or watch-history.json from your Google Takeout export, or the Takeout .zip file itself.",
        ),
      };
    case "empty":
      return {
        icon: "file",
        title: "No watched videos in this history",
        body: said("The file is a watch history, but it doesn't list any watched videos."),
      };
    case "dates":
      return {
        icon: "file",
        title: "The dates in this file couldn't be read",
        body: said("Export the history again from Takeout with History set to JSON, which stores dates in one standard format."),
      };
    case "bad-zip":
      return {
        icon: "file",
        title: "This .zip file can't be read",
        body: said("It seems damaged or incomplete. Try downloading it from Google again."),
      };
    case "missing-key":
      return hasKey
        ? { icon: "check", title: "Key saved, ready when you are", body: "Your API key is in place. Continue to read the file you chose." }
        : {
            icon: "key",
            title: "Add a YouTube API key first",
            body: "The app needs a free key from Google to look up how long each video is. The key stays on this PC and is only sent to YouTube.",
          };
    case "key":
      return { icon: "key", title: "Your API key didn't work", body: said(keyProblemText(error.reason)) };
    case "quota":
      return {
        icon: "alert",
        title: "Today's YouTube lookups are used up",
        body: said("Your key has used its free daily quota. It resets at midnight Pacific time; try again after that."),
      };
    case "network":
      return { icon: "wifiOff", title: "Couldn't reach YouTube", body: said("Check your internet connection, then try again.") };
    default:
      return error.friendly && error.message
        ? { icon: "alert", title: "Something went wrong", body: error.message }
        : {
            icon: "alert",
            title: "Something went wrong",
            body: "The app ran into a problem it didn't expect while reading your history. Trying again often helps.",
            details: !!error.message,
          };
  }
}

export function ErrorState({ error, fileName, hasKey, onRetry, onBack, onChooseAnother, onOpenSettings }: ErrorStateProps) {
  const copy = copyFor(error, hasKey);
  const back = (
    <button type="button" className="btn btn--quiet nb-btn" onClick={onBack}>
      <Icon name="arrowLeft" />
      Back to start
    </button>
  );
  const retry = (primary: boolean, label = "Try again") =>
    onRetry && (
      <button type="button" className={primary ? "btn btn--primary nb-btn" : "btn nb-btn"} onClick={onRetry}>
        <Icon name="retry" />
        {label}
      </button>
    );
  const settings = (primary: boolean, label: string) => (
    <button
      type="button"
      className={primary ? "btn btn--primary nb-btn" : "btn nb-btn"}
      onClick={onOpenSettings}
      aria-haspopup="dialog"
    >
      <Icon name="key" />
      {label}
    </button>
  );
  const chooseAnother = (
    <button type="button" className="btn btn--primary nb-btn" onClick={onChooseAnother}>
      <Icon name="file" />
      Choose another file
    </button>
  );

  let actions: ReactNode;
  switch (error.kind) {
    case "not-history":
    case "empty":
    case "dates":
    case "bad-zip":
      actions = chooseAnother;
      break;
    case "missing-key":
      actions = hasKey
        ? onRetry && (
            <button type="button" className="btn btn--primary nb-btn" onClick={onRetry}>
              Continue{fileName ? ` with ${fileName}` : ""}
            </button>
          )
        : settings(true, "Add API key");
      break;
    case "key":
      actions = (
        <>
          {settings(true, "Open settings")}
          {retry(false)}
        </>
      );
      break;
    case "quota":
      actions = retry(false);
      break;
    default:
      actions = retry(true);
  }

  return (
    <main className="center">
      <div className="status-card card">
        {fileName && (
          <div className="status-card__file">
            <Icon name="file" size={16} />
            <span title={fileName}>{fileName}</span>
          </div>
        )}
        <div className="error-card__head">
          <div className={copy.icon === "check" ? "tile" : "tile tile--warn"} aria-hidden="true">
            <Icon name={copy.icon} size={22} />
          </div>
          <div className="error-card__text">
            <h1 className="error-card__title" tabIndex={-1}>
              {copy.title}
            </h1>
            <p className="error-card__body">{copy.body}</p>
          </div>
        </div>
        {copy.details && (
          <details className="tech disclosure">
            <summary>
              <Icon name="chevronDown" size={14} />
              Technical details
            </summary>
            <pre>{error.message}</pre>
          </details>
        )}
        <div className="btn-row">
          {actions}
          {back}
        </div>
      </div>
    </main>
  );
}
