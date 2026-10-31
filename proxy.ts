import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Basic認証。テスト物件は秘密保持契約の対象なので、/api・画像・静的ファイルを含むすべてのリクエストを守る
// Next.js 16 では middleware.ts は proxy.ts に改名された（node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md）
// matcher を付けないので、Server Actions（各画面への POST）もここを通る
//
// 環境変数：BASIC_AUTH_PASSWORD（共通パスワード、必須）、BASIC_AUTH_USER（省略時は brumby）
// パスワードが未設定のときは、認証をかけずに通す（一時的に解除中。元はローカルの開発（next dev）以外は 503 で止めていた）

const REALM = "BRUMBY PoC";

/** 長さの違いで時間が変わらないよう、ハッシュにしてから比べる */
function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function readCredentials(header: string | null): { user: string; password: string } | null {
  if (!header?.startsWith("Basic ")) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return null;
  }
  const i = decoded.indexOf(":");
  if (i < 0) return null;
  return { user: decoded.slice(0, i), password: decoded.slice(i + 1) };
}

export function proxy(request: NextRequest) {
  const password = process.env.BASIC_AUTH_PASSWORD;
  const user = process.env.BASIC_AUTH_USER || "brumby";

  // TODO: 一時的に解除中。戻すときは、未設定なら next dev 以外は 503 で止める形に戻す
  if (!password) return NextResponse.next();

  const given = readCredentials(request.headers.get("authorization"));
  // ユーザー名とパスワードは両方とも比べる（片方だけで判定を打ち切らない）
  const okUser = given ? safeEqual(given.user, user) : false;
  const okPassword = given ? safeEqual(given.password, password) : false;
  if (okUser && okPassword) return NextResponse.next();

  return new NextResponse("認証が必要です。", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
