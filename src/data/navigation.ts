import { campusServices } from "./services";
import type { CampusService, MainTab } from "../types";

interface TabNavigationItem {
  id: MainTab;
  label: string;
  icon: string;
  description: string;
  kind: "tab";
}

interface ServiceNavigationItem extends CampusService {
  label: string;
  kind: "feature";
}

export type NavigationItem = TabNavigationItem | ServiceNavigationItem;

const mainItems: TabNavigationItem[] = [
  {
    id: "home",
    label: "主页",
    icon: "home",
    description: "校园信息与常用服务",
    kind: "tab",
  },
  {
    id: "services",
    label: "服务",
    icon: "grid",
    description: "浏览全部校园服务",
    kind: "tab",
  },
  {
    id: "profile",
    label: "我的",
    icon: "person",
    description: "个人资料与应用设置",
    kind: "tab",
  },
];

const serviceItems: NavigationItem[] = campusServices.map((service) => ({
  ...service,
  label: service.title,
  kind: "feature",
}));

export const navigationItems: NavigationItem[] = [
  ...mainItems,
  ...serviceItems,
];
