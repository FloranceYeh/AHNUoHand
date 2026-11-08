const COMMANDS: &[&str] = &["configure", "notify", "schedule", "sync_icon", "sync_widget"];

fn main() {
  tauri_plugin::Builder::new(COMMANDS)
    .android_path("android")
    .ios_path("ios")
    .build();
}
