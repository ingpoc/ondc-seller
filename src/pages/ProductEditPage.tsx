import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { ProductForm } from '../components';
import type { BecknItem } from '@ondc-sdk/shared';
import type { ProductFormData } from '../components/ProductForm';
import {
  PageLayout,
  PageHeader,
  CARD,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
} from '@portfolio-ui';

const CARD_STYLE = {
  ...CARD.base,
  padding: SPACING['3xl'],
};

const ERROR_STYLE = {
  padding: `${SPACING.md} ${SPACING.lg}`,
  borderRadius: RADIUS.lg,
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#dc2626',
  ...TYPOGRAPHY.bodySmall,
  marginBottom: SPACING.xl,
};

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const { data: existingProduct, execute } = useApi<BecknItem>(
    isNew ? '/api/catalog' : `/api/catalog/products/${id}`
  );

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
          descriptor: {
            name: data.name,
            short_desc: data.description,
          },
          price: {
            currency: data.currency,
            value: data.price,
          },
          category_id: data.categoryId,
          fulfillment_id: 'ful-1',
        };

        const url = isNew ? '/api/catalog/products' : `/api/catalog/products/${id}`;
        const method = isNew ? 'POST' : 'PUT';

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error('Failed to save product');
        }

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
        <div style={ERROR_STYLE}>
          <p style={{ margin: 0, fontWeight: TYPOGRAPHY.label.fontWeight }}>Error</p>
          <p style={{ margin: '4px 0 0 0' }}>{error}</p>
        </div>
      )}

      <div style={CARD_STYLE}>
        <ProductForm
          product={existingProduct ?? undefined}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          loading={loading}
        />
      </div>
    </PageLayout>
  );
}
