"use client";

import ActionForm from "@/components/ActionForm";
import { CTA_TYPES, CTA_TYPE_KEYS } from "@/lib/constants";
import { deleteOffer, saveOffer } from "./actions";

export type OfferRow = {
  id: string;
  name: string;
  price: number | null;
  cta_type: string;
  cta_destination: string;
};

function OfferFields({ offer }: { offer?: OfferRow }) {
  const prefix = offer?.id ?? "new";
  return (
    <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_2fr]">
      <div>
        <label htmlFor={`${prefix}-name`} className="label">
          Name
        </label>
        <input id={`${prefix}-name`} name="name" required defaultValue={offer?.name} placeholder="e.g. Content Starter Kit" className="input" />
      </div>
      <div>
        <label htmlFor={`${prefix}-price`} className="label">
          Price ($)
        </label>
        <input id={`${prefix}-price`} name="price" inputMode="decimal" defaultValue={offer?.price ?? ""} placeholder="97" className="input" />
      </div>
      <div>
        <label htmlFor={`${prefix}-cta`} className="label">
          CTA type
        </label>
        <select id={`${prefix}-cta`} name="cta_type" defaultValue={offer?.cta_type ?? "dm_keyword"} className="input">
          {CTA_TYPE_KEYS.map((k) => (
            <option key={k} value={k}>
              {CTA_TYPES[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`${prefix}-dest`} className="label">
          CTA destination
        </label>
        <input
          id={`${prefix}-dest`}
          name="cta_destination"
          defaultValue={offer?.cta_destination}
          placeholder="keyword, link or booking URL"
          className="input"
        />
      </div>
    </div>
  );
}

export function OfferEditor({ offer }: { offer: OfferRow }) {
  return (
    <div className="card space-y-3">
      <ActionForm action={saveOffer}>
        {(pending) => (
          <div className="space-y-3">
            <input type="hidden" name="id" value={offer.id} />
            <OfferFields offer={offer} />
            <button className="btn-secondary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </ActionForm>
      <ActionForm action={deleteOffer}>
        {(pending) => (
          <>
            <input type="hidden" name="id" value={offer.id} />
            <button
              className="btn-danger"
              disabled={pending}
              onClick={(e) => {
                if (!confirm(`Delete "${offer.name}"? Past reviews keep working.`)) e.preventDefault();
              }}
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </>
        )}
      </ActionForm>
    </div>
  );
}

export function NewOfferForm() {
  return (
    <ActionForm action={saveOffer} resetOnSuccess className="card space-y-3">
      {(pending) => (
        <>
          <h2 className="font-semibold">Add an offer</h2>
          <OfferFields />
          <button className="btn-primary" disabled={pending}>
            {pending ? "Adding…" : "Add offer"}
          </button>
        </>
      )}
    </ActionForm>
  );
}
