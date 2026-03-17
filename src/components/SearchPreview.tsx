import { useState, useCallback } from 'react';
import { DramsProductCard } from '@portfolio-ui';
import { DRAMS, SPACING, TYPOGRAPHY, RADIUS, BUTTON } from '@portfolio-ui';

export interface SearchPreviewProps {
  query: string;
  category: string;
}

const CONTAINER_STYLE = {
  marginTop: SPACING.xl,
  padding: SPACING.xl,
  backgroundColor: DRAMS.grayTrack,
  borderRadius: RADIUS.lg,
  border: `1px solid ${DRAMS.grayHover}`,
};

const HEADER_STYLE = {
  ...TYPOGRAPHY.h4,
  color: DRAMS.textDark,
  margin: `0 0 ${SPACING.sm} 0`,
};

const DESCRIPTION_STYLE = {
  ...TYPOGRAPHY.body,
  color: DRAMS.textLight,
  margin: `0 0 ${SPACING.lg} 0`,
};

const BUTTON_ACTIVE_STYLE = {
  ...BUTTON.primary,
  cursor: 'pointer',
};

const BUTTON_DISABLED_STYLE = {
  ...BUTTON.secondary,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const RESULTS_CONTAINER_STYLE = {
  marginTop: SPACING.xl,
};

const RESULTS_HEADER_STYLE = {
  ...TYPOGRAPHY.label,
  color: DRAMS.textLight,
  margin: `0 0 ${SPACING.md} 0`,
};

const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: SPACING.lg,
};

const LOADING_CONTAINER_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACING.md,
  padding: `${SPACING.xl} 0`,
};

const SPINNER_STYLE = {
  width: '20px',
  height: '20px',
  border: `3px solid ${DRAMS.grayTrack}`,
  borderTopColor: DRAMS.orange,
  borderRadius: '50%',
  animation: 'spin 1s linear infinite',
};

const LOADING_TEXT_STYLE = {
  ...TYPOGRAPHY.body,
  color: DRAMS.textLight,
};

const EMPTY_STATE_STYLE = {
  padding: `${SPACING['3xl']} ${SPACING.xl}`,
  textAlign: 'center' as const,
};

const EMPTY_STATE_ICON_STYLE = {
  ...TYPOGRAPHY.h1,
  marginBottom: SPACING.md,
};

const EMPTY_STATE_TEXT_STYLE = {
  ...TYPOGRAPHY.body,
  color: DRAMS.textLight,
  margin: '0',
};

export function SearchPreview({ query, category }: SearchPreviewProps) {
  const [previewResults, setPreviewResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const handlePreviewSearch = useCallback(async () => {
    if (!query) return;

    setLoading(true);
    setShowPreview(true);

    try {
      const params = new URLSearchParams({ category, query });
      const response = await fetch(`/api/search?${params}`);
      const data = await response.json();
      setPreviewResults(data.items || []);
    } catch (error) {
      console.error('Preview search failed:', error);
    } finally {
      setLoading(false);
    }
  }, [category, query]);

  const canSearch = query.trim().length > 0 && !loading;

  return (
    <div style={CONTAINER_STYLE}>
      <h3 style={HEADER_STYLE}>Search Preview</h3>
      <p style={DESCRIPTION_STYLE}>See how your products appear in buyer search results</p>

      <button
        onClick={handlePreviewSearch}
        disabled={!canSearch}
        style={{
          ...(canSearch ? BUTTON_ACTIVE_STYLE : BUTTON_DISABLED_STYLE),
          ...(loading ? { opacity: 0.7 } : {}),
        }}
      >
        {loading ? 'Loading...' : 'Preview Search Results'}
      </button>

      {showPreview && (
        <div style={RESULTS_CONTAINER_STYLE}>
          {loading ? (
            <div style={LOADING_CONTAINER_STYLE}>
              <div style={SPINNER_STYLE} />
              <span style={LOADING_TEXT_STYLE}>Searching...</span>
              <style>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : (
            <>
              <h4 style={RESULTS_HEADER_STYLE}>
                Results for "{query}" ({previewResults.length}{' '}
                {previewResults.length === 1 ? 'item' : 'items'})
              </h4>
              {previewResults.length === 0 ? (
                <div style={EMPTY_STATE_STYLE}>
                  <div style={EMPTY_STATE_ICON_STYLE}>🔍</div>
                  <p style={EMPTY_STATE_TEXT_STYLE}>No results found</p>
                </div>
              ) : (
                <div style={GRID_STYLE}>
                  {previewResults.slice(0, 3).map((item) => (
                    <DramsProductCard
                      key={item.id}
                      name={item.name || item.descriptor?.name || 'Product'}
                      category={item.category_id || item.category?.descriptor?.name}
                      price={
                        item.price?.value
                          ? `${item.price.value} ${item.price.currency || 'INR'}`
                          : 'Price on request'
                      }
                      image={item.images?.[0]?.url || item.descriptor?.images?.[0]?.url}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
