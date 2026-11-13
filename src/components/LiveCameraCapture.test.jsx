// Ported from main's 7cef7da liveCamera.test (capture goes through compressImage now).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LiveCameraCapture from "./LiveCameraCapture";

// Capture now scales/encodes through utils/imageCompression (tested on its own).
vi.mock("../utils/imageCompression", () => ({ compressImage: vi.fn(async () => ({ dataUrl: "data:image/jpeg;base64,AAAA" })) }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LiveCameraCapture", () => {
  it("keeps Capture disabled until the camera has a frame, then captures", async () => {
    const stream = { getTracks: () => [{ stop: vi.fn() }] };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn(async () => stream) } });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();

    const onCapture = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<LiveCameraCapture photo={null} onCapture={onCapture} onRetake={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Take a photo" }));

    const capture = await screen.findByRole("button", { name: /Starting camera|Capture/ });
    expect(capture).toBeDisabled();

    const video = container.querySelector("video");
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 640 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 480 });
    act(() => {
      fireEvent(video, new Event("loadedmetadata"));
    });

    const ready = screen.getByRole("button", { name: "Capture" });
    expect(ready).toBeEnabled();
    await user.click(ready);
    expect(onCapture).toHaveBeenCalledWith("data:image/jpeg;base64,AAAA");
  });
});
