import BottomNavigation from "./BottomNavigation";
import VerifyEmailBanner from "./VerifyEmailBanner";

/**
 * Wraps citizen screens with the phone-frame treatment, the "Verify your
 * email" banner (until the email is verified) and the tab bar. The tab bar
 * is a sibling of the scrolling content, never on top of it, so it can't
 * cover anything.
 */
export default function CitizenShell({ children, noScroll = false }) {
  return (
    <div className="min-h-dvh bg-section sm:py-4">
      <div className="device-frame device-frame--app">
        <VerifyEmailBanner />
        <div data-shell-content className={noScroll ? "flex min-h-0 flex-1 flex-col" : "flex min-h-0 flex-1 flex-col overflow-y-auto pb-4"}>
          {children}
        </div>
        <BottomNavigation />
      </div>
    </div>
  );
}
