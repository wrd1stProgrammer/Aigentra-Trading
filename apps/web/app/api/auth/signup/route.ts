import { NextResponse } from "next/server";
import { z } from "zod";
import { createPasswordAccount, PasswordAuthApiError } from "@/lib/password-auth-api";

export const dynamic = "force-dynamic";

const signupPayloadSchema = z.object({
  name: z.string().trim().max(120).default(""),
  email: z.string().trim().email().max(240),
  password: z.string().min(8).max(200)
});

export async function POST(request: Request) {
  const body: unknown = await readJson(request);
  const parsed = signupPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_signup_payload" }, { status: 400 });
  }

  try {
    const account = await createPasswordAccount(parsed.data);
    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    if (error instanceof PasswordAuthApiError) {
      const status = [400, 409, 503, 504].includes(error.status) ? error.status : 502;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: "password_signup_failed" }, { status: 502 });
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
