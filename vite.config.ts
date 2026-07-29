import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const normalize = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "";
};

const getPackageVersion = () => {
  try {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      version?: string;
    };
    return normalize(packageJson.version);
  } catch {
    return "";
  }
};

const buildVersion =
  normalize(process.env.VITE_APP_VERSION) || getPackageVersion() || "dev";

export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 4096,
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(buildVersion),
  },
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 40218,
    strictPort: true,
  },
});
