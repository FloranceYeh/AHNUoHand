use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub fn init<R: Runtime, C: DeserializeOwned>(
  app: &AppHandle<R>,
  _api: PluginApi<R, C>,
) -> crate::Result<BackgroundNotifications<R>> {
  Ok(BackgroundNotifications(app.clone()))
}

/// Access to the background-notifications APIs.
pub struct BackgroundNotifications<R: Runtime>(AppHandle<R>);

impl<R: Runtime> BackgroundNotifications<R> {
  pub fn configure(&self, _payload: ConfigureRequest) -> crate::Result<()> {
    Ok(())
  }
}
