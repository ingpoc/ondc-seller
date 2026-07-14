import { useCallback, useState } from 'react';
import { COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';
import { getDemoCatalogResponse, findDemoCatalogItem, MOCK_CATALOG_RESPONSE } from '../lib/mockCatalog';
import { getPublishedCatalogProduct, listPublishedCatalogResponse } from '../lib/commerceClient';

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
      // Prefer published demo-commerce (BPP source of truth) over local mockCatalog.
      if (url === '/api/catalog') {
        try {
          setData((await listPublishedCatalogResponse()) as T);
          return;
        } catch {
          if (COMMERCE_DEMO_MODE) {
            setData({ ...getDemoCatalogResponse(), __source: 'local' } as T);
            return;
          }
          throw new Error('Published catalog unavailable');
        }
      }

      if (url.startsWith('/api/catalog/products/')) {
        const id = url.split('/').pop();
        try {
          const item = id ? await getPublishedCatalogProduct(id) : null;
          setData(item as T);
          return;
        } catch {
          if (COMMERCE_DEMO_MODE) {
            setData((id ? findDemoCatalogItem(id) : null) as T);
            return;
          }
          throw new Error('Catalog product unavailable');
        }
      }

      if (COMMERCE_DEMO_MODE) {
        // Remaining demo endpoints may still use mock fixtures.
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
      if (url === '/api/catalog' && COMMERCE_DEMO_MODE) {
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
