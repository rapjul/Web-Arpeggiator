import { afterAll, beforeAll, expect, test } from "bun:test";
import {
    cleanupProcesses,
    closeBrowser,
    resetBrowserState,
    runBrowser,
    startTestServer,
    waitForPwaReady,
} from "../test-helpers";

const PORT: number = 4186;
const APP_URL: string = `http://127.0.0.1:${PORT}/index.html`;

beforeAll(async (): Promise<void> => {
    await startTestServer(PORT);
});

afterAll(async (): Promise<void> => {
    await closeBrowser();
    cleanupProcesses();
});

test("History controls restore settings, defaults, and persisted state", async (): Promise<void> => {
    await waitForPwaReady(APP_URL);
    await resetBrowserState();

    const interactionResult: string = await runBrowser([
        "eval",
        `(() => {
            const bpm = document.getElementById('bpm');
            const bpmValue = document.getElementById('bpm-value');
            const undo = document.getElementById('undo-button');
            const redo = document.getElementById('redo-button');
            const historyButton = document.getElementById('history-menu-button');
            const historyMenu = document.getElementById('history-menu');
            const reset = document.getElementById('reset-defaults-button');
            const desktopReset = document.getElementById('reset-defaults-desktop-button');
            const confirm = document.getElementById('reset-defaults-confirm');
            const cancel = document.getElementById('reset-defaults-cancel');
            const resetOverlay = document.getElementById('reset-defaults-overlay');
            const presetName = document.getElementById('preset-name-input');

            if (!bpm || !bpmValue || !undo || !redo || !historyButton || !historyMenu || !reset || !desktopReset || !confirm || !cancel || !resetOverlay || !presetName) {
                return 'missing-history-controls';
            }

            const nativeUndo = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
            presetName.dispatchEvent(nativeUndo);
            if (nativeUndo.defaultPrevented) return 'blocked-preset-name-native-undo';

            bpm.value = '150';
            bpm.dispatchEvent(new Event('input', { bubbles: true }));
            bpm.dispatchEvent(new Event('change', { bubbles: true }));
            if (undo.disabled || Number(bpm.value) !== 150) return 'failed-to-record-change';

            undo.click();
            if (Number(bpm.value) !== 120 || redo.disabled) return 'failed-button-undo';

            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
            if (Number(bpm.value) !== 150) return 'failed-control-y-redo';

            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
            if (Number(bpm.value) !== 120) return 'failed-control-z-undo';

            bpm.value = '160';
            bpm.dispatchEvent(new Event('input', { bubbles: true }));
            bpm.dispatchEvent(new Event('change', { bubbles: true }));
            bpmValue.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            if (Number(bpm.value) !== 120) return 'failed-individual-reset';

            bpm.value = '165';
            bpm.dispatchEvent(new Event('input', { bubbles: true }));
            bpm.dispatchEvent(new Event('change', { bubbles: true }));
            desktopReset.click();
            if (resetOverlay.getAttribute('aria-hidden') !== 'false') return 'failed-open-desktop-reset-dialog';
            cancel.click();

            bpm.value = '170';
            bpm.dispatchEvent(new Event('input', { bubbles: true }));
            bpm.dispatchEvent(new Event('change', { bubbles: true }));
            historyButton.click();
            const menuActions = [...historyMenu.querySelectorAll('button')];
            if (menuActions.map((action) => action.textContent.trim()).join('|') !== 'Undo|Redo|Reset All Settings') {
                return 'failed-menu-order';
            }
            reset.click();
            if (resetOverlay.getAttribute('aria-hidden') !== 'false') return 'failed-open-reset-dialog';
            confirm.click();
            if (Number(bpm.value) !== 120) return 'failed-reset-defaults';

            return 'success';
        })()`,
    ]);
    expect(interactionResult).toBe('"success"');

    await runBrowser(["set", "viewport", "1024", "768"]);
    const presentationResult: string = await runBrowser([
        "eval",
        `(async () => {
            const undo = document.getElementById('undo-button');
            const redo = document.getElementById('redo-button');
            const historyButton = document.getElementById('history-menu-button');
            const description = document.getElementById('reset-defaults-description');
            const transportBar = document.querySelector('.sticky-transport-bar');
            const historyMenu = document.getElementById('history-menu');
            const desktopReset = document.getElementById('reset-defaults-desktop-button');

            if (!undo || !redo || !historyButton || !description || !transportBar || !historyMenu || !desktopReset) {
                return 'missing-history-presentation';
            }

            const undoStyle = getComputedStyle(undo);
            const redoStyle = getComputedStyle(redo);
            const desktopResetStyle = getComputedStyle(desktopReset);
            const descriptionLines = [...description.children].map((element) => getComputedStyle(element).display);
            const hasMatchingControlHeights = undoStyle.height === redoStyle.height && redoStyle.height === desktopResetStyle.height;
            const hasDesktopReset = desktopResetStyle.display !== 'none';
            const hidesDesktopHistoryMenu = historyButton.getClientRects().length === 0;
            if (!hasMatchingControlHeights || !hasDesktopReset || !hidesDesktopHistoryMenu || descriptionLines.some((display) => display !== 'block')) {
                return 'failed-control-presentation';
            }

            window.scrollTo(0, transportBar.getBoundingClientRect().top + 24);
            window.dispatchEvent(new Event('scroll'));
            await new Promise((resolve) => setTimeout(resolve, 350));
            return transportBar.classList.contains('is-stuck') && getComputedStyle(transportBar).borderRadius === '0px'
                ? 'success'
                : 'failed-sticky-presentation';
        })()`,
    ]);
    expect(presentationResult).toBe('"success"');

    await runBrowser(["set", "viewport", "375", "667"]);
    const mobileMenuPresentationResult: string = await runBrowser([
        "eval",
        `(() => {
            const historyButton = document.getElementById('history-menu-button');
            const historyMenu = document.getElementById('history-menu');
            const desktopReset = document.getElementById('reset-defaults-desktop-button');
            const undoButton = document.getElementById('history-menu-undo');
            const redoButton = document.getElementById('history-menu-redo');
            if (!historyButton || !historyMenu || !desktopReset || !undoButton || !redoButton) return 'missing-mobile-history-menu';

            historyButton.click();
            const menuPosition = historyMenu.getBoundingClientRect();
            const buttonPosition = historyButton.getBoundingClientRect();
            const visualMenuActions = [...historyMenu.querySelectorAll('button')]
                .toSorted((first, second) => first.getBoundingClientRect().top - second.getBoundingClientRect().top)
                .map((action) => action.textContent.trim());

            undoButton.click();
            const undoFocusRestored = document.activeElement === historyButton && historyMenu.classList.contains('hidden');

            historyButton.click();
            redoButton.click();
            const redoFocusRestored = document.activeElement === historyButton && historyMenu.classList.contains('hidden');

            const showsMobileHistoryMenu = historyButton.getClientRects().length > 0;
            const hidesMobileResetButton = getComputedStyle(desktopReset).display === 'none';
            return menuPosition.bottom <= buttonPosition.top &&
                showsMobileHistoryMenu &&
                hidesMobileResetButton &&
                visualMenuActions.join('|') === 'Reset All Settings|Redo|Undo' &&
                undoFocusRestored &&
                redoFocusRestored
                ? 'success'
                : 'failed-mobile-menu-presentation';
        })()`,
    ]);
    expect(mobileMenuPresentationResult).toBe('"success"');

    const persistenceResult: string = await runBrowser([
        "eval",
        `(async () => {
            const bpm = document.getElementById('bpm');
            bpm.value = '155';
            bpm.dispatchEvent(new Event('input', { bubbles: true }));
            bpm.dispatchEvent(new Event('change', { bubbles: true }));
            await window.__WEB_ARP_TEST__.saveLastSession();
            return 'saved';
        })()`,
    ]);
    expect(persistenceResult).toBe('"saved"');

    await runBrowser(["reload"]);
    await runBrowser([
        "wait",
        "--fn",
        "window.__WEB_ARP_TEST__?.lastSessionRestoreFinished === true",
    ]);
    const restoredResult: string = await runBrowser([
        "eval",
        `(() => {
            const bpm = document.getElementById('bpm');
            const history = window.__WEB_ARP_TEST__.getHistoryState();
            return Number(bpm.value) === 155 && history.past.length > 0 ? 'success' : 'failed';
        })()`,
    ]);
    expect(restoredResult).toBe('"success"');
});
