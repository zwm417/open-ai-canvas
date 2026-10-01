const ACTIVE_USER_SCOPE_KEY = "infinite-canvas:active-user-scope";
const GUEST_SCOPE = "guest";
let userScopedPersistenceSuppressionDepth = 0;

export function withUserScopedPersistenceSuppressed<T>(operation: () => T) {
    userScopedPersistenceSuppressionDepth += 1;
    try {
        return operation();
    } finally {
        userScopedPersistenceSuppressionDepth -= 1;
    }
}

export function isUserScopedPersistenceSuppressed() {
    return userScopedPersistenceSuppressionDepth > 0;
}

// @opc-feature: multi-user-scope [start]
export const USER_SCOPE_CHANGED_EVENT = "infinite-canvas:user-scope-changed";
// @opc-feature: multi-user-scope [end]

export function getActiveUserScope() {
    if (typeof window === "undefined") return GUEST_SCOPE;
    return window.localStorage.getItem(ACTIVE_USER_SCOPE_KEY) || GUEST_SCOPE;
}

export function setActiveUserScope(userId?: string | null) {
    if (typeof window === "undefined") return;
    // @opc-feature: multi-user-scope [start]
    const prev = window.localStorage.getItem(ACTIVE_USER_SCOPE_KEY) || GUEST_SCOPE;
    const next = userId || GUEST_SCOPE;
    window.localStorage.setItem(ACTIVE_USER_SCOPE_KEY, next);
    if (prev !== next && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent(USER_SCOPE_CHANGED_EVENT, { detail: { scope: next } }));
    }
    // @opc-feature: multi-user-scope [end]
}

export function scopedStorageKey(name: string, scope = getActiveUserScope()) {
    return `${name}:user:${scope}`;
}

export const scopedLocalStorage = {
    getItem: (name: string) => {
        if (typeof window === "undefined") return null;
        return window.localStorage.getItem(scopedStorageKey(name));
    },
    setItem: (name: string, value: string) => {
        if (typeof window === "undefined") return;
        if (isUserScopedPersistenceSuppressed()) return;
        window.localStorage.setItem(scopedStorageKey(name), value);
    },
    removeItem: (name: string) => {
        if (typeof window === "undefined") return;
        if (isUserScopedPersistenceSuppressed()) return;
        window.localStorage.removeItem(scopedStorageKey(name));
    },
};
