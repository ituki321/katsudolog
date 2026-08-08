"use client";

import { useState } from "react";
import { Building2 } from "lucide-react";
import { LOGO_FALLBACK_SIZE, logoUrlFromWebsite } from "@/lib/logo";

/**
 * 企業ロゴ。取得できないときは今までどおり建物アイコンにする。
 *
 * 取得失敗の判定に工夫がいる：Google は該当なしのとき 404 ではなく
 * 16×16 の既定アイコン（地球儀）を 200 で返してくる。実データは 48×48 で返るので、
 * 読み込み後の naturalWidth が 16 以下なら「無かった」とみなす。
 * naturalWidth はクロスオリジンでも読めるので canvas を汚さずに判定できる。
 */
export default function CompanyLogo({
  website,
  size = 36,
  className = "",
}: {
  website: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const src = logoUrlFromWebsite(website);
  const [failed, setFailed] = useState(false);

  const box = `flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${className}`;
  const style = { width: size, height: size };

  if (!src || failed) {
    return (
      <div className={`${box} bg-accent/10 text-accent`} style={style}>
        <Building2 size={Math.round(size * 0.5)} />
      </div>
    );
  }

  return (
    <div className={`${box} border border-separator bg-white`} style={style}>
      {/* 48px 程度のファビコンなので最適化の旨みがなく、
          Google → gstatic のリダイレクトを挟むため next/image は使わない */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="h-full w-full object-contain p-1"
        onError={() => setFailed(true)}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth <= LOGO_FALLBACK_SIZE) setFailed(true);
        }}
      />
    </div>
  );
}
