import React from "react";
import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-background pt-24 pb-12 border-t border-border">
      <div className="max-w-[1200px] mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12 mb-20">
          <div className="col-span-1 md:col-span-2 pr-8">
            <Link href="/" className="flex items-center gap-3 mb-6 inline-flex">
              <div className="w-8 h-8 rounded-[4px] bg-primary flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 2L2 12L12 22L22 12L12 2Z" fill="white" />
                </svg>
              </div>
              <span className="font-sans text-[22px] tracking-tight text-foreground">
                <span className="font-bold">Synops</span> <span className="font-normal">Consulting</span>
              </span>
            </Link>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-sm">
              Operations, learning, and technology consulting, from strategy to build.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground mb-2">Practices</h3>
            <Link href="/healthcare" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Healthcare & Operations</Link>
            <Link href="/learning" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Learning, EdTech & AI</Link>
            <Link href="/platforms" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Platforms & Build</Link>
          </div>

          {/* Products: private beta. These link to the /products showcase (sampler +
              interest form), NOT to the apps. No /app/ or /study/ links here. */}
          <div className="flex flex-col gap-4">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground mb-2">Products</h3>
            <Link href="/products#teacher" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Synops Teacher</Link>
            <Link href="/products#coach" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Synops Coach</Link>
            <Link href="/products#builder" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Curriculum Builder</Link>
            <Link href="/products#register-interest" className="text-[15px] text-muted-foreground hover:text-accent transition-colors mt-2">Request access</Link>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-[13px] font-bold uppercase tracking-wider text-foreground mb-2">Company</h3>
            <Link href="/about" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">About</Link>
            <Link href="/insights" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Insights</Link>
            <Link href="/contact" className="text-[15px] text-muted-foreground hover:text-accent transition-colors">Contact</Link>
          </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border gap-6">
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-[14px] text-muted-foreground">
            <span>© Synops Consulting</span>
            <span className="hidden md:inline text-border">|</span>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
