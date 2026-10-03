import { requireUser } from "@/lib/auth";
import { NewOfferForm, OfferEditor } from "./OfferForms";

export default async function OffersPage() {
  const { supabase, userId } = await requireUser();
  const { data: offers } = await supabase
    .from("offers")
    .select("id, name, price, cta_type, cta_destination")
    .eq("user_id", userId)
    .order("created_at");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Offers</h1>
        <p className="text-sm text-zinc-600">What your posts sell. Pick one when you start a review.</p>
      </div>
      {(offers ?? []).map((o) => (
        <OfferEditor key={o.id} offer={{ ...o, price: o.price === null ? null : Number(o.price) }} />
      ))}
      {offers?.length === 0 && <p className="text-sm text-zinc-500">No offers yet.</p>}
      <NewOfferForm />
    </div>
  );
}
