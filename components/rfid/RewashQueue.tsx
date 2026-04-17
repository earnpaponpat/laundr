"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { createClient } from "@/lib/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertOctagon, RefreshCw, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useRouter } from "next/navigation";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useNotifications } from "@/lib/contexts/NotificationContext";

interface RewashQueueProps {
  queueItems: any[];
  onRefresh?: () => void;
}

export function RewashQueue({ queueItems, onRefresh }: RewashQueueProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { success, error } = useNotifications();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  
  // Reject Dialog
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; record: any | null }>({ open: false, record: null });
  const supabase = createClient();

  const handleToggleBillable = async (recordId: string, currentVal: boolean) => {
    setLoadingId(recordId);
    try {
      const { error: err } = await supabase.from("rewash_records").update({ billable: !currentVal }).eq("id", recordId);
      if (err) throw err;
      success(`Billing status updated: ${!currentVal ? 'Billable' : 'Non-billable'}`);
      if (onRefresh) onRefresh();
      router.refresh();
    } catch (err: any) {
      error("Failed to update billing status");
    }
    setLoadingId(null);
  };

  const handleResolve = async (record: any) => {
    setLoadingId(record.id);
    try {
      // 1. Mark record resolved
      await supabase.from("rewash_records").update({ resolved: true }).eq("id", record.id);
      
      // 2. Insert checkin event (brings it back to stock and increments wash count)
      await supabase.from("scan_events").insert({
        org_id: record.org_id,
        rfid_tag_id: record.linen_items.rfid_tag_id,
        item_id: record.item_id,
        event_type: 'checkin',
        gate_id: 'rewash_resolution',
        source: 'dashboard'
      });

      success(`Item ${record.linen_items.rfid_tag_id} resolved and returned to stock`);
      if (onRefresh) onRefresh();
      router.refresh();
    } catch (err: any) {
      error("Failed to resolve rewash item");
    }
    setLoadingId(null);
  };

  const handleReject = async () => {
    const { record } = rejectDialog;
    if (!record) return;

    setLoadingId(record.id);
    try {
      // 1. Mark record resolved (settled via rejection)
      await supabase.from("rewash_records").update({ resolved: true }).eq("id", record.id);

      // 2. Insert reject event (permanently removes from stock)
      await supabase.from("scan_events").insert({
        org_id: record.org_id,
        rfid_tag_id: record.linen_items.rfid_tag_id,
        item_id: record.item_id,
        event_type: 'reject',
        gate_id: 'rewash_resolution',
        source: 'dashboard'
      });

      success(`Item ${record.linen_items.rfid_tag_id} PERMANENTLY rejected`);
      setRejectDialog({ open: false, record: null });
      if (onRefresh) onRefresh();
      router.refresh();
    } catch (err: any) {
      error("Failed to process rejection");
    }
    setLoadingId(null);
  };

  const getReasonBadge = (reason: string) => {
    switch(reason) {
      case 'stain': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Stain</Badge>;
      case 'damage': return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Damage</Badge>;
      case 'special_treatment': return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">Special Treatment</Badge>;
      default: return <Badge variant="outline" className="text-slate-500">Other</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border-0 shadow-sm shadow-slate-200/50 rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="w-[180px] font-bold uppercase text-[10px] tracking-wider text-slate-400">Tag ID</TableHead>
              <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Category</TableHead>
              <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Last Client</TableHead>
              <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Reason</TableHead>
              <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Days in Queue</TableHead>
              <TableHead className="text-center font-bold uppercase text-[10px] tracking-wider text-slate-400">Billable</TableHead>
              <TableHead className="text-right font-bold uppercase text-[10px] tracking-wider text-slate-400">Decisions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queueItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-green-200 mb-3" />
                  <p className="font-bold text-lg text-slate-700 italic">Queue is Clear</p>
                  <p className="text-xs text-slate-400">No items currently flagged for rewash or repair.</p>
                </TableCell>
              </TableRow>
            ) : (
              queueItems.map((record) => {
                const item = record.linen_items;
                const client = record.clients;
                
                return (
                  <TableRow key={record.id} className="hover:bg-slate-50/50 transition-colors">
                    <TableCell className="font-mono text-xs text-slate-600">
                      {item?.rfid_tag_id}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{item?.linen_categories?.name}</TableCell>
                    <TableCell className="text-sm text-slate-600">{client?.name || t('dashboard.inHouse')}</TableCell>
                    <TableCell>{getReasonBadge(record.reason)}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {formatDistanceToNow(new Date(record.created_at))}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <Switch 
                          checked={record.billable} 
                          onCheckedChange={() => handleToggleBillable(record.id, record.billable)}
                          disabled={loadingId === record.id}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" size="sm" 
                          className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                          disabled={loadingId === record.id}
                          onClick={() => handleResolve(record)}
                        >
                          {loadingId === record.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                          Resolve
                        </Button>
                        <Button 
                          variant="ghost" size="sm" 
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          disabled={loadingId === record.id}
                          onClick={() => setRejectDialog({ open: true, record })}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(val) => setRejectDialog(prev => ({ ...prev, open: val }))}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Permanently Reject Item?</DialogTitle>
            <DialogDescription className="py-4 text-slate-600 italic">
              This will remove Tag <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">{rejectDialog.record?.linen_items?.rfid_tag_id}</span> from active circulation entirely. 
              {rejectDialog.record?.billable ? " The system will flag this replacement cost as Billable to the client." : ""}
              <br/><br/>
              Are you sure the item is unrecoverable?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-slate-200" onClick={() => setRejectDialog({ open: false, record: null })} disabled={loadingId === rejectDialog.record?.id}>
              {t('actions.cancel')}
            </Button>
            <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={handleReject} disabled={loadingId === rejectDialog.record?.id}>
              {loadingId === rejectDialog.record?.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertOctagon className="w-4 h-4 mr-2" />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
