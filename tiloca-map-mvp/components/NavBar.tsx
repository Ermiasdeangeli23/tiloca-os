"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function linkClass(pathname: string, href: string, muted = false): string {
  const active = href === "/" ? pathname === "/" || pathname === "/deliveries" : pathname.startsWith(href);
  if (muted) {
    return `font-mono text-[10px] uppercase tracking-[0.16em] transition ${
      active ? "text-white/65" : "text-white/32 hover:text-white/55"
    }`;
  }
  return `font-mono text-[11px] uppercase tracking-[0.16em] transition ${
    active ? "text-tiloca-green" : "text-white/55 hover:text-tiloca-green"
  }`;
}

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed left-0 right-0 top-0 z-[80] border-b border-white/10 bg-[#080f1a]/92 px-6 py-3 backdrop-blur-md">
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-display text-lg font-semibold tracking-tight text-white">Tiloca</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-tiloca-green/70">
            Territorial Console
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/" className={linkClass(pathname, "/")}>
            Delivery
          </Link>
          <Link href="/territories" className={linkClass(pathname, "/territories")}>
            Territori
          </Link>
          <Link href="/operations" className={linkClass(pathname, "/operations", true)}>
            Operations
          </Link>
        </div>
      </div>
    </nav>
  );
}
