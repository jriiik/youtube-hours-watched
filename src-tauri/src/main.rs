// Release builds on Windows run without the extra console window. Keep this attribute.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    watch_time_stats_lib::run();
}
