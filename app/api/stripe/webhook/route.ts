import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { randomToken } from "@/lib/token";
import { getSiteUrl } from "@/lib/origin";
import { sendDownloadEmail } from "@/lib/email";

export const runtime = "nodejs";

async function fulfillFromSession(session: Stripe.Checkout.Session) {
  const site = getSiteUrl();
  const plan = (session.metadata?.plan || "") as "daypass" | "pro" | "team";
  if (plan !== "daypass" && plan !== "pro" && plan !== "team") return;

  const email = session.customer_details?.email || session.customer_email || null;
  if (!email) return;

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
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);
  await prisma.downloadToken.create({
    data: { token, purchaseId: purchase.id, expiresAt },
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
        <p style="color:#6b7280;font-size:13px">Link expires in 3 days. Save this email.</p>
      </div>
    `,
    text: `Activate access + downloads: ${redeemUrl}`
  });
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 400 });
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature verification failed: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Only fulfill paid sessions
    const paid = session.payment_status === "paid" || session.status === "complete";
    if (paid) {
      try {
        await fulfillFromSession(session);
      } catch (e) {
        // swallow errors to avoid webhook retries storm; in production log to Sentry
      }
    }
  }

  return NextResponse.json({ received: true });
}
