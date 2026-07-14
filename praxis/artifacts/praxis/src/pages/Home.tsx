import React from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { BookOpen, GraduationCap, Building2, ChevronRight, Award } from 'lucide-react';

export function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="h-20 border-b border-border/50 bg-background/80 backdrop-blur-md fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground h-8 w-8 flex items-center justify-center rounded-sm font-serif font-bold text-lg">P</span>
            <span className="font-serif font-bold text-xl tracking-tight">Synops Praxis</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dev-login" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">Try Demo</Link>
            <Link href="/sign-in" className="text-sm font-medium hover:text-primary transition-colors">Sign In</Link>
            <Link href="/sign-up">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-20">
        {/* Hero Section */}
        <section className="py-24 md:py-32 px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center rounded-full border border-border bg-muted/50 px-3 py-1 text-sm font-medium text-muted-foreground">
              Enterprise Skills Development
            </div>
            <h1 className="text-5xl md:text-7xl font-serif font-bold tracking-tight text-foreground leading-[1.1]">
              Socratic learning for the modern workforce.
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed">
              Equip your organization with the reasoning skills required for mastery. A platform built for South African enterprise skills development.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Link href="/sign-up">
                <Button size="lg" className="w-full sm:w-auto text-base h-12 px-8">
                  Partner With Us
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/dev-login">
                <Button size="lg" variant="outline" className="w-full sm:w-auto text-base h-12 px-8">
                  Try Demo
                </Button>
              </Link>
            </div>
          </div>
          
          {/* Abstract Hero Visual */}
          <div className="relative aspect-square md:aspect-[4/3] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden flex items-center justify-center bg-gradient-to-br from-background to-muted/50">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background"></div>
            <div className="relative z-10 flex flex-col items-center space-y-6 text-center p-8">
              <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <GraduationCap className="h-10 w-10 text-primary-foreground" />
              </div>
              <div className="space-y-2">
                <h3 className="font-serif text-2xl font-semibold">Mastery Achieved</h3>
                <p className="text-sm text-muted-foreground max-w-xs">Earn the PraxisMark credential through guided Socratic dialogue.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 bg-card border-t border-border">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
              <h2 className="text-3xl md:text-4xl font-serif font-bold">Learning That Proves Itself</h2>
              <p className="text-muted-foreground text-lg">Not just content consumed — understanding demonstrated, and credentials that mean something.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="p-8 rounded-2xl border border-border bg-background shadow-sm space-y-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-serif font-bold">Socratic Dialogue</h3>
                <p className="text-muted-foreground leading-relaxed">Our AI tutor doesn't give answers. It asks probing questions, forcing learners to reason their way to mastery.</p>
              </div>
              
              <div className="p-8 rounded-2xl border border-border bg-background shadow-sm space-y-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Award className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-serif font-bold">Decaying Credentials</h3>
                <p className="text-muted-foreground leading-relaxed">The PraxisMark represents current competence. Skills decay over time, and our credentials reflect that reality.</p>
              </div>

              <div className="p-8 rounded-2xl border border-border bg-background shadow-sm space-y-4">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Building2 className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-serif font-bold">Enterprise-Ready</h3>
                <p className="text-muted-foreground leading-relaxed">Built for large organisations — multi-tenant, role-based, and designed to scale across divisions, cohorts, and partner networks.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t border-border bg-background">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-serif font-bold text-foreground">Synops Praxis</span>
            <span>&copy; {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
