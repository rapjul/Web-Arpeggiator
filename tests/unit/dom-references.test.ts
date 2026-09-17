import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createDomReferences } from "@ui/dom-references.js";

function loadProductionBody(documentRef: Document) {
    const htmlPath = resolve(__dirname, "../../index.html");
    const htmlContent = readFileSync(htmlPath, "utf-8");
    const bodyStart = htmlContent.indexOf("<body");
    const bodyEnd = htmlContent.indexOf("</body>");
    const bodyHtml =
        bodyStart !== -1 && bodyEnd !== -1
            ? htmlContent.slice(bodyStart, bodyEnd + 7)
            : htmlContent;
    const parsedDocument = new DOMParser().parseFromString(bodyHtml, "text/html");

    parsedDocument.querySelectorAll("script").forEach((element) => {
        element.remove();
    });
    documentRef.body.innerHTML = parsedDocument.body.innerHTML;
}

describe("createDomReferences", () => {
    it("matches the production DOM contract used by the composition root", () => {
        loadProductionBody(document);

        const dom = createDomReferences(document);

        expect(dom.documentRef).toBe(document);
        expect(dom.appMain).toBe(document.getElementById("app-main"));
        expect(dom.playStopButton).toBe(document.getElementById("play-stop"));
        expect(dom.bpmSlider).toBe(document.getElementById("bpm"));
        expect(dom.notesInput).toBe(document.getElementById("notes"));
        expect(dom.synthTypeSelect).toBe(document.getElementById("synth-type"));
        expect(dom.keyboardToggle).toBe(document.getElementById("keyboard-toggle"));
        expect(dom.scaleRootSelect).toBe(document.getElementById("scale-root"));
        expect(dom.filterCutoffSlider).toBe(document.getElementById("filter-cutoff"));
        expect(dom.visualizerPlotCanvas).toBe(document.getElementById("visualizer-plot"));
        expect(dom.presetNameInput).toBe(document.getElementById("preset-name-input"));
        expect(dom.liveRegion).toBe(document.getElementById("sr-announcements"));
        expect(dom.quickStartModal).toBe(document.getElementById("quick-start-modal"));
    });

    it("preserves fallback elements and selector collections", () => {
        const isolatedDocument = document.implementation.createHTMLDocument("isolated");
        isolatedDocument.body.innerHTML = `
            <div id="realtime-record-status"></div>
            <div id="realtime-export-controls"></div>
            <button class="chord-btn" data-chord="major"></button>
            <input name="offline-export-mode" value="seamless">
            <label for="bpm">BPM</label>
            <span id="bpm-value"></span>
        `;

        const dom = createDomReferences(isolatedDocument);

        expect(dom.recordStatus).toBe(isolatedDocument.getElementById("realtime-record-status"));
        expect(dom.exportControls).toBe(
            isolatedDocument.getElementById("realtime-export-controls"),
        );
        expect(dom.chordButtons).toHaveLength(1);
        expect(dom.offlineExportModeInputs).toHaveLength(1);
        expect(dom.resolveResetTargets(["label[for='bpm']", "#bpm-value", "#missing"])).toEqual([
            isolatedDocument.querySelector("label[for='bpm']"),
            isolatedDocument.getElementById("bpm-value"),
        ]);
    });

    it("queries only the supplied document", () => {
        document.body.innerHTML = '<div id="app-main"></div>';
        const isolatedDocument = document.implementation.createHTMLDocument("isolated");
        isolatedDocument.body.innerHTML = '<main id="app-main"></main>';

        const dom = createDomReferences(isolatedDocument);

        expect(dom.appMain).toBe(isolatedDocument.getElementById("app-main"));
        expect(dom.appMain).not.toBe(document.getElementById("app-main"));
    });
});
