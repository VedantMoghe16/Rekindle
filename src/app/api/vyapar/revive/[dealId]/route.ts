import { fail, ok } from "@/lib/api";
import { db } from "@/lib/db";
import { firstName } from "@/lib/vyapar/pitch";
import { rupees } from "@/lib/vyapar/taxonomy";
import { getSeller } from "@/lib/vyapar/server/context";
import { sendMessage } from "@/lib/vyapar/server/conversation";

/** Sends the revive message for a stalled objection, using what changed since the buyer said no. */
export async function POST(_request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const deal = await db.vyaparDeal.findUnique({ where: { id: dealId }, include: { merchant: true } });
  if (!deal) return fail("NOT_FOUND", "Deal not found.", 404);
  const seller = await getSeller();
  const name = firstName(deal.merchant.ownerName);
  const tier = seller.offers.tiers[0];
  const text = deal.objection === "CREDIT_TERMS"
    ? `Namaste ${name} ji 🙏 Aapne credit ke baare mein poocha tha. Ab ${seller.offers.credit.days} din ka credit Paytm Postpaid se mil jaayega, aapko abhi kuch pay nahi karna. Pehla order chhota rakhein?`
    : `Namaste ${name} ji 🙏 Aapne kaha tha ₹${seller.unitPriceInr} zyada hai. Diwali ke liye naya bulk rate aaya hai: ${tier.minQty.toLocaleString("en-IN")}+ pcs pe sirf ${rupees(tier.unitPriceInr)}. Free sample ke saath. Bhej doon?`;
  await sendMessage(dealId, text, { author: "Vyapar AI · revive", provider: "template" });
  await db.vyaparDeal.update({ where: { id: dealId }, data: { nextStep: "Revive offer sent" } });
  return ok({ dealId });
}
