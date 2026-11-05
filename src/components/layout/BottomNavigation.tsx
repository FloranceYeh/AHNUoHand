import type { MainTab } from "../../types";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "../Icon";
import { hapticIfAllowed } from "../../lib/haptics";
import { readThemeSettings } from "../../lib/theme";

const items: { id: MainTab; label: string; icon: string }[] = [
  { id: "home", label: "首页", icon: "home" },
  { id: "services", label: "服务", icon: "grid" },
  { id: "profile", label: "我的", icon: "person" },
];

export function BottomNavigation({
  activeTab,
  onChange,
}: {
  activeTab: MainTab;
  onChange: (tab: MainTab) => void;
}) {
  const reduceMotion = useReducedMotion();
  const iconOnly = readThemeSettings().navigationDisplay === "icon-only";
  return (
    <nav
      className={`bottom-navigation${iconOnly ? " icons-only" : ""}`}
      aria-label="主导航"
    >
      {items.map((item) => {
        const active = activeTab === item.id;
        return (
          <motion.button
            key={item.id}
            className={`nav-item ${active ? "is-active" : ""}`}
            aria-current={active ? "page" : undefined}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            onClick={() => {
              // 已经在这一页就不响，避免多余触感
              if (!active) hapticIfAllowed("light");
              onChange(item.id);
            }}
          >
            <motion.span
              className="nav-icon"
              animate={
                reduceMotion
                  ? undefined
                  : { scale: active ? 1.08 : 1, y: active ? -1 : 0 }
              }
              transition={{ type: "spring", stiffness: 500, damping: 28 }}
            >
              <Icon name={item.icon} size={22} />
            </motion.span>
            {!iconOnly && <span>{item.label}</span>}
          </motion.button>
        );
      })}
    </nav>
  );
}
