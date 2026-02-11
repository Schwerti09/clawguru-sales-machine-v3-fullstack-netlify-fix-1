import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/token";
import { getSiteUrl } from "@/lib/origin";
import { sendDownloadEmail } from "@/lib/email";

export const runtime = "nodejs";

const Schema = z.object({
  session_id: z.string().min(5)
});

export async function POST(req: NextRequest) {
  try {
    const { session_id } = Schema.parse(await req.json());
    const stripe = getStripe();
    const site = getSiteUrl();

    const session = await stripe.checkout.sessions.retrieve(session_id);

    const paid = session.payment_status === "paid" || session.status === "complete";
    if (!paid) return NextResponse.json({ error: "Payment not completed." }, { status: 403 });

    const plan = (session.metadata?.plan || "") as "daypass" | "pro" | "team";
    if (plan !== "daypass" && plan !== "pro" && plan !== "team") {
      return NextResponse.json({ error: "Invalid plan metadata on session." }, { status: 400 });
    }

    const email = session.customer_details?.email || session.customer_email || null;
    if (!email) return NextResponse.json({ error: "No customer email on session. Enable email collection in Stripe Checkout." }, { status: 400 });

    // Upsert purchase by session id
    const purchase = await prisma.purchase.upsert({
      where: { stripeSessionId: session.id },
      update: {
        email,
        plan,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
        status: "paid",
      },
      create: {
        stripeSessionId: session.id,
        email,
        plan,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : null,
        status: "paid",
      },
    });

    const token = randomToken();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3); // 3 days to redeem
    await prisma.downloadToken.create({
      data: {
        token,
        purchaseId: purchase.id,
        expiresAt,
      },
    });

    const redeemUrl = `${site}/dl/${token}`;

    await sendDownloadEmail({
      to: email,
      subject: "Your ClawGuru download link",
      html: `
        <div style="font-family:system-ui,Segoe UI,Roboto,Arial;line-height:1.5">
          <h2>Your secure download link</h2>
          <p>Click to activate access + open downloads:</p>
          <p><a href="${redeemUrl}">${redeemUrl}</a></p>
          <p style="color:#6b7280;font-size:13px">Link expires in 3 days. You can request a new link from the thank-you page.</p>
        </div>
      `,
      text: `Activate access + downloads: ${redeemUrl}`
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Fulfillment failed" }, { status: 500 });
  }
}
