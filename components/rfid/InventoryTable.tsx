"use client";

import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ChevronLeft, ChevronRight, MoreHorizontal, Copy, Info, CheckCircle2, Package } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import { ItemDetailSheet } from "./ItemDetailSheet";

import { useLanguage } from "@/lib/i18n/LanguageContext";

interface InventoryTableProps {
  items: any[];
  page: number;
  totalCount: number;
  pageSize: number;
}

export function InventoryTable({ items, page, totalCount, pageSize }: InventoryTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const totalPages = Math.ceil(totalCount / pageSize);

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`?${params.toString()}`);
  };

  const copyToClipboard = (text: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-4">
      <div className="card !p-0 overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-200">
            <TableRow>
              <TableHead className="w-[180px] text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Tag ID</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Category</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">{t('billing.status')}</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Location</TableHead>
              <TableHead className="w-[200px] text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Wash Count</TableHead>
              <TableHead className="text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">Last Scan</TableHead>
              <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-slate-500 py-4 px-6">{t('billing.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-20 text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="w-8 h-8 opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">No matching items found</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow 
                  key={item.id} 
                  className="cursor-pointer hover:bg-slate-50 border-b border-slate-100 transition-colors"
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <TableCell className="px-6 py-4">
                    <div className="flex items-center gap-2 group/tag">
                      <span className="tag-pill group-hover/tag:bg-white transition-colors">
                        {item.rfid_tag_id}
                      </span>
                      <Button 
                        variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-slate-900 opacity-0 group-hover/tag:opacity-100 transition-opacity" 
                        onClick={(e) => copyToClipboard(item.rfid_tag_id, e)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4 font-medium text-slate-700">{item.linen_categories?.name}</TableCell>
                  <TableCell className="px-6 py-4">
                    <StatusBadge status={item.status === 'in_stock' ? 'IN STOCK' : item.status} />
                  </TableCell>
                  <TableCell className="px-6 py-4 text-slate-600 font-medium">
                    {item.status === 'in_stock' ? 
                      <span className="text-emerald-600 flex items-center gap-1.5 font-bold text-xs uppercase tracking-tight">
                        <CheckCircle2 className="w-3 h-3" /> {t('dashboard.inHouse')}
                      </span> : 
                      (item.clients?.name || "-")
                    }
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-black tabular-nums w-8 text-slate-500">{item.wash_count}</span>
                      <Progress 
                        value={(item.wash_count / (item.linen_categories?.lifespan_cycles || 200)) * 100} 
                        className={`h-1.5 flex-1 ${item.wash_count >= 180 ? '[&>div]:bg-red-500' : 
                                   item.wash_count >= 160 ? '[&>div]:bg-amber-500' : '[&>div]:bg-indigo-500'}`}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="px-6 py-4">
                    {item.last_scan_at ? (
                      <div>
                        <div className="text-xs font-bold text-slate-600 lowercase first-letter:uppercase">
                          {formatDistanceToNow(new Date(item.last_scan_at), { addSuffix: true })}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                          {item.last_scan_location || 'Unknown'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300">Never Scanned</span>
                    )}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-indigo-50 hover:text-indigo-600">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl p-1 shadow-xl border-slate-200">
                        <DropdownMenuItem onClick={() => setSelectedItemId(item.id)} className="rounded-lg gap-2 text-xs font-bold uppercase tracking-tight text-slate-600 focus:bg-indigo-50 focus:text-indigo-700">
                          <Info className="w-3.5 h-3.5" /> Details
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between px-2">
        <div className="text-sm text-slate-500 italic">
          Showing <span className="font-bold">{(page - 1) * pageSize + 1}</span> to <span className="font-bold">{Math.min(page * pageSize, totalCount)}</span> of <span className="font-bold">{totalCount}</span> results
        </div>
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" size="sm" 
            className="border-slate-200 bg-white"
            onClick={() => handlePageChange(page - 1)} 
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4 mr-1" /> Prev
          </Button>
          <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Page {page} of {totalPages || 1}</div>
          <Button 
            variant="outline" size="sm" 
            className="border-slate-200 bg-white"
            onClick={() => handlePageChange(page + 1)} 
            disabled={page >= totalPages}
          >
            Next <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <ItemDetailSheet 
        itemId={selectedItemId} 
        open={!!selectedItemId} 
        onOpenChange={(open) => !open && setSelectedItemId(null)}
        onActionComplete={() => router.refresh()} // Refresh server component data
      />
    </div>
  );
}
