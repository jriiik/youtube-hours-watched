mod links;

use tauri::webview::{NewWindowResponse, WebviewWindowBuilder};

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
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the app");
}
