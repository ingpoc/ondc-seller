import type { BecknItem } from '../types';

const LOCAL_DEMO_CATALOG_STORAGE_KEY = 'ondc-seller-demo-catalog';

const DEFAULT_ITEMS: BecknItem[] = [
  {
    id: 'demo-basmati-rice',
    name: 'Basmati Rice 5kg',
    description: 'Premium rice listing used for local seller-flow fallback.',
    descriptor: {
      name: 'Basmati Rice 5kg',
      short_desc: 'Premium rice listing used for local seller-flow fallback.',
    },
    price: {
      currency: 'INR',
      value: '640.00',
    },
    images: [
      {
        url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=800&q=80',
      },
    ],
    category: {
      name: 'Staples',
    },
  },
  {
    id: 'demo-cold-pressed-oil',
    name: 'Cold Pressed Mustard Oil 1L',
    description: 'Seller fallback catalog item for local trust validation.',
    descriptor: {
      name: 'Cold Pressed Mustard Oil 1L',
      short_desc: 'Seller fallback catalog item for local trust validation.',
    },
    price: {
      currency: 'INR',
      value: '285.00',
    },
    images: [],
    category: {
      name: 'Pantry',
    },
  },
];

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function cloneDefaultItems(): BecknItem[] {
  return DEFAULT_ITEMS.map((item) => ({
    ...item,
    descriptor: item.descriptor ? { ...item.descriptor } : item.descriptor,
    price: item.price ? { ...item.price } : item.price,
    images: item.images ? item.images.map((image) => ({ ...image })) : item.images,
  }));
}

function sanitizeStoredItems(value: unknown): BecknItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value.filter((item): item is BecknItem => {
    if (!item || typeof item !== 'object') {
      return false;
    }
    const candidate = item as Record<string, unknown>;
    return typeof candidate.id === 'string';
  });

  return items.length > 0 ? items : [];
}

export function getDemoCatalogItems(): BecknItem[] {
  if (!canUseStorage()) {
    return cloneDefaultItems();
  }

  const raw = window.localStorage.getItem(LOCAL_DEMO_CATALOG_STORAGE_KEY);
  if (!raw) {
    return cloneDefaultItems();
  }

  try {
    const parsed = JSON.parse(raw);
    const items = sanitizeStoredItems(parsed);
    return items ?? cloneDefaultItems();
  } catch {
    return cloneDefaultItems();
  }
}

export function saveDemoCatalogItems(items: BecknItem[]): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(LOCAL_DEMO_CATALOG_STORAGE_KEY, JSON.stringify(items));
}

export function upsertDemoCatalogItem(item: BecknItem): void {
  const items = getDemoCatalogItems();
  const index = items.findIndex((entry) => entry.id === item.id);

  if (index >= 0) {
    items[index] = item;
  } else {
    items.unshift(item);
  }

  saveDemoCatalogItems(items);
}

export function deleteDemoCatalogItem(id: string): void {
  const items = getDemoCatalogItems().filter((item) => item.id !== id);
  saveDemoCatalogItems(items);
}

export function findDemoCatalogItem(id: string): BecknItem | null {
  return getDemoCatalogItems().find((item) => item.id === id) ?? null;
}

export function getDemoCatalogResponse() {
  return {
    'bpp/providers': [
      {
        items: getDemoCatalogItems(),
      },
    ],
  } as const;
}

export const MOCK_CATALOG_RESPONSE = {
  'bpp/providers': [
    {
      items: DEFAULT_ITEMS,
    },
  ],
} as const;
