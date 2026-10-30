import { runAnalysis } from "./pipeline";
import { serializeError } from "./workerMessages";
import type { WorkerReply, WorkerRequest } from "./workerMessages";

// Runs the analysis off the interface thread; analyze.ts starts it and relays its messages.
// The project's type library is the DOM one, so the worker scope is described by hand.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerReply): void;
};

scope.onmessage = (event) => {
  const { file, apiKey } = event.data;
  runAnalysis(file, { apiKey, onProgress: (progress) => scope.postMessage({ type: "progress", progress }) }).then(
    (result) => scope.postMessage({ type: "result", result }),
    (err: unknown) => scope.postMessage({ type: "error", error: serializeError(err) }),
  );
};
