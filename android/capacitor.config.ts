import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "me.jybb.bbnote",
  appName: "BBNote",
  webDir: "../web/dist-android",
  plugins: {
    SystemBars: { insetsHandling: "native" }
  }
};

export default config;

