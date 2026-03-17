export const MOCK_CATALOG_RESPONSE = {
  'bpp/providers': [
    {
      items: [
        {
          id: 'demo-basmati-rice',
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
        },
        {
          id: 'demo-cold-pressed-oil',
          descriptor: {
            name: 'Cold Pressed Mustard Oil 1L',
            short_desc: 'Seller fallback catalog item for local trust validation.',
          },
          price: {
            currency: 'INR',
            value: '285.00',
          },
          images: [],
        },
      ],
    },
  ],
} as const;
