"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  BarChart3,
  Briefcase,
  LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/companies", label: "企業", icon: Building2 },
  { href: "/calendar", label: "カレンダー", icon: CalendarDays },
  { href: "/stats", label: "統計", icon: BarChart3 },
  { href: "/internships", label: "インターン", icon: Briefcase },
];

export default function AppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signOut() {
    if (isSupabaseConfigured()) await getSupabase().auth.signOut();
    router.push("/login");
  }

  // ログイン画面ではナビを出さない
  if (pathname === "/login") {
    return <>{children}</>;
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* PC: サイドバー */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-separator bg-surface p-4 md:flex">
        <div className="mb-8 px-2">
          <div className="text-2xl font-bold tracking-tight">KatsudouLog</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">就活選考管理</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition active:scale-[0.98] ${
                isActive(href)
                  ? "bg-accent/10 text-accent"
                  : "text-slate-600 hover:bg-slate-500/10 dark:text-slate-300"
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-4 flex items-center justify-between border-t border-separator pt-3">
          <div className="min-w-0">
            <ThemeToggle />
          </div>
          {email && (
            <button
              onClick={signOut}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 transition hover:bg-slate-500/10 dark:text-slate-400"
            >
              <LogOut size={14} /> ログアウト
            </button>
          )}
        </div>
        {email && (
          <div className="mt-2 truncate px-1 text-[11px] text-slate-400">{email}</div>
        )}
      </aside>

      {/* モバイル: 上部ヘッダー */}
      <header className="material pt-safe sticky top-0 z-30 flex items-center justify-between px-4 py-3 md:hidden">
        <div className="text-lg font-bold tracking-tight">KatsudouLog</div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {email && (
            <button onClick={signOut} aria-label="ログアウト" className="rounded-lg p-2 text-slate-500 transition-transform duration-150 hover:bg-slate-500/10 active:scale-90 dark:text-slate-400">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>

      {/* メイン */}
      <main className="pb-tabbar flex-1 px-4 pt-4 md:px-8 md:pb-8 md:pt-6">
        <div className="mx-auto max-w-6xl fade-in">{children}</div>
      </main>

      {/* モバイル: 下部固定タブ。
          罫線ではなくスクロールエッジでコンテンツを溶かし、下端はセーフエリアぶん空ける。 */}
      <nav className="material scroll-edge-top pb-safe fixed inset-x-0 bottom-0 z-40 flex justify-around pt-1 md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              // 指で押す前提なので最低 44px の高さを確保する
              className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg text-[10px] tracking-tight transition-transform duration-150 active:scale-90 ${
                active
                  ? "font-semibold text-accent"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Icon size={20} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
