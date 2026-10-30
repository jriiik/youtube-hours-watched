import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { analyzeHistory } from "../core/analyze";
import { loadApiKey, saveApiKey } from "../core/settings";
import type { DashboardData, Progress, Stage } from "../core/types";
import { AppHeader, type HeaderBadge } from "./components/AppHeader";
import { Icon } from "./components/Icon";
import { Dashboard } from "./dashboard/Dashboard";
import { isDashboardData, loadSampleData } from "./data";
import { type UiError, classifyError, isAbortError } from "./errors";
import { int } from "./format";
import { ErrorState } from "./screens/ErrorState";
import { Processing } from "./screens/Processing";
import { type KeyState, Welcome } from "./screens/Welcome";
import { SettingsDialog } from "./settings/SettingsDialog";
import "./styles/global.css";

/**
 * Development only: `VITE_API_KEY_FROM_PROXY=1 npx vite` runs without a key, for sandboxes
 * whose network proxy adds one to YouTube requests. Never set it for a release build.
 */
const KEY_FROM_PROXY = ["1", "true"].includes(String(import.meta.env.VITE_API_KEY_FROM_PROXY ?? ""));

type Screen =
  | { kind: "welcome"; howTo: boolean }
  | { kind: "processing"; file: File }
  | { kind: "dashboard" }
  | { kind: "error"; error: UiError; file?: File };

interface Loaded {
  /** Changes on every load so the dashboard starts fresh (All time, best estimate). */
  id: number;
  data: DashboardData;
  warnings: string[];
  badge: HeaderBadge;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "welcome", howTo: false });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [apiKey, setApiKey] = useState(loadApiKey);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [seen, setSeen] = useState<Partial<Record<Stage, string>>>({});

  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<{ id: number; p: Progress } | null>(null);
  const seenSoFar = useRef<Partial<Record<Stage, string>>>({});
  const frame = useRef(0);
  const firstScreen = useRef(true);

  const hasKey = apiKey.trim() !== "" || KEY_FROM_PROXY;
  const keyState: KeyState = apiKey.trim() ? "saved" : KEY_FROM_PROXY ? "proxy" : "missing";

  // A file dropped outside the drop zone must never replace the app with the file itself.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  // Each screen starts at the top with its heading focused, so keyboard and screen reader users land in it.
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    window.scrollTo(0, 0);
    document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
  }, [screen.kind]);

  // The core may report progress thousands of times a second; render at most once per frame.
  const reportProgress = useCallback((id: number, p: Progress) => {
    if (runId.current !== id) return;
    pending.current = { id, p };
    // Remember counts of a step so they stay visible once the next step starts.
    if (p.stage === "parsing" && p.done !== undefined) seenSoFar.current.parsing = `${int(p.done)} entries`;
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      // Commits the latest report of the current run, even if an earlier run scheduled this frame.
      const latest = pending.current;
      if (!latest || latest.id !== runId.current) return;
      setProgress(latest.p);
      setSeen({ ...seenSoFar.current });
    });
  }, []);

  const analyze = useCallback(
    async (file: File) => {
      if (!hasKey) {
        setScreen({ kind: "error", error: { kind: "missing-key", message: "", friendly: false }, file });
        return;
      }
      controller.current?.abort();
      const ctrl = new AbortController();
      controller.current = ctrl;
      const id = ++runId.current;
      pending.current = null;
      seenSoFar.current = {};
      setProgress(null);
      setSeen({});
      setScreen({ kind: "processing", file });
      try {
        const result = await analyzeHistory(file, {
          apiKey: apiKey.trim(),
          onProgress: (p) => reportProgress(id, p),
          signal: ctrl.signal,
        });
        if (runId.current !== id) return;
        if (!isDashboardData(result?.data)) throw new Error("The analysis finished without dashboard data.");
        setLoaded({
          id,
          data: result.data,
          warnings: result.warnings ?? [],
          badge: { kind: "file", fileName: file.name },
        });
        setScreen({ kind: "dashboard" });
      } catch (err) {
        if (runId.current !== id) return;
        if (ctrl.signal.aborted || isAbortError(err)) {
          setScreen({ kind: "welcome", howTo: false });
          return;
        }
        setScreen({ kind: "error", error: classifyError(err), file });
      } finally {
        if (controller.current === ctrl) controller.current = null;
      }
    },
    [apiKey, hasKey, reportProgress],
  );

  const cancel = () => {
    controller.current?.abort();
    controller.current = null;
    // Forget the run now; whatever it settles with later is ignored.
    runId.current += 1;
    setScreen({ kind: "welcome", howTo: false });
  };

  const showSample = async () => {
    try {
      const data = await loadSampleData();
      setLoaded({ id: ++runId.current, data, warnings: [], badge: { kind: "sample" } });
      setScreen({ kind: "dashboard" });
    } catch (err) {
      setScreen({ kind: "error", error: classifyError(err) });
    }
  };

  const saveKey = (key: string) => {
    saveApiKey(key);
    setApiKey(key);
  };

  const openSettings = () => setSettingsOpen(true);
  const toWelcome = (howTo = false) => setScreen({ kind: "welcome", howTo });

  let badge: HeaderBadge | undefined;
  let actions: ReactNode = null;
  let body: ReactNode;

  switch (screen.kind) {
    case "welcome":
      if (loaded) {
        actions = (
          <button type="button" className="btn nb-btn" onClick={() => setScreen({ kind: "dashboard" })}>
            <Icon name="arrowLeft" />
            Back to your stats
          </button>
        );
      }
      body = (
        <Welcome
          keyState={keyState}
          showHowTo={screen.howTo}
          onFile={analyze}
          onSample={showSample}
          onOpenSettings={openSettings}
        />
      );
      break;
    case "processing":
      body = (
        <Processing
          fileName={screen.file.name}
          size={screen.file.size}
          progress={progress}
          seen={seen}
          onCancel={cancel}
        />
      );
      break;
    case "dashboard":
      if (!loaded) {
        body = null;
        break;
      }
      badge = loaded.badge;
      actions = (
        <button type="button" className="btn nb-btn" onClick={() => toWelcome()}>
          <Icon name="upload" />
          Load another file
        </button>
      );
      body = <Dashboard key={loaded.id} data={loaded.data} warnings={loaded.warnings} />;
      break;
    case "error": {
      const file = screen.file;
      body = (
        <ErrorState
          error={screen.error}
          fileName={file?.name}
          hasKey={hasKey}
          onRetry={file ? () => analyze(file) : undefined}
          onBack={() => toWelcome()}
          onChooseAnother={() => toWelcome(true)}
          onOpenSettings={openSettings}
        />
      );
      break;
    }
  }

  return (
    <div className="page">
      <div className="page__inner">
        <AppHeader
          badge={badge}
          actions={actions}
          onOpenSettings={screen.kind === "processing" ? undefined : openSettings}
        />
        {body}
      </div>
      {settingsOpen && (
        <SettingsDialog
          apiKey={apiKey}
          keyFromProxy={KEY_FROM_PROXY}
          onSaveKey={saveKey}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
