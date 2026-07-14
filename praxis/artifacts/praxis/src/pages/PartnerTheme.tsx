import React, { useState, useEffect } from 'react';
import { useGetBrandTheme, useUpdateBrandTheme } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2, Palette } from 'lucide-react';
import { BrandThemeInput } from '@workspace/api-client-react';

export function PartnerTheme() {
  const { data: theme, isLoading } = useGetBrandTheme();
  const updateTheme = useUpdateBrandTheme();
  const { toast } = useToast();

  const [formData, setFormData] = useState<Partial<BrandThemeInput>>({});

  useEffect(() => {
    if (theme) {
      setFormData({
        displayName: theme.displayName || '',
        primaryColor: theme.primaryColor || '#0f172a',
        credentialTitle: theme.credentialTitle || 'PraxisMark',
        logoUrl: theme.logoUrl || '',
      });
    }
  }, [theme]);

  const handleSave = () => {
    updateTheme.mutate(
      { data: formData },
      {
        onSuccess: () => {
          toast({ title: 'Theme Updated', description: 'Changes will propagate to all learners immediately.' });
        }
      }
    );
  };

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="space-y-8 animate-in fade-in">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-serif font-bold tracking-tight">Brand Theme</h1>
        <p className="text-muted-foreground">Customize the white-label experience for your organization.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Editor Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Palette className="h-5 w-5 text-primary" /> Visual Identity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Platform Display Name</Label>
                <Input 
                  value={formData.displayName || ''} 
                  onChange={e => setFormData({...formData, displayName: e.target.value})} 
                />
              </div>
              
              <div className="space-y-2">
                <Label>Primary Brand Color</Label>
                <div className="flex gap-4">
                  <Input 
                    type="color" 
                    value={formData.primaryColor || '#0f172a'} 
                    onChange={e => setFormData({...formData, primaryColor: e.target.value})}
                    className="w-16 h-10 p-1 cursor-pointer"
                  />
                  <Input 
                    type="text" 
                    value={formData.primaryColor || '#0f172a'} 
                    onChange={e => setFormData({...formData, primaryColor: e.target.value})}
                    className="flex-1 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Logo URL</Label>
                <Input 
                  placeholder="https://example.com/logo.png"
                  value={formData.logoUrl || ''} 
                  onChange={e => setFormData({...formData, logoUrl: e.target.value})} 
                />
              </div>

              <div className="space-y-2 pt-4 border-t border-border">
                <Label>Credential Title</Label>
                <Input 
                  value={formData.credentialTitle || ''} 
                  onChange={e => setFormData({...formData, credentialTitle: e.target.value})} 
                  placeholder="e.g. Leadership PraxisMark"
                />
                <p className="text-xs text-muted-foreground">This is the title shown on learner credential cards.</p>
              </div>

              <div className="pt-6">
                <Button onClick={handleSave} disabled={updateTheme.isPending} className="w-full">
                  <Save className="h-4 w-4 mr-2" /> Save Theme Settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Preview */}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">Live Preview</h3>
          <div className="rounded-2xl border border-border p-8 bg-muted/30 shadow-inner flex flex-col items-center justify-center min-h-[500px]">
            
            {/* Mock Dashboard Header */}
            <div className="w-full max-w-sm bg-card rounded-xl shadow-lg border border-border overflow-hidden mb-8">
              <div className="h-14 border-b border-border flex items-center px-4" style={{ backgroundColor: formData.primaryColor, color: '#fff' }}>
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt="Logo" className="h-6 object-contain" />
                ) : (
                  <span className="font-serif font-bold text-lg">{formData.displayName || 'Your Brand'}</span>
                )}
              </div>
              <div className="p-6 space-y-4">
                <div className="h-4 w-1/3 bg-muted rounded" />
                <div className="h-20 w-full bg-muted/50 rounded" />
                <Button className="w-full" style={{ backgroundColor: formData.primaryColor }}>Continue Learning</Button>
              </div>
            </div>

            {/* Mock Credential */}
            <div className="w-full max-w-sm bg-card rounded-xl shadow-lg border border-border p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: formData.primaryColor }} />
              <div className="flex justify-between items-center mb-4">
                <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-xs" style={{ color: formData.primaryColor }}>Logo</div>
                <div className="text-[10px] font-bold uppercase border rounded-full px-2 py-0.5 border-green-200 bg-green-50 text-green-700">Valid</div>
              </div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{formData.displayName || 'Platform'}</p>
              <h3 className="font-serif font-bold text-xl mb-6">{formData.credentialTitle || 'PraxisMark'}</h3>
              <div className="flex justify-between items-end">
                <div className="h-3 w-20 bg-muted rounded" />
                <div className="h-10 w-10 rounded-full border-4 border-muted" style={{ borderLeftColor: formData.primaryColor }} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
