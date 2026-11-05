import { useState } from "react";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { ServicesPage } from "./pages/ServicesPage";
import { ProfilePage } from "./pages/ProfilePage";
import { FeaturePage } from "./pages/FeaturePage";
import { ElectricityPage } from "./pages/ElectricityPage";
import type { FeatureId, MainTab } from "./types";
import "./styles/tokens.css";
import "./App.css";

export default function App() {
  const [tab, setTab] = useState<MainTab>("home");
  const [feature, setFeature] = useState<FeatureId | null>(null);

  const openFeature = (id: FeatureId) => setFeature(id);
  const closeFeature = () => setFeature(null);

  return (
    <AppShell
      activeTab={tab}
      onTabChange={(next) => {
        setFeature(null);
        setTab(next);
      }}
    >
      {feature ? (
        feature === "electricity" ? (
          <ElectricityPage onBack={closeFeature} />
        ) : (
          <FeaturePage featureId={feature} onBack={closeFeature} />
        )
      ) : tab === "home" ? (
        <HomePage
          onOpenFeature={openFeature}
          onBrowseServices={() => setTab("services")}
        />
      ) : tab === "services" ? (
        <ServicesPage onOpenFeature={openFeature} />
      ) : (
        <ProfilePage />
      )}
    </AppShell>
  );
}
