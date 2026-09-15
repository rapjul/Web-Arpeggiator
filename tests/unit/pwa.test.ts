import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initializePwa } from "@/pwa/pwa.js";

type ServiceWorkerCommand = {
    messageId: string;
    type: string;
    [key: string]: unknown;
};

type WorkerStub = {
    postMessage: (command: ServiceWorkerCommand) => void;
};

type RegistrationStub = {
    active: WorkerStub | null;
    addEventListener: (type: string, listener: () => void) => void;
    installing: {
        addEventListener: (type: string, listener: () => void) => void;
        state: string;
    } | null;
    unregister?: () => Promise<boolean>;
    update: () => Promise<RegistrationStub>;
    waiting: WorkerStub | null;
};

type ServiceWorkerApiStub = {
    addEventListener: (type: string, listener: (event: MessageEvent) => void) => void;
    controller: WorkerStub | null;
    dispatchEvent: (event: Event) => boolean;
    getRegistration: (scope: string) => Promise<RegistrationStub | undefined>;
    getRegistrations: () => Promise<RegistrationStub[]>;
    ready: Promise<RegistrationStub>;
    register: (url: string, options: { scope: string }) => Promise<RegistrationStub>;
    removeEventListener: (type: string, listener: (event: MessageEvent) => void) => void;
};

const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
const readyStateDescriptor = Object.getOwnPropertyDescriptor(document, "readyState");

function setServiceWorker(serviceWorker: ServiceWorkerApiStub | undefined): void {
    if (serviceWorker) {
        Object.defineProperty(navigator, "serviceWorker", {
            configurable: true,
            value: serviceWorker,
        });
        return;
    }

    Reflect.deleteProperty(navigator, "serviceWorker");
}

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
    const registration: RegistrationStub = {
        active: null,
        addEventListener: vi.fn(),
        installing: null,
        update: vi.fn(),
        waiting: null,
        ...overrides,
    };
    registration.update = overrides.update ?? vi.fn().mockResolvedValue(registration);
    return registration;
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
    };
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
        setServiceWorker(undefined);
        window.history.replaceState({}, "", "/?pwa=true");
    });

    afterEach(async () => {
        window.dispatchEvent(new Event("load"));
        await Promise.resolve();
        restoreProperty(navigator, "serviceWorker", serviceWorkerDescriptor);
        restoreProperty(document, "readyState", readyStateDescriptor);
        vi.restoreAllMocks();
    });

    it("reports an unsupported browser without attempting registration", async () => {
        const controller = initializePwa();

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
        const waitingWorker: WorkerStub = { postMessage: vi.fn() };
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
        setServiceWorker(serviceWorker);

        const controller = initializePwa({ showToast });
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
        const worker: WorkerStub = {
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
        };
        const registration = createRegistration({ active: worker, waiting: worker });
        serviceWorker = createServiceWorkerApi(registration);
        setServiceWorker(serviceWorker);

        const controller = initializePwa();
        await expect(controller.listCaches()).resolves.toEqual(["web-arp-v1"]);
        await expect(controller.clearCaches()).resolves.toEqual(["web-arp-v1"]);
        await expect(controller.activateWaitingWorker()).resolves.toMatchObject({ ok: true });
        expect(worker.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: "SKIP_WAITING" }),
        );
    });

    it("returns a skipped result when no worker is waiting", async () => {
        const registration = createRegistration();
        setServiceWorker(createServiceWorkerApi(registration));

        const controller = initializePwa();

        await expect(controller.activateWaitingWorker()).resolves.toEqual({
            ok: true,
            reason: "no-waiting-worker",
            skipped: true,
        });
        expect(controller.getState().hasWaitingWorker).toBe(false);
    });

    it("rejects service-worker command failures with the worker error", async () => {
        let serviceWorker: ServiceWorkerApiStub;
        const worker: WorkerStub = {
            postMessage: vi.fn((command: ServiceWorkerCommand) => {
                dispatchWorkerResponse(serviceWorker, command, {
                    error: "Cache access denied",
                    ok: false,
                });
            }),
        };
        const registration = createRegistration({ active: worker });
        serviceWorker = createServiceWorkerApi(registration);
        setServiceWorker(serviceWorker);

        const controller = initializePwa();

        await expect(controller.listCaches()).rejects.toThrow("Cache access denied");
    });

    it("defers registration until the page load event", async () => {
        const registration = createRegistration();
        const serviceWorker = createServiceWorkerApi(registration);
        setServiceWorker(serviceWorker);

        initializePwa();
        expect(serviceWorker.register).not.toHaveBeenCalled();

        window.dispatchEvent(new Event("load"));
        await vi.waitFor(() => expect(serviceWorker.register).toHaveBeenCalledTimes(1));
    });
});
