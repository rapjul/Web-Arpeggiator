import {
    DEFAULT_INTERFACE_MODE,
    INTERFACE_MODE_SIMPLE,
    normalizeInterfaceMode,
} from "@core/interface-mode.js";
import { createInterfaceModeController } from "@ui/interface-mode-controller.js";
import { afterEach, describe, expect, test, vi } from "vitest";

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
        appMain.hidden = true;
        const advancedSection = document.createElement("section");
        advancedSection.dataset.interfaceAdvanced = "true";
        const modeSelect = document.createElement("select");
        modeSelect.innerHTML =
            '<option value="simple">Simple controls</option><option value="full">Full controls</option>';
        appMain.append(advancedSection, modeSelect);
        document.body.append(appMain);

        const controller = createInterfaceModeController({
            dom: { appMain, interfaceModeSelect: modeSelect },
            storage: localStorage,
        });

        controller.initialize();
        expect(controller.getMode()).toBe(DEFAULT_INTERFACE_MODE);
        expect(appMain.dataset.interfaceMode).toBe("full");
        expect(appMain.hidden).toBe(false);
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
            storage: localStorage,
        });

        controller.initialize();
        expect(controller.getMode()).toBe(INTERFACE_MODE_SIMPLE);
        expect(advancedSection.hidden).toBe(true);
    });

    test("reports real mode transitions and removes its select listener on teardown", () => {
        const appMain = document.createElement("main");
        const modeSelect = document.createElement("select");
        modeSelect.innerHTML =
            '<option value="simple">Simple controls</option><option value="full">Full controls</option>';
        appMain.append(modeSelect);
        const onModeApplied = vi.fn();
        const controller = createInterfaceModeController({
            dom: { appMain, interfaceModeSelect: modeSelect },
            storage: localStorage,
            onModeApplied,
        });

        controller.initialize();
        expect(onModeApplied).toHaveBeenCalledTimes(1);
        controller.setMode("full");
        expect(onModeApplied).toHaveBeenCalledTimes(1);

        modeSelect.value = "simple";
        modeSelect.dispatchEvent(new Event("change"));
        expect(onModeApplied).toHaveBeenLastCalledWith(INTERFACE_MODE_SIMPLE);
        expect(onModeApplied).toHaveBeenCalledTimes(2);

        controller.setMode(INTERFACE_MODE_SIMPLE);
        expect(onModeApplied).toHaveBeenCalledTimes(2);

        controller.destroy();
        modeSelect.value = "full";
        modeSelect.dispatchEvent(new Event("change"));
        expect(controller.getMode()).toBe(INTERFACE_MODE_SIMPLE);
    });

    test("falls back safely and warns when browser storage is unavailable", () => {
        const appMain = document.createElement("main");
        const logger = { warn: vi.fn() };
        const controller = createInterfaceModeController({
            dom: { appMain, interfaceModeSelect: null },
            storage: {
                getItem: vi.fn(() => {
                    throw new Error("read denied");
                }),
                setItem: vi.fn(() => {
                    throw new Error("write denied");
                }),
            },
            logger,
        });

        controller.initialize();
        expect(controller.getMode()).toBe(DEFAULT_INTERFACE_MODE);
        controller.setMode(INTERFACE_MODE_SIMPLE);
        expect(controller.getMode()).toBe(INTERFACE_MODE_SIMPLE);
        expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    test("keeps beginner pattern directions visible and groups the rest", () => {
        const appMain = document.createElement("main");
        const patternButtons = document.createElement("fieldset");
        patternButtons.id = "pattern-buttons";
        patternButtons.innerHTML = ["up", "down", "upDown", "random", "octaveCycle"]
            .map(
                (direction, index) =>
                    `<label><input type="radio" name="pattern-direction" value="${direction}"${index === 0 ? " checked" : ""}></label>`,
            )
            .join("");
        appMain.append(patternButtons);
        document.body.append(appMain);

        const controller = createInterfaceModeController({
            dom: { appMain, interfaceModeSelect: null },
            documentRef: document,
            storage: localStorage,
        });

        controller.initialize();
        expect(patternButtons.querySelectorAll(":scope > label")).toHaveLength(4);
        expect(patternButtons.querySelectorAll("#pattern-more-buttons > label")).toHaveLength(1);
        expect(patternButtons.querySelector("#pattern-more-details")?.open).toBe(true);

        controller.setMode(INTERFACE_MODE_SIMPLE);
        expect(patternButtons.querySelector("#pattern-more-details")?.open).toBe(false);

        controller.setMode(DEFAULT_INTERFACE_MODE);
        expect(patternButtons.querySelector("#pattern-more-details")?.open).toBe(true);
    });
});
