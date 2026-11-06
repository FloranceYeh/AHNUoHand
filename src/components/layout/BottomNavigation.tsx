import type { NavigationItemId } from "../../types";
import { motion, useReducedMotion } from "motion/react";
import { Icon } from "../Icon";
import { hapticIfAllowed } from "../../lib/haptics";
import { navigationItems } from "../../data/navigation";

export function BottomNavigation({
  activeItem,
  onSelect,
  navigationTabs,
  navigationDisplay,
}: {
  activeItem: NavigationItemId;
  onSelect: (item: NavigationItemId) => void;
  navigationTabs: NavigationItemId[];
  navigationDisplay: "icon-label" | "icon-only";
}) {
  const reduceMotion = useReducedMotion();
  const iconOnly = navigationDisplay === "icon-only";
  const items = navigationTabs
    .map((id) => navigationItems.find((item) => item.id === id))
    .filter((item) => item !== undefined);
  return (
    <nav
      className={`bottom-navigation${iconOnly ? " icons-only" : ""}`}
      aria-label="主导航"
    >
      {items.map((item) => {
        const active = activeItem === item.id;
        return (
          <motion.button
            key={item.id}
            className={`nav-item ${active ? "is-active" : ""}`}
            data-service-category={
              item.kind === "feature" ? item.category : undefined
            }
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            onClick={() => {
              // 已经在这一页就不响，避免多余触感
              if (!active) hapticIfAllowed("light");
              onSelect(item.id);
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
