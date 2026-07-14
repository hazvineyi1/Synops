import React from 'react';
import { useListCredentials, useGetBrandTheme } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck, Calendar, Clock, Copy, ExternalLink, Award } from 'lucide-react';
import { formatDistanceToNow, isPast } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

export function Credentials() {
  const { data: credentials, isLoading } = useListCredentials();
  const { data: theme } = useGetBrandTheme();
  const { toast } = useToast();

  const credentialTitle = theme?.credentialTitle || 'PraxisMark';

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(`${window.location.origin}${url}`);
    toast({
      title: 'Link copied',
      description: 'Verification link copied to clipboard.',
    });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-pulse">
        {[1,2].map(i => <div key={i} className="h-80 bg-muted rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2 mb-10">
        <h1 className="text-4xl font-serif font-bold tracking-tight">My Credentials</h1>
        <p className="text-muted-foreground">Digital proof of your mastered competencies.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {credentials?.map(cred => {
          const isExpired = cred.status === 'expired' || isPast(new Date(cred.decayDate));
          const isRevoked = cred.status === 'revoked';
          const valid = !isExpired && !isRevoked;

          // Days left for urgency color
          const msLeft = new Date(cred.decayDate).getTime() - Date.now();
          const daysLeft = msLeft / (1000 * 60 * 60 * 24);
          
          let statusColor = "text-green-600 bg-green-50 border-green-200";
          if (isRevoked) statusColor = "text-slate-600 bg-slate-50 border-slate-200";
          else if (isExpired) statusColor = "text-red-600 bg-red-50 border-red-200";
          else if (daysLeft < 30) statusColor = "text-red-600 bg-red-50 border-red-200";
          else if (daysLeft < 90) statusColor = "text-amber-600 bg-amber-50 border-amber-200";

          const masteryPct = Math.round((cred.masteryScore || 0) * 100);
          
          // SVG ring gauge math
          const radius = 36;
          const circumference = 2 * Math.PI * radius;
          const strokeDashoffset = circumference - (masteryPct / 100) * circumference;

          return (
            <Card key={cred.id} className="overflow-hidden border-0 shadow-lg relative group">
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-primary/60" />
              <CardContent className="p-0">
                <div className="p-8 sm:p-10 space-y-8">
                  {/* Top Bar: Logo & Status */}
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-inner">
                        {theme?.logoUrl ? (
                          <img src={theme.logoUrl} alt="Logo" className="h-8 w-8 object-contain" />
                        ) : (
                          <Award className="h-6 w-6" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{cred.partnerName || 'Platform'}</p>
                        <h3 className="text-xl font-serif font-bold text-foreground">{credentialTitle}</h3>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${statusColor}`}>
                      {isRevoked ? 'Revoked' : isExpired ? 'Expired' : 'Valid'}
                    </div>
                  </div>

                  {/* Body: Module & Score */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-2 max-w-[60%]">
                      <p className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Competency Area</p>
                      <p className="text-2xl font-serif font-bold leading-tight">{cred.moduleTitle}</p>
                    </div>

                    {/* Circular Progress Gauge */}
                    <div className="relative h-24 w-24 shrink-0">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        {/* Background circle */}
                        <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-muted/30" />
                        {/* Progress circle */}
                        <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent"
                                strokeDasharray={circumference} strokeDashoffset={valid ? strokeDashoffset : circumference}
                                strokeLinecap="round" className={valid ? 'text-primary' : 'text-muted'}
                                style={{ transition: 'stroke-dashoffset 1s ease-in-out' }} />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className={`text-xl font-bold ${valid ? 'text-foreground' : 'text-muted-foreground'}`}>{masteryPct}%</span>
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">Mastery</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer: Dates & Actions */}
                  <div className="pt-6 border-t border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>Issued: <span className="font-medium text-foreground">{new Date(cred.issuedAt).toLocaleDateString()}</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>Expires: <span className={`font-medium ${!valid ? 'text-foreground' : daysLeft < 30 ? 'text-red-600' : 'text-foreground'}`}>
                          {new Date(cred.decayDate).toLocaleDateString()}
                        </span></span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Action overlay on hover (desktop) or fixed (mobile) */}
                  <div className="mt-4 flex gap-3 w-full">
                    <Button variant="outline" className="flex-1 bg-card hover:bg-muted" onClick={() => copyToClipboard(`/verify/${cred.id}`)}>
                      <Copy className="h-4 w-4 mr-2" /> Copy Link
                    </Button>
                    <Button variant="secondary" className="flex-1" onClick={() => window.open(`/verify/${cred.id}`, '_blank')}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Verify Page
                    </Button>
                  </div>

                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {credentials?.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl bg-card/50">
            <ShieldCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-serif font-bold mb-2">No Credentials Yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Complete course modules through guided Socratic sessions to earn your first PraxisMark.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
