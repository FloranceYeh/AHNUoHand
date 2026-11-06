import type { CampusService } from "../../types";

export function ServiceDetails({ service }: { service: CampusService }) {
  return (
    <span className="service-copy">
      <span className="service-title">
        {service.title}
        {service.status === "coming-soon" && (
          <span className="coming-badge">即将上线</span>
        )}
        {service.status === "testing" && (
          <span className="testing-badge">测试功能</span>
        )}
      </span>
      <span className="service-description">{service.description}</span>
    </span>
  );
}
