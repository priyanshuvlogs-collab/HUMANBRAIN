"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatLabel, platformLabel } from "@/lib/constants";
import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ROWS,
  checkHeaders,
  chunkRows,
  parseCsvText,
  validateCsvRow,
  type RowCheck,
} from "@/lib/csv";
import { describeMetrics, formatDate, truncate } from "@/lib/format";
import { importRows } from "./actions";

type Parsed = {
  fileName: string;
  headerErrors: string[];
  ignored: string[];
  checks: RowCheck[];
  records: Record<string, string>[];
  tooMany: boolean;
};

type Summary = { imported: number; duplicates: number; failed: { line: number; errors: string[] }[] };

const PREVIEW_ROWS = 20;

export default function ImportClient() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();

  async function onFile(file: File | undefined) {
    setParsed(null);
    setSummary(null);
    setImportError(null);
    setFileError(null);
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) return setFileError("That file is over 5 MB. Split it into smaller files.");
    try {
      const { headers, records } = parseCsvText(await file.text());
      const { errors, ignored } = checkHeaders(headers);
      const kept = records.slice(0, MAX_IMPORT_ROWS);
      setParsed({
        fileName: file.name,
        headerErrors: errors,
        ignored,
        records: kept,
        // Row 1 of the spreadsheet is the header, so data starts on row 2.
        checks: errors.length ? [] : kept.map((r, i) => validateCsvRow(r, i + 2)),
        tooMany: records.length > MAX_IMPORT_ROWS,
      });
    } catch {
      setFileError("Couldn't read that file. Save it as CSV (comma-separated) and try again.");
    }
  }

  function runImport() {
    if (!parsed) return;
    const rows = parsed.checks.flatMap((c, i) => (c.ok ? [{ line: c.line, data: parsed.records[i] }] : []));
    const batches = chunkRows(rows);
    setSummary(null);
    setImportError(null);
    setProgress({ done: 0, total: rows.length });
    startImport(async () => {
      const total: Summary = { imported: 0, duplicates: 0, failed: [] };
      let done = 0;
      let stopped = false;
      for (const batch of batches) {
        let result;
        try {
          result = await importRows(batch);
        } catch {
          result = { ok: false as const, error: "The connection dropped. Check your internet and try again." };
        }
        if (!result.ok) {
          setImportError(
            `${result.error}${total.imported ? ` ${total.imported} posts were already saved — importing the file again skips them.` : ""}`,
          );
          stopped = true;
          break;
        }
        total.imported += result.imported;
        total.duplicates += result.duplicates;
        total.failed.push(...result.failed);
        done += batch.length;
        setProgress({ done, total: rows.length });
      }
      // Nothing saved and it failed: stay on the preview so the user can just retry.
      if (!stopped || total.imported > 0) setSummary(total);
      setProgress(null);
    });
  }

  const ready = parsed?.checks.filter((c) => c.ok) ?? [];
  const bad = parsed?.checks.filter((c): c is Extract<RowCheck, { ok: false }> => !c.ok) ?? [];

  return (
    <div className="space-y-6">
      <section className="card space-y-3">
        <label htmlFor="csv-file" className="label">
          Choose a CSV file
        </label>
        <input
          id="csv-file"
          type="file"
          accept=".csv,text/csv"
          disabled={importing}
          onChange={(e) => onFile(e.target.files?.[0])}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-4 file:py-2 file:font-semibold file:text-violet-700 hover:file:bg-violet-100"
        />
        {fileError && (
          <p className="text-sm text-red-600" role="alert">
            {fileError}
          </p>
        )}
      </section>

      {parsed && parsed.headerErrors.length > 0 && (
        <section className="card space-y-2 border-red-200" role="alert">
          <p className="font-semibold text-red-700">This file can&apos;t be imported yet</p>
          <ul className="list-disc pl-5 text-sm text-red-700">
            {parsed.headerErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="text-sm text-zinc-600">
            Compare your header row with the{" "}
            <a href="/import/template" className="text-violet-700 underline">
              template
            </a>
            .
          </p>
        </section>
      )}

      {parsed && parsed.headerErrors.length === 0 && !summary && (
        <section className="space-y-4">
          <div className="card space-y-2">
            <p className="font-semibold">
              {parsed.fileName}: {ready.length} ready{bad.length > 0 && `, ${bad.length} with problems (they'll be skipped)`}
            </p>
            {parsed.tooMany && (
              <p className="text-sm text-amber-800">Only the first {MAX_IMPORT_ROWS.toLocaleString()} rows are used. Import the rest as a second file.</p>
            )}
            {parsed.ignored.length > 0 && (
              <p className="text-xs text-zinc-500">Ignored columns: {parsed.ignored.join(", ")}</p>
            )}
            <button className="btn-primary" disabled={importing || ready.length === 0} onClick={runImport}>
              {importing && progress
                ? `Importing… ${progress.done} of ${progress.total}`
                : `Import ${ready.length} post${ready.length === 1 ? "" : "s"}`}
            </button>
            {importError && (
              <p className="text-sm text-red-600" role="alert">
                {importError}
              </p>
            )}
          </div>

          {bad.length > 0 && (
            <div className="card space-y-2">
              <h2 className="font-semibold text-red-700">Rows with problems</h2>
              <ul className="divide-y divide-zinc-100 text-sm">
                {bad.slice(0, 100).map((c) => (
                  <li key={c.line} className="py-2">
                    <span className="font-semibold">Row {c.line}:</span> {c.errors.join(" ")}
                  </li>
                ))}
              </ul>
              {bad.length > 100 && <p className="text-xs text-zinc-500">…and {bad.length - 100} more.</p>}
            </div>
          )}

          {ready.length > 0 && (
            <div className="card space-y-2 overflow-hidden">
              <h2 className="font-semibold">Preview{ready.length > PREVIEW_ROWS && ` (first ${PREVIEW_ROWS})`}</h2>
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-zinc-200 text-xs text-zinc-500">
                    <tr>
                      <th className="px-4 py-2 font-medium sm:px-5">Row</th>
                      <th className="px-2 py-2 font-medium">Post</th>
                      <th className="px-2 py-2 font-medium">Goal</th>
                      <th className="px-2 py-2 font-medium">Posted</th>
                      <th className="px-2 py-2 font-medium">Numbers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 align-top">
                    {ready.slice(0, PREVIEW_ROWS).map((c) =>
                      c.ok ? (
                        <tr key={c.line}>
                          <td className="px-4 py-2 text-zinc-500 sm:px-5">{c.line}</td>
                          <td className="px-2 py-2">
                            <p className="font-medium">{truncate(c.row.hook, 80)}</p>
                            <p className="text-xs text-zinc-500">
                              {platformLabel(c.row.platform)} · {formatLabel(c.row.platform, c.row.format)}
                            </p>
                          </td>
                          <td className="px-2 py-2 capitalize">{c.row.goal}</td>
                          <td className="whitespace-nowrap px-2 py-2">{c.row.posted_at ? formatDate(c.row.posted_at) : "—"}</td>
                          <td className="px-2 py-2 text-xs text-zinc-600">{describeMetrics(c.row.metrics)}</td>
                        </tr>
                      ) : null,
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {summary && (
        <section className="card space-y-2" role="status">
          <p className="font-semibold text-emerald-700">
            Imported {summary.imported} post{summary.imported === 1 ? "" : "s"}.
          </p>
          {summary.duplicates > 0 && (
            <p className="text-sm text-zinc-600">Skipped {summary.duplicates} already imported (same platform, hook and date).</p>
          )}
          {summary.failed.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-red-700">
              {summary.failed.slice(0, 50).map((f) => (
                <li key={f.line}>
                  Row {f.line}: {f.errors.join(" ")}
                </li>
              ))}
            </ul>
          )}
          {importError && (
            <p className="text-sm text-red-600" role="alert">
              {importError}
            </p>
          )}
          <Link href="/posts" className="btn-primary">
            See your posts
          </Link>
        </section>
      )}
    </div>
  );
}
