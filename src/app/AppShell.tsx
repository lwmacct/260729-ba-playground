import { CloudServerOutlined } from "@ant-design/icons";
import {
  WorkbenchAppearanceButton,
  WorkbenchShell,
} from "@lwmacct/260627-antd-workbench";
import { useEffect, useState } from "react";
import playgroundPackageJson from "../../package.json";
import AdsPowerPage from "../pages/AdsPowerPage";
import SettingsPage from "../pages/SettingsPage";
import WorkflowPage from "../pages/WorkflowPage";
import {
  appRoutes,
  getRouteFromHash,
  navigateHashRoute,
  normalizeHashRoute,
  type AppRoute,
} from "./routes";
import styles from "./AppShell.module.css";

export function AppShell() {
  const [activeRoute, setActiveRoute] = useState<AppRoute>(getRouteFromHash);
  const buildVersion =
    (import.meta.env.VITE_APP_VERSION as string | undefined) ??
    playgroundPackageJson.version;

  useEffect(() => {
    const handleHashChange = () => {
      setActiveRoute(normalizeHashRoute());
    };

    if (!window.location.hash) {
      navigateHashRoute("workflow");
    } else {
      handleHashChange();
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  function handleNavigate(key: string) {
    const route = key as AppRoute;
    setActiveRoute(route);
    navigateHashRoute(route);
  }

  const routeContent = {
    workflow: <WorkflowPage />,
    adspower: <AdsPowerPage />,
    settings: <SettingsPage />,
  } satisfies Record<AppRoute, React.ReactNode>;

  return (
    <WorkbenchShell
      brand={{
        mark: <CloudServerOutlined />,
        name: "BA Playground",
        version: buildVersion,
      }}
      contentClassName={
        activeRoute === "settings"
          ? `${styles.content} ${styles.scrollContent}`
          : styles.content
      }
      nav={appRoutes}
      selectedNavKey={activeRoute}
      utilities={<WorkbenchAppearanceButton />}
      onSelectNav={handleNavigate}
    >
      {routeContent[activeRoute]}
    </WorkbenchShell>
  );
}
