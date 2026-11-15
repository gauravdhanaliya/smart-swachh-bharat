import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { MotionGlobalConfig } from "motion";
import { clearConsentCache } from "../services/consentService";
import { agreeOnThisDevice } from "./consent";

// Animations finish instantly in tests (their timing is covered by utils/motion.test.js).
MotionGlobalConfig.skipAnimations = true;

// Every test starts with empty storage, a clean DOM and no remembered consent,
// except that this device has agreed on the start screen's consent step
// (first-visit tests call firstVisit() from ./consent).
beforeEach(() => {
  clearConsentCache();
  localStorage.clear();
  sessionStorage.clear();
  agreeOnThisDevice();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
