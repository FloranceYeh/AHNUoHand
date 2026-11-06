import type { CampusService } from "../../types";
import { Icon } from "../Icon";

export function ServiceIcon({
  service,
  size = 22,
}: {
  service: CampusService;
  size?: number;
}) {
  return (
    <span className={`service-icon service-icon-${service.category}`}>
      <Icon name={service.icon} size={size} />
    </span>
  );
}
