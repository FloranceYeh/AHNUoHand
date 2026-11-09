use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::BackgroundNotifications;
#[cfg(mobile)]
use mobile::BackgroundNotifications;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the background-notifications APIs.
pub trait BackgroundNotificationsExt<R: Runtime> {
  fn background_notifications(&self) -> &BackgroundNotifications<R>;
}

impl<R: Runtime, T: Manager<R>> crate::BackgroundNotificationsExt<R> for T {
  fn background_notifications(&self) -> &BackgroundNotifications<R> {
    self.state::<BackgroundNotifications<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("background-notifications")
    .invoke_handler(tauri::generate_handler![commands::configure, commands::notify, commands::schedule, commands::sync_icon, commands::sync_widget, commands::take_widget_launch_route])
    .setup(|app, api| {
      #[cfg(mobile)]
      let background_notifications = mobile::init(app, api)?;
      #[cfg(desktop)]
      let background_notifications = desktop::init(app, api)?;
      app.manage(background_notifications);
      Ok(())
    })
    .build()
}
