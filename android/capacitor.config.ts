import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "me.jybb.bbnote",
  appName: "BBNote",
  webDir: "../web/dist",
  bundledWebRuntime: false,
  plugins: {
    App: {
      launchUrl: "bbnote://auth/callback"
    }
  }
};

export default config;

