import { Button } from "antd-mobile";
import {
  LayoutGroup,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "motion/react";
import { memo, useEffect, useId, useRef, type RefObject } from "react";
import { navigationItems, type NavigationItem } from "../../data/navigation";
import type { NavigationItemId } from "../../types";
import { Icon } from "../Icon";
import { ServiceDetails } from "../services/ServiceDetails";
import { ServiceIcon } from "../services/ServiceIcon";

function SortableService({
  item,
  orderKey,
  listRef,
  removeDisabled,
  onRemove,
  isDefault,
  onLongPress,
}: {
  item: NavigationItem;
  orderKey: string;
  listRef: RefObject<HTMLDivElement | null>;
  removeDisabled: boolean;
  onRemove: () => void;
  isDefault: boolean;
  onLongPress?: (id: NavigationItemId) => void;
}) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();
  const pressTimer = useRef<number | null>(null);
  const pressHandled = useRef(false);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const cancelPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressOrigin.current = null;
  };
  useEffect(
    () => () => {
      if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    },
    [],
  );
  return (
    <Reorder.Item
      as="div"
      value={item.id}
      className="customization-row"
      layout="position"
      layoutDependency={orderKey}
      dragListener={false}
      dragControls={controls}
      dragConstraints={listRef}
      dragElastic={0.05}
      dragMomentum={false}
      tabIndex={onLongPress ? 0 : undefined}
      aria-label={
        onLongPress
          ? `${item.label}，${isDefault ? "当前首页" : "长按设为首页"}`
          : undefined
      }
      onPointerDown={(event) => {
        cancelPress();
        pressHandled.current = false;
        if (
          !onLongPress ||
          !event.isPrimary ||
          event.button !== 0 ||
          (event.target as Element).closest("button")
        )
          return;
        pressOrigin.current = { x: event.clientX, y: event.clientY };
        pressTimer.current = window.setTimeout(() => {
          cancelPress();
          pressHandled.current = true;
          onLongPress(item.id);
        }, 500);
      }}
      onPointerMove={(event) => {
        const origin = pressOrigin.current;
        if (
          origin &&
          Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10
        )
          cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={cancelPress}
      onDragStart={cancelPress}
      onContextMenu={
        onLongPress
          ? (event) => {
              event.preventDefault();
              cancelPress();
              if (
                !pressHandled.current &&
                !(event.target as Element).closest("button")
              ) {
                pressHandled.current = true;
                onLongPress(item.id);
              }
            }
          : undefined
      }
      onKeyDown={
        onLongPress
          ? (event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" ||
                  event.key === " " ||
                  event.key === "ContextMenu" ||
                  (event.shiftKey && event.key === "F10"))
              ) {
                event.preventDefault();
                onLongPress(item.id);
              }
            }
          : undefined
      }
      whileDrag={{
        boxShadow: "var(--shadow-floating)",
        borderColor: "var(--color-primary)",
      }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 500, damping: 38 }
      }
    >
      <button
        type="button"
        className="customization-drag-handle"
        aria-label={`拖动${item.label}排序`}
        title={`拖动${item.label}排序`}
        onPointerDown={(event) => controls.start(event)}
      >
        <Icon name="grip" size={20} />
      </button>
      <span
        className="customization-sortable-icon"
        onPointerDown={(event) => controls.start(event)}
      >
        {item.kind === "feature" ? (
          <ServiceIcon service={item} />
        ) : (
          <span className="customization-menu-icon">
            <Icon name={item.icon} size={22} />
          </span>
        )}
      </span>
      {item.kind === "feature" ? (
        <ServiceDetails service={item} />
      ) : (
        <span className="service-copy">
          <span className="service-title">{item.label}</span>
          <span className="service-description">{item.description}</span>
        </span>
      )}
      {isDefault && (
        <span className="customization-default-badge">
          <Icon name="star" size={15} />
          <p>首页</p>
        </span>
      )}
      <Button
        size="small"
        fill="none"
        className="customization-remove-button"
        aria-label={`移除${item.label}`}
        disabled={removeDisabled}
        onClick={onRemove}
      >
        <Icon name="close" size={18} />
      </Button>
    </Reorder.Item>
  );
}

// Each list observes only its own order, so editing one list does not
// remeasure or animate the other list's rows.
export const SortableServiceList = memo(function SortableServiceList({
  values,
  onChange,
  allowEmpty = false,
  label,
  defaultNavigation,
  onSetDefaultNavigation,
}: {
  values: NavigationItemId[];
  onChange: (values: NavigationItemId[]) => void;
  allowEmpty?: boolean;
  label: string;
  defaultNavigation?: NavigationItemId;
  onSetDefaultNavigation?: (id: NavigationItemId) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const groupId = useId();
  const orderKey = values.join("|");
  return (
    <LayoutGroup id={groupId} inherit={false}>
      <Reorder.Group
        as="div"
        ref={listRef}
        aria-label={label}
        className="customization-list"
        axis="y"
        values={values}
        onReorder={onChange}
        layoutDependency={orderKey}
      >
        {values.map((id) => {
          const item = navigationItems.find((option) => option.id === id);
          if (!item) return null;
          return (
            <SortableService
              key={id}
              item={item}
              orderKey={orderKey}
              listRef={listRef}
              removeDisabled={!allowEmpty && values.length === 1}
              isDefault={id === defaultNavigation}
              onLongPress={onSetDefaultNavigation}
              onRemove={() => onChange(values.filter((value) => value !== id))}
            />
          );
        })}
      </Reorder.Group>
    </LayoutGroup>
  );
});
