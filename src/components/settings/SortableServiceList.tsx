import { Button } from "antd-mobile";
import {
  LayoutGroup,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "motion/react";
import { memo, useId, useRef, type RefObject } from "react";
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
}: {
  item: NavigationItem;
  orderKey: string;
  listRef: RefObject<HTMLDivElement | null>;
  removeDisabled: boolean;
  onRemove: () => void;
}) {
  const controls = useDragControls();
  const reduceMotion = useReducedMotion();
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
}: {
  values: NavigationItemId[];
  onChange: (values: NavigationItemId[]) => void;
  allowEmpty?: boolean;
  label: string;
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
              onRemove={() => onChange(values.filter((value) => value !== id))}
            />
          );
        })}
      </Reorder.Group>
    </LayoutGroup>
  );
});
