"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, Send, CheckCircle2, Loader2, FileText, Building2, CreditCard, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";

interface InvoiceSheetProps {
  invoice: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

export function InvoiceSheet({ invoice, open, onOpenChange, onRefresh }: InvoiceSheetProps) {
  const [loading, setLoading] = useState(false);

  if (!invoice) return null;

  const statusColors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700",
  };

  const handleUpdateStatus = async (newStatus: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) onRefresh();
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/billing/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_id: invoice.id }),
      });
      if (res.ok) onRefresh();
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-3xl flex flex-col h-full bg-slate-50 p-0 text-slate-900 border-l border-slate-200 shadow-2xl">
        <SheetHeader className="p-6 bg-white border-b shadow-sm no-print">
          <div className="flex justify-between items-start">
             <div className="space-y-1">
                <SheetTitle className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                  <FileText className="w-6 h-6 text-indigo-600" />
                  {invoice.invoice_number}
                </SheetTitle>
                <SheetDescription className="text-sm font-medium text-slate-400">
                  Issued on: {format(new Date(invoice.issue_date), 'MMMM dd, yyyy')}
                </SheetDescription>
             </div>
             <Badge className={`${statusColors[invoice.status]} capitalize px-3 py-1 border`}>{invoice.status}</Badge>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-8 space-y-8 invoice-content bg-white min-h-full">
            {/* Header / Logo Section */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-8">
                <div>
                  <h1 className="text-3xl font-black tracking-tighter text-slate-900">LAUNDRY<span className="text-indigo-600">TRACK</span></h1>
                  <p className="text-sm text-slate-500 font-medium">Smart RFID Solutions for Hospitality</p>
                </div>
                <div className="text-right space-y-1">
                    <h2 className="text-xl font-bold uppercase tracking-widest text-slate-400">Tax Invoice</h2>
                    <p className="text-sm font-bold">{invoice.invoice_number}</p>
                    <p className="text-xs text-slate-500">Page 1 of 1</p>
                </div>
            </div>

            {/* Address Info */}
            <div className="grid grid-cols-2 gap-12">
                <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Bill To</p>
                    <div className="space-y-1">
                        <p className="text-lg font-black">{invoice.clients?.name}</p>
                        <p className="text-sm text-slate-600 leading-relaxed max-w-[280px]">
                            {invoice.clients?.address || "No address provided"}
                        </p>
                    </div>
                </div>
                <div className="space-y-4 text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Payment Details</p>
                    <div className="space-y-1 text-sm">
                        <p><span className="text-slate-500">Issue Date:</span> <span className="font-bold">{format(new Date(invoice.issue_date), 'dd/MM/yyyy')}</span></p>
                        <p><span className="text-slate-500">Due Date:</span> <span className="font-bold text-red-600">{format(new Date(invoice.due_date), 'dd/MM/yyyy')}</span></p>
                    </div>
                </div>
            </div>

            {/* Itemized Table */}
            <div className="border rounded-xl overflow-hidden">
                <Table>
                    <TableHeader className="bg-slate-900">
                        <TableRow className="hover:bg-slate-900 border-0">
                            <TableHead className="text-white font-bold h-12">Description</TableHead>
                            <TableHead className="text-right text-white font-bold h-12">Qty</TableHead>
                            <TableHead className="text-right text-white font-bold h-12">Unit Price</TableHead>
                            <TableHead className="text-right text-white font-bold h-12">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {invoice.items_json?.map((item: any, i: number) => (
                            <TableRow key={i} className="border-b border-slate-100">
                                <TableCell className="py-4 font-medium">{item.name}</TableCell>
                                <TableCell className="text-right py-4">{item.qty}</TableCell>
                                <TableCell className="text-right py-4">฿{item.unitPrice.toFixed(2)}</TableCell>
                                <TableCell className="text-right py-4 font-bold">฿{item.amount.toLocaleString()}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Totals Section */}
            <div className="flex justify-end pt-4">
                <div className="w-64 space-y-3">
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Subtotal</span>
                        <span className="font-bold text-slate-900">฿{invoice.subtotal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">VAT (7%)</span>
                        <span className="font-bold text-slate-900">฿{(invoice.subtotal * 0.07).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <span className="text-xs font-black uppercase tracking-widest text-indigo-600">Total Due</span>
                        <span className="text-xl font-black text-indigo-700">฿{invoice.total.toLocaleString()}</span>
                    </div>
                </div>
            </div>

            {/* Footer / Banking Info */}
            <div className="pt-12 grid grid-cols-2 gap-8 border-t border-slate-100 mt-12">
                <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Remittance Info</p>
                    <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span className="font-bold">Kasikorn Bank (K-Bank)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <CreditCard className="w-3 h-3 text-slate-400" />
                            <span className="font-bold">Acc: LaundryTrack Solution Co. Ltd</span>
                        </div>
                        <p className="font-black text-indigo-600 ml-5">Account: 123-4-56789-0</p>
                    </div>
                </div>
                <div className="flex flex-col justify-end items-end space-y-4">
                    <div className="w-48 border-b-2 border-slate-900 h-12"></div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Authorized Signature</p>
                </div>
            </div>

            {invoice.notes && (
                <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 text-xs text-amber-800 leading-relaxed italic no-print">
                   <strong>Notes:</strong> {invoice.notes}
                </div>
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="p-6 bg-white border-t border-slate-200 no-print gap-3 flex-wrap sm:flex-nowrap">
          <Button variant="outline" className="flex-1 h-12 shadow-sm font-bold" onClick={handlePrint} disabled={loading}>
            <Printer className="w-4 h-4 mr-2" /> Print PDF
          </Button>
          
          {invoice.status === 'draft' && (
            <Button className="flex-1 h-12 shadow-sm font-bold bg-indigo-600 hover:bg-indigo-700" onClick={handleSend} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              Finalize & Send
            </Button>
          )}

          {invoice.status === 'pending' && (
            <Button className="flex-1 h-12 shadow-sm font-bold bg-green-600 hover:bg-green-700" onClick={() => handleUpdateStatus('paid')} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Mark as Paid
            </Button>
          )}

          {invoice.status === 'paid' && (
            <div className="flex-1 h-12 bg-green-50 text-green-700 font-black text-center flex items-center justify-center rounded-xl border border-green-200 tracking-widest uppercase text-xs">
              ✓ Receipt Generated
            </div>
          )}
        </SheetFooter>

        <style jsx global>{`
          @media print {
            .no-print { display: none !important; }
            .invoice-content { 
              padding: 0 !important; 
              margin: 0 !important;
              width: 100% !important;
            }
            body { 
              background: white !important; 
              margin: 0 !important;
              padding: 0 !important;
            }
            .sheet-content {
              box-shadow: none !important;
              border: none !important;
            }
          }
        `}</style>
      </SheetContent>
    </Sheet>
  );
}
