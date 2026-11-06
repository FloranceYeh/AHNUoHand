import { campusServices, featureDetails } from "../data/services";
import type { FeatureId } from "../types";
import { Icon } from "../components/Icon";

/** 有占位页的功能：从 featureDetails 的键里排除掉独立实现的页面。 */
type PlaceholderFeatureId = Exclude<FeatureId, "auth">;

export function FeaturePage({
  featureId,
  onBack,
}: {
  featureId: FeatureId;
  onBack?: () => void;
}) {
  const detail = featureDetails[featureId as PlaceholderFeatureId];
  const service = campusServices.find((item) => item.id === featureId);
  return (
    <div className="page feature-page">
      {onBack && (
        <button className="back-button" onClick={onBack}>
          <Icon name="arrow" size={19} />
          返回
        </button>
      )}
      <section className="feature-intro">
        <span
          className={`feature-hero-icon service-icon-${service?.category ?? "campus"}`}
        >
          <Icon name={detail.icon} size={30} />
        </span>
        <p className="eyebrow">{detail.eyebrow}</p>
        <h1>{detail.title}</h1>
        <p>{detail.description}</p>
      </section>
      <div className="placeholder-panel">
        <span className="placeholder-symbol">
          <Icon name="clock" size={24} />
        </span>
        <strong>功能准备中</strong>
        <p>校园数据接口接入后，这里将为你提供{detail.title}相关信息。</p>
        <span className="placeholder-caption">功能占位 · 等待服务接入</span>
      </div>
      <section className="planned-section">
        <h2>计划支持</h2>
        <div className="planned-list">
          {detail.points.map((point) => (
            <div className="planned-item" key={point}>
              <span className="planned-check">✓</span>
              {point}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
