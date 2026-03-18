import { useCallback, useState } from 'react';
import { COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';
import { getDemoCatalogResponse, findDemoCatalogItem, MOCK_CATALOG_RESPONSE } from '../lib/mockCatalog';

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
      if (COMMERCE_DEMO_MODE) {
        if (url === '/api/catalog') {
          setData(getDemoCatalogResponse() as T);
          return;
        }

        if (url.startsWith('/api/catalog/products/')) {
          const id = url.split('/').pop();
          const item = id ? findDemoCatalogItem(id) : null;
          setData(item as T);
          return;
        }
      }

      const response = await fetch(buildCommerceUrl(url));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      if (url === '/api/catalog') {
        setData(MOCK_CATALOG_RESPONSE as T);
        setError(null);
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    } finally {
      setLoading(false);
    }
  }, [url]);

  return { data, loading, error, execute };
}
