"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md text-center">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 text-sm text-zinc-600">Please try again. If it keeps happening, check that Supabase is running.</p>
      <button onClick={reset} className="btn-primary mt-4">
        Try again
      </button>
    </div>
  );
}
