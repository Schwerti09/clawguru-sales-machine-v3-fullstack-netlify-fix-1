import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessCookieName, sign } from "@/lib/access";

export const runtime = "nodejs";

function ttlSeconds(plan: "daypass" | "pro" | "team") {
  if (plan === "daypass") return 60 * 60 * 24;
  return 60 * 60 * 24 * 30;
}

export async function POST(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

    const row = await prisma.downloadToken.findUnique({
      where: { token },
      include: { purchase: true },
    });

    if (!row) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    if (row.usedAt) return NextResponse.json({ error: "Token already used" }, { status: 410 });
    if (row.expiresAt.getTime() < Date.now()) return NextResponse.json({ error: "Token expired" }, { status: 410 });

    const plan = row.purchase.plan as "daypass" | "pro" | "team";
    if (plan !== "daypass" && plan !== "pro" && plan !== "team") {
      return NextResponse.json({ error: "Invalid plan on purchase" }, { status: 400 });
    }

    // Mark token used
    await prisma.downloadToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    // Set access cookie
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds(plan);
    const signed = sign({ plan, exp });

    const res = NextResponse.json({ ok: true, plan });
    res.cookies.set(accessCookieName(), signed, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: true,
      maxAge: ttlSeconds(plan),
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Redeem failed" }, { status: 500 });
  }
}
