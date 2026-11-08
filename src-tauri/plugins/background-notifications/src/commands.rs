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

#[command]
pub(crate) async fn notify<R: Runtime>(
    app: AppHandle<R>,
    payload: NotificationRequest,
) -> Result<()> {
    #[cfg(mobile)]
    { app.background_notifications().notify(payload) }
    #[cfg(desktop)]
    { let _ = (app, payload); Ok(()) }
}

#[command]
pub(crate) async fn schedule<R: Runtime>(
    app: AppHandle<R>,
    payload: ScheduleRequest,
) -> Result<()> {
    #[cfg(mobile)]
    { app.background_notifications().schedule(payload) }
    #[cfg(desktop)]
    { let _ = (app, payload); Ok(()) }
}

#[command]
pub(crate) async fn sync_icon<R: Runtime>(
    app: AppHandle<R>,
    payload: SyncIconRequest,
) -> Result<()> {
    #[cfg(mobile)]
    { app.background_notifications().sync_icon(payload) }
    #[cfg(desktop)]
    { let _ = (app, payload); Ok(()) }
}
