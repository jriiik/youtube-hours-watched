//! Keeps the window on the app's own pages and sends web links to the default browser.
//!
//! WebView2 drops `window.open` and `target="_blank"` requests unless the shell handles them,
//! so without this the app's links to Google Takeout and the Cloud console would do nothing.

use url::Url;

/// The app's own pages: the bundled frontend (`tauri://localhost`, or `http(s)://tauri.localhost`
/// on Windows), blobs it created, and, while developing, the Vite dev server.
pub fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    if url.scheme() == "tauri" {
        return true;
    }
    // For a blob: URL this is the origin of the page that created it.
    let origin = url.origin().ascii_serialization();
    origin == "http://tauri.localhost"
        || origin == "https://tauri.localhost"
        || dev_url.is_some_and(|dev| dev.origin().ascii_serialization() == origin)
}

/// Only http(s): other schemes (file:, ms-settings:, search-ms: and so on) can start local
/// programs, and the app never links to them.
pub fn is_web_link(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https")
}

pub fn open_in_browser(url: &Url) {
    if !is_web_link(url) {
        return;
    }
    let url = url.to_string();
    // Off the UI thread: this is called from WebView2 event handlers, and starting a browser
    // can take a moment.
    std::thread::spawn(move || {
        if let Err(err) = open::that_detached(&url) {
            eprintln!("Could not open {url} in the browser: {err}");
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn bundled_frontend_is_the_app() {
        assert!(is_app_url(&url("tauri://localhost/index.html"), None));
        assert!(is_app_url(&url("http://tauri.localhost/"), None));
        assert!(is_app_url(
            &url("https://tauri.localhost/assets/index.js"),
            None
        ));
        assert!(is_app_url(
            &url("blob:http://tauri.localhost/5e1c9a6b-0d2f-4c1e-9d55-1b2f3a4c5d6e"),
            None
        ));
    }

    #[test]
    fn dev_server_is_the_app_only_while_developing() {
        let dev = url("http://localhost:1420");
        assert!(is_app_url(&url("http://localhost:1420/"), Some(&dev)));
        assert!(!is_app_url(&url("http://localhost:1420/"), None));
        assert!(!is_app_url(&url("http://localhost:1421/"), Some(&dev)));
    }

    #[test]
    fn everything_else_leaves_the_app() {
        let dev = url("http://localhost:1420");
        for s in [
            "https://takeout.google.com/",
            "https://console.cloud.google.com/apis/credentials",
            "http://tauri.localhost.example.com/",
            "file:///C:/Users/me/Downloads/watch-history.html",
            "about:blank",
            "data:text/html,hello",
        ] {
            assert!(!is_app_url(&url(s), Some(&dev)), "{s}");
        }
    }

    #[test]
    fn only_web_links_go_to_the_browser() {
        assert!(is_web_link(&url("https://takeout.google.com/")));
        assert!(is_web_link(&url("http://example.com/")));
        for s in [
            "file:///C:/Windows/System32/calc.exe",
            "ms-settings:privacy",
            "search-ms:query=x",
            "javascript:alert(1)",
            "mailto:someone@example.com",
        ] {
            assert!(!is_web_link(&url(s)), "{s}");
        }
    }
}
