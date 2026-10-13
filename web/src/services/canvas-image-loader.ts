// @opc-feature: canvas-image-loader-optimization [start]
const MAX_ACTIVE_IMAGE_PREPARATIONS = 16;
const IMAGE_PREPARATION_TIMEOUT_MS = 60_000;
const MAX_PREPARED_CACHE_ENTRIES = 160;

const preparedCache = new Map<string, HTMLImageElement>();
const inFlightRequests = new Map<string, Promise<HTMLImageElement>>();
// @opc-feature: canvas-image-loader-optimization [end]

type ImagePreparationJob = {
    src: string;
    signal: AbortSignal;
    resolve: (image: HTMLImageElement) => void;
    reject: (error: unknown) => void;
    started: boolean;
    settled: boolean;
    image?: HTMLImageElement;
    timeout?: ReturnType<typeof setTimeout>;
    onAbort: () => void;
};

const queue: ImagePreparationJob[] = [];
let activePreparations = 0;

/** Load and decode one image under a shared concurrency budget. Queued work is cancellable. */
export function prepareCanvasImage(src: string, signal: AbortSignal, timeoutMs = IMAGE_PREPARATION_TIMEOUT_MS): Promise<HTMLImageElement> {
    if (signal.aborted) return Promise.reject(abortError());

    // @opc-feature: canvas-image-loader-optimization [start]
    const cached = preparedCache.get(src);
    if (cached && cached.naturalWidth > 0) {
        return Promise.resolve(cached);
    }

    const inFlight = inFlightRequests.get(src);
    if (inFlight) {
        return new Promise<HTMLImageElement>((resolve, reject) => {
            if (signal.aborted) return reject(abortError());
            const onAbort = () => reject(abortError());
            signal.addEventListener("abort", onAbort, { once: true });
            inFlight.then(
                (img) => {
                    signal.removeEventListener("abort", onAbort);
                    resolve(img);
                },
                (err) => {
                    signal.removeEventListener("abort", onAbort);
                    reject(err);
                },
            );
        });
    }
    // @opc-feature: canvas-image-loader-optimization [end]

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
        const job: ImagePreparationJob = { src, signal, resolve, reject, started: false, settled: false, onAbort: () => {} };
        job.onAbort = () => {
            if (job.settled) return;
            if (!job.started) {
                const index = queue.indexOf(job);
                if (index >= 0) queue.splice(index, 1);
                settle(job, undefined, abortError());
                return;
            }
            job.image?.removeAttribute("src");
            settle(job, undefined, abortError());
        };
        signal.addEventListener("abort", job.onAbort, { once: true });
        queue.push(job);
        pump(timeoutMs);
    });

    // @opc-feature: canvas-image-loader-optimization [start]
    inFlightRequests.set(src, promise);
    promise.then(
        (img) => {
            inFlightRequests.delete(src);
            if (preparedCache.size >= MAX_PREPARED_CACHE_ENTRIES) {
                const oldestKey = preparedCache.keys().next().value;
                if (oldestKey) preparedCache.delete(oldestKey);
            }
            preparedCache.set(src, img);
        },
        () => {
            inFlightRequests.delete(src);
        },
    );
    // @opc-feature: canvas-image-loader-optimization [end]

    return promise;
}

export function canvasImagePreparationStats() {
    return { active: activePreparations, queued: queue.length, limit: MAX_ACTIVE_IMAGE_PREPARATIONS };
}

function pump(timeoutMs: number) {
    while (activePreparations < MAX_ACTIVE_IMAGE_PREPARATIONS && queue.length) {
        const job = queue.shift()!;
        if (job.settled || job.signal.aborted) {
            settle(job, undefined, abortError());
            continue;
        }
        job.started = true;
        activePreparations += 1;
        job.timeout = setTimeout(() => {
            job.image?.removeAttribute("src");
            settle(job, undefined, new Error("图片加载或解码超时"));
        }, timeoutMs);

        const image = new Image();
        job.image = image;
        image.decoding = "async";
        image.onload = () => {
            if (job.settled || job.signal.aborted) return;
            void image.decode().then(
                () => settle(job, image),
                (error) => settle(job, undefined, error),
            );
        };
        image.onerror = () => settle(job, undefined, new Error("图片加载失败"));
        image.src = job.src;
        if (image.complete && image.naturalWidth > 0) image.onload?.call(image, new Event("load"));
    }
}

function settle(job: ImagePreparationJob, image?: HTMLImageElement, error?: unknown) {
    if (job.settled) return;
    job.settled = true;
    job.signal.removeEventListener("abort", job.onAbort);
    if (job.timeout) clearTimeout(job.timeout);
    if (job.started) {
        activePreparations = Math.max(0, activePreparations - 1);
        pump(IMAGE_PREPARATION_TIMEOUT_MS);
    }
    if (error !== undefined) job.reject(error);
    else if (image) job.resolve(image);
    else job.reject(new Error("图片准备未完成"));
}

function abortError() {
    return new DOMException("图片准备已取消", "AbortError");
}
