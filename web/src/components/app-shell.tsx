import { Github, Lightbulb, Menu, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

import { appConfig } from "../lib/config";
import { cn } from "../lib/utils";
import { BrandMark } from "./brand-mark";
import { Button } from "./ui/button";
import { WalletButton } from "./wallet-button";

const nav = [
  ["Explore", "/"],
  ["Create", "/create"],
  ["Portfolio", "/me"],
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lightMode, setLightMode] = useState(() => localStorage.getItem("color-mode") === "light");

  useEffect(() => {
    document.documentElement.dataset.theme = lightMode ? "light" : "dark";
    localStorage.setItem("color-mode", lightMode ? "light" : "dark");
  }, [lightMode]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link to="/" className="brand" aria-label={`${appConfig.name} home`}>
          <BrandMark />
          <span>{appConfig.name}</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {nav.map(([label, href]) => (
            <NavLink key={href} to={href} className={({ isActive }) => cn("nav-link", isActive && "active")}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <Button className="theme-toggle" variant="square" aria-label={`Switch to ${lightMode ? "dark" : "light"} mode`} aria-pressed={lightMode} onClick={() => setLightMode((value) => !value)}>
            <Lightbulb size={17} fill={lightMode ? "currentColor" : "none"} />
          </Button>
          <WalletButton compact />
          <Button className="mobile-menu" variant="square" aria-label="Toggle menu" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </Button>
        </div>
      </header>
      {mobileOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.map(([label, href]) => (
            <NavLink key={href} to={href} onClick={() => setMobileOpen(false)}>
              {label}
            </NavLink>
          ))}
        </nav>
      )}
      <main>{children}</main>
      <footer className="site-footer">
        <div className="footer-columns">
          <section className="footer-about">
            <div className="brand footer-brand"><BrandMark /> {appConfig.name}</div>
            <p>Launch and explore fixed-supply tokens on Robinhood Chain, quoted in any priceable asset. Your wallet submits every transaction. We do not custody assets.</p>
          </section>
          <nav className="footer-nav" aria-label="Footer navigation">
            <span>Product</span>
            <Link to="/">Explore</Link>
            <Link to="/create">Create</Link>
            <Link to="/me">Portfolio</Link>
            <Link to="/docs">Docs</Link>
          </nav>
          <section className="footer-risk">
            <span>Risk notice</span>
            <p>Transactions are submitted through your wallet and may be irreversible. Tokens can be volatile or lose all value. This interface does not provide custody, warranties, or financial advice.</p>
          </section>
        </div>
        <div className="footer-bottom">
          <span>© 2026 {appConfig.name}</span>
          <div>
            <span>Built on Robinhood Chain</span>
            <span>Uniswap V4</span>
            <span>Non-custodial</span>
            <span className="footer-socials" aria-label="Social links">
              <a className="footer-social-placeholder" href={appConfig.xUrl} target="_blank" rel="noreferrer" aria-label="Pakt on X">X</a>
              <a className="footer-social-placeholder" href={appConfig.githubUrl} target="_blank" rel="noreferrer" aria-label="Pakt on GitHub"><Github size={14} /></a>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
