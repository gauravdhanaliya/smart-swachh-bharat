import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { MotionGlobalConfig } from "motion";
import { clearConsentCache } from "../services/consentService";

// Animations finish instantly in tests (their timing is covered by utils/motion.test.js).
MotionGlobalConfig.skipAnimations = true;

// Every test starts with empty storage, a clean DOM and no remembered consent.
beforeEach(() => {
  clearConsentCache();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
