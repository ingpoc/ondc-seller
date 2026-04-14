import type { BecknItem } from '@ondc-sdk/shared';
import {
  AsyncState,
  Badge,
  Button,
  DataTableLayout,
} from '@/components/seller-ui';

export interface InventoryTableProps {
  items: BecknItem[];
  onEdit: (item: BecknItem) => void;
  onDelete: (itemId: string) => void;
  actionsDisabled?: boolean;
}

function formatCategory(categoryId?: string | null) {
  if (!categoryId) {
    return 'General';
  }

  return categoryId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function InventoryTable({
  items,
  onEdit,
  onDelete,
  actionsDisabled = false,
}: InventoryTableProps): JSX.Element {
  if (items.length === 0) {
    return (
      <AsyncState
        kind="empty"
        title="No inventory in this view"
        description="Adjust the search or add a product to populate the inventory ledger."
      />
    );
  }

  return (
    <DataTableLayout>
      <table className="min-w-[760px] w-full border-collapse bg-white">
        <thead>
          <tr className="border-b border-[var(--ui-border)] bg-[var(--ui-bg-subtle)]">
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] text-[var(--ui-text-muted)]">
              Product
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] text-[var(--ui-text-muted)]">
              Price
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] text-[var(--ui-text-muted)]">
              Category
            </th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.12em] text-[var(--ui-text-muted)]">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const imageUrl = item.images?.[0]?.url;
            const shortDescription = item.descriptor?.short_desc;

            return (
              <tr
                key={item.id}
                className="border-b border-[var(--ui-border)] transition-colors duration-150 hover:bg-muted/40"
              >
                <td className="px-4 py-4 align-top">
                  <div className="flex items-start gap-3">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={item.descriptor?.name ?? item.id}
                        className="h-14 w-14 rounded-[var(--ui-radius-md)] object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-[var(--ui-radius-md)] bg-[var(--ui-bg-subtle)] text-xl">
                        📦
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-[var(--ui-text)]">
                        {item.descriptor?.name || 'Unknown product'}
                      </div>
                      <div className="text-sm text-[var(--ui-text-secondary)]">
                        {shortDescription || `SKU ${item.id}`}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 align-top text-sm font-semibold text-[var(--ui-text)]">
                  {item.price?.currency || 'INR'} {item.price?.value || '0'}
                </td>
                <td className="px-4 py-4 align-top">
                  <Badge tone="info">{formatCategory(item.category_id)}</Badge>
                </td>
                <td className="px-4 py-4 align-top">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onEdit(item)}
                      disabled={actionsDisabled}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => onDelete(item.id)}
                      disabled={actionsDisabled}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </DataTableLayout>
  );
}
