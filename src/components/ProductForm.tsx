import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import type { BecknItem } from '@ondc-sdk/shared';
import {
  Badge,
  Button,
  Card,
  FormLayout,
  Input,
  Textarea,
  DramsDropdown,
} from '@/components/seller-ui';

export interface ProductFormData {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  categoryId: string;
}

export interface ProductFormProps {
  product?: BecknItem;
  initialData?: ProductFormData | null;
  onSubmit: (data: ProductFormData) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

const CATEGORY_OPTIONS = [
  { value: 'cat-1', label: 'Grocery' },
  { value: 'cat-2', label: 'Restaurant' },
  { value: 'cat-3', label: 'Fashion' },
  { value: 'cat-4', label: 'Electronics' },
] as const;

const CURRENCY_OPTIONS = [
  { value: 'INR', label: 'INR' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
] as const;

function buildFormData(product?: BecknItem, initialData?: ProductFormData | null): ProductFormData {
  if (initialData) {
    return initialData;
  }

  return {
    id: product?.id || `item-${Date.now()}`,
    name: product?.descriptor?.name || '',
    description: product?.descriptor?.short_desc || '',
    price: product?.price?.value || '',
    currency: product?.price?.currency || 'INR',
    categoryId: product?.category_id || 'cat-1',
  };
}

function Field({
  label,
  htmlFor,
  helper,
  required,
  children,
  fullWidth = false,
}: {
  label: string;
  htmlFor: string;
  helper?: string;
  required?: boolean;
  children: ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'space-y-2 md:col-span-2' : 'space-y-2'}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-semibold tracking-[-0.01em] text-[var(--ui-text)]"
      >
        {label}
        {required ? <span className="ml-1 text-[var(--ui-error)]">*</span> : null}
      </label>
      {children}
      {helper ? <p className="text-sm text-[var(--ui-text-secondary)]">{helper}</p> : null}
    </div>
  );
}

export function ProductForm({ product, initialData, onSubmit, onCancel, loading }: ProductFormProps) {
  const [formData, setFormData] = useState<ProductFormData>(() => buildFormData(product, initialData));

  useEffect(() => {
    setFormData(buildFormData(product, initialData));
  }, [product, initialData]);

  const handleInputChange =
    (field: keyof ProductFormData) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData((current) => ({ ...current, [field]: event.target.value }));
    };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={product ? 'info' : 'success'}>
          {product ? 'Editing existing SKU' : 'Creating new SKU'}
        </Badge>
        <Badge tone="neutral">{formData.currency} pricing</Badge>
      </div>

      <FormLayout className="gap-6">
        <Field
          label="Product ID"
          htmlFor="product-id"
          helper={product ? 'Product IDs stay locked after creation.' : 'Use a stable SKU-style identifier.'}
        >
          <Input
            id="product-id"
            type="text"
            value={formData.id}
            onChange={handleInputChange('id')}
            disabled={Boolean(product)}
            required
          />
        </Field>

        <Field label="Product name" htmlFor="product-name" required>
          <Input
            id="product-name"
            type="text"
            value={formData.name}
            onChange={handleInputChange('name')}
            required
            placeholder="Organic mangoes"
          />
        </Field>

        <Field label="Category" htmlFor="product-category">
          <DramsDropdown
            id="product-category"
            options={CATEGORY_OPTIONS}
            value={formData.categoryId}
            onChange={(value) => setFormData((current) => ({ ...current, categoryId: value }))}
          />
        </Field>

        <Field label="Currency" htmlFor="product-currency">
          <DramsDropdown
            id="product-currency"
            options={CURRENCY_OPTIONS}
            value={formData.currency}
            onChange={(value) => setFormData((current) => ({ ...current, currency: value }))}
          />
        </Field>

        <Field label="Description" htmlFor="product-description" helper="A short description improves buyer confidence." fullWidth>
          <Textarea
            id="product-description"
            value={formData.description}
            onChange={handleInputChange('description')}
            placeholder="Describe provenance, quality, and key purchase cues."
          />
        </Field>

        <Field label="Price" htmlFor="product-price" required fullWidth>
          <Input
            id="product-price"
            type="number"
            value={formData.price}
            onChange={handleInputChange('price')}
            required
            min="0"
            step="0.01"
            placeholder="100"
          />
        </Field>
      </FormLayout>

      <Card className="space-y-3 bg-secondary/60">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ui-text-muted)]">
          Listing preview
        </div>
        <div className="text-xl font-bold tracking-[-0.03em] text-[var(--ui-text)]">
          {formData.name || 'Untitled product'}
        </div>
        <div className="text-sm text-[var(--ui-text-secondary)]">
          {formData.description || 'Buyer-facing description will appear here once entered.'}
        </div>
        <div className="flex flex-wrap gap-3 text-sm font-medium text-[var(--ui-text)]">
          <span>{formData.currency} {formData.price || '0'}</span>
          <span>{CATEGORY_OPTIONS.find((option) => option.value === formData.categoryId)?.label ?? 'General'}</span>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? 'Saving product...' : product ? 'Update product' : 'Add product'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
