import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { useAppStore } from "@/app/store";

import { SettingsPage } from "../SettingsPage";

const originalSettings = useAppStore.getState().settings;

describe("SettingsPage", () => {
  afterEach(() => {
    useAppStore.setState({ settings: originalSettings });
  });

  it("exposes and updates the state of visual accessibility toggles", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    const colorBlindToggle = screen.getByRole("button", { name: /Modo daltônico/i });

    expect(colorBlindToggle).toHaveAttribute("aria-pressed", "false");
    await user.click(colorBlindToggle);

    expect(colorBlindToggle).toHaveAttribute("aria-pressed", "true");
    expect(useAppStore.getState().settings.colorBlind).toBe(true);
  });

  it("explains device-local preferences and restores the visual defaults", async () => {
    useAppStore.setState({
      settings: {
        ...originalSettings,
        interfaceScale: "large",
        colorBlind: true,
        highContrast: true,
      },
    });
    const user = userEvent.setup();

    render(<MemoryRouter><SettingsPage /></MemoryRouter>);

    expect(screen.getByText(/preferências ficam somente neste dispositivo/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Restaurar visual padrão/i }));
    expect(useAppStore.getState().settings).toMatchObject({
      interfaceScale: "comfortable",
      colorBlind: false,
      highContrast: false,
      lowPerformance: false,
    });
  });
});
