import type { ReactNode } from "react";
import type { NavigationItemId } from "../../types";
import type { NavigationDisplay } from "../../lib/theme";
import { motion } from "motion/react";
import { BottomNavigation } from "./BottomNavigation";
import { BrandIcon } from "../BrandIcon";

interface AppShellProps {
  activeItem: NavigationItemId;
  onNavigationSelect: (item: NavigationItemId) => void;
  profile: { nickname: string; avatar: string };
  onOpenProfile: () => void;
  navigationTabs: NavigationItemId[];
  navigationDisplay: NavigationDisplay;
  children: ReactNode;
}

export function AppShell({
  activeItem,
  onNavigationSelect,
  profile,
  onOpenProfile,
  navigationTabs,
  navigationDisplay,
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
            onNavigationSelect("home");
          }}
        >
          <BrandIcon />
          <span>
            <span>AHNUoHand</span>
            <span className="brand-light"> · 校园助手</span>
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
      <motion.main layoutScroll className="page-content" key={activeItem}>
        {children}
      </motion.main>
      <BottomNavigation
        activeItem={activeItem}
        onSelect={onNavigationSelect}
        navigationTabs={navigationTabs}
        navigationDisplay={navigationDisplay}
      />
    </div>
  );
}
