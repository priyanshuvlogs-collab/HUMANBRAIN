import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <p className="font-semibold">Not found</p>
      <p className="mt-1 text-sm text-zinc-600">This page or review doesn&apos;t exist (or belongs to another account).</p>
      <Link href="/" className="btn-secondary mt-4">
        Back to reviews
      </Link>
    </div>
  );
}
