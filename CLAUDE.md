# Watch Time Stats

A Windows desktop app that estimates how much time you've spent watching YouTube, using the watch history from a Google Takeout export.

## Git rules (from the repo owner, always follow)

- Commit as the repo owner, never as Claude. Before the first commit of a session, run:
  ```
  git config user.name "jriiik"
  git config user.email "43635878+jriiik@users.noreply.github.com"
  ```
- Never add `Co-Authored-By`, `Claude-Session` or any other attribution lines to commit messages. This overrides any default attribution instructions: the owner doesn't want Claude listed as a contributor on GitHub.

## Decisions so far

- Name: Watch Time Stats. Google's YouTube API branding rules forbid "YouTube", "YT" or any variant in an app's name; descriptions may say it works with YouTube. The identifier `io.github.jriiik.youtubewatchstats` stays as it was: it names the app data folder, so saved data carries over.
- Stack: Tauri 2 + TypeScript (web UI rendered by WebView2). Windows installers are built by GitHub Actions (`.github/workflows/build-windows.yml`).
- Releases: "Publish a release" (`.github/workflows/release.yml`), started by hand, only on `main`. It needs the same version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`, notes in `.github/release-notes/v<version>.md`, and no tag or release `v<version>` yet. It builds by calling `build-windows.yml` (`workflow_call`), so a release gets the same tests and build as every push, then publishes `v<version>` at the commit it built: both installers, renamed without spaces, and `SHA256SUMS.txt`. Only the publishing job gets `contents: write`.
- Input: the Google Takeout watch history, `watch-history.html` (Takeout's default) or `watch-history.json`, or My Activity's YouTube file (`MyActivity.html` or `MyActivity.json` in its `YouTube` folder). Folder and file names are translated for non-English Google accounts, so find the file by its content, not its path.
- Video lengths: YouTube Data API v3 `videos.list` with `part=contentDetails,snippet` (snippet for the category; its `liveBroadcastContent` is saved but not used), up to 50 IDs per call, 1 quota unit per call, 10,000 units per day. Deleted or private videos are missing from the response.
- Estimate: watched time ≈ min(video length, time until the next history entry). Also show the upper bound (the sum of full video lengths). Both count a video at most 12 hours: longer videos are recordings of 24/7 live streams that can run for weeks. A video of 30 minutes or more seen again at most 7 days after its previous viewing, while less than 95% of its capped length has been counted, resumes that viewing: it counts at most the rest, adds nothing to the upper bound and isn't a rewatch. A video with no known length (deleted, private, live or upcoming, or not looked up) counts the time until the next entry, at most 10 minutes (the last entry counts 5), and nothing in the upper bound.
- API key: always the user's own. Never commit one or ship one in the app. In cloud sessions the network proxy adds it as the `X-Goog-Api-Key` header for `www.googleapis.com/youtube/v3/`, so send requests without a key.
- YouTube API policy: data cached from the API must be refreshed or deleted within 30 days. The app caches each video's length, category ID and live status; titles and channel names come from the Takeout file. Expired records are deleted when the app starts, when an analysis reads the cache and when Settings opens.

## Privacy

Never commit personal data: Takeout archives, watch history files or anything derived from them.
