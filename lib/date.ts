const JST = "Asia/Tokyo";

// 候補日の見出し表示（例: 9/18(木) 19:00）
export function formatCandidate(isoString: string): string {
  const date = new Date(isoString);
  const md = new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${md} ${time}`;
}

// 確定演出画面用（例: 9月22日(月)）
export function formatConfirmedDate(isoString: string): { month: string; day: string; weekday: string; time: string } {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: JST,
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
    time: `${get("hour")}:${get("minute")}`,
  };
}

// Google Calendar API（freebusy.query / events.insert）向け：オフセット付きRFC3339（JST +09:00）
export function toJstRfc3339(isoString: string): string {
  const date = new Date(isoString);
  const y = new Intl.DateTimeFormat("en-CA", { timeZone: JST, year: "numeric" }).format(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${y}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}+09:00`;
}
