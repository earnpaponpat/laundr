"use client";

import { useMemo } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, CartesianGrid } from "recharts";
import { format, subMonths, startOfMonth, isAfter } from "date-fns";

interface RewashReportTabsProps {
  allRecords: any[];
}

export function RewashReportTabs({ allRecords }: RewashReportTabsProps) {
  const { t } = useLanguage();
  
  // 1. By Reason (Last 6 Months)
  const reasonData = useMemo(() => {
    const monthsMap = new Map();
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, 'MMM yyyy');
      monthsMap.set(key, { name: key, stain: 0, damage: 0, special: 0, other: 0 });
    }

    const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5));

    allRecords.forEach(r => {
      const d = new Date(r.created_at);
      if (isAfter(d, sixMonthsAgo)) {
        const key = format(d, 'MMM yyyy');
        const bucket = monthsMap.get(key);
        if (bucket) {
          if (r.reason === 'stain') bucket.stain += 1;
          else if (r.reason === 'damage') bucket.damage += 1;
          else if (r.reason === 'special_treatment') bucket.special += 1;
          else bucket.other += 1;
        }
      }
    });

    return Array.from(monthsMap.values());
  }, [allRecords]);

  // 2. By Client
  const clientData = useMemo(() => {
    const clientsMap = new Map();
    
    allRecords.forEach(r => {
      const clientName = r.clients?.name || t('dashboard.inHouse');
      if (!clientsMap.has(clientName)) {
        clientsMap.set(clientName, { name: clientName, rewashCount: 0, rejectCount: 0, billableAmount: 0 });
      }
      const c = clientsMap.get(clientName);
      c.rewashCount += 1;
      
      const isRejected = r.resolved === true && r.linen_items?.status === 'rejected';
      if (isRejected) {
        c.rejectCount += 1;
      }

      if (r.billable) {
        // approximate value or exact if we had historical cost. using current catalog cost.
        const cost = typeof r.linen_items?.linen_categories?.replacement_cost === 'number' 
          ? r.linen_items.linen_categories.replacement_cost 
          : 0;
        c.billableAmount += cost;
      }
    });

    return Array.from(clientsMap.values()).sort((a, b) => b.billableAmount - a.billableAmount);
  }, [allRecords, t]);

  // 3. Trend Rate
  // we just simulate a smooth rate for demo purposes since we don't have total volume. 
  // We'll plot absolute Rewash vs absolute Reject.
  const trendData = useMemo(() => {
    const monthsMap = new Map();
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, 'MMM yyyy');
      monthsMap.set(key, { name: key, Rewashed: 0, Rejected: 0 });
    }

    const sixMonthsAgo = startOfMonth(subMonths(new Date(), 5));

    allRecords.forEach(r => {
      const d = new Date(r.created_at);
      if (isAfter(d, sixMonthsAgo)) {
        const key = format(d, 'MMM yyyy');
        const bucket = monthsMap.get(key);
        if (bucket) {
          bucket.Rewashed += 1;
          if (r.resolved === true && r.linen_items?.status === 'rejected') {
             bucket.Rejected += 1;
          }
        }
      }
    });

    return Array.from(monthsMap.values());
  }, [allRecords]);

  return (
    <Tabs defaultValue="reason" className="space-y-4">
      <TabsList className="bg-slate-100">
        <TabsTrigger value="reason">{t('reports.byReason')}</TabsTrigger>
        <TabsTrigger value="client">{t('reports.byClient')}</TabsTrigger>
        <TabsTrigger value="trend">{t('reports.trend')}</TabsTrigger>
      </TabsList>

      <TabsContent value="reason">
        <Card>
          <CardContent className="pt-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reasonData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}} />
                <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                <Bar dataKey="stain" name={t('reports.stains')} stackId="a" fill="#f59e0b" radius={[0, 0, 4, 4]} barSize={40} />
                <Bar dataKey="damage" name={t('reports.damage')} stackId="a" fill="#ef4444" />
                <Bar dataKey="special" name={t('reports.special')} stackId="a" fill="#a855f7" />
                <Bar dataKey="other" name={t('reports.other')} stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="client">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>{t('reports.clientName')}</TableHead>
                <TableHead className="text-right">{t('reports.totalRewashed')}</TableHead>
                <TableHead className="text-right">{t('reports.totalRejected')}</TableHead>
                <TableHead className="text-right">{t('reports.totalLiability')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-slate-500">{t('reports.noData')}</TableCell>
                </TableRow>
              )}
              {clientData.map((c: any) => (
                <TableRow key={c.name}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right">{c.rewashCount}</TableCell>
                  <TableCell className="text-right text-red-600">{c.rejectCount}</TableCell>
                  <TableCell className="text-right font-mono text-slate-700">
                    ฿{c.billableAmount.toLocaleString({ minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </TabsContent>

      <TabsContent value="trend">
        <Card>
          <CardContent className="pt-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <Tooltip cursor={{fill: '#f8fafc', strokeWidth: 0}} contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}} />
                <Legend iconType="circle" wrapperStyle={{paddingTop: '20px'}} />
                <Line type="monotone" dataKey="Rewashed" stroke="#3b82f6" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
                <Line type="monotone" dataKey="Rejected" stroke="#ef4444" strokeWidth={3} dot={{r: 4, strokeWidth: 2}} activeDot={{r: 6}} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
