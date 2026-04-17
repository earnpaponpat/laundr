"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Users, Search, Plus, MapPin, Phone, ExternalLink, MoreVertical } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function ClientsPage() {
  const { t } = useLanguage();

  const mockClients = [
    { id: 1, name: "Hilton Pattaya", location: "Chonburi", phone: "+66 38 253 000", status: "Active", items: 12450 },
    { id: 2, name: "InterContinental Phuket", location: "Phuket", phone: "+66 76 609 999", status: "Active", items: 8900 },
    { id: 3, name: "Bumrungrad Hospital", location: "Bangkok", phone: "+66 2 066 8888", status: "Active", items: 25600 },
    { id: 4, name: "W Bangkok", location: "Bangkok", phone: "+66 2 344 4000", status: "Inactive", items: 0 },
  ];

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Users className="w-8 h-8 text-indigo-600" />
            {t('clients.title')}
          </h1>
          <p className="text-slate-500">Overview of all active and historical client partnerships.</p>
        </div>
        <Button className="bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-200">
          <Plus className="mr-2 h-4 w-4" /> {t('clients.addClient')}
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder={t('clients.search')} 
            className="pl-10 bg-white border-slate-200"
          />
        </div>
        <Button variant="outline" className="border-slate-200 bg-white">Filters</Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {mockClients.map((client) => (
          <Card key={client.id} className="p-0 border-0 shadow-sm shadow-slate-200/50 bg-white group hover:shadow-md transition-all">
            <div className="p-6 border-b border-slate-50 relative flex items-start justify-between">
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">{client.name}</h3>
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <MapPin className="w-3.5 h-3.5" />
                  {client.location}
                </div>
              </div>
              <Badge 
                variant={client.status === 'Active' ? 'secondary' : 'outline'}
                className={client.status === 'Active' ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50' : 'text-slate-400'}
              >
                {client.status}
              </Badge>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium italic">Active RFID Inventory</span>
                <span className="font-bold text-slate-900">{client.items.toLocaleString()} {t('ai.items')}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                {client.phone}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <Button variant="ghost" size="sm" className="text-xs text-indigo-600 hover:bg-indigo-100">
                View Ledger & Routes
              </Button>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
