import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getSiteUrl } from "@/lib/origin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripe();
    const site = getSiteUrl();

    const { customerId } = await req.json().catch(() => ({}));
    if (!customerId || typeof customerId !== "string") {
      return NextResponse.json({ error: "Missing customerId" }, { status: 400 });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${site}/dashboard`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Portal failed" }, { status: 500 });
  }
}
