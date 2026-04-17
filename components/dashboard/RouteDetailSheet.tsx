"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, MapPin, FileText, Truck, User, Clock, Loader2, PlayCircle, Trophy } from "lucide-react";
import { ManifestDialog } from "./ManifestDialog";
import { format } from "date-fns";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useNotifications } from "@/lib/contexts/NotificationContext";

interface RouteDetailSheetProps {
  route: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}

export function RouteDetailSheet({ route, open, onOpenChange, onRefresh }: RouteDetailSheetProps) {
  const { t } = useLanguage();
  const { success, error } = useNotifications();
  const [manifestOpen, setManifestOpen] = useState(false);
  const [activeStop, setActiveStop] = useState<any>(null);
  const [activeStopIdx, setActiveStopIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  if (!route) return null;

  const stops = Array.isArray(route.stops) ? route.stops : [];
  const driver = route.profiles?.full_name || "Unassigned";

  const toggleRouteStatus = async (newStatus: 'active' | 'completed') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/routes/${route.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeStatus: newStatus }),
      });
      if (!res.ok) throw new Error("Failed to update route");
      
      success(newStatus === 'active' ? "Route dispatched and live" : "Route successfully completed");
      onRefresh();
    } catch (err) {
      error("Failed to update route status");
    }
    setLoading(false);
  };

  const openManifest = (stop: any, idx: number) => {
    setActiveStop(stop);
    setActiveStopIdx(idx);
    setManifestOpen(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md flex flex-col h-full bg-slate-50 border-l p-0 text-slate-900">
        <SheetHeader className="p-6 bg-white border-b shadow-sm">
          <div className="flex justify-between items-start">
             <div>
                <SheetTitle className="text-xl uppercase tracking-tighter font-black">{route.name}</SheetTitle>
                <SheetDescription className="text-xs font-medium text-slate-400">
                  Scheduled: {format(new Date(route.scheduled_at), 'MMM dd, HH:mm')}
                </SheetDescription>
             </div>
             <Badge className={route.status === 'active' ? 'bg-indigo-600' : ''}>{route.status}</Badge>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 p-6">
          <div className="space-y-6">
            
            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Driver</p>
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-sm font-bold">{driver}</span>
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Vehicle</p>
                <div className="flex items-center gap-2">
                  <Truck className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="text-sm font-bold">{route.vehicle_plate}</span>
                </div>
              </div>
            </div>

            {/* Stops Timeline */}
            <div className="space-y-4">
               <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                 <MapPin className="w-4 h-4" /> {t('routes.stops')}
               </h3>
               
               <div className="relative pl-6 space-y-6">
                 {/* Vertical line connector */}
                 <div className="absolute left-[11px] top-2 bottom-6 w-0.5 bg-slate-200" />
                 
                 {stops.map((stop: any, idx: number) => (
                   <div key={idx} className="relative">
                      {/* Circle indicator */}
                      <div className={`absolute -left-[23px] top-1 w-4 h-4 rounded-full border-2 border-white z-10 shadow-sm ${stop.status === 'delivered' ? 'bg-green-500' : 'bg-slate-300'}`}>
                        {stop.status === 'delivered' && <CheckCircle2 className="w-2.5 h-2.5 text-white absolute inset-0 m-auto" />}
                      </div>

                      <div className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 ${stop.status === 'delivered' ? 'opacity-70 bg-slate-50' : ''}`}>
                         <div className="flex justify-between items-start">
                            <div className="space-y-0.5">
                               <p className="font-bold text-sm">{stop.client_name}</p>
                               <p className="text-[10px] text-slate-500 line-clamp-1">{stop.address}</p>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                               <Clock className="w-3 h-3" /> {stop.estimated_time}
                            </div>
                         </div>

                         <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                            <span className="text-xs font-bold text-slate-600">{stop.item_count} {t('ai.items')}</span>
                            <Button 
                                variant={stop.status === 'delivered' ? "outline" : "default"} 
                                size="sm" 
                                className="h-7 px-2 text-xs"
                                onClick={() => openManifest(stop, idx)}
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              {stop.status === 'delivered' ? 'View Manifest' : 'Open Manifest'}
                            </Button>
                         </div>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="p-6 bg-white border-t">
           {route.status === 'pending' && (
             <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-lg font-bold" onClick={() => toggleRouteStatus('active')} disabled={loading}>
               {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5 mr-2" />}
               START ROUTE (DISPATCH)
             </Button>
           )}
           {route.status === 'active' && (
             <Button className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg font-bold" onClick={() => toggleRouteStatus('completed')} disabled={loading}>
               {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trophy className="w-5 h-5 mr-2" />}
               COMPLETE ROUTE
             </Button>
           )}
           {route.status === 'completed' && (
             <div className="w-full bg-slate-100 text-slate-500 font-black text-center py-4 rounded-xl border border-slate-200 uppercase tracking-widest text-sm">
                ✓ ROUTE COMPLETED
             </div>
           )}
        </SheetFooter>

        {manifestOpen && activeStop && (
          <ManifestDialog 
            open={manifestOpen} 
            onOpenChange={setManifestOpen} 
            stop={activeStop}
            routeId={route.id}
            stopIndex={activeStopIdx}
            onSigned={onRefresh}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
