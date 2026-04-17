"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, PlusCircle, Loader2, Calendar as CalendarIcon, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { format, addDays } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useNotifications } from "@/lib/contexts/NotificationContext";

interface GenerateInvoiceDialogProps {
  onSuccess: () => void;
}

export function GenerateInvoiceDialog({ onSuccess }: GenerateInvoiceDialogProps) {
  const { t } = useLanguage();
  const { success, error } = useNotifications();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);

  // Form State
  const [clientId, setClientId] = useState("");
  const [dateFrom, setDateFrom] = useState(format(addDays(new Date(), -30), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dueDate, setDueDate] = useState(format(addDays(new Date(), 30), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  
  // Calculation Result
  const [calculation, setCalculation] = useState<any>(null);

  const supabase = createClient();

  useEffect(() => {
    if (open) {
      loadClients();
    }
  }, [open]);

  const loadClients = async () => {
    const { data } = await supabase.from('clients').select('id, name').eq('active', true);
    setClients(data || []);
  };

  const handleCalculate = async () => {
    if (!clientId || !dateFrom || !dateTo) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, date_from: dateFrom, date_to: dateTo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCalculation(data);
      setStep(2);
      success("Charges calculated successfully");
    } catch (err: any) {
      error(err.message || "Failed to calculate charges");
    }
    setLoading(false);
  };

  const handleSave = async (status: 'draft' | 'pending') => {
    if (!calculation) return;
    setLoading(true);
    try {
      const res = await fetch("/api/billing/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          issue_date: new Date().toISOString(),
          due_date: new Date(dueDate).toISOString(),
          status,
          subtotal: calculation.subtotal,
          rewash_charges: calculation.rewash_total,
          loss_charges: calculation.loss_total,
          total: calculation.total,
          items: calculation.items,
          notes
        })
      });

      if (!res.ok) throw new Error('Failed to save invoice');
      
      success(status === 'draft' ? "Invoice saved as draft" : "Invoice generated and finalized");
      setOpen(false);
      onSuccess();
      setStep(1);
      setCalculation(null);
    } catch (err: any) {
      error(err.message || "Failed to save invoice");
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg flex items-center text-sm font-semibold transition-colors shadow-lg shadow-slate-200">
          <PlusCircle className="mr-2 h-4 w-4" /> {t('actions.newInvoice')}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{step === 1 ? t('actions.newInvoice') : 'Invoice Preview'}</DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>{t('billing.client')}</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date From</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date To</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
            </div>
            <Button className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-700 font-bold" onClick={handleCalculate} disabled={loading || !clientId}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Calculator className="w-5 h-5 mr-2" />}
              Calculate Charges
            </Button>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
               <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-700">Detailed Breakdown</h3>
                  <Badge variant="outline" className="bg-white">7% VAT Included</Badge>
               </div>
               <Table>
                 <TableHeader>
                   <TableRow>
                     <TableHead>Description</TableHead>
                     <TableHead className="text-right">Qty</TableHead>
                     <TableHead className="text-right">Unit Price</TableHead>
                     <TableHead className="text-right">Amount</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {calculation.items.map((item: any, i: number) => (
                     <TableRow key={i}>
                       <TableCell className="text-sm">{item.name}</TableCell>
                       <TableCell className="text-right">{item.qty}</TableCell>
                       <TableCell className="text-right">฿{item.unitPrice.toFixed(2)}</TableCell>
                       <TableCell className="text-right font-bold">฿{item.amount.toLocaleString()}</TableCell>
                     </TableRow>
                   ))}
                   <TableRow className="bg-white/50 font-bold border-t-2">
                     <TableCell colSpan={3} className="text-right">Subtotal</TableCell>
                     <TableCell className="text-right">฿{calculation.subtotal.toLocaleString()}</TableCell>
                   </TableRow>
                   <TableRow className="bg-white/50 text-slate-500">
                     <TableCell colSpan={3} className="text-right">VAT (7%)</TableCell>
                     <TableCell className="text-right">฿{calculation.vat.toLocaleString()}</TableCell>
                   </TableRow>
                   <TableRow className="bg-indigo-50 font-black text-indigo-700 text-lg">
                     <TableCell colSpan={3} className="text-right uppercase tracking-wider">Total Amount</TableCell>
                     <TableCell className="text-right">฿{calculation.total.toLocaleString()}</TableCell>
                   </TableRow>
                 </TableBody>
               </Table>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                    <Label>{t('billing.dueDate')}</Label>
                    <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-2 col-span-2">
                    <Label>Notes (Internal or for Client)</Label>
                    <Textarea 
                      placeholder="Add any specific instructions or billing notes..."
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                    />
                </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => step === 1 ? setOpen(false) : setStep(1)}>
            {step === 1 ? t('actions.cancel') : 'Back'}
          </Button>
          {step === 2 && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => handleSave('draft')} disabled={loading}>
                Save as Draft
              </Button>
              <Button onClick={() => handleSave('pending')} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 font-bold">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Generate & Finalize
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
