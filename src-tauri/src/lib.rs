mod links;

use tauri::http::header::{HeaderValue, CONTENT_SECURITY_POLICY};
use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};

/// The policy for the analysis worker, which reads the history and makes the YouTube requests.
const WORKER_CSP: &str = "default-src 'self'; connect-src https://www.googleapis.com";

/// Vite's build of src/core/worker.ts, e.g. /assets/worker-Dii3wRNJ.js.
fn is_worker_script(path: &str) -> bool {
    path.starts_with("/assets/worker-") && path.ends_with(".js")
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // tauri.conf.json declares this window with "create": false: link handlers can only
            // be attached while a window is being built.
            let config = app
                .config()
                .app
                .windows
                .iter()
                .find(|w| w.label == "main")
                .cloned()
                .ok_or("tauri.conf.json has no window labelled \"main\"")?;
            let dev_url = if tauri::is_dev() {
                app.config().build.dev_url.clone()
            } else {
                None
            };
            WebviewWindowBuilder::from_config(app.handle(), &config)?
                // Plain links, and files dropped outside the drop zone, would otherwise replace
                // the app in its own window.
                .on_navigation(move |url| {
                    if links::is_app_url(url, dev_url.as_ref()) {
                        return true;
                    }
                    links::open_in_browser(url);
                    false
                })
                .on_new_window(|url, _features| {
                    links::open_in_browser(&url);
                    NewWindowResponse::Deny
                })
                // Tauri sends tauri.conf.json's content security policy only with HTML files, and
                // a worker takes its policy from its own script, so the worker gets one here.
                .on_web_resource_request(|request, response| {
                    if is_worker_script(request.uri().path()) {
                        response
                            .headers_mut()
                            .insert(CONTENT_SECURITY_POLICY, HeaderValue::from_static(WORKER_CSP));
                    }
                })
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
