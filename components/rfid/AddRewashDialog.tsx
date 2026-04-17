"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PlusCircle, Loader2, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface AddRewashDialogProps {
  onSuccess?: () => void;
}

export function AddRewashDialog({ onSuccess }: AddRewashDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rfid, setRfid] = useState("");
  const [itemInfo, setItemInfo] = useState<any>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  
  const [reason, setReason] = useState<string>("stain");
  const [billable, setBillable] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  
  const [errorMsg, setErrorMsg] = useState("");

  const supabase = createClient();

  const handleFetchItem = async () => {
    if (!rfid) return;
    setLoadingInfo(true);
    setErrorMsg("");
    setItemInfo(null);
    
    // Quick client side verify
    const { data: orgLookup } = await supabase.rpc('get_current_org_id');
    const orgId = orgLookup || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    const { data, error } = await supabase
      .from('linen_items')
      .select('*, linen_categories(name)')
      .eq('org_id', orgId)
      .eq('rfid_tag_id', rfid)
      .single();

    if (error || !data) {
      setErrorMsg("Tag not found in database.");
    } else {
      setItemInfo(data);
    }
    setLoadingInfo(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rfid) return;
    
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch('/api/rewash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rfid_tag_id: rfid,
          reason,
          billable
        })
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to submit');

      setOpen(false);
      if (onSuccess) onSuccess();
      router.refresh();
      
      // reset
      setRfid("");
      setItemInfo(null);
      setReason("stain");
      setBillable(true);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" /> Add to Rewash
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Flag Item for Rewash/Damage</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="space-y-4">
            
            {/* Tag Lookup */}
            <div className="space-y-2">
              <Label>RFID Tag ID</Label>
              <div className="flex gap-2">
                <Input 
                  placeholder="Scan or enter tag..." 
                  value={rfid} 
                  onChange={(e) => setRfid(e.target.value)} 
                  disabled={submitting}
                />
                <Button type="button" variant="outline" onClick={handleFetchItem} disabled={loadingInfo || !rfid}>
                  {loadingInfo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {errorMsg && <p className="text-xs text-red-500 font-medium">{errorMsg}</p>}
            </div>

            {/* Micro Display of Found Item */}
            {itemInfo && (
              <div className="bg-slate-50 p-3 rounded-lg border text-sm flex justify-between items-center">
                <div>
                  <div className="font-medium">{itemInfo.linen_categories?.name}</div>
                  <div className="text-slate-500 text-xs">Cycles: {itemInfo.wash_count} | Status: {itemInfo.status}</div>
                </div>
                <div className="h-2 w-2 rounded-full bg-green-500" title="Found"></div>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-2">
              <Label>Primary Reason</Label>
              <Select value={reason} onValueChange={setReason} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stain">Stain (Oil, Blood, Ink)</SelectItem>
                  <SelectItem value="damage">Damage (Tears, Holes)</SelectItem>
                  <SelectItem value="special_treatment">Special Treatment Needed</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Billable Toggle */}
            <div className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-white">
              <div className="space-y-0.5">
                <Label>Billable to Client</Label>
                <p className="text-[12px] text-slate-500">
                  Charge client for extra processing or replacement.
                </p>
              </div>
              <Switch checked={billable} onCheckedChange={setBillable} disabled={submitting} />
            </div>

          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !itemInfo}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Flag
            </Button>
          </div>
        </form>

      </DialogContent>
    </Dialog>
  );
}
