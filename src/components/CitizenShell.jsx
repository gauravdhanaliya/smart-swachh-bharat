import BottomNavigation from "./BottomNavigation";

/**
 * Wraps citizen screens (Home, Map, Bin/Toilet Details) with the same
 * phone-frame treatment as the auth flow, plus the bottom navigation
 * bar instead of the auth footer tagline.
 */
export default function CitizenShell({ children, noScroll = false }) {
  return (
    <div className="min-h-dvh bg-emerald-50/40 sm:py-4">
      <div className="device-frame device-frame--app">
        <div className={noScroll ? "flex-1 flex flex-col min-h-0" : "flex-1 flex flex-col min-h-0 overflow-y-auto pb-4"}>
          {children}
        </div>
        <BottomNavigation />
      </div>
    </div>
  );
}
