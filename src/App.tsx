import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { ServicesPage } from "./pages/ServicesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { FeaturePage } from "./pages/FeaturePage";
import { ElectricityPage } from "./pages/ElectricityPage";
import { ClassroomPage } from "./pages/ClassroomPage";
import { TimetablePage } from "./pages/TimetablePage";
import { CalendarPage } from "./pages/CalendarPage";
import { AuthPage } from "./pages/AuthPage";
import { resumeMobileLogin, takeReturnTo } from "./lib/classroom";
import type { FeatureId, MainTab } from "./types";
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
  const [tab, setTab] = useState<MainTab>("home");
  const [feature, setFeature] = useState<FeatureId | null>(null);
  const [semester, setSemester] = useState<SemesterInfo>({});
  const [targetWeek, setTargetWeek] = useState<number | undefined>(undefined);

  // 移动端登录会跳去 CAS 再跳回来，应用重新加载。
  // 启动时把上次的票据接上，并回到登录前所在的功能页。
  useEffect(() => {
    const back = takeReturnTo();
    if (back) setFeature(back as FeatureId);
    void resumeMobileLogin().catch(() => {
      /* 没有待处理的登录，或票据已失效，忽略即可 */
    });
  }, []);

  const openFeature = (id: FeatureId) => {
    if (id !== "schedule") setTargetWeek(undefined);
    setFeature(id);
  };
  const closeFeature = () => setFeature(null);

  const openTimetableAt = useCallback((week: number) => {
    setTargetWeek(week);
    setFeature("schedule");
  }, []);

  const renderFeature = (id: FeatureId) => {
    if (id === "electricity") return <ElectricityPage onBack={closeFeature} />;
    if (id === "classroom") return <ClassroomPage onBack={closeFeature} />;
    if (id === "schedule") {
      return (
        <TimetablePage
          onBack={closeFeature}
          initialWeek={targetWeek}
          onOpenCalendar={() => setFeature("calendar")}
          onSemesterChange={setSemester}
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
        />
      );
    }
    if (id === "auth") return <AuthPage onBack={closeFeature} />;
    return <FeaturePage featureId={id} onBack={closeFeature} />;
  };

  return (
    <AppShell
      activeTab={tab}
      onTabChange={(next) => {
        setFeature(null);
        setTab(next);
      }}
    >
      {feature ? (
        renderFeature(feature)
      ) : tab === "home" ? (
        <HomePage
          onOpenFeature={openFeature}
          onBrowseServices={() => setTab("services")}
        />
      ) : tab === "services" ? (
        <ServicesPage onOpenFeature={openFeature} />
      ) : (
        <ProfilePage onOpenAuth={() => setFeature("auth")} />
      )}
    </AppShell>
  );
}
