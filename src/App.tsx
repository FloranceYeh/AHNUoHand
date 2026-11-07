import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { ServicesPage } from "./pages/ServicesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { AppearancePage } from "./pages/AppearancePage";
import { HomeNavigationPage } from "./pages/HomeNavigationPage";
import { PersonalInfoPage } from "./pages/PersonalInfoPage";
import { NotificationSettingsPage } from "./pages/NotificationSettingsPage";
import { FeaturePage } from "./pages/FeaturePage";
import { ElectricityPage } from "./pages/ElectricityPage";
import { ClassroomPage } from "./pages/ClassroomPage";
import { TimetablePage } from "./pages/TimetablePage";
import { CalendarPage } from "./pages/CalendarPage";
import { AuthPage } from "./pages/AuthPage";
import { SchoolCardPage } from "./pages/SchoolCardPage";
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
import {
  hasPendingSchoolCardLogin,
  resumeMobileSchoolCardLogin,
} from "./lib/schoolcard";
import type {
  CampusServiceId,
  FeatureId,
  MainTab,
  NavigationItemId,
} from "./types";
import { navigationItems } from "./data/navigation";
import {
  pollNotificationSources,
  readNotificationSettings,
  saveNotificationSettings,
  syncCourseNotifications,
  type NotificationSettings,
} from "./lib/notifications";
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

type AppRoute =
  | { type: "tab"; tab: MainTab }
  | { type: "menu-feature"; id: CampusServiceId }
  | { type: "feature"; id: FeatureId; initialWeek?: number }
  | { type: "appearance" }
  | { type: "home-navigation" }
  | { type: "personal-info" }
  | { type: "notifications" };

interface StackScreen {
  key: number;
  route: AppRoute;
}

function createScreen(key: number, route: AppRoute): StackScreen {
  return { key, route };
}

function navigationRoute(id: NavigationItemId): AppRoute {
  const item = navigationItems.find((option) => option.id === id)!;
  return item.kind === "feature"
    ? { type: "menu-feature", id: item.id }
    : { type: "tab", tab: item.id };
}

