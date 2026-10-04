import Link from "next/link";
import { signOut } from "@/app/login/actions";

const LINKS = [
  { href: "/", label: "Reviews" },
  { href: "/reviews/new", label: "New review" },
  { href: "/posts", label: "Posts" },
  { href: "/import", label: "Import" },
  { href: "/settings/brand", label: "Brand" },
  { href: "/settings/offers", label: "Offers" },
  { href: "/settings/personas", label: "Personas" },
];

export default function Nav({ email }: { email: string | null }) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight text-violet-700">
          Offer Brain
        </Link>
        <nav className="order-last -mx-2 flex w-full flex-wrap gap-1 text-sm sm:order-none sm:mx-0 sm:w-auto sm:flex-1">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="shrink-0 rounded-md px-2 py-1.5 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <form action={signOut} className="ml-auto shrink-0 sm:ml-0">
          <button className="text-sm text-zinc-500 hover:text-zinc-900" title={email ?? undefined}>
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
