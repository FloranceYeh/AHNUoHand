import type { MainTab } from "../../types";
import { Icon } from "../Icon";

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
  return (
    <nav className="bottom-navigation" aria-label="主导航">
      {items.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${activeTab === item.id ? "is-active" : ""}`}
          aria-current={activeTab === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          <span className="nav-icon">
            <Icon name={item.icon} size={22} />
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
