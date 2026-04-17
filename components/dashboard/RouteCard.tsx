"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Truck, Navigation, ArrowRight } from "lucide-react";

import { useLanguage } from "@/lib/i18n/LanguageContext";

interface RouteCardProps {
  route: any;
  onViewDetails: (route: any) => void;
}

export function RouteCard({ route, onViewDetails }: RouteCardProps) {
  const { t } = useLanguage();
  const driver = route.profiles?.full_name || "Unassigned";
  const stops = Array.isArray(route.stops) ? route.stops : [];
  const completedStops = stops.filter((s: any) => s.status === 'delivered').length;
  const totalItems = stops.reduce((acc: number, s: any) => acc + (s.item_count || 0), 0);
  
  const progress = stops.length > 0 ? (completedStops / stops.length) * 100 : 0;

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'active': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <Card className="overflow-hidden border-slate-200 hover:border-indigo-300 transition-all shadow-sm hover:shadow-md group">
      <CardContent className="p-0">
        <div className="p-5 space-y-4">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h3 className="font-bold text-lg group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{route.name}</h3>
              <div className="flex items-center text-sm text-slate-500 gap-2">
                <Truck className="w-3.5 h-3.5" />
                <span>{route.vehicle_plate || t('routes.noVehicle')}</span>
              </div>
            </div>
            <Badge className={`${getStatusColor(route.status)} capitalize border px-2 py-0.5`} variant="outline">
               {route.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5 animate-pulse" />}
               {route.status}
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase font-bold text-slate-400">Driver</p>
              <p className="text-sm font-medium">{driver}</p>
            </div>
            <div className="space-y-0.5 text-right">
              <p className="text-[10px] uppercase font-bold text-slate-400">Load</p>
              <p className="text-sm font-medium">{totalItems} {t('ai.items')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-slate-500">{completedStops} / {stops.length} {t('routes.stops')}</span>
              <span className="text-indigo-600">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1.5 bg-slate-100" />
          </div>
        </div>

        <div className="bg-slate-50 border-t p-3 flex justify-between items-center group-hover:bg-indigo-50/50 transition-colors cursor-pointer" onClick={() => onViewDetails(route)}>
           <div className="flex items-center text-xs text-slate-500">
              <Navigation className="w-3.5 h-3.5 mr-1.5" />
              {t('common.viaGate')}: <span className="font-bold text-slate-700 ml-1">{stops.find((s: any) => s.status === 'pending')?.client_name || "Finishing"}</span>
           </div>
           <Button variant="ghost" size="sm" className="h-7 px-2 text-indigo-600 hover:text-indigo-700 hover:bg-transparent p-0">
             View <ArrowRight className="w-3.5 h-3.5 ml-1" />
           </Button>
        </div>
      </CardContent>
    </Card>
  );
}
