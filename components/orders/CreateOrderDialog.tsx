"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, format } from 'date-fns';
import { CalendarIcon, Loader2, PlusCircle, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

type ClientOption = { id: string; name: string };
type DriverOption = { id: string; full_name: string | null };
type CategoryOption = { id: string; name: string };
type ParLevelRow = { category_id: string; par_quantity: number; linen_categories: { name: string } | null };

export function CreateOrderDialog() {
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [loadingData, setLoadingData] = useState(false);

  const [orgId, setOrgId] = useState('');
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [parLevels, setParLevels] = useState<ParLevelRow[]>([]);
  const [availableCleanByCategory, setAvailableCleanByCategory] = useState<Record<string, number>>({});

  const [clientId, setClientId] = useState('');
  const [scheduledDate, setScheduledDate] = useState<Date>(addDays(new Date(), 1));
  const [driverId, setDriverId] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');
  const [qtyByCategory, setQtyByCategory] = useState<Record<string, number>>({});

  const suggestionText = useMemo(() => {
    if (!parLevels.length) return '';
    const selectedClientName = clients.find((client) => client.id === clientId)?.name || 'This client';
    const parts = parLevels
      .filter((row) => row.par_quantity > 0)
      .map((row) => `${row.linen_categories?.name ?? 'Category'}×${row.par_quantity}`);
    return parts.length ? `${selectedClientName} usually orders: ${parts.join(', ')}` : '';
  }, [parLevels, clients, clientId]);

  const totalItems = useMemo(
    () => Object.values(qtyByCategory).reduce((sum, qty) => sum + (qty || 0), 0),
    [qtyByCategory]
  );

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoadingData(true);

      const { data: orgData } = await supabase.rpc('get_current_org_id');
      const resolvedOrgId =
        orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id || '';
      setOrgId(resolvedOrgId);

      const [clientRes, driverRes, categoryRes, cleanItemsRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('org_id', resolvedOrgId).order('name', { ascending: true }),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('org_id', resolvedOrgId)
          .eq('role', 'driver')
          .order('full_name', { ascending: true }),
        supabase.from('linen_categories').select('id, name').eq('org_id', resolvedOrgId).order('name', { ascending: true }),
        supabase
          .from('linen_items')
          .select('category_id')
          .eq('org_id', resolvedOrgId)
          .eq('status', 'clean')
          .not('category_id', 'is', null),
      ]);

      setClients((clientRes.data || []) as ClientOption[]);
      setDrivers((driverRes.data || []) as DriverOption[]);
      setCategories((categoryRes.data || []) as CategoryOption[]);

      const stockMap: Record<string, number> = {};
      for (const row of cleanItemsRes.data || []) {
        const categoryId = row.category_id as string | null;
        if (!categoryId) continue;
        stockMap[categoryId] = (stockMap[categoryId] || 0) + 1;
      }
      setAvailableCleanByCategory(stockMap);
      setLoadingData(false);
    };

    load();
  }, [open, supabase]);

  useEffect(() => {
    if (!clientId || !orgId) {
      setParLevels([]);
      return;
    }

    const loadParLevels = async () => {
      const { data } = await supabase
        .from('client_par_levels')
        .select('category_id, par_quantity, linen_categories(name)')
        .eq('org_id', orgId)
        .eq('client_id', clientId);

      const normalized = (data || []).map((row) => ({
        category_id: row.category_id as string,
        par_quantity: Number(row.par_quantity || 0),
        linen_categories: Array.isArray(row.linen_categories)
          ? ((row.linen_categories[0] as { name: string } | undefined) ?? null)
          : ((row.linen_categories as { name: string } | null) ?? null),
      }));

      setParLevels(normalized);
    };

    loadParLevels();
  }, [clientId, orgId, supabase]);

  const applyParLevels = () => {
    const next: Record<string, number> = { ...qtyByCategory };
    for (const row of parLevels) {
      next[row.category_id] = row.par_quantity;
    }
    setQtyByCategory(next);
  };

  const submit = async () => {
    if (!clientId) return;
    setSubmitError('');
    const payloadItems = Object.entries(qtyByCategory)
      .filter(([, qty]) => qty > 0)
      .map(([category_id, qty]) => ({ category_id, qty }));

    if (payloadItems.length === 0) return;

    setSubmitting(true);
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        scheduled_date: format(scheduledDate, 'yyyy-MM-dd'),
        driver_id: driverId || null,
        vehicle_plate: vehiclePlate || null,
        notes: notes || null,
        items: payloadItems,
      }),
    });

    const result = await response.json();
    setSubmitting(false);

    if (!response.ok || !result.order_id) {
      setSubmitError(result?.error || 'Failed to create order');
      return;
    }

    setOpen(false);
    router.push(`/orders/${result.order_id}`);
    router.refresh();
  };

  const canGoStep2 = Boolean(clientId && scheduledDate);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center text-sm font-semibold transition-colors shadow-lg shadow-slate-200">
          <PlusCircle className="mr-2 h-4 w-4" />
          New Order
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Delivery Order</DialogTitle>
          <DialogDescription>
            Step {step} of 2 {step === 1 ? 'Order Info' : 'Items'}
          </DialogDescription>
        </DialogHeader>

        {loadingData ? (
          <div className="py-16 flex items-center justify-center text-slate-500">
            <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading data...
          </div>
        ) : null}

        {!loadingData && step === 1 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !scheduledDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduledDate ? format(scheduledDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={scheduledDate} onSelect={(date) => date && setScheduledDate(date)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Driver</Label>
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select driver" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.full_name || 'Unnamed Driver'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Vehicle Plate</Label>
              <Input value={vehiclePlate} onChange={(event) => setVehiclePlate(event.target.value)} placeholder="e.g. กข-1234" />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} placeholder="Optional notes" />
            </div>

            {suggestionText ? (
              <div className="md:col-span-2 bg-indigo-50 border border-indigo-100 rounded-lg p-3 text-sm text-indigo-700 flex items-start gap-2">
                <Sparkles className="w-4 h-4 mt-0.5" />
                <span>{suggestionText}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {!loadingData && step === 2 ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">Order Items</h3>
              <Button variant="outline" size="sm" onClick={applyParLevels}>
                Fill from Par Level
              </Button>
            </div>

            <div className="space-y-2">
              {categories.map((category) => {
                const qty = qtyByCategory[category.id] || 0;
                const available = availableCleanByCategory[category.id] || 0;
                const overLimit = qty > available;

                return (
                  <div key={category.id} className="grid grid-cols-12 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="col-span-6 font-medium text-slate-800">{category.name}</div>
                    <div className="col-span-3">
                      <Input
                        type="number"
                        min={0}
                        value={qty}
                        onChange={(event) =>
                          setQtyByCategory((prev) => ({
                            ...prev,
                            [category.id]: Number(event.target.value || 0),
                          }))
                        }
                      />
                    </div>
                    <div className="col-span-3 text-right text-xs text-slate-500">
                      Available clean stock: {available}
                    </div>
                    {overLimit ? (
                      <div className="col-span-12 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1">
                        Only {available} {category.name} available in clean stock
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="text-sm font-semibold text-slate-700 text-right">Total: {totalItems} items</div>
            {submitError ? (
              <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {submitError}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === 2 ? (
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
          ) : null}

          {step === 1 ? (
            <Button disabled={!canGoStep2} onClick={() => setStep(2)} className="bg-indigo-600 hover:bg-indigo-700">
              Next: Items
            </Button>
          ) : (
            <Button disabled={submitting || totalItems === 0} onClick={submit} className="bg-slate-900 hover:bg-slate-800">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Create Order
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
