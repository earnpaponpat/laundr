"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { Loader2, AlertOctagon, CheckCircle2, Phone } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useRouter } from "next/navigation";

interface MissingItemsTableProps {
  missingItems: any[];
  onRefresh: () => void;
}

export function MissingItemsTable({ missingItems, onRefresh }: MissingItemsTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const toggleAll = () => {
    if (selectedIds.length === missingItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(missingItems.map(i => i.item_id));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const markSelectedLost = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    
    // Update physically 'lost' state
    await supabase
      .from('linen_items')
      .update({ status: 'lost' })
      .in('id', selectedIds);

    // Optional: Log it as an audit trail (since it skips normal flow)
    const { data: userData } = await supabase.auth.getUser();
    const mockEvents = selectedIds.map(id => {
      const item = missingItems.find(i => i.item_id === id);
      return {
        org_id: item.org_id || null, // Will use db trigger defaults if null
        rfid_tag_id: item.rfid_tag_id,
        item_id: id,
        event_type: 'reject', // using reject as a proxy for forced removal right now
        source: 'reconcile_dashboard',
        scanned_by: userData?.user?.id || null,
        gate_id: 'system_override'
      };
    });
    // Fire and forget (just best effort trail)
    if(mockEvents[0].org_id) {
       await supabase.from('scan_events').insert(mockEvents);
    }

    setLoading(false);
    setSelectedIds([]);
    onRefresh();
  };

  const markSingleLost = async (item_id: string, org_id: string, rfid: string) => {
    setLoading(true);
    await supabase.from('linen_items').update({ status: 'lost' }).eq('id', item_id);
    if(org_id) {
       await supabase.from('scan_events').insert({
         org_id, rfid_tag_id: rfid, item_id, event_type: 'reject', source: 'reconcile', gate_id: 'system'
       });
    }
    setLoading(false);
    onRefresh();
  };

  return (
    <div className="space-y-4 text-slate-900">
      <div className="flex justify-between items-center">
        <h3 className="font-medium">Missing Checklist</h3>
        <Button 
          variant="destructive" 
          disabled={selectedIds.length === 0 || loading}
          onClick={markSelectedLost}
        >
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <AlertOctagon className="w-4 h-4 mr-2" />}
          Mark Selected as Lost ({selectedIds.length})
        </Button>
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[50px] text-center">
                <Checkbox 
                  checked={selectedIds.length === missingItems.length && missingItems.length > 0}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Tag ID</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Days Passed</TableHead>
              <TableHead>Last Known (Gate)</TableHead>
              <TableHead className="text-right">Quick Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {missingItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-green-200 mb-3" />
                  <p className="font-medium text-lg text-slate-700">All Items Accounted For!</p>
                  <p className="text-sm">No missing items detected in this batch.</p>
                </TableCell>
              </TableRow>
            ) : (
              missingItems.map((item) => {
                const isLost = item.current_db_status === 'lost';
                return (
                  <TableRow key={item.item_id}>
                    <TableCell className="text-center">
                      <Checkbox 
                        checked={selectedIds.includes(item.item_id)}
                        onCheckedChange={() => toggleOne(item.item_id)}
                        disabled={isLost}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {item.rfid_tag_id}
                      {isLost && <Badge variant="secondary" className="ml-2">LOST</Badge>}
                    </TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>
                      <span className={`font-medium ${item.days_outstanding > 3 ? 'text-red-500' : 'text-slate-700'}`}>
                        {item.days_outstanding} days
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {item.last_gate || "Unknown Gate"} <br/>
                      <span className="text-xs text-slate-400">
                        {formatDistanceToNow(new Date(item.checkout_time), { addSuffix: true })}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => {}} title="Contact Client">
                          <Phone className="w-4 h-4 text-slate-400" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => markSingleLost(item.item_id, item.org_id, item.rfid_tag_id)}
                          disabled={isLost || loading}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          Mark Lost
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
    </div>
  );
}
