import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3ON 운영센터 차세대 Staging",
  description: "Production과 분리된 3ON 성장자료 검증 환경",
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
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
