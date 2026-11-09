use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigureRequest {
  pub settings: String,
  pub operator_no: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRequest {
  pub title: String,
  pub body: String,
  pub image_base64: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRequest {
  pub jobs: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncIconRequest {
  pub accent: String,
}

/// Display options shared by every timetable widget. Values are clamped again
/// on Android before rendering.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimetableWidgetSettings {
  pub show_time: bool,
  pub show_place: bool,
  pub show_teacher: bool,
  pub show_weekend: bool,
  pub week_cell_height: u32,
  pub max_courses: u32,
}

/// Either field may be omitted to keep the value already stored on the device.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncWidgetRequest {
  /// Timetable payload as a JSON string.
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub data: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub settings: Option<TimetableWidgetSettings>,
}

