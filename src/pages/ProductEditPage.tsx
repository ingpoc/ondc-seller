import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ProductForm } from '../components';
import type { BecknItem } from '../types';
import type { ProductFormData } from '../components/ProductForm';
import { COMMERCE_DEMO_MODE, buildCommerceUrl } from '../lib/commerceConfig';
import { upsertDemoCatalogItem } from '../lib/mockCatalog';
import { clearConsumedSellerDraft, getDraftFormDataForRoute } from '../lib/agentSellerState';
import {
  Alert,
  Card,
  PageLayout,
  PageHeader,
} from '@/components/seller-ui';

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  const shouldUseAgentDraft = searchParams.get('draft') === 'agent';

  const { data: existingProduct, execute } = useApi<BecknItem>(
    isNew ? '/api/catalog' : `/api/catalog/products/${id}`
  );
  const draftData = shouldUseAgentDraft
    ? getDraftFormDataForRoute({ isNew, itemId: id ?? null })
    : null;

  useEffect(() => {
    if (!isNew) {
      execute();
    }
  }, [execute, isNew]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(
    async (data: ProductFormData) => {
      setLoading(true);
      setError('');

      try {
        const payload = {
          id: data.id,
          name: data.name,
          description: data.description,
          descriptor: {
            name: data.name,
            short_desc: data.description,
          },
          price: {
            currency: data.currency,
            value: data.price,
          },
          images: [],
          category: {
            name: data.categoryId || 'General',
          },
          category_id: data.categoryId,
          fulfillment_id: 'ful-1',
        };

        if (COMMERCE_DEMO_MODE) {
          upsertDemoCatalogItem(payload as BecknItem);
          clearConsumedSellerDraft(isNew ? null : id ?? null);
          navigate('/catalog');
          return;
        }

        const url = isNew ? buildCommerceUrl('/api/catalog/products') : buildCommerceUrl(`/api/catalog/products/${id}`);
        const method = isNew ? 'POST' : 'PUT';

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error('Failed to save product');
        }

        clearConsumedSellerDraft(isNew ? null : id ?? null);
        navigate('/catalog');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [isNew, id, navigate]
  );

  const handleCancel = useCallback(() => {
    navigate('/catalog');
  }, [navigate]);

  return (
    <PageLayout>
      <PageHeader
        title={isNew ? 'Add New Product' : 'Edit Product'}
        subtitle={
          isNew
            ? 'Fill in the details to add a new product to your catalog'
            : 'Update the product information below'
        }
      />

      {error && (
        <Alert tone="error" title="Unable to save product" description={error} className="mb-6" />
      )}

      <Card className="px-8">
        <ProductForm
          product={existingProduct ?? undefined}
          initialData={draftData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={loading}
        />
      </Card>
    </PageLayout>
  );
}
