import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { buildFormData, normalizeCategoryId } from './ProductForm';
import { ProductForm } from './ProductForm';

describe('ProductForm catalog values', () => {
  it('normalizes persisted category aliases to a selectable option', () => {
    expect(normalizeCategoryId('Grocery')).toBe('Grocery');
    expect(normalizeCategoryId('cat-1')).toBe('Grocery');
  });

  it('preserves category and inventory when editing a published product', () => {
    const form = buildFormData({
      id: 'atta-1',
      name: 'Whole Wheat Atta',
      descriptor: { name: 'Whole Wheat Atta', short_desc: 'Stone-ground flour' },
      description: 'Stone-ground flour',
      price: { currency: 'INR', value: '89.00' },
      images: [{ url: '/products/atta.jpg' }],
      category: { name: 'Grocery' },
      category_id: 'Grocery',
      quantity: 25,
      imageCaption: 'Ingredient photo; packaging may vary',
      deliveryAreas: ['Pune', '411001'],
    });

    expect(form.categoryId).toBe('Grocery');
    expect(form.inventory).toBe('25');
    expect(form.imageUrl).toBe('/products/atta.jpg');
    expect(form.imageCaption).toBe('Ingredient photo; packaging may vary');
    expect(form.deliveryAreas).toBe('Pune, 411001');
  });

  it('makes the whole-rupee pricing constraint visible and browser-enforced', () => {
    render(createElement(ProductForm, { onSubmit: vi.fn(), onCancel: vi.fn() }));

    const price = screen.getByLabelText(/Price/);
    expect(price).toHaveAttribute('min', '1');
    expect(price).toHaveAttribute('step', '1');
    expect(screen.getByText('Enter a whole-rupee amount. Decimal prices are not supported.')).toBeInTheDocument();
  });
});
