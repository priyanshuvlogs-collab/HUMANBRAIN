import ImportClient from "./ImportClient";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import past posts</h1>
        <p className="text-sm text-zinc-600">
          Bring in posts you&apos;ve already published, with their real numbers. They fill your proof library, so reviews can
          compare new posts with what actually worked for you.
        </p>
      </div>

      <section className="card space-y-2 text-sm text-zinc-700">
        <p>
          <a href="/import/template" className="font-semibold text-violet-700 underline">
            Download the CSV template
          </a>{" "}
          and fill one row per post (Google Sheets or Excel → File → Download/Save as → CSV).
        </p>
        <ul className="list-disc space-y-1 pl-5 text-zinc-600">
          <li>
            Needed: <strong>platform</strong> (instagram, tiktok, youtube), <strong>goal</strong> (views, engagement, leads,
            sales), <strong>hook</strong> (or a caption — its first line is used), and at least one number.
          </li>
          <li>Format is optional: blank means reel / video / short.</li>
          <li>
            Dates: use YYYY-MM-DD, e.g. 2026-09-14. A date like 09/01/2026 is read as month/day (Sep 1). Check the preview.
          </li>
          <li>Numbers can include commas or % signs. Leave a cell blank if you don&apos;t have it.</li>
          <li>Importing the same file twice is safe — posts already imported are skipped.</li>
        </ul>
      </section>

      <ImportClient />
    </div>
  );
}
