import React from 'react';
import { useVerifyCredential } from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, Shield, Award, Calendar, Check, ExternalLink } from 'lucide-react';
import { isPast } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export function Verify({ params }: { params: { credentialId: string } }) {
  const { credentialId } = params;
  
  // Public route: no auth required to verify a credential.
  //
  // The `as any` is a generator/TanStack-v5 typing gap, not a bug: orval types this
  // option as a full UseQueryOptions, which in v5 demands a `queryKey` -- but the
  // generated hook builds the queryKey itself internally, so passing one here would
  // be both redundant and wrong. Cast is confined to the option object.
  const { data: verification, isLoading, isError } = useVerifyCredential(credentialId, {
    query: { enabled: !!credentialId, retry: false } as any,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="animate-pulse flex flex-col items-center gap-6">
          <div className="h-16 w-16 bg-muted rounded-full" />
          <div className="h-6 w-48 bg-muted rounded" />
          <div className="h-64 w-full max-w-md bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !verification) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
        <XCircle className="h-16 w-16 text-destructive mb-6" />
        <h1 className="text-3xl font-serif font-bold mb-2">Verification Failed</h1>
        <p className="text-muted-foreground max-w-md">
          This credential could not be found or is invalid. Please check the URL and try again.
        </p>
        <Link href="/">
          <Button className="mt-8">Return Home</Button>
        </Link>
      </div>
    );
  }

  const isExpired = verification.status === 'expired' || isPast(new Date(verification.decayDate));
  const isRevoked = verification.status === 'revoked';
  const valid = !isExpired && !isRevoked;

  const masteryPct = Math.round((verification.masteryScore || 0) * 100);

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-2xl space-y-8 animate-in slide-in-from-bottom-8 duration-700">
        
        {/* Verification Status Banner */}
        <div className={`p-6 rounded-2xl flex items-center gap-4 text-white shadow-lg ${
          valid ? 'bg-green-600' : isRevoked ? 'bg-slate-700' : 'bg-destructive'
        }`}>
          {valid ? <CheckCircle2 className="h-10 w-10 shrink-0" /> : <XCircle className="h-10 w-10 shrink-0" />}
          <div>
            <h2 className="text-xl font-bold">
              {valid ? 'Credential Verified' : isRevoked ? 'Credential Revoked' : 'Credential Expired'}
            </h2>
            <p className="opacity-90 text-sm">
              {valid 
                ? 'This record is authentic and currently valid.' 
                : isRevoked 
                  ? 'This credential has been explicitly revoked by the issuer.'
                  : 'This credential has passed its decay date and requires renewal.'}
            </p>
          </div>
        </div>

        {/* Main Credential Card */}
        <Card className="overflow-hidden border-0 shadow-xl bg-card">
          <div className="h-32 bg-primary/5 flex items-center justify-center border-b border-border">
            <Award className="h-16 w-16 text-primary opacity-20" />
          </div>
          
          <div className="px-8 py-10 -mt-16 relative">
            <div className="h-24 w-24 bg-card rounded-full border-4 border-card shadow-md flex items-center justify-center mx-auto mb-6">
              <Shield className={`h-10 w-10 ${valid ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>

            <div className="text-center space-y-6">
              <div>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Credential Holder</p>
                <h1 className="text-3xl font-serif font-bold text-foreground">{verification.holderName}</h1>
              </div>

              <div className="w-16 h-px bg-border mx-auto" />

              <div>
                <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Competency Area</p>
                <h2 className="text-2xl font-serif font-semibold text-foreground">{verification.moduleTitle}</h2>
              </div>

              <div className="grid grid-cols-2 gap-4 py-6 border-y border-border text-left">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Issued By</p>
                  <p className="font-semibold text-foreground">{verification.partnerName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Mastery Score</p>
                  <p className="font-bold text-primary text-xl">{masteryPct}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Issue Date</p>
                  <p className="font-medium text-foreground">{new Date(verification.issuedAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Valid Until</p>
                  <p className={`font-medium ${!valid ? 'text-destructive' : 'text-foreground'}`}>
                    {new Date(verification.decayDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Evidence Chain */}
        {verification.evidenceItems && verification.evidenceItems.length > 0 && (
          <Card className="border-0 shadow-md">
            <CardContent className="p-8">
              <h3 className="font-serif font-bold text-lg mb-6 flex items-center gap-2">
                <Check className="h-5 w-5 text-primary" /> Cryptographic Evidence Chain
              </h3>
              <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {verification.evidenceItems.map((evidence, i) => (
                  <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-card bg-primary text-primary-foreground shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">
                      <Check className="h-4 w-4" />
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-border bg-card shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">{evidence.type.replace('_', ' ')}</span>
                        <span className="text-xs text-muted-foreground font-mono">{new Date(evidence.recordedAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-foreground">{evidence.description}</p>
                      {evidence.score !== undefined && evidence.score !== null && (
                        <p className="text-xs text-muted-foreground mt-2 font-mono bg-muted/50 p-1.5 rounded inline-block">
                          Score: {Math.round(evidence.score * 100)}%
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="text-center pb-12">
          <Link href="/">
            <Button variant="outline" className="bg-background">
              Learn about Synops Praxis <ExternalLink className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>

      </div>
    </div>
  );
}
