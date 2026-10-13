import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3ON 운영센터",
  description: "3ON 길드 성장자료와 운영기록",
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
