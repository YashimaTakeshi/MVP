import "server-only";
import crypto from "node:crypto";

// 幹事のGoogle refresh_token をDBへ保存する前に暗号化するための共通処理。
// Supabaseのダンプや万一のDB流出だけではトークンを復元できないようにするのが目的なので、
// 鍵はDBではなく実行環境の環境変数（TOKEN_ENCRYPTION_KEY）だけに置く。
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCMの推奨IV長（96bit）
const KEY_LENGTH = 32; // AES-256

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("TOKEN_ENCRYPTION_KEY が設定されていません（`openssl rand -hex 32` で生成してください）");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("TOKEN_ENCRYPTION_KEY は32byte（64桁）のhex文字列である必要があります");
  }
  return Buffer.from(hex, "hex");
}

/**
 * 平文を AES-256-GCM で暗号化し、`iv.authTag.ciphertext`（各パートbase64url）の1文字列にまとめて返す。
 * IVは毎回ランダム生成し、復号に必要なので暗号文と一緒に保存する（IVは秘密情報ではない）。
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

/** encrypt() が返した文字列を復号する。改ざんされている場合はGCMの認証で例外になる。 */
export function decrypt(cipher: string): string {
  const parts = cipher.split(".");
  if (parts.length !== 3) {
    throw new Error("暗号文の形式が正しくありません");
  }
  const [ivPart, tagPart, dataPart] = parts;
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  if (iv.length !== IV_LENGTH) {
    throw new Error("暗号文の形式が正しくありません");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

// 鍵長の定数は将来のローテーション処理でも使えるようにexportしておく
export const TOKEN_KEY_LENGTH = KEY_LENGTH;
