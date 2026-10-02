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
        expect(onModeApplied).not.toHaveBeenCalled();
        controller.setMode("full");
        expect(onModeApplied).not.toHaveBeenCalled();

        modeSelect.value = "simple";
        modeSelect.dispatchEvent(new Event("change"));
        expect(onModeApplied).toHaveBeenLastCalledWith(INTERFACE_MODE_SIMPLE);
        expect(onModeApplied).toHaveBeenCalledTimes(1);

        controller.setMode(INTERFACE_MODE_SIMPLE);
        expect(onModeApplied).toHaveBeenCalledTimes(1);

        controller.destroy();
        modeSelect.value = "full";
        modeSelect.dispatchEvent(new Event("change"));
        expect(controller.getMode()).toBe(INTERFACE_MODE_SIMPLE);
    });

    test("supports suppressing transition notification via notify option", () => {
        const appMain = document.createElement("main");
        const onModeApplied = vi.fn();
        const controller = createInterfaceModeController({
            dom: { appMain },
            storage: localStorage,
            onModeApplied,
        });

        controller.initialize();
        expect(onModeApplied).not.toHaveBeenCalled();

        controller.setMode("simple", { notify: false });
        expect(controller.getMode()).toBe("simple");
        expect(onModeApplied).not.toHaveBeenCalled();

        controller.setMode("full");
        expect(controller.getMode()).toBe("full");
        expect(onModeApplied).toHaveBeenCalledWith("full");
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

    test("synchronizes segmented buttons and responds to button clicks", () => {
        const appMain = document.createElement("main");
        const controls = document.createElement("div");
        controls.setAttribute("role", "radiogroup");

        const simpleBtn = document.createElement("button");
        simpleBtn.setAttribute("data-interface-mode", "simple");
        simpleBtn.setAttribute("role", "radio");

        const fullBtn = document.createElement("button");
        fullBtn.setAttribute("data-interface-mode", "full");
        fullBtn.setAttribute("role", "radio");

        controls.append(simpleBtn, fullBtn);
        appMain.append(controls);
        document.body.append(appMain);

        const controller = createInterfaceModeController({
            dom: {
                appMain,
                interfaceModeControls: controls,
                interfaceModeButtons: [simpleBtn, fullBtn],
            },
            storage: localStorage,
        });

        controller.initialize();
        expect(fullBtn.getAttribute("aria-checked")).toBe("true");
        expect(fullBtn.tabIndex).toBe(0);
        expect(fullBtn.classList.contains("active")).toBe(true);
        expect(simpleBtn.getAttribute("aria-checked")).toBe("false");
        expect(simpleBtn.tabIndex).toBe(-1);
        expect(simpleBtn.classList.contains("active")).toBe(false);

        simpleBtn.click();
        expect(controller.getMode()).toBe("simple");
        expect(simpleBtn.getAttribute("aria-checked")).toBe("true");
        expect(simpleBtn.tabIndex).toBe(0);
        expect(simpleBtn.classList.contains("active")).toBe(true);
        expect(fullBtn.getAttribute("aria-checked")).toBe("false");
        expect(fullBtn.tabIndex).toBe(-1);

        controller.destroy();
        fullBtn.click();
        expect(controller.getMode()).toBe("simple");
    });

    test("supports circular arrow-key navigation on segmented buttons", () => {
        const appMain = document.createElement("main");
        const controls = document.createElement("div");
        controls.setAttribute("role", "radiogroup");

        const simpleBtn = document.createElement("button");
        simpleBtn.setAttribute("data-interface-mode", "simple");

        const fullBtn = document.createElement("button");
        fullBtn.setAttribute("data-interface-mode", "full");

        controls.append(simpleBtn, fullBtn);
        appMain.append(controls);
        document.body.append(appMain);

        const controller = createInterfaceModeController({
            dom: {
                appMain,
                interfaceModeControls: controls,
                interfaceModeButtons: [simpleBtn, fullBtn],
            },
            storage: localStorage,
        });

        controller.initialize();
        fullBtn.focus();

        controls.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        expect(controller.getMode()).toBe("simple");
        expect(document.activeElement).toBe(simpleBtn);

        controls.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
        expect(controller.getMode()).toBe("full");
        expect(document.activeElement).toBe(fullBtn);

        controller.destroy();
    });

    test("supports arrow-key navigation in an isolated document", () => {
        const isolatedDoc = document.implementation.createHTMLDocument("isolated");
        const appMain = isolatedDoc.createElement("main");
        const controls = isolatedDoc.createElement("div");
        const simpleBtn = isolatedDoc.createElement("button");
        simpleBtn.setAttribute("data-interface-mode", "simple");
        const fullBtn = isolatedDoc.createElement("button");
        fullBtn.setAttribute("data-interface-mode", "full");

        controls.append(simpleBtn, fullBtn);
        appMain.append(controls);
        isolatedDoc.body.append(appMain);

        const controller = createInterfaceModeController({
            dom: {
                appMain,
                interfaceModeControls: controls,
                interfaceModeButtons: [simpleBtn, fullBtn],
            },
            storage: localStorage,
        });

        controller.initialize();
        fullBtn.focus();

        controls.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
        expect(controller.getMode()).toBe("simple");
        expect(isolatedDoc.activeElement).toBe(simpleBtn);

        controller.destroy();
    });

    test("persists mode before applyMode so nested setMode calls determine the final stored value", () => {
        const appMain = document.createElement("main");
        let controller: ReturnType<typeof createInterfaceModeController>;
        const onModeApplied = vi.fn((mode) => {
            if (mode === "simple") {
                controller.setMode("full");
            }
        });

        controller = createInterfaceModeController({
            dom: { appMain },
            storage: localStorage,
            onModeApplied,
        });

        controller.initialize();
        controller.setMode("simple");

        expect(controller.getMode()).toBe("full");
        expect(localStorage.getItem("webArpInterfaceMode")).toBe("full");
        controller.destroy();
    });
});
