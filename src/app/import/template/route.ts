import { templateCsv } from "@/lib/csv";

export function GET() {
  return new Response(templateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="offer-brain-import-template.csv"',
    },
  });
}
