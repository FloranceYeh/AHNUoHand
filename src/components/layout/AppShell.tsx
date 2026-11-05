import type { ReactNode } from "react";
import type { MainTab } from "../../types";
import { BottomNavigation } from "./BottomNavigation";

interface AppShellProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  children: ReactNode;
}

export function AppShell({ activeTab, onTabChange, children }: AppShellProps) {
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
          <span className="brand-mark">A</span>
          <span>
            AHNUoHand<span className="brand-light"> · 校园助手</span>
          </span>
        </a>
        <button
          className="avatar-button"
          aria-label="个人中心"
          onClick={() => onTabChange("profile")}
        >
          同
        </button>
      </header>
      <main className="page-content" key={activeTab}>
        {children}
      </main>
      <BottomNavigation activeTab={activeTab} onChange={onTabChange} />
    </div>
  );
}
