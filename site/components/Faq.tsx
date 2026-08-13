"use client";

import { useState } from "react";

const ITEMS = [
  {
    q: "What is Jorqeth?",
    a: "Jorqeth is a private commission settlement app built on Flare. It uses Flare Confidential Compute to privately check an agreed merchant record, calculate the exact creator or affiliate commission, and settle it on Coston2 without exposing the underlying ledger.",
  },
  {
    q: "Why does Jorqeth use Flare?",
    a: "Flare is part of the primary trust path. Coston2 hosts the escrow and settlement contracts, Flare Confidential Compute runs the private evaluation, and Jorqeth verifies the signed result against the active TEE set before value can move.",
  },
  {
    q: "Can I verify a real settlement?",
    a: "Yes. The live proof page links the hosted FCE instruction and the completed Coston2 settlement. The demonstrated run paid exactly 3 FTestXRP, left 5 FTestXRP in escrow, and rejected a second payout attempt for the same order.",
  },
  {
    q: "Do I have to trust the merchant?",
    a: "The merchant remains the agreed source of record, so Jorqeth does not prove universal attribution truth. Once the record source and rule are fixed, the settlement contract prevents a result bound to the wrong amount, chain, contract, rule, or creator from paying.",
  },
  {
    q: "Is customer data exposed?",
    a: "No raw customer, order, or revenue fields are sent on-chain. The FCE path uses an opaque order digest while the private merchant record remains inside the evaluation runtime. Only the minimum domain-bound payout result is returned for verification and settlement.",
  },
  {
    q: "What happens if a sale is refunded?",
    a: "A refunded sale is a valid evaluation that pays zero and is marked settled. If the system cannot obtain or verify a result, no payout is made and the escrow remains unchanged so the check can be retried.",
  },
  {
    q: "Is this live money?",
    a: "No. Jorqeth is deployed on Flare Testnet Coston2 and uses a test token with no cash value. The live proof covers a real FCE instruction, an active simulated-TEE result, on-chain verification, and a testnet payout. Hardware-backed production attestation and a real commerce connector remain production requirements.",
  },
  {
    q: "How is the amount calculated?",
    a: "A fixed-rate floor formula: the eligible net order amount times the agreed rate, rounded down. In the live Coston2 run, a 100-unit eligible amount at a 3 percent rule produced exactly 3 FTestXRP. The settlement left 5 FTestXRP in escrow.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="faq">
      {ITEMS.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className={`faq__item${isOpen ? " open" : ""}`}>
            <button
              className="faq__q"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span>{item.q}</span>
              <span className="faq__icon" aria-hidden="true" />
            </button>
            <div className="faq__a">
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
