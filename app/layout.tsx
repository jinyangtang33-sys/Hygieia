import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "观己 · 个人数据中心",
  description: "记录健康、三餐、工作与资产，看见每一天的积累。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
