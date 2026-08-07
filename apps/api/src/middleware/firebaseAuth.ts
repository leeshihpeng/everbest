import jwt from "jsonwebtoken";

/**
 * 驗證 Firebase 的 ID token（三順記帳系統用 Google 登入拿到的那個）。
 *
 * 刻意**不裝 `firebase-admin`**：那包相依很重、還要在 Cloud Run 上放服務帳戶金鑰，
 * 而我們只需要「驗簽 + 檢查 iss/aud」這一件事。Firebase 的 ID token 就是 Google 用
 * RS256 簽的 JWT，公鑰公開在下面那個網址，jsonwebtoken 直接吃 PEM 憑證。
 *
 * 沒設 FIREBASE_PROJECT_ID 就整條關閉——不會變成「忘了設定所以誰都能進」。
 */
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

export const firebaseAuthEnabled = !!PROJECT_ID;

/** Google 會輪換簽章金鑰，回應的 Cache-Control 有 max-age，照著它快取就好。 */
let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getCerts(): Promise<Record<string, string>> {
  if (certCache && Date.now() < certCache.expiresAt) return certCache.certs;

  const res = await fetch(CERT_URL);
  if (!res.ok) throw new Error(`取得 Google 簽章憑證失敗（HTTP ${res.status}）`);
  const certs = (await res.json()) as Record<string, string>;

  // 解析不出 max-age 時給一小時，不要無限期沿用舊金鑰
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  certCache = { certs, expiresAt: Date.now() + maxAge * 1000 };
  return certs;
}

export interface FirebaseIdentity {
  email: string;
}

/**
 * 驗證成功回傳 email，失敗一律回 null（不細分原因，避免把驗證細節洩漏給呼叫端）。
 *
 * **`email_verified` 一定要檢查**：Firebase 允許以未驗證的信箱建立帳號，
 * 少了這道檢查，任何人只要註冊一個宣稱是公司同事信箱的帳號就能登入。
 * Google 登入本來就是已驗證的，所以這個檢查不會擋到正常使用者。
 */
export async function verifyFirebaseIdToken(token: string): Promise<FirebaseIdentity | null> {
  if (!PROJECT_ID) return null;

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || decoded.header.alg !== "RS256" || !decoded.header.kid) return null;

    const certs = await getCerts();
    const cert = certs[decoded.header.kid];
    if (!cert) return null;

    const payload = jwt.verify(token, cert, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    }) as { sub?: string; email?: string; email_verified?: boolean };

    if (!payload.sub || !payload.email || payload.email_verified !== true) return null;
    return { email: payload.email.toLowerCase() };
  } catch {
    return null;
  }
}
