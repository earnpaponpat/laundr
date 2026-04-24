"use client";

import { useState, useEffect } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, CreditCard, Clock, CheckCircle2, AlertCircle, Eye, Mail, Check, Loader2 } from "lucide-react";
import { GenerateInvoiceDialog } from "@/components/dashboard/GenerateInvoiceDialog";
import { InvoiceSheet } from "@/components/dashboard/InvoiceSheet";
import { HeaderActions } from "@/components/dashboard/HeaderActions";
import { format } from "date-fns";
import { DEMO_INVOICES } from "@/lib/demo/dashboard";

export default function BillingPage() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loadError, setLoadError] = useState("");

  useEffect(() => { loadInvoices(); }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/invoices");
      const data = await res.json();
      if (Array.isArray(data)) {
        setInvoices(data);
        setLoadError("");
      } else {
        setInvoices(DEMO_INVOICES);
        setLoadError(data?.error || "billing_demo_mode");
      }
    } catch (err) {
      console.error(err);
      setInvoices(DEMO_INVOICES);
      setLoadError(err instanceof Error ? err.message : "billing_demo_mode");
    }
    setLoading(false);
  };

  const safeInvoices = Array.isArray(invoices) ? invoices : DEMO_INVOICES;

  const filteredInvoices = safeInvoices.filter(inv => {
    const invoiceNumber = String(inv.invoice_number || "").toLowerCase();
    const clientName = String(inv.clients?.name || "").toLowerCase();
    const matchesSearch = invoiceNumber.includes(searchTerm.toLowerCase()) ||
      clientName.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const metrics = {
    totalBilled: safeInvoices.reduce((acc, inv) => acc + (inv.status !== 'draft' ? inv.total : 0), 0),
    paidCount: safeInvoices.filter(inv => inv.status === 'paid').length,
    pendingTotal: safeInvoices.reduce((acc, inv) => acc + (inv.status === 'pending' ? inv.total : 0), 0),
    overdueCount: safeInvoices.filter(inv => inv.status === 'overdue').length,
  };

  const statusColors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-700",
    pending: "bg-amber-100 text-amber-700",
    paid: "bg-green-100 text-green-700",
    overdue: "bg-red-100 text-red-700",
  };

  const metricCards = [
    { label: t('billing.totalBilled'), value: `฿${metrics.totalBilled.toLocaleString()}`, icon: CreditCard, bg: 'bg-slate-50', iconColor: 'text-slate-400' },
    { label: t('billing.invoicesPaid'), value: metrics.paidCount, icon: CheckCircle2, bg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
    { label: t('billing.pendingAmount'), value: `฿${metrics.pendingTotal.toLocaleString()}`, icon: Clock, bg: 'bg-amber-50', iconColor: 'text-amber-500' },
    { label: t('billing.overdue'), value: metrics.overdueCount, icon: AlertCircle, bg: 'bg-red-50', iconColor: 'text-red-500' },
  ];

  return (
    <div className="space-y-10 text-slate-900 pb-20 no-print">
      <HeaderActions>
        <GenerateInvoiceDialog onSuccess={loadInvoices} />
      </HeaderActions>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((m) => (
          <div key={m.label} className="bg-white rounded-xl p-5 shadow-sm shadow-slate-200/50 hover:shadow-md transition-shadow duration-200 group">
            <div className="flex items-start justify-between mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{m.label}</span>
              <div className={`w-8 h-8 rounded-lg ${m.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <m.icon className={`h-4 w-4 ${m.iconColor}`} />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tighter">
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <Card className="p-4 bg-slate-50/50 border-slate-200">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={t('billing.searchPlaceholder')}
              className="pl-10 bg-white"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder={t('billing.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('billing.allStatuses')}</SelectItem>
                <SelectItem value="draft">{t('billing.draft')}</SelectItem>
                <SelectItem value="pending">{t('billing.pending')}</SelectItem>
                <SelectItem value="paid">{t('billing.paid')}</SelectItem>
                <SelectItem value="overdue">{t('billing.overdue')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="bg-white">
            <Download className="w-4 h-4 mr-2" /> {t('billing.exportCsv')}
          </Button>
        </div>
        {loadError ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Billing is using demo invoices right now because the backend response was unavailable.
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold">{t('billing.invoiceNum')}</TableHead>
                <TableHead className="font-bold">{t('billing.client')}</TableHead>
                <TableHead className="font-bold">{t('billing.issueDate')}</TableHead>
                <TableHead className="font-bold">{t('billing.dueDate')}</TableHead>
                <TableHead className="text-right font-bold">{t('billing.amount')}</TableHead>
                <TableHead className="text-center font-bold">{t('billing.status')}</TableHead>
                <TableHead className="text-right font-bold">{t('billing.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-300" />
                  </TableCell>
                </TableRow>
              ) : filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                    {t('billing.noInvoices')}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow key={inv.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => { setSelectedInvoice(inv); setIsSheetOpen(true); }}>
                    <TableCell className="font-bold text-indigo-600">{inv.invoice_number}</TableCell>
                    <TableCell className="font-medium">{inv.clients?.name}</TableCell>
                    <TableCell className="text-sm text-slate-500">{format(new Date(inv.issue_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-sm text-slate-500 font-medium">{format(new Date(inv.due_date), 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-right font-bold">฿{inv.total.toLocaleString()}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={`${statusColors[inv.status]} capitalize shadow-none font-bold border-0`}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600" onClick={() => { setSelectedInvoice(inv); setIsSheetOpen(true); }}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {inv.status === 'draft' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600">
                            <Mail className="w-4 h-4" />
                          </Button>
                        )}
                        {inv.status === 'pending' && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-green-600">
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <InvoiceSheet
        invoice={selectedInvoice}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onRefresh={loadInvoices}
      />
    </div>
  );
}
