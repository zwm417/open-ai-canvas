export type AsyncQueueOperation = () => Promise<void> | void;

export function createKeyedAsyncQueue() {
    const pending = new Map<string, Promise<void>>();

    return (key: string, operation: AsyncQueueOperation) => {
        const previous = pending.get(key) || Promise.resolve();
        const current = previous.catch(() => undefined).then(operation);
        const settled = current.finally(() => {
            if (pending.get(key) === settled) pending.delete(key);
        });
        pending.set(key, settled);
        return settled;
    };
}
