import type { CampusService } from "../types";

export const campusServices: CampusService[] = [
  {
    id: "schedule",
    title: "课程表",
    description: "查看今日课程与每周安排",
    icon: "calendar",
    category: "academic",
    status: "available",
  },
  {
    id: "classroom",
    title: "空教室",
    description: "查找可用教室与自习空间",
    icon: "school",
    category: "academic",
    status: "available",
  },
  {
    id: "electricity",
    title: "宿舍电费",
    description: "查看余额与用电信息",
    icon: "bolt",
    category: "life",
    status: "available",
  },
  {
    id: "schoolcard",
    title: "校园一卡通",
    description: "完美校园一卡通相关服务",
    icon: "idCard",
    category: "life",
    status: "available",
  },
  {
    id: "library",
    title: "图书馆",
    description: "馆藏与座位服务",
    icon: "book",
    category: "academic",
    status: "coming-soon",
  },
  {
    id: "calendar",
    title: "校历安排",
    description: "校历、假期与重要日期",
    icon: "event",
    category: "campus",
    status: "testing",
  },
  {
    id: "feedback",
    title: "意见反馈",
    description: "告诉我们你需要的校园服务",
    icon: "chat",
    category: "campus",
    status: "coming-soon",
  },
];

export const serviceCategories = [
  { id: "all", label: "全部" },
  { id: "academic", label: "学习" },
  { id: "life", label: "生活" },
  { id: "campus", label: "校园" },
] as const;

export const featureDetails = {
  schedule: {
    title: "课程表",
    eyebrow: "学习服务",
    icon: "calendar",
    description: "课程安排接入后，可在这里查看每周课表、上课地点与今日课程。",
    points: ["按周查看课程安排", "上课时间与教室提醒", "支持学期课表同步"],
  },
  classroom: {
    title: "空教室",
    eyebrow: "学习服务",
    icon: "school",
    description: "教室数据接入后，可按校区、教学楼和时段查询可用空间。",
    points: ["按时间筛选可用教室", "查看教学楼与座位信息", "快速找到自习空间"],
  },
  electricity: {
    title: "宿舍电费",
    eyebrow: "生活服务",
    icon: "bolt",
    description: "校园缴费接口接入后，可查询宿舍电费余额与用电情况。",
    points: ["查看宿舍电费余额", "了解近期用电情况", "余额不足时及时提醒"],
  },
  schoolcard: {
    title: "校园一卡通",
    eyebrow: "生活服务",
    icon: "idCard",
    description: "完美校园一卡通相关服务，包括充值、消费记录等。",
    points: ["校园卡充值", "消费记录查询", "余额提醒"],
  },
  library: {
    title: "图书馆",
    eyebrow: "学习服务",
    icon: "book",
    description: "图书馆服务正在规划中，后续可接入馆藏查询与座位信息。",
    points: ["馆藏检索", "座位与开放信息", "借阅记录"],
  },
  calendar: {
    title: "校历安排",
    eyebrow: "校园服务",
    icon: "event",
    description: "校历服务正在规划中，后续可集中查看假期与校园活动。",
    points: ["校历与节假日", "考试周安排", "校园活动提醒"],
  },
  feedback: {
    title: "意见反馈",
    eyebrow: "校园服务",
    icon: "chat",
    description: "反馈入口正在规划中，欢迎期待更多贴近校园生活的功能。",
    points: ["提交服务建议", "反馈使用体验", "跟进处理进度"],
  },
} satisfies Record<
  string,
  {
    title: string;
    eyebrow: string;
    icon: string;
    description: string;
    points: string[];
  }
>;
