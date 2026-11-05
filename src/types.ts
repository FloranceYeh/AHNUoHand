export type MainTab = "home" | "services" | "profile";
export type FeatureId =
  | "schedule"
  | "electricity"
  | "classroom"
  | "library"
  | "calendar"
  | "feedback"
  /** 登录管理，只从「我的」页面进入，不出现在服务列表里 */
  | "auth";

export interface CampusService {
  id: FeatureId;
  title: string;
  description: string;
  icon: string;
  category: "academic" | "campus" | "life";
  status: "available" | "coming-soon";
}
