"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { User, Building, Palette, Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNotifications } from "@/lib/contexts/NotificationContext";
import { useState } from "react";

export default function SettingsPage() {
  const { t, language, setLanguage } = useLanguage();
  const { success } = useNotifications();
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      success(t('settings.updateSuccess'));
    }, 800);
  };

  return (
    <div className="max-w-4xl space-y-8 animate-fade-up">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t('nav.settings')}</h1>
        <p className="text-slate-500">{t('settings.description')}</p>
      </div>

      <div className="grid gap-6">
        <Card className="p-0 border-0 shadow-sm shadow-slate-200/50 bg-white overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <User className="w-4 h-4 text-slate-600" />
            </div>
            <h2 className="font-bold text-slate-900">{t('settings.profile')}</h2>
          </div>
          <div className="p-6 grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('settings.fullName')}</Label>
              <Input defaultValue="Admin User" />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.emailAddress')}</Label>
              <Input defaultValue="admin@laundrytrack.com" disabled />
            </div>
          </div>
        </Card>

        <Card className="p-0 border-0 shadow-sm shadow-slate-200/50 bg-white overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Building className="w-4 h-4 text-slate-600" />
            </div>
            <h2 className="font-bold text-slate-900">{t('settings.organization')}</h2>
          </div>
          <div className="p-6 grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t('settings.orgName')}</Label>
              <Input defaultValue="LaundryTrack Industrial Hub" />
            </div>
            <div className="space-y-2">
              <Label>{t('settings.location')}</Label>
              <Input defaultValue="Chonburi, Thailand" />
            </div>
          </div>
        </Card>

        <Card className="p-0 border-0 shadow-sm shadow-slate-200/50 bg-white overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Palette className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="font-bold text-slate-900">{t('common.preferences')}</h2>
          </div>
          <div className="p-6 space-y-8">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t('settings.language')}</Label>
                <p className="text-sm text-slate-500 italic">{t('common.selectLanguage')}</p>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-lg gap-1 border border-slate-200">
                <Button 
                  size="sm" 
                  variant={language === 'en' ? 'secondary' : 'ghost'} 
                  className={language === 'en' ? 'bg-white shadow-sm' : 'text-slate-500'}
                  onClick={() => setLanguage('en')}
                >
                  English
                </Button>
                <Button 
                  size="sm" 
                  variant={language === 'th' ? 'secondary' : 'ghost'}
                  className={language === 'th' ? 'bg-white shadow-sm' : 'text-slate-500'}
                  onClick={() => setLanguage('th')}
                >
                  ไทย
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">{t('common.pushNotifications')}</Label>
                <p className="text-sm text-slate-500 italic">{t('common.notificationDescription')}</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 px-8 py-6 text-base font-bold shadow-lg shadow-indigo-100"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Check className="mr-2 h-5 w-5" />}
          {t('actions.save')}
        </Button>
      </div>
    </div>
  );
}
