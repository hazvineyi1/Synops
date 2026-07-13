import React from "react";
import { Link, useLocation } from "wouter";
import { Menu, X } from "lucide-react";

export function Nav() {
  const [isScrolled, setIsScrolled] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [location] = useLocation();

  React.useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/about", label: "About" },
    { href: "/healthcare", label: "Healthcare" },
    { href: "/learning", label: "Learning & AI" },
    { href: "/platforms", label: "Platforms" },
    { href: "/products", label: "Products" },
    { href: "/insights", label: "Insights" },
  ];

  return (
    <>
      <header
        className={`fixed top-0 left-0 w-full z-50 transition-colors duration-300 border-b ${
          isScrolled ? "bg-white border-[#E2E6E9]" : "bg-primary border-transparent"
        }`}
      >
        <div className="max-w-[1200px] mx-auto px-6 h-[88px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group z-50">
            <div className={`w-8 h-8 rounded-[4px] flex items-center justify-center transition-colors ${isScrolled ? 'bg-primary' : 'bg-white'}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 12L12 22L22 12L12 2Z" fill={isScrolled ? "white" : "currentColor"} className={isScrolled ? "" : "text-primary"} />
              </svg>
            </div>
            <span className={`font-sans text-[22px] tracking-tight ${isScrolled ? "text-foreground" : "text-white"}`}>
              <span className="font-bold">Synops</span> <span className="font-normal">Consulting</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-[15px] font-medium transition-colors hover:text-accent ${
                  location === link.href ? "text-accent" : (isScrolled ? "text-foreground" : "text-white/90")
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          
          <div className="hidden md:flex items-center gap-6">
            {/* "Start free trial" (Synops Teacher signup) hidden for now. Product
                not yet publicly launched. Restore when ready. */}
            <Link
              href="/contact" 
              className={`text-[14px] font-bold px-5 py-2.5 rounded-[6px] transition-colors ${
                isScrolled ? "bg-primary text-white hover:bg-primary/90" : "bg-accent text-white hover:bg-accent/90"
              }`}
            >
              Book a consultation
            </Link>
          </div>

          <button
            className={`md:hidden p-2 z-50 ${isScrolled || mobileMenuOpen ? "text-foreground" : "text-white"}`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close Menu" : "Open Menu"}
          >
            {mobileMenuOpen ? <X strokeWidth={1.5} size={28} /> : <Menu strokeWidth={1.5} size={28} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-white flex flex-col pt-[88px]">
          <div className="flex-1 flex flex-col p-6 gap-6">
            <div className="flex flex-col gap-4 border-b border-border pb-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="font-sans text-2xl font-semibold text-foreground hover:text-accent transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-4 pt-4">
              <Link 
                href="/contact" 
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center text-[16px] font-bold px-5 py-4 rounded-[6px] bg-primary text-white"
              >
                Book a consultation
              </Link>
              {/* "Start free trial" (Synops Teacher signup) hidden for now. Product
                  not yet publicly launched. Restore when ready. */}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
