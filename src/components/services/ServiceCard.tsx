import type { CampusService } from "../../types";
import { Icon } from "../Icon";

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
      <span className={`service-icon service-icon-${service.category}`}>
        <Icon name={service.icon} size={22} />
      </span>
      <span className="service-copy">
        <span className="service-title">
          {service.title}
          {service.status === "coming-soon" && (
            <span className="coming-badge">即将上线</span>
          )}
        </span>
        <span className="service-description">{service.description}</span>
      </span>
      <Icon name="chevron" size={18} className="service-chevron" />
    </button>
  );
}
