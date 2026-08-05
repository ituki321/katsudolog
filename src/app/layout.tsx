import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppFrame from "@/components/AppFrame";

export const metadata: Metadata = {
  title: "KatsudouLog | 就活選考管理",
  description: "就活の選考フロー・締切・カレンダーをまとめて管理する KatsudouLog",
};

// viewportFit: "cover" にしないと env(safe-area-inset-*) が常に 0 になる。
// 画面下端まで描いたうえで、ホームインジケーターぶんの余白は各要素が自分で確保する。
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// ダークモードのちらつき防止：ハイドレーション前にクラスを適用
const themeScript = `(function(){try{var t=localStorage.getItem('katsudou-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
