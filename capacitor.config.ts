import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.example.blescout",
  appName: "BLE Scout",
  webDir: "out",
  android: { zoomEnabled: true }, // pinch-to-zoom the whole app
};

export default config;
