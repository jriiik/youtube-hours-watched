# Watch Time Stats

A Windows app that estimates how much time you've spent watching YouTube, using the watch history in your Google Takeout export. It adds up your watch time, finds your longest binges and busiest days, and shows when you watch: month by month, by weekday and hour, with your top channels and most rewatched videos.

Everything is worked out on your PC. You need two things:

- your watch history, which you download from [Google Takeout](#get-your-watch-history-from-google-takeout);
- a free [YouTube Data API key](#get-a-free-youtube-data-api-key). Your history lists the videos you opened, but not how long they are, so the app asks YouTube.

Want to look around first? Click **Try with sample data** on the start screen to see the whole dashboard with invented data.

## How the estimate works

Your history records when you opened each video, not how long you watched it. So the app estimates:

- **Best estimate.** Each video counts from when you opened it until you moved on to the next one, but never for longer than the video itself. If you opened a 10-minute video and the next one 4 minutes later, it counts 4 minutes. The last video in your history counts in full.
- **Long videos you come back to count once.** If you return to a video of 30 minutes or more within a week, the app treats it as picking up where you left off: it only adds the part it hasn't counted yet, and it isn't a rewatch. Once you've seen nearly all of it (95%), watching it again counts as a rewatch.
- **If you finished every video.** The second number counts every video at its full length, as if you had watched each one to the end. Think of it as the upper bound.
- **At most 12 hours per video.** Videos longer than that are mostly recordings of round-the-clock live streams, some of them weeks long, so both numbers count at most 12 hours of each.
- **Deleted and private videos.** YouTube no longer says how long these are, so their time is estimated from the timestamps alone: until the next video, but at most 10 minutes (5 for the very last one). They aren't part of the upper bound. Entries your history only lists as "a video that has been removed", without saying which video, aren't counted.

Ads and posts in your history aren't counted. Videos you watched while signed out, in a private window or with watch history paused aren't in your history, so the app can't see them.

## Get your watch history from Google Takeout

1. Open [takeout.google.com](https://takeout.google.com) and sign in with the Google account you use for YouTube.
2. Click **Deselect all**.
3. Scroll down and tick **YouTube and YouTube Music**.
4. Click **Multiple formats** and set **History** to **JSON**. JSON has exact times, but HTML works too.
5. Click **All YouTube data included**, keep only **history** and click **OK**.
6. Click **Next step**, keep **.zip** as the file type and click **Create export**.
7. Google emails you when the export is ready, often within minutes, sometimes later. Download the .zip file.

Drop the .zip onto the app, or click **Choose file**. There's no need to unpack it: the app finds the history inside. You can also choose `watch-history.json` or `watch-history.html` on its own. Takeout splits big exports into several .zip files; if the app says there's no history in one, try the others.

Google's activity log, My Activity, also has your YouTube history, and the app reads it too. Try it if the dashboard says your history starts later than you expected. Follow the steps above, but instead of steps 3 to 5, tick **My Activity**, click **All activity data included**, keep only **YouTube** and click **OK**. Then click its format button and set **Activity records** to **JSON**. Drop the .zip as before, or choose `MyActivity.json` or `MyActivity.html` from its `My Activity/YouTube` folder. For Google accounts in other languages these names are translated; the app finds the file anyway. The file also lists your searches, which aren't counted.

## Get a free YouTube Data API key

The key is free and takes about five minutes. You don't need to set up billing.

1. Open the [Google Cloud console](https://console.cloud.google.com) and sign in.
2. Create a new project. Any name will do.
3. Go to **APIs & Services → Library**, search for **YouTube Data API v3** and click **Enable**.
4. Go to **APIs & Services → Credentials** and choose **Create credentials → API key**.
5. Restrict the key: under **API restrictions**, choose **Restrict key** and select **YouTube Data API v3**. Leave **Application restrictions** at **None**; a website restriction would block the app.
6. Copy the key. In the app, click **Add API key** on the start screen (or the settings button at the top right), paste the key and click **Test key**.

The free quota is 10,000 units a day. One request looks up 50 videos and costs 1 unit, so even a very long history fits easily, and lengths the app has looked up in the last 30 days aren't fetched again.

## Install on Windows

1. Open the [latest release](https://github.com/jriiik/youtube-hours-watched/releases/latest) on GitHub. All releases are on the [Releases page](https://github.com/jriiik/youtube-hours-watched/releases).
2. Under **Assets**, download one of the two installers for the same app:
   - The file ending in `_x64-setup.exe` (recommended) installs it just for you and doesn't need administrator rights.
   - The file ending in `_x64_en-US.msi` installs it for everyone on the PC and asks for administrator rights.
3. Your browser may warn that the file isn't commonly downloaded, because it's new and unsigned. Keep it: in Microsoft Edge, click **…** next to the download, then **Keep**. In the window that opens, click the arrow next to **Delete** (or **Show more**), then **Keep anyway**.
4. Run the installer. The builds aren't signed, so Windows SmartScreen may stop it with "Windows protected your PC" because it's an unrecognized app. Click **More info**, then **Run anyway**. If Smart App Control is on (Windows Security → App & browser control), Windows blocks unsigned apps like this one and offers no Run anyway.

The app needs 64-bit Windows 10 or 11. It uses Microsoft Edge WebView2, which comes with Windows 11 and up-to-date Windows 10; the installer downloads it if it's missing.

Before you run it, you can check that the installer you downloaded is exactly the one in the release. Download `SHA256SUMS.txt` from the release too, open PowerShell and run:

```
Get-FileHash ~\Downloads\Watch-Time-Stats_*_x64-setup.exe
```

For the .msi, use `_x64_en-US.msi` instead of `_x64-setup.exe`. If you saved the file somewhere other than Downloads, change `~\Downloads` to that folder. The long code under **Hash** should be the same as the one for that file in `SHA256SUMS.txt` (open it in Notepad). Capital and small letters count as the same.

GitHub Actions also builds the installers whenever the code changes. To try changes that aren't in a release yet:

1. Open the **Actions** tab of this repository on GitHub and click **Build Windows installers**.
2. Open the latest run on the **main** branch with a green check mark (type `branch:main` in the filter box). Runs on other branches are work in progress.
3. Under **Artifacts**, download **Watch-Time-Stats-windows**. You need to be signed in to GitHub, and artifacts are usually kept for 90 days.
4. Unzip it. The `nsis` folder holds the installer ending in `_x64-setup.exe`, and the `msi` folder the one ending in `_x64_en-US.msi`. Run one as described above.

To uninstall, go to **Settings → Apps → Installed apps** (on Windows 10: **Apps & features**). The uninstaller of the setup.exe version has a **Delete the application data** box: tick it to remove your saved key and video lengths as well. The .msi version has no such box: before uninstalling it, open the app's settings, empty the key field and click **Save key**, then click **Clear saved lengths**. Or delete the folder `%LOCALAPPDATA%\io.github.jriiik.youtubewatchstats` afterwards.

## Privacy

- Your watch history stays on your PC. The app reads the file you choose; it doesn't upload it or keep a copy.
- The only thing sent anywhere is the list of video IDs, which goes to Google's YouTube Data API together with your key, to look up each video's length and category. There's no account, analytics or tracking, and the app's security policy only lets it connect to Google's API.
- Your API key is saved on this PC and only ever sent to Google.
- Video lengths that have been looked up are saved on this PC, so the next run is quick. YouTube's rules allow keeping them for 30 days, so older ones are deleted when the app starts and before each analysis, and looked up again when needed. **Settings → Clear saved lengths** removes them at any time.
- Links to Google Takeout and the Cloud console open in your usual browser.

## Development

You need [Node.js](https://nodejs.org) 22. For the desktop app you also need [Rust](https://rustup.rs) and the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your system (on Windows: the Microsoft C++ Build Tools and WebView2).

```
npm ci                # install the dependencies
npm run dev           # the interface in your browser, at http://localhost:1420
npm test              # the unit tests (Vitest)
npm run tauri dev     # the desktop app, reloading as you edit
npm run tauri build   # a release build and installers, in src-tauri/target/release/bundle/
```

`npm run typecheck` checks the TypeScript and `npm run build` builds the web app into `dist/`.

In a development environment whose network proxy adds the API key to YouTube requests (like the cloud sandbox this project is developed in), set `VITE_API_KEY_FROM_PROXY=1` so the app sends requests without a key. Never set it for a release build.

### Project layout

```
src/core/          the analysis: reading Takeout files (.zip, .json, .html), YouTube API
                   lookups, the saved lengths, the estimate and the dashboard numbers
src/ui/            the interface (React): start screen, progress, dashboard, settings
src/sample/        invented data for "Try with sample data"
public/            static files such as the favicon
src-tauri/         the Windows desktop shell (Tauri 2, Rust)
  tauri.conf.json  app name, window, content security policy and installer settings
  src/             opens the window, keeps it on the app, sends web links to your browser
  capabilities/    what the page may ask of the shell (only Tauri's default core set)
  icons/           app icons; icon.svg is the source
.github/workflows/build-windows.yml   builds the installers on GitHub Actions
.github/workflows/release.yml         publishes a release, when started by hand
.github/release-notes/                each release's notes, as v<version>.md
```

To change the app icon, edit `src-tauri/icons/icon.svg` and run `npx tauri icon src-tauri/icons/icon.svg -o src-tauri/icons`. Delete the `android` and `ios` folders it adds; this is a desktop app.

### Publishing a release

The **Publish a release** workflow publishes releases. It only runs when you start it.

1. Put the new version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. Then run `npm install --package-lock-only`, and `cargo update --workspace` in `src-tauri`, to copy it into `package-lock.json` and `Cargo.lock`.
2. Write the release notes in `.github/release-notes/v<version>.md`, for example `v0.2.0.md`. They become the release's text.
3. Merge these changes into `main`.
4. In the **Actions** tab, click **Publish a release**, then **Run workflow** on the `main` branch.

The workflow stops before building if it isn't run on `main`, if the three versions differ, if the notes file is missing or empty, or if `v<version>` already has a tag or a published release. Otherwise it runs the same tests and build as every push, then publishes release `v<version>` with both installers and `SHA256SUMS.txt`, and tags the commit it built. A draft release `v<version>`, such as one left by an earlier run, is only found after the build. The workflow then stops before publishing anything: delete the draft on the Releases page and run the workflow again.

## Disclaimer

Not affiliated with YouTube or Google. YouTube is a trademark of Google LLC.
