import Link from "next/link";
import { AppFooter } from "@/components/AppFooter";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-[34rem] flex-1 flex-col justify-center gap-10 px-4 py-24">
        <div className="space-y-4">
          <h1 className="font-heading text-3xl font-bold leading-snug">
            日程調整
          </h1>
          <p className="text-ink-muted leading-loose">
            参加者はいつも通り、名前と○△×を送るだけ。
            <br />
            幹事だけGoogleカレンダーでパワーアップできます。
          </p>
        </div>
        <Link
          href="/new"
          className="inline-flex h-12 items-center justify-center rounded-lg bg-bamboo px-6 font-medium text-surface on-bamboo"
        >
          イベントをつくる
        </Link>
      </main>
      <AppFooter />
    </div>
  );
}
