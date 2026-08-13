import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { runSearch, searchRequestSchema } from "@/lib/search/search";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  try {
    const parsed = searchRequestSchema.parse(payload);
    const response = await runSearch(parsed);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid search",
          issues: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        { status: 422 },
      );
    }

    const message = error instanceof Error ? error.message : "Search failed";

    const status = message.toLowerCase().includes("could not find") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
