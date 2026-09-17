import "server-only";
import { google } from "googleapis";
import { createOrganizerOAuthClient, type OrganizerRecord } from "@/lib/auth";

/**
 * 【設計上の注意】リマインドの宛先は「未回答者」ではなく「幹事自身」。
 *
 * このアプリは参加者のメールアドレスを一切集めない（回答は名前と○△×だけ）。
 * つまり未回答者へ直接メールを送る手段が構造的に存在しない。
 * そこで、未回答者の名前一覧と回答用URLを載せた文面を幹事自身のGmailアドレスへ1通送り、
 * 幹事が普段使っているLINEやメールでそれを転送する、という運用に寄せている。
 * 本文には転送を促す一文を必ず入れる。
 */

function encodeSubject(subject: string): string {
  // RFC 2047（非ASCIIのヘッダーはbase64でエンコードする）
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function buildRawMessage(params: { to: string; subject: string; body: string }): string {
  const headers = [
    `To: ${params.to}`,
    `From: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = Buffer.from(params.body, "utf8").toString("base64");
  const message = `${headers.join("\r\n")}\r\n\r\n${body}`;
  return Buffer.from(message, "utf8").toString("base64url");
}

/**
 * 回答ページの絶対URL。
 * NEXTAUTH_URL が未設定だと相対パスだけのリンクになり、転送されたメールの中では開けない。
 * 気づかないまま「送れました」と表示されるのが最悪なので、ここで例外にして送信自体を失敗させる。
 */
function respondUrl(eventId: string): string {
  const base = (process.env.NEXTAUTH_URL ?? "").trim().replace(/\/$/, "");
  if (!base.startsWith("http")) {
    throw new Error("NEXTAUTH_URLが設定されていないため、回答ページのURLを作れませんでした。");
  }
  return `${base}/e/${eventId}`;
}

export function buildReminderBody(params: {
  eventTitle: string;
  eventId: string;
  pendingNames: string[];
}): string {
  const url = respondUrl(params.eventId);

  // 参加者名簿を持たないため、1人も回答が無いときは「誰が未回答か」を出せない。
  // その場合は名前一覧ではなく、URLをもう一度共有してもらう文面にする。
  if (params.pendingNames.length === 0) {
    return [
      `「${params.eventTitle}」の日程調整です。`,
      "",
      "まだ誰も回答していません。",
      "参加者に共有した日程調整のURLをもう一度送って、回答を呼びかけてください。",
      "",
      url,
      "",
      "このメールは幹事のあなた宛に届いています。",
      "上の文面をそのまま、参加者へ転送してお使いください。",
      "",
    ].join("\n");
  }

  const names = params.pendingNames.map((name) => `　${name} さん`).join("\n");
  return [
    `「${params.eventTitle}」の日程調整です。`,
    "",
    `まだ回答がそろっていないのは ${params.pendingNames.length} 人です。`,
    "",
    names,
    "",
    "回答はこちらのページからお願いします。",
    url,
    "",
    "このメールは幹事のあなた宛に届いています。",
    "上の文面をそのまま、未回答の方へ転送してお使いください。",
    "",
  ].join("\n");
}

/**
 * 未回答者リマインドの文面を、幹事自身のGmailアドレスへ送る。
 * 送信元も宛先も幹事のアカウント（gmail.send スコープ）なので、独自ドメインの確保が要らない。
 */
export async function sendReminderToOrganizer(
  organizer: OrganizerRecord,
  params: { eventTitle: string; eventId: string; pendingNames: string[] },
): Promise<void> {
  if (!organizer.email) {
    throw new Error("幹事のメールアドレスが取得できていません。Googleとつなぎ直してください。");
  }

  // 本文を先に組み立てる（URLが作れない場合はここで例外になり、送信前に止まる）。
  const body = buildReminderBody(params);
  const subject =
    params.pendingNames.length === 0
      ? `「${params.eventTitle}」まだ誰も回答していません`
      : `「${params.eventTitle}」まだ回答がそろっていません`;

  const auth = createOrganizerOAuthClient(organizer);
  const gmail = google.gmail({ version: "v1", auth });

  const raw = buildRawMessage({
    to: organizer.email,
    subject,
    body,
  });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}
