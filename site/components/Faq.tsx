"use client";

import { useState } from "react";

const ITEMS = [
  {
    q: "What is Jorqeth?",
    a: "Jorqeth is a private commission settlement app built on Flare. It uses Flare Confidential Compute to evaluate an agreed private merchant record, returns a signed TEE result, and settles the exact creator or affiliate commission on Coston2 without exposing the underlying ledger.",
  },
  {
    q: "Why does Jorqeth use Flare?",
    a: "Flare is the trust layer for the primary settlement path. Coston2 hosts the escrow and settlement contracts, Flare FCE routes the evaluation to a registered TEE, and Jorqeth verifies the resulting Flare ActionResult against the active TEE set before value can move.",
  },
  {
    q: "Do I have to trust the merchant?",
    a: "The merchant remains the agreed source of record, so Jorqeth does not prove universal attribution truth. Once the record source and rule are fixed, the settlement contract prevents a result bound to the wrong amount, chain, contract, rule, or creator from paying.",
  },
  {
    q: "Is customer data exposed?",
    a: "No raw customer, order, or revenue fields are sent on-chain. The Coston2 FCE path uses an opaque order digest while the private merchant record remains inside the extension runtime. Only the minimal domain-bound payout result is returned for verification and settlement.",
  },
  {
    q: "What happens if a sale is refunded?",
    a: "A refunded sale is a valid evaluation that pays zero and is marked settled. An infrastructure-unknown result is different: settlement rejects it and leaves the digest retryable. Neither path can move commission value.",
  },
  {
    q: "Is this live money?",
    a: "No. Jorqeth is deployed on Flare Testnet Coston2 and uses a test token with no cash value. The proof covers a live FCE instruction, an active simulated TEE ActionResult, and an on-chain payout. Hardware-backed production attestation and a real commerce connector remain production requirements.",
  },
  {
    q: "How is the amount calculated?",
    a: "A fixed-rate floor formula: the eligible net order amount times the agreed rate, rounded down. In the committed Coston2 FCE proof that is floor(100.000000 times 20 percent) = exactly 20.000000 mUSD. The signed Flare ActionResult, settlement event, payout, and escrow state all agree.",
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
