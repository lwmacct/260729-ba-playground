import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkbenchProvider } from "@lwmacct/260627-antd-workbench";
import { AppShell } from "./AppShell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15_000,
    },
  },
});

export function AppRoot() {
  return (
    <WorkbenchProvider
      antd={{
        app: {
          notification: {
            bottom: 20,
            duration: 2,
            maxCount: 3,
            pauseOnHover: true,
            placement: "bottomRight",
            showProgress: true,
          },
        },
      }}
      appearance={{
        defaultValue: {
          accent: "#ef5b3c",
          mode: "light",
          radius: 6,
          scheme: "neutral",
          surface: "soft",
        },
        storageKey: "workflow-webui.appearance",
      }}
      locale="zh-CN"
      localeStorageKey={false}
    >
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </WorkbenchProvider>
  );
}
