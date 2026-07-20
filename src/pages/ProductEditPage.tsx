import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { useTrustState } from '../hooks/useTrustState';
import { useSubject } from '../hooks/useSubject';
import { ProductForm } from '../components';
import type { BecknItem } from '../types';
import type { ProductFormData } from '../components/ProductForm';
import { clearConsumedSellerDraft, getDraftFormDataForRoute } from '../lib/agentSellerState';
import { recordSellerActionAuditEvent } from '../lib/localSellerAudit';
import { executeProtectedAction } from '../lib/agentGuardClient';
import { Alert, Button, Card, PageLayout, PageHeader } from '@/components/seller-ui';

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const { subjectId, walletAddress, displayName } = useSubject();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;
  const shouldUseAgentDraft = searchParams.get('draft') === 'agent';
  const trust = useTrustState(walletAddress);

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
        const executed = await executeProtectedAction({
          walletAddress,
          action: 'seller.catalog.publish',
          amountInr: 0,
          resourceId: id ?? data.id,
          idempotencyKey: `seller-catalog:${id ?? data.id}:${data.name}:${data.price}:${data.inventory}:${data.categoryId}:${data.imageUrl ?? ''}:${data.imageCaption ?? ''}:${data.deliveryAreas ?? ''}`,
          payload: {
            ...(isNew ? {} : { item_id: id }),
            title: data.name,
            description: data.description,
            price_inr: Math.round(Number(data.price) || 0),
            inventory: Math.max(0, Math.round(Number(data.inventory) || 0)),
            seller_id: subjectId || walletAddress,
            seller_name: displayName,
            category_id: data.categoryId,
            image_url: data.imageUrl?.trim() || null,
            image_caption: data.imageCaption?.trim() || null,
            delivery_areas: String(data.deliveryAreas || '')
              .split(',')
              .map((area) => area.trim())
              .filter(Boolean),
          },
        });
        if (!executed.execution) {
          throw new Error(
            executed.decision === 'need_approval'
              ? 'Catalog save requires exact approval.'
              : 'Catalog save was denied by AgentGuard.',
          );
        }
        recordSellerActionAuditEvent({
          action: 'catalog_save',
          targetId: data.id,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'applied',
          reason: isNew
            ? 'Created seller catalog item through AgentGuard.'
            : 'Updated seller catalog item through AgentGuard.',
        });

        clearConsumedSellerDraft(isNew ? null : (id ?? null));
        navigate('/catalog', {
          state: {
            catalogNotice: isNew
              ? `${data.name} was published.`
              : `${data.name} was updated.`,
          },
        });
      } catch (err) {
        recordSellerActionAuditEvent({
          action: 'catalog_save',
          targetId: data.id,
          walletAddress,
          subjectId,
          trustState: trust.state,
          outcome: 'blocked',
          reason: err instanceof Error ? err.message : 'Catalog save blocked.',
        });
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [displayName, isNew, id, navigate, subjectId, trust.state, walletAddress]
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
