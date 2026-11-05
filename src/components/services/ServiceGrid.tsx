import type { CampusService, FeatureId } from "../../types";
import { ServiceCard } from "./ServiceCard";

export function ServiceGrid({
  services,
  onOpen,
  compact = false,
}: {
  services: CampusService[];
  onOpen: (id: FeatureId) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "service-list" : "service-grid"}>
      {services.map((service) => (
        <ServiceCard
          key={service.id}
          service={service}
          onOpen={onOpen}
          compact={compact}
        />
      ))}
    </div>
  );
}
