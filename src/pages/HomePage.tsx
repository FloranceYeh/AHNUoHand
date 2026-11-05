import { campusServices } from "../data/services";
import type { FeatureId } from "../types";
import { Icon } from "../components/Icon";
import { ServiceGrid } from "../components/services/ServiceGrid";

export function HomePage({
  onOpenFeature,
  onBrowseServices,
}: {
  onOpenFeature: (id: FeatureId) => void;
  onBrowseServices: () => void;
}) {
  const featured = campusServices.filter(
    (service) => service.status === "available",
  );
  return (
    <div className="page home-page">
      <section className="welcome-block">
        <p className="eyebrow">ANHUI NORMAL UNIVERSITY</p>
        <h1>
          你好，同学<span className="wave">👋</span>
        </h1>
        <p className="welcome-subtitle">校园里的大小事，从这里开始。</p>
      </section>
      <button className="assistant-card" onClick={onBrowseServices}>
        <span className="assistant-orb">
          <Icon name="spark" size={23} />
        </span>
        <span className="assistant-copy">
          <strong>今天想办点什么？</strong>
          <span>课表、电费、空教室，一站就能找到</span>
        </span>
        <span className="assistant-action">
          <Icon name="search" size={20} />
        </span>
      </button>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">QUICK ACCESS</p>
            <h2>常用服务</h2>
          </div>
          <button className="text-action" onClick={onBrowseServices}>
            全部服务
            <Icon name="chevron" size={16} />
          </button>
        </div>
        <ServiceGrid services={featured} onOpen={onOpenFeature} />
      </section>
      <section className="campus-note">
        <span className="note-icon">
          <Icon name="spark" size={18} />
        </span>
        <div>
          <strong>让校园生活更简单</strong>
          <p>更多校园服务正在接入中，敬请期待。</p>
        </div>
      </section>
      <p className="home-footer">AHNUoHand</p>
    </div>
  );
}
