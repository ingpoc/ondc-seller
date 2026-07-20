import { useCallback, useState } from 'react';
import { buildCommerceUrl } from '../lib/commerceConfig';
import { getSellerCatalogProduct, listSellerCatalogResponse } from '../lib/commerceClient';

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: () => Promise<void>;
}

export function useApi<T>(url: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Management reads are scoped to the signed-in Seller principal. Buyer
      // marketplace discovery remains on the public search endpoint.
      if (url === '/api/catalog') {
        setData((await listSellerCatalogResponse()) as T);
        return;
      }

      if (url.startsWith('/api/catalog/products/')) {
        const id = url.split('/').pop();
        const item = id ? await getSellerCatalogProduct(id) : null;
        setData(item as T);
        return;
      }

      const response = await fetch(buildCommerceUrl(url), {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [url]);

  return { data, loading, error, execute };
}
