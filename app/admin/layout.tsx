import React from "react";
import BottomTabsShell from "../components/navigation/BottomTabsShell";

export const metadata = {
  title: "Yield",
  description: "Yield MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <BottomTabsShell>{children}</BottomTabsShell>
      </body>
    </html>
  );
}
