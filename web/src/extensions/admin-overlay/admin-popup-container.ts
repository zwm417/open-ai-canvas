/**
 * Keep Ant Design admin popups inside the admin theme boundary.
 *
 * The upstream shell uses the same fallback order. Keeping this in the local
 * extension namespace means upstream page files do not need to own the popup
 * policy and the sync script will preserve the implementation.
 */
export function getAdminPopupContainer(node?: HTMLElement): HTMLElement {
    if (typeof document === "undefined") return node?.ownerDocument?.body ?? ({} as HTMLElement);
    return document.querySelector<HTMLElement>("[data-admin-overlay-host]") || document.getElementById("admin-root") || node?.closest<HTMLElement>("[data-admin-root]") || document.body;
}
