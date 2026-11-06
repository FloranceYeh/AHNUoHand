import { Button, Checkbox, Popup } from "antd-mobile";
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { SortableServiceList } from "../components/settings/SortableServiceList";
import { HomeWelcomeSettings } from "../components/settings/HomeWelcomeSettings";
import { ServiceDetails } from "../components/services/ServiceDetails";
import { ServiceIcon } from "../components/services/ServiceIcon";
import { campusServices } from "../data/services";
import { navigationItems } from "../data/navigation";
import type { CampusServiceId, NavigationItemId } from "../types";
import type { ThemeSettings } from "../lib/theme";
import { hapticIfAllowed } from "../lib/haptics";

export function HomeNavigationPage({
  settings,
  onChange,
  onBack,
}: {
  settings: ThemeSettings;
  onChange: (changes: Partial<ThemeSettings>) => void;
  onBack: () => void;
}) {
  const update = onChange;
  const updateHomeServices = useCallback(
    (ids: NavigationItemId[]) => {
      onChange({
        homeServices: ids.filter((id): id is CampusServiceId =>
          campusServices.some((service) => service.id === id),
        ),
      });
    },
    [onChange],
  );
  const updateNavigation = useCallback(
    (navigationTabs: NavigationItemId[]) => {
      onChange({ navigationTabs });
    },
    [onChange],
  );
  const [picker, setPicker] = useState<"home" | "navigation" | null>(null);
  const setDefaultNavigation = useCallback(
    (id: NavigationItemId) => {
      onChange({ defaultNavigation: id });
      hapticIfAllowed("success");
    },
    [onChange],
  );
  const [pendingSelection, setPendingSelection] = useState<NavigationItemId[]>(
    [],
  );
  useEffect(() => {
    if (picker === null) return;
    const dismissPicker = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        event.key !== "Escape" &&
        event.key !== "Back"
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPicker(null);
    };
    window.addEventListener("app-back", dismissPicker, true);
    window.addEventListener("keydown", dismissPicker, true);
    return () => {
      window.removeEventListener("app-back", dismissPicker, true);
      window.removeEventListener("keydown", dismissPicker, true);
    };
  }, [picker]);
  const pickerOptions =
    picker === "home"
      ? campusServices
          .filter((service) => !settings.homeServices.includes(service.id))
          .map((service) => ({
            id: service.id,
            label: service.title,
            icon: service.icon,
            description: service.description,
            service,
          }))
      : picker === "navigation"
        ? navigationItems
            .filter((item) => !settings.navigationTabs.includes(item.id))
            .map((item) => ({
              id: item.id,
              label: item.label,
              icon: item.icon,
              service: item.kind === "feature" ? item : undefined,
              description: item.description,
            }))
        : [];
  const pickerLimit =
    picker === "navigation" ? 5 - settings.navigationTabs.length : Infinity;

  const openPicker = (target: "home" | "navigation") => {
    setPendingSelection([]);
    setPicker(target);
  };

  const confirmAdd = () => {
    if (picker === "home") {
      const added = pendingSelection.filter((id): id is CampusServiceId =>
        campusServices.some((service) => service.id === id),
      );
      update({ homeServices: [...settings.homeServices, ...added] });
    } else if (picker === "navigation") {
      update({
        navigationTabs: [...settings.navigationTabs, ...pendingSelection].slice(
          0,
          5,
        ),
      });
    }
    setPicker(null);
    setPendingSelection([]);
  };

  return (
    <div className="page feature-page home-navigation-page">
      <button className="back-button" onClick={onBack}>
        <Icon name="arrow" size={18} />
        返回
      </button>
      <div className="page-heading">
        <p className="eyebrow">HOME & NAVIGATION</p>
        <h1>主页与导航</h1>
        <p>定制欢迎语、常用服务与底部菜单，按你的习惯安排主页。</p>
      </div>
      <HomeWelcomeSettings settings={settings} onChange={onChange} />
      <section
        className="customization-section"
        aria-labelledby="home-services-title"
      >
        <div className="customization-heading">
          <h2 id="home-services-title">主页常用服务</h2>
          <span>{settings.homeServices.length} 项</span>
          <Button
            size="small"
            fill="outline"
            className="customization-add-button"
            disabled={settings.homeServices.length === campusServices.length}
            onClick={() => openPicker("home")}
          >
            <Icon name="plus" size={16} />
            添加
          </Button>
        </div>
        <SortableServiceList
          values={settings.homeServices}
          onChange={updateHomeServices}
          allowEmpty
          label="主页常用服务排序"
        />
        {settings.homeServices.length === 0 && (
          <p className="customization-empty">还没有添加常用服务</p>
        )}
      </section>
      <section
        className="customization-section"
        aria-labelledby="navigation-items-title"
      >
        <div className="customization-heading">
          <h2 id="navigation-items-title">底部菜单栏</h2>
          <span>{settings.navigationTabs.length} / 5 项</span>
          <Button
            size="small"
            fill="outline"
            className="customization-add-button"
            disabled={settings.navigationTabs.length >= 5}
            onClick={() => openPicker("navigation")}
          >
            <Icon name="plus" size={16} />
            添加
          </Button>
        </div>
        <SortableServiceList
          values={settings.navigationTabs}
          onChange={updateNavigation}
          defaultNavigation={settings.defaultNavigation}
          onSetDefaultNavigation={setDefaultNavigation}
          label="底部菜单排序"
        />
        <p className="customization-hint">
          长按上方列表中的项目可设为首页，打开应用时默认显示。
        </p>
      </section>
      <Popup
        visible={picker !== null}
        position="bottom"
        closeOnMaskClick
        showCloseButton
        onClose={() => setPicker(null)}
        destroyOnClose
        bodyClassName="customization-picker-popup"
      >
        <div className="customization-picker-content">
          <header className="customization-picker-header">
            <h2>{picker === "home" ? "添加常用服务" : "添加底部菜单"}</h2>
          </header>
          {picker === "navigation" && (
            <p className="customization-picker-capacity">
              还可添加 {pickerLimit} 项
            </p>
          )}
          <div className="customization-picker-options">
            {pickerOptions.map((option) => {
              const checked = pendingSelection.includes(option.id);
              const disabled =
                !checked && pendingSelection.length >= pickerLimit;
              return (
                <Checkbox
                  className="customization-picker-option"
                  aria-label={option.label}
                  key={option.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={(nextChecked) =>
                    setPendingSelection((current) =>
                      nextChecked
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id),
                    )
                  }
                >
                  {option.service ? (
                    <>
                      <ServiceIcon service={option.service} size={19} />
                      <ServiceDetails service={option.service} />
                    </>
                  ) : (
                    <>
                      <span className="customization-menu-icon">
                        <Icon name={option.icon} size={19} />
                      </span>
                      <span className="service-copy">
                        <span className="service-title">{option.label}</span>
                        <span className="service-description">
                          {option.description}
                        </span>
                      </span>
                    </>
                  )}
                </Checkbox>
              );
            })}
            {pickerOptions.length === 0 && (
              <p className="customization-empty">没有可添加的项目</p>
            )}
          </div>
          <Button
            block
            color="primary"
            disabled={pendingSelection.length === 0}
            onClick={confirmAdd}
          >
            添加 {pendingSelection.length} 项
          </Button>
        </div>
      </Popup>
    </div>
  );
}
