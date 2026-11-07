export type MainTab = "home" | "services" | "profile";
export type CampusServiceId = Exclude<FeatureId, "auth">;
export type NavigationItemId = MainTab | CampusServiceId;
export type FeatureId =
  | "schedule"
  | "electricity"
  | "classroom"
  | "library"
  | "calendar"
  | "feedback"
  | "schoolcard"
  /** 登录管理，只从「我的」页面进入，不出现在服务列表里 */
  | "auth";

export interface CampusService {
  id: CampusServiceId;
  title: string;
  description: string;
  icon: string;
  category: "academic" | "campus" | "life";
  status: "available" | "coming-soon" | "testing";
}
