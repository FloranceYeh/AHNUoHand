import type { CampusService } from "../../types";
import { Icon } from "../Icon";
import { ServiceDetails } from "./ServiceDetails";
import { ServiceIcon } from "./ServiceIcon";

export function ServiceCard({
  service,
  onOpen,
  compact = false,
}: {
  service: CampusService;
  onOpen: (id: CampusService["id"]) => void;
  compact?: boolean;
}) {
  return (
    <button
      className={`service-card ${compact ? "service-card-compact" : ""}`}
      onClick={() => onOpen(service.id)}
    >
      <ServiceIcon service={service} />
      <ServiceDetails service={service} />
      <Icon name="chevron" size={18} className="service-chevron" />
    </button>
  );
}
