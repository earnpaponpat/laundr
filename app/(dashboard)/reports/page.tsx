"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { FileBarChart, Download, Calendar, Filter, FileText, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function ReportsPage() {
  const { t } = useLanguage();

  const mockReports = [
    { id: 1, name: "Daily Operations Ledger", date: "Apr 17, 2026", type: "Operational", status: "Generated" },
    { id: 2, name: "Monthly Client Loss Analysis", date: "Apr 01, 2026", type: "Financial", status: "Archived" },
    { id: 3, name: "RFID Lifecycle Audit", date: "Mar 15, 2026", type: "Inventory", status: "Archived" },
    { id: 4, name: "Rewash Liability Summary", date: "Mar 01, 2026", type: "Financial", status: "Archived" },
  ];

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileBarChart className="w-8 h-8 text-indigo-600" />
            {t('reports.title')}
          </h1>
          <p className="text-slate-500">Historical performance data and exported operational ledgers.</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200 py-6">
          <FileText className="mr-2 h-4 w-4" /> {t('reports.generate')}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Reports Generated", value: "128", sub: "Last 30 days" },
          { label: "Auto-Exports", value: "Active", sub: "Daily at 06:00" },
          { label: "Storage Used", value: "1.2 GB", sub: "of 10 GB" },
          { label: "Pending Layouts", value: "2", sub: "Custom templates" },
        ].map((stat, i) => (
          <Card key={i} className="p-6 border-0 shadow-sm shadow-slate-200/50 bg-white space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            <p className="text-xs text-slate-500 italic">{stat.sub}</p>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm shadow-slate-200/50 bg-white overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Recent Generated Reports</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs border-slate-200">
              <Calendar className="w-3.5 h-3.5 mr-1" /> {t('reports.period')}
            </Button>
            <Button variant="outline" size="sm" className="text-xs border-slate-200">
              <Filter className="w-3.5 h-3.5 mr-1" /> Filter
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="font-bold uppercase text-[11px] tracking-wider text-slate-400">Report Name</TableHead>
              <TableHead className="font-bold uppercase text-[11px] tracking-wider text-slate-400">Date</TableHead>
              <TableHead className="font-bold uppercase text-[11px] tracking-wider text-slate-400">Type</TableHead>
              <TableHead className="font-bold uppercase text-[11px] tracking-wider text-slate-400">Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mockReports.map((report) => (
              <TableRow key={report.id} className="group cursor-pointer hover:bg-slate-50/50 transition-colors">
                <TableCell className="font-medium text-slate-900">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center group-hover:bg-white transition-colors">
                      <FileText className="w-4 h-4 text-slate-400" />
                    </div>
                    {report.name}
                  </div>
                </TableCell>
                <TableCell className="text-slate-500 text-sm">{report.date}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] uppercase font-bold text-slate-500 border-slate-200">
                    {report.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {report.status}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" className="text-indigo-600 hover:bg-white border border-transparent hover:border-slate-100">
                    <Download className="w-4 h-4 mr-2" /> Download
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
