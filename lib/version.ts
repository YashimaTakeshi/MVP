import pkg from "../package.json";

export const APP_VERSION = pkg.version;
// ビルド時刻をJST日付で埋め込む（vercelのビルド時・ローカルビルド時ともにビルド実行時点の日付になる）
export const BUILD_DATE = new Date().toISOString().slice(0, 10);
