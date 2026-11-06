import type { ReactNode } from "react";
import type { MainTab } from "../../types";
import { BottomNavigation } from "./BottomNavigation";
import { BrandIcon } from "../BrandIcon";

interface AppShellProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  profile: { nickname: string; avatar: string };
  onOpenProfile: () => void;
  children: ReactNode;
}

export function AppShell({
  activeTab,
  onTabChange,
  profile,
  onOpenProfile,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <a
          className="brand"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            onTabChange("home");
          }}
        >
          <BrandIcon />
          <span>
            AHNUoHand<span className="brand-light"> · 校园助手</span>
          </span>
        </a>
        <button
          className={`avatar-button${profile.avatar ? " has-image" : ""}`}
          aria-label="个人中心"
          onClick={onOpenProfile}
        >
          {profile.avatar ? (
            <img src={profile.avatar} alt="个人头像" />
          ) : (
            profile.nickname.slice(0, 1) || "同"
          )}
        </button>
      </header>
      <main className="page-content" key={activeTab}>
        {children}
      </main>
      <BottomNavigation activeTab={activeTab} onChange={onTabChange} />
    </div>
  );
}
