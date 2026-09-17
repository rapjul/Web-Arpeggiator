import {
    DEFAULT_INTERFACE_MODE,
    INTERFACE_MODE_SIMPLE,
    normalizeInterfaceMode,
} from "@core/interface-mode.js";
import { createInterfaceModeController } from "@ui/interface-mode-controller.js";
import { afterEach, describe, expect, test } from "vitest";

describe("interface mode", () => {
    afterEach(() => {
        localStorage.clear();
        document.body.replaceChildren();
    });

    test("normalizes unsupported values to full controls", () => {
        expect(normalizeInterfaceMode("unknown")).toBe(DEFAULT_INTERFACE_MODE);
        expect(normalizeInterfaceMode(undefined, INTERFACE_MODE_SIMPLE)).toBe(
            INTERFACE_MODE_SIMPLE,
        );
    });

    test("applies and persists the selected presentation mode", () => {
        const appMain = document.createElement("main");
        const advancedSection = document.createElement("section");
        advancedSection.dataset.interfaceAdvanced = "true";
        const modeSelect = document.createElement("select");
        modeSelect.innerHTML =
            '<option value="simple">Simple controls</option><option value="full">Full controls</option>';
        appMain.append(advancedSection, modeSelect);
        document.body.append(appMain);

        const controller = createInterfaceModeController({
            dom: { appMain, interfaceModeSelect: modeSelect },
            documentRef: document,
            storage: localStorage,
        });

        controller.initialize();
        expect(controller.getMode()).toBe(DEFAULT_INTERFACE_MODE);
        expect(appMain.dataset.interfaceMode).toBe("full");
        expect(advancedSection.hidden).toBe(false);

        controller.setMode(INTERFACE_MODE_SIMPLE);
        expect(controller.getMode()).toBe(INTERFACE_MODE_SIMPLE);
        expect(advancedSection.hidden).toBe(true);
        expect(advancedSection.getAttribute("aria-hidden")).toBe("true");
        expect(localStorage.getItem("webArpInterfaceMode")).toBe(INTERFACE_MODE_SIMPLE);

        modeSelect.value = "full";
        modeSelect.dispatchEvent(new Event("change"));
        expect(controller.getMode()).toBe("full");
        expect(advancedSection.hidden).toBe(false);
    });

    test("restores a persisted simple mode before the UI is displayed", () => {
        localStorage.setItem("webArpInterfaceMode", "simple");
        const appMain = document.createElement("main");
        const advancedSection = document.createElement("section");
        advancedSection.dataset.interfaceAdvanced = "true";
        appMain.append(advancedSection);

        const controller = createInterfaceModeController({
            dom: { appMain, interfaceModeSelect: null },
            documentRef: document,
            storage: localStorage,
        });

        controller.initialize();
        expect(controller.getMode()).toBe(INTERFACE_MODE_SIMPLE);
        expect(advancedSection.hidden).toBe(true);
    });
});
