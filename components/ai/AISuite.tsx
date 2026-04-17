"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { AIInsightsPanel } from "./AIInsightsPanel";
import { AIAssistantChat } from "./AIAssistantChat";

export function AISuite() {
  const [followUp, setFollowUp] = useState<string | undefined>(undefined);
  const { t } = useLanguage();

  const handleRecommendation = (rec: string) => {
    setFollowUp(t('ai.followUpPrefix') + rec);
  };

  return (
    <>
      <AIInsightsPanel onRecommendationClick={handleRecommendation} />
      <AIAssistantChat initialMessage={followUp} />
    </>
  );
}
