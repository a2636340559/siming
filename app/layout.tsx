import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "司命 · 命运回收池",
  description: "你人生的回收站",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
