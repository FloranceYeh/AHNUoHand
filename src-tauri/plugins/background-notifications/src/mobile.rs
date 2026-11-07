use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_background_notifications);

// initializes the Kotlin or Swift plugin classes
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> crate::Result<BackgroundNotifications<R>> {
  #[cfg(target_os = "android")]
  let handle = api.register_android_plugin("com.plugin.background_notifications", "BackgroundNotificationsPlugin")?;
  #[cfg(target_os = "ios")]
  let handle = api.register_ios_plugin(init_plugin_background_notifications)?;
  Ok(BackgroundNotifications(handle))
}

/// Access to the background-notifications APIs.
pub struct BackgroundNotifications<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> BackgroundNotifications<R> {
  pub fn configure(&self, payload: ConfigureRequest) -> crate::Result<()> {
    self
      .0.run_mobile_plugin("configure", payload)
      .map_err(Into::into)
  }

  pub fn notify(&self, payload: NotificationRequest) -> crate::Result<()> {
    self.0.run_mobile_plugin("notify", payload).map_err(Into::into)
  }

  pub fn schedule(&self, payload: ScheduleRequest) -> crate::Result<()> {
    self.0.run_mobile_plugin("schedule", payload).map_err(Into::into)
  }
}