export default function App() {
  const reduceMotion = useReducedMotion();
  const [themeSettings, setThemeSettings] = useState(readThemeSettings);
  const [stack, setStack] = useState<StackScreen[]>(() => [
    createScreen(0, navigationRoute(themeSettings.defaultNavigation)),
  ]);
  const nextScreenKey = useRef(1);
  const [semester, setSemester] = useState<SemesterInfo>({});
  const [personalInfo, setPersonalInfo] =
    useState<PersonalInfo>(readPersonalInfo);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>(readNotificationSettings);
  const lastHomeBackRef = useRef(0);
  const exitPromptTimerRef = useRef<number | null>(null);
  const [exitPromptVisible, setExitPromptVisible] = useState(false);
  const isAndroid = /android/i.test(navigator.userAgent);

  const currentScreen = stack[stack.length - 1];
  const currentRoute = currentScreen.route;
  const rootRoute = stack[0].route;
  const activeItem: NavigationItemId =
    rootRoute.type === "menu-feature"
      ? rootRoute.id
      : rootRoute.type === "tab"
        ? rootRoute.tab
        : "home";

  const pushRoute = useCallback((route: AppRoute) => {
    const key = nextScreenKey.current++;
    setStack((current) => [...current, createScreen(key, route)]);
  }, []);

  const setRootRoute = useCallback((route: AppRoute) => {
    const key = nextScreenKey.current++;
    setStack([createScreen(key, route)]);
  }, []);

  const goBack = useCallback(() => {
    if (stack.length > 1) {
      lastHomeBackRef.current = 0;
      setExitPromptVisible(false);
      if (exitPromptTimerRef.current !== null) {
        window.clearTimeout(exitPromptTimerRef.current);
      }
      setStack((current) => current.slice(0, -1));
      return;
    }
    if (activeItem !== themeSettings.defaultNavigation) {
      lastHomeBackRef.current = 0;
      setExitPromptVisible(false);
      setRootRoute(navigationRoute(themeSettings.defaultNavigation));
      return;
    }
    if (isAndroid) {
      const now = Date.now();
      if (now - lastHomeBackRef.current < 2000) {
        lastHomeBackRef.current = 0;
        setExitPromptVisible(false);
        if (exitPromptTimerRef.current !== null) {
          window.clearTimeout(exitPromptTimerRef.current);
          exitPromptTimerRef.current = null;
        }
        void invoke("exit_app").catch(() => {});
        return;
      }
      lastHomeBackRef.current = now;
      setExitPromptVisible(true);
      if (exitPromptTimerRef.current !== null) {
        window.clearTimeout(exitPromptTimerRef.current);
      }
      exitPromptTimerRef.current = window.setTimeout(() => {
        setExitPromptVisible(false);
        lastHomeBackRef.current = 0;
        exitPromptTimerRef.current = null;
      }, 2000);
    }
  }, [
    activeItem,
    isAndroid,
    themeSettings.defaultNavigation,
    setRootRoute,
    stack.length,
  ]);

  useEffect(
    () => () => {
      if (exitPromptTimerRef.current !== null) {
        window.clearTimeout(exitPromptTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    lastHomeBackRef.current = 0;
    setExitPromptVisible(false);
    if (exitPromptTimerRef.current !== null) {
      window.clearTimeout(exitPromptTimerRef.current);
      exitPromptTimerRef.current = null;
    }
  }, [currentScreen.key, themeSettings.defaultNavigation]);

  const changeThemeSettings = useCallback((changes: Partial<ThemeSettings>) => {
    setThemeSettings((current) => {
      const next = { ...current, ...changes };
      if (!next.navigationTabs.includes(next.defaultNavigation)) {
        next.defaultNavigation = next.navigationTabs[0];
      }
      return next;
    });
  }, []);
  useEffect(() => {
    saveThemeSettings(themeSettings);
  }, [themeSettings]);
  useEffect(() => {
    saveNotificationSettings(notificationSettings);
    const sync = () =>
      void syncCourseNotifications(notificationSettings).catch(() => {});
    sync();
    const timer = window.setInterval(sync, 15 * 60_000);
    return () => window.clearInterval(timer);
  }, [notificationSettings, currentScreen.key]);
  useEffect(() => {
    const poll = () => void pollNotificationSources(notificationSettings);
    poll();
    const timer = window.setInterval(poll, 60_000);
    return () => window.clearInterval(timer);
  }, [notificationSettings]);
  const changePersonalInfo = (info: PersonalInfo) => {
    savePersonalInfo(info);
    setPersonalInfo(info);
    goBack();
  };
  const changeStudentId = useCallback((studentId: string) => {
    setPersonalInfo((current) => ({ ...current, studentId }));
  }, []);

  // 移动端登录会跳去 CAS 再跳回来，整个应用会重新加载。
  // 必须先把票据换成 token，再挂载功能页 —— 否则功能页在 token 写回前
  // 就已完成初始化，会误判为「未登录」，用户回来还得再点一次。
  // 桌面端没有待处理票据时立即返回，不受影响。
  const [restoring, setRestoring] = useState(
    () =>
      hasPendingLogin() ||
      hasPendingTimetableLogin() ||
      hasPendingSchoolCardLogin(),
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
      await resumeMobileSchoolCardLogin();
      // 换完票再取「该回到哪一页」，避免中途重载时把标记消费掉
      const back = takeReturnTo();
      if (back) pushRoute({ type: "feature", id: back as FeatureId });
      else if (returnedFromJw) pushRoute({ type: "feature", id: "schedule" });
      setRestoring(false);
    })();
    // 只在首帧跑一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushRoute]);

  const openFeature = (id: FeatureId) => {
    pushRoute({ type: "feature", id });
  };

  useEffect(() => {
    const onAppBack = () => goBack();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Back") return;
      event.preventDefault();
      goBack();
    };
    window.addEventListener("app-back", onAppBack);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("app-back", onAppBack);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goBack]);

  const openTimetableAt = useCallback(
    (week: number) => {
      pushRoute({ type: "feature", id: "schedule", initialWeek: week });
    },
    [pushRoute],
  );

  /**
   * 功能页未登录时的统一出口：登记想登录的平台，然后跳到登录管理页。
   * 管理页读走这条请求并自动开始登录，所以登录动作只发生在管理页。
   */
  const goLogin = useCallback(
    (platform: PlatformId) => {
      requestLogin(platform);
      pushRoute({ type: "feature", id: "auth" });
    },
    [pushRoute],
  );

  const renderFeature = (
    id: FeatureId,
    initialWeek?: number,
    isMenuPage = false,
  ) => {
    const onBack = isMenuPage ? undefined : goBack;
    if (id === "electricity")
      return (
        <ElectricityPage
          onBack={onBack}
          studentId={personalInfo.studentId}
          onStudentIdChange={changeStudentId}
        />
      );
    if (id === "classroom") {
      return (
        <ClassroomPage onBack={onBack} onNeedLogin={() => goLogin("ybt")} />
      );
    }
    if (id === "schedule") {
      return (
        <TimetablePage
          onBack={onBack}
          initialWeek={initialWeek}
          onOpenCalendar={() => pushRoute({ type: "feature", id: "calendar" })}
          onSemesterChange={setSemester}
          onNeedLogin={() => goLogin("jw")}
        />
      );
    }
    if (id === "calendar") {
      return (
        <CalendarPage
          onBack={onBack}
          semesterStart={semester.startDate}
          maxWeek={semester.maxWeek}
          onOpenTimetable={openTimetableAt}
          onNeedLogin={() => goLogin("ybt")}
        />
      );
    }
    if (id === "auth")
      return (
        <AuthPage
          onBack={goBack}
          studentId={personalInfo.studentId}
          onStudentIdChange={changeStudentId}
        />
      );
    if (id === "schoolcard") return <SchoolCardPage onBack={onBack} />;
    return <FeaturePage featureId={id} onBack={onBack} />;
  };

  const content = restoring ? (
    <div className="page boot-wait">
      <div className="tt-progress">
        <span className="tt-spinner" aria-hidden="true" />
        <span>正在恢复登录状态…</span>
      </div>
    </div>
  ) : currentRoute.type === "personal-info" ? (
    <PersonalInfoPage
      info={personalInfo}
      onSave={changePersonalInfo}
      onBack={goBack}
    />
  ) : currentRoute.type === "appearance" ? (
    <AppearancePage
      settings={themeSettings}
      onChange={changeThemeSettings}
      onBack={goBack}
    />
  ) : currentRoute.type === "home-navigation" ? (
    <HomeNavigationPage
      settings={themeSettings}
      onChange={changeThemeSettings}
      onBack={goBack}
    />
  ) : currentRoute.type === "menu-feature" ? (
    renderFeature(currentRoute.id, undefined, true)
  ) : currentRoute.type === "feature" ? (
    renderFeature(currentRoute.id, currentRoute.initialWeek)
  ) : currentRoute.type === "notifications" ? (
    <NotificationSettingsPage
      settings={notificationSettings}
      onChange={setNotificationSettings}
      onBack={goBack}
    />
  ) : currentRoute.tab === "home" ? (
    <HomePage
      onOpenFeature={openFeature}
      onBrowseServices={() => setRootRoute({ type: "tab", tab: "services" })}
      homeServices={themeSettings.homeServices}
      greeting={themeSettings.homeGreeting}
      emoji={themeSettings.homeEmoji}
    />
  ) : currentRoute.tab === "services" ? (
    <ServicesPage onOpenFeature={openFeature} />
  ) : (
    <ProfilePage
      onOpenAuth={() => pushRoute({ type: "feature", id: "auth" })}
      onOpenAppearance={() => pushRoute({ type: "appearance" })}
      onOpenHomeNavigation={() => pushRoute({ type: "home-navigation" })}
      onOpenNotifications={() => pushRoute({ type: "notifications" })}
      profile={personalInfo}
      onOpenPersonalInfo={() => pushRoute({ type: "personal-info" })}
    />
  );

  const contentKey = restoring ? "restoring" : currentScreen.key;
  const pageTransition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 360, damping: 32, mass: 0.8 };

  return (
    <AppShell
      activeItem={activeItem}
      profile={personalInfo}
      navigationTabs={themeSettings.navigationTabs}
      navigationDisplay={themeSettings.navigationDisplay}
      onOpenProfile={() => {
        setRootRoute({ type: "tab", tab: "profile" });
      }}
      onNavigationSelect={(id) => {
        setRootRoute(navigationRoute(id));
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
      {exitPromptVisible &&
        createPortal(
          <motion.div
            className="app-exit-prompt-layer"
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <div className="app-exit-prompt" role="status" aria-live="polite">
              再按一次返回键退出
            </div>
          </motion.div>,
          document.body,
        )}
    </AppShell>
  );
}
