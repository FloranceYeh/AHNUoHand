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

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncWidgetRequest {
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub data: Option<String>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub settings: Option<String>,
}

