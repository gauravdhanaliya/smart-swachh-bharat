import { useCallback, useEffect, useRef, useState } from "react";
import { hasGpsAck, rememberGpsAck } from "../utils/gps";

/**
 * Gates a GPS lookup behind the consent notice. GPS is only ever started from
 * `request()` — i.e. when the user taps the auto-fetch option, never on load.
 *
 *   const gps = useGpsConsent({ run: fetchLocation, onManual: showManual });
 *   <button onClick={gps.request}>Use my location</button>
 *   {gps.asking && <GpsConsentNotice onAllow={gps.allow} onManual={gps.decline} />}
 *
 * Once allowed, the notice is skipped for the rest of the browser session.
 */
export function useGpsConsent({ run, onManual }) {
  const [asking, setAsking] = useState(false);
  const runRef = useRef(run);
  const manualRef = useRef(onManual);
  const triggerRef = useRef(null);
  useEffect(() => {
    runRef.current = run;
    manualRef.current = onManual;
  });

  const request = useCallback(() => {
    if (hasGpsAck()) {
      runRef.current();
      return;
    }
    triggerRef.current = document.activeElement;
    setAsking(true);
  }, []);

  const allow = useCallback(() => {
    rememberGpsAck();
    setAsking(false);
    runRef.current();
  }, []);

  const decline = useCallback(() => {
    setAsking(false);
    manualRef.current?.();
    // Hand focus back to the control that opened the notice, once it is rendered again.
    const trigger = triggerRef.current;
    setTimeout(() => trigger?.isConnected && trigger.focus?.(), 0);
  }, []);

  return { asking, request, allow, decline };
}
