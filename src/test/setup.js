import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// Every test starts signed out with the seed data: services re-seed from
// empty storage on first read.
beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});
