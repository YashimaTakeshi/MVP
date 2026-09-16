import { APP_VERSION, BUILD_DATE } from "@/lib/version";

export function AppFooter() {
  return (
    <footer className="mt-auto px-4 py-6 text-center text-xs text-ink-muted">
      v{APP_VERSION}　{BUILD_DATE}
    </footer>
  );
}
