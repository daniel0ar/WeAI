import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "./_components/RegisterSW";

export const metadata: Metadata = {
  title: "WeAI",
  description: "Shows your GPS location and counts nearby BLE devices.",
  appleWebApp: { capable: true, title: "WeAI", statusBarStyle: "black-translucent" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // pinch-to-zoom the whole app
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
