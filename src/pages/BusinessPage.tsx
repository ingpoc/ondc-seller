import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, PageLayout } from '@/components/seller-ui';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  getSellerStore,
  isSellerStoreMissing,
  isSellerStoreMissingMessage,
  isSellerStoreReady,
  saveSellerStore,
  sellerStoreSaveErrorMessage,
  type SellerStore,
  type SellerStoreWrite,
} from '../lib/commerceClient';

const EMPTY_STORE: SellerStoreWrite = {
  store_name: '',
  city: '',
  state: '',
  pin: '',
  serviceability: '',
  fulfilment_sla_hours: 24,
  return_window_days: 7,
  support_hours: '',
};

function formFromStore(store: SellerStore | null): SellerStoreWrite {
  if (!store) return { ...EMPTY_STORE };
  return {
    store_name: store.store_name || '',
    city: store.city || '',
    state: store.state || '',
    pin: store.pin || '',
    serviceability: (store.serviceability_tokens || []).join(', ') || store.serviceability || '',
    fulfilment_sla_hours: store.fulfilment_sla_hours ?? 24,
    return_window_days: store.return_window_days ?? 7,
    support_hours: store.support_hours || '',
  };
}

export function BusinessPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<SellerStoreWrite>(EMPTY_STORE);
  const [storeReady, setStoreReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'draft' | 'complete' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadStore = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const snapshot = await getSellerStore();
      setForm(formFromStore(snapshot.store));
      setStoreReady(isSellerStoreReady(snapshot.store));
    } catch (error) {
      setForm(formFromStore(null));
      setStoreReady(false);
      if (isSellerStoreMissing(error)) {
        setLoadError(null);
      } else {
        setLoadError(error instanceof Error ? error.message : 'Could not load store.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

  async function persist(complete: boolean) {
    setSaving(complete ? 'complete' : 'draft');
    setSaveError(null);
    setNotice(null);
    try {
      const snapshot = await saveSellerStore({ ...form, complete });
      setForm(formFromStore(snapshot.store));
      const ready = isSellerStoreReady(snapshot.store);
      setStoreReady(ready);
      setNotice(
        ready
          ? 'Store is ready. You can publish catalog next.'
          : 'Draft saved. Complete the remaining fields to open the store.',
      );
    } catch (error) {
      setSaveError(sellerStoreSaveErrorMessage(error));
    } finally {
      setSaving(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persist(true);
  }

  function update<K extends keyof SellerStoreWrite>(key: K, value: SellerStoreWrite[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <PageLayout
      title="Set up your store"
      subtitle="Tell buyers where you serve and how quickly you fulfil. Do not upload identity documents here."
    >
      {loading ? (
        <Alert
          tone="info"
          title="Loading store"
          description="Checking whether this seller already has a store record."
        />
      ) : null}
      {loadError && !isSellerStoreMissingMessage(loadError) ? (
        <Alert
          tone="warning"
          title="Store record not on file yet"
          description={`${loadError} You can still fill in store details and save.`}
        />
      ) : null}
      {saveError ? (
        <Alert tone="error" title="Could not complete setup" description={saveError} />
      ) : null}
      {notice ? <Alert tone="success" title="Store updated" description={notice} /> : null}

      <Card className="mt-6 space-y-6 border-border/60 shadow-none" data-testid="seller-store-setup">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="store_name">Store name</FieldLabel>
              <FieldContent>
                <Input
                  id="store_name"
                  name="store_name"
                  value={form.store_name}
                  onChange={(event) => update('store_name', event.target.value)}
                  autoComplete="organization"
                  required
                />
                <FieldDescription>Shown to buyers on comparison and order screens.</FieldDescription>
              </FieldContent>
            </Field>

            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="city">City</FieldLabel>
                <FieldContent>
                  <Input
                    id="city"
                    name="city"
                    value={form.city}
                    onChange={(event) => update('city', event.target.value)}
                    required
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="state">State</FieldLabel>
                <FieldContent>
                  <Input
                    id="state"
                    name="state"
                    value={form.state}
                    onChange={(event) => update('state', event.target.value)}
                    required
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="pin">PIN code</FieldLabel>
                <FieldContent>
                  <Input
                    id="pin"
                    name="pin"
                    inputMode="numeric"
                    pattern="\d{6}"
                    value={form.pin}
                    onChange={(event) => update('pin', event.target.value)}
                    required
                  />
                </FieldContent>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="serviceability">Serviceability</FieldLabel>
              <FieldContent>
                <Input
                  id="serviceability"
                  name="serviceability"
                  value={form.serviceability}
                  onChange={(event) => update('serviceability', event.target.value)}
                  placeholder="Pune, 411001"
                />
                <FieldDescription>
                  Extra city or PIN tokens, comma separated. City, state, and PIN are included
                  automatically.
                </FieldDescription>
              </FieldContent>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="fulfilment_sla_hours">Fulfilment SLA (hours)</FieldLabel>
                <FieldContent>
                  <Input
                    id="fulfilment_sla_hours"
                    name="fulfilment_sla_hours"
                    type="number"
                    min={1}
                    max={72}
                    value={form.fulfilment_sla_hours ?? ''}
                    onChange={(event) =>
                      update(
                        'fulfilment_sla_hours',
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                    required
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="return_window_days">Return window (days)</FieldLabel>
                <FieldContent>
                  <Input
                    id="return_window_days"
                    name="return_window_days"
                    type="number"
                    min={0}
                    max={15}
                    value={form.return_window_days ?? ''}
                    onChange={(event) =>
                      update(
                        'return_window_days',
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                    required
                  />
                </FieldContent>
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="support_hours">Support hours</FieldLabel>
              <FieldContent>
                <Input
                  id="support_hours"
                  name="support_hours"
                  value={form.support_hours}
                  onChange={(event) => update('support_hours', event.target.value)}
                  placeholder="Mon–Sat 10:00–19:00"
                />
              </FieldContent>
            </Field>
          </FieldGroup>

          <p className="text-sm text-muted-foreground">
            Identity documents, Aadhaar, PAN images, and GST certificates stay out of this form.
            An empty store is allowed — save a draft or complete setup when you are ready.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving !== null || loading}>
              {saving === 'complete' ? 'Opening store…' : 'Complete store setup'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving !== null || loading}
              onClick={() => void persist(false)}
            >
              {saving === 'draft' ? 'Saving draft…' : 'Save draft'}
            </Button>
            {storeReady ? (
              <Button type="button" variant="secondary" onClick={() => navigate('/catalog')}>
                Open catalog
              </Button>
            ) : null}
          </div>
        </form>
      </Card>
    </PageLayout>
  );
}
