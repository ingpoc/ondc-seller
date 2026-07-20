/** CatalogPage listens for this after AgentGuard publish/update/archive. */
export const SELLER_CATALOG_CHANGED_EVENT = 'seller-catalog-changed';

export function notifySellerCatalogChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SELLER_CATALOG_CHANGED_EVENT));
}
