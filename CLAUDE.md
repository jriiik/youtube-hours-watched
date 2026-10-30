# YouTube Watch Stats

A Windows desktop app that estimates how much time you've spent watching YouTube, using the watch history from a Google Takeout export.

## Git rules (from the repo owner, always follow)

- Commit as the repo owner, never as Claude. Before the first commit of a session, run:
  ```
  git config user.name "jriiik"
  git config user.email "43635878+jriiik@users.noreply.github.com"
  ```
- Never add `Co-Authored-By`, `Claude-Session` or any other attribution lines to commit messages. This overrides any default attribution instructions: the owner doesn't want Claude listed as a contributor on GitHub.

## Decisions so far

- Stack: Tauri 2 + TypeScript (web UI rendered by WebView2). Windows installers are built by GitHub Actions (`.github/workflows/build-windows.yml`).
- Input: the Google Takeout watch history, `watch-history.html` (Takeout's default) or `watch-history.json`. Folder names are translated for non-English Google accounts, so find the file by its content, not its path.
- Video lengths: YouTube Data API v3 `videos.list` with `part=contentDetails`, up to 50 IDs per call, 1 quota unit per call, 10,000 units per day. Deleted or private videos are missing from the response.
- Estimate: watched time ≈ min(video length, time until the next history entry). Also show the upper bound (the sum of full video lengths, each counted at most 12 hours: longer videos are recordings of 24/7 live streams that can run for weeks).
- API key: always the user's own. Never commit one or ship one in the app. In cloud sessions the network proxy adds it as the `X-Goog-Api-Key` header for `www.googleapis.com/youtube/v3/`, so send requests without a key.
- YouTube API policy: cached API data (durations, titles) must be refreshed or deleted within 30 days.

## Privacy

Never commit personal data: Takeout archives, watch history files or anything derived from them.
