import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializePwa } from "@/pwa/pwa.js";

type PwaDependencies = NonNullable<Parameters<typeof initializePwa>[0]>;
type ServiceWorkerApiStub = NonNullable<PwaDependencies["serviceWorker"]>;
type RegistrationStub = Awaited<ReturnType<ServiceWorkerApiStub["register"]>>;
type WorkerStub = NonNullable<RegistrationStub["active"]>;
type ServiceWorkerCommand = Parameters<WorkerStub["postMessage"]>[0] & {
    messageId: string;
    type: string;
    [key: string]: unknown;
};

const readyStateDescriptor = Object.getOwnPropertyDescriptor(document, "readyState");

function restoreProperty(
    target: object,
    property: string,
    descriptor: PropertyDescriptor | undefined,
): void {
    if (descriptor) {
        Object.defineProperty(target, property, descriptor);
        return;
    }

    Reflect.deleteProperty(target, property);
}

function createRegistration(overrides: Partial<RegistrationStub> = {}): RegistrationStub {
    return {
        active: null,
        addEventListener: vi.fn(),
        installing: null,
        update: vi.fn().mockResolvedValue(undefined),
        waiting: null,
        ...overrides,
    } as unknown as RegistrationStub;
}

function createServiceWorkerApi(
    registration: RegistrationStub,
    overrides: Partial<ServiceWorkerApiStub> = {},
): ServiceWorkerApiStub {
    const messageTarget = new EventTarget();
    return {
        addEventListener: (type, listener) => messageTarget.addEventListener(type, listener),
        controller: registration.active,
        dispatchEvent: (event) => messageTarget.dispatchEvent(event),
        getRegistration: vi.fn().mockResolvedValue(registration),
        getRegistrations: vi.fn().mockResolvedValue([]),
        ready: Promise.resolve(registration),
        register: vi.fn().mockResolvedValue(registration),
        removeEventListener: (type, listener) => messageTarget.removeEventListener(type, listener),
        ...overrides,
    } as unknown as ServiceWorkerApiStub;
}

function dispatchWorkerResponse(
    serviceWorker: ServiceWorkerApiStub,
    command: ServiceWorkerCommand,
    data: Record<string, unknown>,
): void {
    serviceWorker.dispatchEvent(
        new MessageEvent("message", {
            data: { ...data, messageId: command.messageId },
        }),
    );
}

describe("PWA controller", () => {
    beforeEach(() => {
        Object.defineProperty(document, "readyState", {
            configurable: true,
            value: "loading",
        });
        window.history.replaceState({}, "", "/?pwa=true");
    });

    afterEach(async () => {
        window.dispatchEvent(new Event("load"));
        await Promise.resolve();
        restoreProperty(document, "readyState", readyStateDescriptor);
        vi.restoreAllMocks();
    });

    it("reports an unsupported browser without attempting registration", async () => {
        const controller = initializePwa({ serviceWorker: null });

        await expect(controller.registerServiceWorker()).resolves.toBeNull();
        expect(controller.getState()).toMatchObject({
            serviceWorkerError: "unsupported",
            serviceWorkerRegistered: false,
        });
        await expect(controller.refreshServiceWorker()).resolves.toBeNull();
    });

    it("registers, refreshes, and reports an installed update", async () => {
        let updateFoundListener: (() => void) | undefined;
        let stateChangeListener: (() => void) | undefined;
        const installing = {
            addEventListener: vi.fn((type: string, listener: () => void) => {
                if (type === "statechange") stateChangeListener = listener;
            }),
            state: "installing",
        };
        const waitingWorker = { postMessage: vi.fn() } as unknown as WorkerStub;
        const registration = createRegistration({
            installing,
            waiting: waitingWorker,
            addEventListener: vi.fn((type: string, listener: () => void) => {
                if (type === "updatefound") updateFoundListener = listener;
            }),
        });
        const serviceWorker = createServiceWorkerApi(registration, {
            controller: { postMessage: vi.fn() },
        });
        const showToast = vi.fn();
        const controller = initializePwa({ serviceWorker, showToast });
        await expect(controller.registerServiceWorker()).resolves.toBe(registration);

        expect(serviceWorker.register).toHaveBeenCalledWith("./sw.js", { scope: "./" });
        expect(registration.update).toHaveBeenCalledTimes(1);
        expect(controller.getState()).toMatchObject({
            hasWaitingWorker: true,
            serviceWorkerRegistered: true,
            serviceWorkerUrl: "./sw.js",
        });

        installing.state = "installed";
        updateFoundListener?.();
        stateChangeListener?.();
        expect(showToast).toHaveBeenCalledWith(
            "App cache updated. Reload to use the latest assets.",
            "info",
        );

        await expect(controller.refreshServiceWorker()).resolves.toBe(registration);
        expect(registration.update).toHaveBeenCalledTimes(2);
    });

    it("exposes filtered cache results and activates the waiting worker", async () => {
        let serviceWorker: ServiceWorkerApiStub;
        const worker = {
            postMessage: vi.fn((command: ServiceWorkerCommand) => {
                if (command.type === "listCaches") {
                    dispatchWorkerResponse(serviceWorker, command, {
                        caches: ["web-arp-v1", 42],
                        ok: true,
                    });
                    return;
                }
                if (command.type === "clearCaches") {
                    dispatchWorkerResponse(serviceWorker, command, {
                        caches: ["web-arp-v1", null],
                        ok: true,
                    });
                    return;
                }
                dispatchWorkerResponse(serviceWorker, command, { ok: true });
            }),
        } as unknown as WorkerStub;
        const registration = createRegistration({ active: worker, waiting: worker });
        serviceWorker = createServiceWorkerApi(registration);
        const controller = initializePwa({ serviceWorker });
        await expect(controller.listCaches()).resolves.toEqual(["web-arp-v1"]);
        await expect(controller.clearCaches()).resolves.toEqual(["web-arp-v1"]);
        await expect(controller.activateWaitingWorker()).resolves.toMatchObject({ ok: true });
        expect(worker.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: "SKIP_WAITING" }),
        );
    });

    it("returns a skipped result when no worker is waiting", async () => {
        const registration = createRegistration();
        const controller = initializePwa({ serviceWorker: createServiceWorkerApi(registration) });

        await expect(controller.activateWaitingWorker()).resolves.toEqual({
            ok: true,
            reason: "no-waiting-worker",
            skipped: true,
        });
        expect(controller.getState().hasWaitingWorker).toBe(false);
    });

    it("rejects service-worker command failures with the worker error", async () => {
        let serviceWorker: ServiceWorkerApiStub;
        const worker = {
            postMessage: vi.fn((command: ServiceWorkerCommand) => {
                dispatchWorkerResponse(serviceWorker, command, {
                    error: "Cache access denied",
                    ok: false,
                });
            }),
        } as unknown as WorkerStub;
        const registration = createRegistration({ active: worker });
        serviceWorker = createServiceWorkerApi(registration);
        const controller = initializePwa({ serviceWorker });

        await expect(controller.listCaches()).rejects.toThrow("Cache access denied");
    });

    it("defers registration until the page load event", async () => {
        const registration = createRegistration();
        const serviceWorker = createServiceWorkerApi(registration);
        initializePwa({ serviceWorker });
        expect(serviceWorker.register).not.toHaveBeenCalled();

        window.dispatchEvent(new Event("load"));
        await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledTimes(1));
    });
});
