import { test, expect, beforeAll, afterAll } from "bun:test";
import { type Subprocess } from "bun";
import {
    startTestServer,
    runBrowser,
    waitForPwaReady,
    initializeAudio,
    resetBrowserState,
    cleanupProcesses,
    closeBrowser,
} from "../test-helpers";

let serverProcess: Subprocess | null = null;
const PORT: number = 4184;
const APP_URL: string = `http://127.0.0.1:${PORT}/index.html`;

beforeAll(async () => {
    serverProcess = await startTestServer(PORT);
});

afterAll(async () => {
    await closeBrowser();
    cleanupProcesses();
});

test("Preset UI Hierarchy & Visualizer Status Suite", async (): Promise<void> => {
    console.log("Starting Preset UI Hierarchy & Visualizer Status Suite...");

    // 1. Wait for PWA ready
    console.log("Step 1: Waiting for PWA ready...");
    await waitForPwaReady(APP_URL);

    // 1b. Reset browser state
    console.log("Step 1b: Resetting browser state...");
    await resetBrowserState();

    // 2. Initialize AudioContext
    console.log("Step 2: Initializing audio...");
    await initializeAudio();

    // 3. Test Preset UI Sub-panel Hierarchy & Operations
    console.log("Step 3: Testing Preset UI Sub-panels...");
    const presetControlsCheck: string = await runBrowser([
        "eval",
        `(() => {
        const nameInput = document.getElementById("preset-name-input");
        const saveBrowserBtn = document.getElementById("save-preset-to-browser-button");
        const loadStoredBtn = document.getElementById("load-saved-preset-button");
        const deleteBtn = document.getElementById("delete-saved-preset-button");
        const clearBtn = document.getElementById("clear-saved-preset-button");
        const exportJsonBtn = document.getElementById("save-preset-button");
        const loadJsonBtn = document.getElementById("load-preset-button");
        const shareBtn = document.getElementById("share-preset-button");
        const selectEl = document.getElementById("saved-preset-select");

        if (!nameInput || !saveBrowserBtn || !loadStoredBtn || !deleteBtn || !clearBtn || !exportJsonBtn || !loadJsonBtn || !shareBtn || !selectEl) {
            return "preset-controls-missing";
        }

        nameInput.value = "Cyberpunk Test Preset";
        nameInput.dispatchEvent(new Event("input"));
        window.__WEB_ARP_TEST__.lastSaveFinished = false;
        saveBrowserBtn.click();
        return "success";
    })()`,
    ]);
    expect(presetControlsCheck).toBe('"success"');

    // Wait for the async IndexedDB save to finish
    await runBrowser(["wait", "--fn", "window.__WEB_ARP_TEST__.lastSaveFinished === true"]);

    const checkPresetSaved: string = await runBrowser([
        "eval",
        `(async () => {
        const records = await window.__WEB_ARP_TEST__.listPresets();
        if (!records.some((r) => r.name === "Cyberpunk Test Preset")) {
            return "not-saved";
        }
        const selectEl = document.getElementById("saved-preset-select");
        const hasOption = [...selectEl.options].some((opt) => opt.text.includes("Cyberpunk Test Preset"));
        if (!hasOption) {
            return "preset-not-added-to-dropdown";
        }
        return "success";
    })()`,
    ]);
    expect(checkPresetSaved).toBe('"success"');

    // 4. Test Visualizer Toggle & Pause Controls
    console.log("Step 4: Testing Visualizer Toggle and Pause Controls...");
    const visualizerControlsResult: string = await runBrowser([
        "eval",
        `(async () => {
        const toggleBtn = document.getElementById("toggle-visualizer");
        const pauseBtn = document.getElementById("pause-visualizer");
        const clearBtn = document.getElementById("clear-saved-preset-button");

        if (!toggleBtn || !pauseBtn || !clearBtn) return "elements-missing";

        // Verify Clear All button high-contrast red styling
        if (!clearBtn.className.includes("bg-red-600") || !clearBtn.className.includes("text-white")) {
            return "clear-button-contrast-missing: " + clearBtn.className;
        }

        // Enable visualizer
        toggleBtn.click();
        await new Promise((r) => setTimeout(r, 200));
        if (toggleBtn.textContent?.trim() !== "Disable Visualizer") {
            return "toggle-text-not-disable: " + toggleBtn.textContent;
        }

        // Pause visualizer
        pauseBtn.click();
        await new Promise((r) => setTimeout(r, 200));
        if (pauseBtn.textContent?.trim() !== "Resume") {
            return "pause-text-not-resume: " + pauseBtn.textContent;
        }

        // Resume visualizer
        pauseBtn.click();
        await new Promise((r) => setTimeout(r, 200));
        if (pauseBtn.textContent?.trim() !== "Pause") {
            return "pause-text-not-pause: " + pauseBtn.textContent;
        }

        // Disable visualizer
        toggleBtn.click();
        await new Promise((r) => setTimeout(r, 200));
        if (toggleBtn.textContent?.trim() !== "Enable Visualizer") {
            return "toggle-text-not-enable: " + toggleBtn.textContent;
        }

        return "success";
    })()`,
    ]);
    expect(visualizerControlsResult).toBe('"success"');

    // 5. Test Factory Preset Loading
    console.log("Step 5: Testing Factory Preset loading...");
    const factoryPresetResult: string = await runBrowser([
        "eval",
        `(async () => {
        const selectEl = document.getElementById("saved-preset-select");
        const loadStoredBtn = document.getElementById("load-saved-preset-button");
        const bpmSlider = document.getElementById("bpm");
        const synthTypeSelect = document.getElementById("synth-type");

        // Select Classic Synthwave
        selectEl.value = "factory-synthwave";
        selectEl.dispatchEvent(new Event("change"));
        loadStoredBtn.click();

        // Check that BPM was set to 128 and synth to Basic Synth
        if (bpmSlider.value !== "128") {
            return "factory-preset-bpm-failed: " + bpmSlider.value;
        }
        if (synthTypeSelect.value !== "synth") {
            return "factory-preset-synth-failed: " + synthTypeSelect.value;
        }

        return "success";
    })()`,
    ]);
    expect(factoryPresetResult).toBe('"success"');

    console.log("Preset UI Hierarchy & Visualizer Status Suite complete!");
}, 30000);
