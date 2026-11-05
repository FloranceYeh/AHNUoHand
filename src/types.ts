export type MainTab = "home" | "services" | "profile";
export type FeatureId =
  | "schedule"
  | "electricity"
  | "classroom"
  | "library"
  | "calendar"
  | "feedback";

export interface CampusService {
  id: FeatureId;
  title: string;
  description: string;
  icon: string;
  category: "academic" | "campus" | "life";
  status: "available" | "coming-soon";
}
