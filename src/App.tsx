import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { ServicesPage } from "./pages/ServicesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AppearancePage } from "./pages/AppearancePage";
import { PersonalInfoPage } from "./pages/PersonalInfoPage";
import { FeaturePage } from "./pages/FeaturePage";
import { ElectricityPage } from "./pages/ElectricityPage";
import { ClassroomPage } from "./pages/ClassroomPage";
import { TimetablePage } from "./pages/TimetablePage";
import { CalendarPage } from "./pages/CalendarPage";
import { AuthPage } from "./pages/AuthPage";
import {
  hasPendingLogin,
  resumeMobileLogin,
  takeReturnTo,
} from "./lib/classroom";
import { requestLogin, type PlatformId } from "./lib/authManager";
import {
  readThemeSettings,
  saveThemeSettings,
  type ThemeSettings,
} from "./lib/theme";
import {
  hasPendingTimetableLogin,
  resumeMobileTimetableLogin,
} from "./lib/timetableSession";
import type { FeatureId, MainTab } from "./types";
import {
  readPersonalInfo,
  savePersonalInfo,
  type PersonalInfo,
} from "./lib/profile";
import "./styles/tokens.css";
import "./App.css";

/** 课表与校历共享的学期信息，保证两处周次始终一致。 */
export interface SemesterInfo {
  /** 首周起始日，形如 2026-08-31 */
  startDate?: string;
  /** 总周数 */
  maxWeek?: number;
}

export default function App() {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<MainTab>("home");
  const [feature, setFeature] = useState<FeatureId | null>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [personalInfoOpen, setPersonalInfoOpen] = useState(false);
  const [semester, setSemester] = useState<SemesterInfo>({});
  const [targetWeek, setTargetWeek] = useState<number | undefined>(undefined);
  const [themeSettings, setThemeSettings] = useState(readThemeSettings);
  const [personalInfo, setPersonalInfo] =
    useState<PersonalInfo>(readPersonalInfo);

  const changeThemeSettings = (settings: ThemeSettings) => {
    saveThemeSettings(settings);
    setThemeSettings(settings);
  };
  const changePersonalInfo = (info: PersonalInfo) => {
    savePersonalInfo(info);
    setPersonalInfo(info);
    setPersonalInfoOpen(false);
  };

  // 移动端登录会跳去 CAS 再跳回来，整个应用会重新加载。
  // 必须先把票据换成 token，再挂载功能页 —— 否则功能页在 token 写回前
  // 就已完成初始化，会误判为「未登录」，用户回来还得再点一次。
  // 桌面端没有待处理票据时立即返回，不受影响。
  const [restoring, setRestoring] = useState(
    () => hasPendingLogin() || hasPendingTimetableLogin(),
  );

  useEffect(() => {
    if (!restoring) return;
    void (async () => {
      let returnedFromJw = false;
      await resumeMobileLogin().catch(() => {
        /* 没有待处理的登录，或票据已失效，忽略即可 */
      });
      try {
        returnedFromJw = await resumeMobileTimetableLogin();
      } catch {
        returnedFromJw = false;
      }
      // 换完票再取「该回到哪一页」，避免中途重载时把标记消费掉
      const back = takeReturnTo();
      if (back) setFeature(back as FeatureId);
      else if (returnedFromJw) setFeature("schedule");
      setRestoring(false);
    })();
    // 只在首帧跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openFeature = (id: FeatureId) => {
    setAppearanceOpen(false);
    setPersonalInfoOpen(false);
    if (id !== "schedule") setTargetWeek(undefined);
    setFeature(id);
  };
  const closeFeature = () => setFeature(null);

  const openTimetableAt = useCallback((week: number) => {
    setTargetWeek(week);
    setFeature("schedule");
  }, []);

  /**
   * 功能页未登录时的统一出口：登记想登录的平台，然后跳到登录管理页。
   * 管理页读走这条请求并自动开始登录，所以登录动作只发生在管理页。
   */
  const goLogin = useCallback((platform: PlatformId) => {
    requestLogin(platform);
    setFeature("auth");
  }, []);

  const renderFeature = (id: FeatureId) => {
    if (id === "electricity") return <ElectricityPage onBack={closeFeature} />;
    if (id === "classroom") {
      return (
        <ClassroomPage
          onBack={closeFeature}
          onNeedLogin={() => goLogin("ybt")}
        />
      );
    }
    if (id === "schedule") {
      return (
        <TimetablePage
          onBack={closeFeature}
          initialWeek={targetWeek}
          onOpenCalendar={() => setFeature("calendar")}
          onSemesterChange={setSemester}
          onNeedLogin={() => goLogin("jw")}
        />
      );
    }
    if (id === "calendar") {
      return (
        <CalendarPage
          onBack={closeFeature}
          semesterStart={semester.startDate}
          maxWeek={semester.maxWeek}
          onOpenTimetable={openTimetableAt}
          onNeedLogin={() => goLogin("ybt")}
        />
      );
    }
    if (id === "auth") return <AuthPage onBack={closeFeature} />;
    return <FeaturePage featureId={id} onBack={closeFeature} />;
  };

  const content = restoring ? (
    <div className="page boot-wait">
      <div className="tt-progress">
        <span className="tt-spinner" aria-hidden="true" />
        <span>正在恢复登录状态…</span>
      </div>
    </div>
  ) : personalInfoOpen ? (
    <PersonalInfoPage
      info={personalInfo}
      onSave={changePersonalInfo}
      onBack={() => setPersonalInfoOpen(false)}
    />
  ) : appearanceOpen ? (
    <AppearancePage
      settings={themeSettings}
      onChange={changeThemeSettings}
      onBack={() => setAppearanceOpen(false)}
    />
  ) : feature ? (
    renderFeature(feature)
  ) : tab === "home" ? (
    <HomePage
      onOpenFeature={openFeature}
      onBrowseServices={() => setTab("services")}
    />
  ) : tab === "services" ? (
    <ServicesPage onOpenFeature={openFeature} />
  ) : (
    <ProfilePage
      onOpenAuth={() => setFeature("auth")}
      onOpenAppearance={() => setAppearanceOpen(true)}
      profile={personalInfo}
      onOpenPersonalInfo={() => setPersonalInfoOpen(true)}
    />
  );

  const contentKey = restoring
    ? "restoring"
    : personalInfoOpen
      ? "personal-info"
      : appearanceOpen
        ? "appearance"
        : feature
          ? `feature:${feature}`
          : `tab:${tab}`;
  const pageTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 360, damping: 32, mass: 0.8 };

  return (
    <AppShell
      activeTab={tab}
      profile={personalInfo}
      onOpenProfile={() => {
        setAppearanceOpen(false);
        setPersonalInfoOpen(false);
        setFeature(null);
        setTab("profile");
      }}
      onTabChange={(next) => {
        setAppearanceOpen(false);
        setPersonalInfoOpen(false);
        setFeature(null);
        setTab(next);
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={contentKey}
          className="app-motion-view"
          initial={reduceMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduceMotion ? undefined : { opacity: 0, x: -12 }}
          transition={pageTransition}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}
