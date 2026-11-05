import { useState } from "react";
import { campusServices, serviceCategories } from "../data/services";
import type { FeatureId } from "../types";
import { Icon } from "../components/Icon";
import { ServiceGrid } from "../components/services/ServiceGrid";

export function ServicesPage({
  onOpenFeature,
}: {
  onOpenFeature: (id: FeatureId) => void;
}) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const filtered = campusServices.filter(
    (service) =>
      (category === "all" || service.category === category) &&
      `${service.title}${service.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="page services-page">
      <div className="page-heading">
        <p className="eyebrow">CAMPUS TOOLKIT</p>
        <h1>校园服务</h1>
        <p>把常用功能，放在触手可及的地方。</p>
      </div>
      <label className="search-field">
        <Icon name="search" size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索校园服务"
          aria-label="搜索校园服务"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="清除搜索">
            ×
          </button>
        )}
      </label>
      <div className="filter-row" role="tablist" aria-label="服务分类">
        {serviceCategories.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={category === item.id}
            className={`filter-chip ${category === item.id ? "is-selected" : ""}`}
            onClick={() => setCategory(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="service-results">
        <ServiceGrid services={filtered} onOpen={onOpenFeature} compact />
        {filtered.length === 0 && (
          <div className="empty-state">
            <Icon name="search" size={26} />
            <strong>没有找到相关服务</strong>
            <span>试试其他关键词</span>
          </div>
        )}
      </div>
      <div className="services-footnote">
        <span className="status-dot" />
        服务将随校园需求持续更新
      </div>
    </div>
  );
}
