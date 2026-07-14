import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'zu', label: 'isiZulu', short: 'ZU' },
  { code: 'xh', label: 'isiXhosa', short: 'XH' },
  { code: 'af', label: 'Afrikaans', short: 'AF' },
];

interface Props {
  /** 'icon' = globe icon only (mobile header), 'full' = icon + label (sidebar) */
  variant?: 'icon' | 'full';
}

export function LanguageSwitcher({ variant = 'icon' }: Props) {
  const { i18n } = useTranslation();
  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'full' ? (
          <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <Globe className="h-4 w-4 shrink-0" />
            <span>{current.label}</span>
          </button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Switch language"
          >
            <Globe className="h-5 w-5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {LANGUAGES.map(lang => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => i18n.changeLanguage(lang.code)}
            className={`flex items-center gap-2 cursor-pointer ${
              lang.code === i18n.language ? 'text-primary font-semibold' : ''
            }`}
          >
            <span className="text-xs font-mono w-6 shrink-0 text-muted-foreground">{lang.short}</span>
            {lang.label}
            {lang.code === i18n.language && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
