import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';

export function AiInsightsPlaceholder() {
  return (
    <Card className="h-full bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
      <CardHeader className="pb-2">
        <CardTitle className="text-md flex items-center text-indigo-900">
          <Sparkles className="w-4 h-4 mr-2 text-indigo-600" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center text-center h-[200px] text-indigo-800">
        <div className="bg-white p-3 rounded-full shadow-sm mb-3">
          <Sparkles className="w-6 h-6 text-indigo-500" />
        </div>
        <h4 className="font-semibold text-sm mb-1">Coming Soon in Phase 3</h4>
        <p className="text-xs opacity-75 max-w-[200px]">
          Claude 3.5 Sonnet will analyze your daily operations and predict linen shortages automatically.
        </p>
      </CardContent>
    </Card>
  );
}
