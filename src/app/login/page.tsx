"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Mail, Lock } from "lucide-react";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { Button, Field, inputClass } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!configured) {
      setErr("Supabase が未設定です。.env.local を設定してください。");
      return;
    }
    setLoading(true);
    const supabase = getSupabase();
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("確認メールを送信しました。メール内のリンクで認証後、ログインしてください。");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="surface w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold leading-tight tracking-tight">KatsudouLog</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            就活の選考をまとめて管理
          </p>
        </div>

        {!configured && (
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            Supabase が未設定です。<code>.env.local</code> に URL と anon key を設定してください。
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <Field label="メールアドレス">
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="you@example.com"
              />
            </div>
          </Field>
          <Field label="パスワード">
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pl-9`}
                placeholder="6文字以上"
              />
            </div>
          </Field>

          {err && <p className="text-sm text-red-500">{err}</p>}
          {msg && <p className="text-sm text-emerald-600">{msg}</p>}

          <Button type="submit" disabled={loading} className="w-full">
            <LogIn size={16} />
            {loading ? "処理中…" : mode === "signin" ? "ログイン" : "新規登録"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
          {mode === "signin" ? (
            <button onClick={() => setMode("signup")} className="text-brand-sky hover:underline">
              アカウントを作成
            </button>
          ) : (
            <button onClick={() => setMode("signin")} className="text-brand-sky hover:underline">
              ログインに戻る
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
