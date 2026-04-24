"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow, format } from "date-fns";
import { 
  History, MapPin, AlertOctagon, RefreshCw, 
  Download, ArrowRightLeft, CheckCircle2, Factory, Loader2
} from "lucide-react";
import { getDemoItemDetail } from "@/lib/demo/server-data";

interface ItemDetailSheetProps {
  itemId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionComplete: () => void;
}

export function ItemDetailSheet({ itemId, open, onOpenChange, onActionComplete }: ItemDetailSheetProps) {
  const [item, setItem] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (open && itemId) {
      loadData(itemId);
    } else {
      setItem(null);
      setEvents([]);
    }
  }, [open, itemId]);

  const loadData = async (id: string) => {
    setLoading(true);
    // Fetch item + category + client
    const { data: itemData } = await supabase
      .from("linen_items")
      .select(`
        *,
        linen_categories (name, lifespan_cycles),
        clients (name)
      `)
      .eq("id", id)
      .single();

    if (itemData) {
      setItem(itemData);
    }

    // Fetch history
    const { data: historyData } = await supabase
      .from("scan_events")
      .select(`
        *,
        clients (name)
      `)
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (historyData) {
      setEvents(historyData);
    }

    if (!itemData) {
      const demoDetail = getDemoItemDetail(id);
      if (demoDetail) {
        setItem(demoDetail.item);
        setEvents(demoDetail.events);
      }
    }
    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "in_stock":
      case "clean": return "success";
      case "out": return "default"; // internal blue
      case "dirty":
      case "washing":
      case "drying":
      case "folding": return "outline";
      case "rewash": return "warning";
      case "rejected": return "destructive";
      case "lost": return "secondary";
      default: return "outline";
    }
  };

  const handleExportCSV = () => {
    if (!events.length) return;
    const csvContent = [
      ["Date", "Time", "Event", "Gate", "Client", "Source"],
      ...events.map(e => [
        format(new Date(e.created_at), 'yyyy-MM-dd'),
        format(new Date(e.created_at), 'HH:mm:ss'),
        e.event_type,
        e.gate_id || "N/A",
        e.clients?.name || "N/A",
        e.source || "N/A"
      ])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `History_${item?.rfid_tag_id}.csv`;
    link.click();
  };

  const markLost = async () => {
    if (!item) return;
    setActionLoading(true);
    await supabase.from("linen_items").update({ status: "lost" }).eq("id", item.id);
    setActionLoading(false);
    setDialogOpen(false);
    onActionComplete();
    onOpenChange(false);
  };

  const sendToRewash = async () => {
    if (!item) return;
    setActionLoading(true);
    // We can simulate a scan event for rewash, or just update directly.
    // A clean way is hitting our system API. 
    await fetch('/api/scan-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: item.org_id,
        rfid_tag_id: item.rfid_tag_id,
        gate_id: 'manual_override',
        event_type: 'rewash',
        source: 'dashboard_override',
        client_id: item.client_id
      })
    });
    setActionLoading(false);
    onActionComplete();
    onOpenChange(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center justify-between">
              <span className="font-mono">{item?.rfid_tag_id || "Loading..."}</span>
              {item && <Badge variant={getStatusColor(item.status) as any}>{item.status.toUpperCase()}</Badge>}
            </SheetTitle>
            <SheetDescription>
              {item?.linen_categories?.name || "Unknown Category"}
            </SheetDescription>
          </SheetHeader>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : !item ? (
            <div className="py-8 text-center text-slate-500">Item not found.</div>
          ) : (
            <div className="mt-6 space-y-8">
              {/* Stats Section */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    <div className="text-xs text-slate-500 flex items-center mb-1">
                      <MapPin className="w-3 h-3 mr-1" /> Current Location
                    </div>
                    <div className="font-medium text-sm">
                      {item.status === "in_stock" || item.status === "clean"
                        ? (item.last_scan_location || "Factory")
                        : (item.clients?.name || item.last_scan_location || "Unknown Client")}
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border">
                    <div className="text-xs text-slate-500 flex items-center mb-1">
                      <RefreshCw className="w-3 h-3 mr-1" /> Estimated Life
                    </div>
                    <div className="font-medium text-sm">
                      {Math.max(0, (item.linen_categories?.lifespan_cycles || 200) - item.wash_count)} cycles left
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Wash Cycle Usage</span>
                    <span className="font-medium">{item.wash_count} / {item.linen_categories?.lifespan_cycles || 200}</span>
                  </div>
                  <Progress 
                    value={(item.wash_count / (item.linen_categories?.lifespan_cycles || 200)) * 100} 
                    className={`h-2 ${item.wash_count >= 180 ? '[&>div]:bg-red-500' : ''}`}
                  />
                </div>
              </div>

              {/* Actions Section */}
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={sendToRewash}>
                  <RefreshCw className="w-4 h-4 mr-2" /> Rewash
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => setDialogOpen(true)}>
                  <AlertOctagon className="w-4 h-4 mr-2" /> Mark Lost
                </Button>
                <Button variant="outline" size="icon" onClick={handleExportCSV}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-lg border">
                  <div className="text-xs text-slate-500 mb-1">Last Scan</div>
                  <div className="font-medium text-sm">
                    {item.last_scan_at ? formatDistanceToNow(new Date(item.last_scan_at), { addSuffix: true }) : "N/A"}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">{item.last_scan_location || "Unknown location"}</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg border">
                  <div className="text-xs text-slate-500 mb-1">Lifecycle State</div>
                  <div className="font-medium text-sm capitalize">{item.status.replaceAll("_", " ")}</div>
                  <div className="text-xs text-slate-400 mt-1">SKU: {item.linen_categories?.name}</div>
                </div>
              </div>

              {/* Timeline Section */}
              <div className="space-y-4">
                <h3 className="font-medium flex items-center">
                  <History className="w-4 h-4 mr-2 text-slate-500" />
                  Recent History
                </h3>
                
                <div className="relative pl-4 space-y-6 before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-slate-200">
                  {events.map((evt) => (
                    <div key={evt.id} className="relative">
                      <div className={`absolute -left-[21px] w-2.5 h-2.5 rounded-full border-2 border-white
                        ${evt.event_type === 'checkin' ? 'bg-green-500' : 
                          evt.event_type === 'checkout' ? 'bg-orange-500' : 
                          evt.event_type === 'audit' ? 'bg-blue-500' : 'bg-slate-400'}`} 
                      />
                      <div className="text-xs text-slate-500 mb-1">
                        {formatDistanceToNow(new Date(evt.created_at), { addSuffix: true })}
                      </div>
                      <div className="bg-slate-50 border rounded-md p-3 text-sm">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-medium capitalize">{evt.event_type}</span>
                          <span className="text-xs text-slate-400 font-mono">{format(new Date(evt.created_at), 'HH:mm')}</span>
                        </div>
                        <div className="text-slate-500 text-xs">
                          Gate: {evt.gate_id || "N/A"}<br/>
                          {evt.clients?.name && <>Location: {evt.clients.name}</>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {events.length === 0 && (
                    <div className="text-sm text-slate-500">No events recorded.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Confirmation Dialog for Lost */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Item as Lost?</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-sm text-slate-500">
            This will remove the item from active circulation and mark it as LOST. This action may trigger reporting discrepancies for the client. Are you sure?
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={actionLoading}>Cancel</Button>
            <Button variant="destructive" onClick={markLost} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Confirm Loss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
