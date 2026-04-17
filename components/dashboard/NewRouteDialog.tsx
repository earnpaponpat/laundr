"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Trash2, MapPin, Truck, Calendar as CalcIcon, Loader2, ArrowUpDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { format } from "date-fns";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useNotifications } from "@/lib/contexts/NotificationContext";

interface NewRouteDialogProps {
  onSuccess?: () => void;
}

export function NewRouteDialog({ onSuccess }: NewRouteDialogProps) {
  const { t } = useLanguage();
  const { success, error } = useNotifications();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);

  // Form State
  const [name, setName] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [scheduledAt, setScheduledAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [stops, setStops] = useState<any[]>([]);

  const supabase = createClient();

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    const [drvRes, cliRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('org_id', orgId).eq('role', 'driver'),
      supabase.from('clients').select('id, name, address').eq('org_id', orgId)
    ]);

    setDrivers(drvRes.data || []);
    setClients(cliRes.data || []);
  };

  const addStop = () => {
    setStops([...stops, { client_id: "", client_name: "", address: "", item_count: 50, estimated_time: "10:00" }]);
  };

  const removeStop = (idx: number) => {
    setStops(stops.filter((_, i) => i !== idx));
  };

  const updateStop = (idx: number, field: string, value: any) => {
    const newStops = [...stops];
    newStops[idx][field] = value;

    if (field === 'client_id') {
      const client = clients.find(c => c.id === value);
      newStops[idx].client_name = client?.name || "";
      newStops[idx].address = client?.address || "";
    }

    setStops(newStops);
  };

  const handleSubmit = async () => {
    if (!name || !driverId || stops.length === 0) return;
    setLoading(true);

    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          driver_id: driverId,
          vehicle_plate: vehicle,
          scheduled_at: new Date(scheduledAt).toISOString(),
          stops
        })
      });

      if (!res.ok) throw new Error('Failed to create route');

      success("Route created and dispatched successfully");
      setOpen(false);
      onSuccess?.();

      // Reset
      setName("");
      setDriverId("");
      setVehicle("");
      setStops([]);
    } catch (err) {
      error("Failed to create route. Please check logistics constraints.");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center text-sm font-semibold transition-colors shadow-lg shadow-slate-200">
          <PlusCircle className="mr-2 h-4 w-4" /> {t('actions.newRoute')}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('actions.newRoute')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>Route Name</Label>
            <Input placeholder="e.g. Morning Hilton Run" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>Assign Driver</Label>
            <Select value={driverId} onValueChange={setDriverId}>
              <SelectTrigger>
                <SelectValue placeholder="Select driver" />
              </SelectTrigger>
              <SelectContent>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Vehicle Plate</Label>
            <div className="relative">
              <Truck className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input className="pl-10" placeholder="1กข-1234" value={vehicle} onChange={e => setVehicle(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Scheduled Date & Time</Label>
            <div className="relative">
              <CalcIcon className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                type="datetime-local"
                className="pl-10"
                value={scheduledAt}
                onChange={e => setScheduledAt(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Stops & Sequence</h3>
            <Button variant="outline" size="sm" onClick={addStop}>
              <MapPin className="mr-2 h-3 w-3" /> Add Stop
            </Button>
          </div>

          <div className="space-y-3">
            {stops.map((stop, index) => (
              <div key={index} className="flex gap-4 items-end bg-slate-50 p-3 rounded-lg border border-slate-200 relative group">
                <div className="bg-slate-900 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold absolute -left-3 top-1/2 -translate-y-1/2 shadow-lg">
                  {index + 1}
                </div>

                <div className="flex-1 space-y-1">
                  <Label className="text-[10px] uppercase text-slate-400">Client</Label>
                  <Select value={stop.client_id} onValueChange={(v) => updateStop(index, 'client_id', v)}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Select Client" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-24 space-y-1">
                  <Label className="text-[10px] uppercase text-slate-400">Est. Items</Label>
                  <Input
                    type="number"
                    className="bg-white"
                    value={stop.item_count}
                    onChange={e => updateStop(index, 'item_count', parseInt(e.target.value))}
                  />
                </div>

                <div className="w-24 space-y-1">
                  <Label className="text-[10px] uppercase text-slate-400">ETA</Label>
                  <Input
                    type="time"
                    className="bg-white"
                    value={stop.estimated_time}
                    onChange={e => updateStop(index, 'estimated_time', e.target.value)}
                  />
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-slate-400 hover:text-red-500"
                  onClick={() => removeStop(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {stops.length === 0 && (
              <div className="text-center py-8 border-2 border-dashed rounded-xl text-slate-400">
                <p>No stops added yet. Click "Add Stop" to begin.</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-8 border-t pt-4">
          <Button variant="outline" onClick={() => setOpen(false)}>{t('actions.cancel')}</Button>
          <Button
            disabled={!name || !driverId || stops.length === 0 || loading}
            onClick={handleSubmit}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create Route & Dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
