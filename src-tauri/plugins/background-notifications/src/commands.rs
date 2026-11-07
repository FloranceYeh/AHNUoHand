use tauri::{AppHandle, command, Runtime};

use crate::models::*;
use crate::Result;
use crate::BackgroundNotificationsExt;

#[command]
pub(crate) async fn configure<R: Runtime>(
    app: AppHandle<R>,
    payload: ConfigureRequest,
) -> Result<()> {
    app.background_notifications().configure(payload)
}
