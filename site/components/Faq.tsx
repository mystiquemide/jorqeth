"use client";

import { useState } from "react";

const ITEMS = [
  {
    q: "What is Jorqeth?",
    a: "A commission-settlement prototype for creators and affiliates. The merchant funds escrow and fixes the rule, an evaluator derives the outcome from an agreed record, and the contract enforces the exact bound payout once.",
  },
  {
    q: "Do I have to trust the merchant?",
    a: "The merchant remains the agreed source of record, so Jorqeth does not prove universal attribution truth. Once the record source and rule are fixed, the settlement contract prevents a result bound to the wrong amount, chain, contract, rule, or creator from paying.",
  },
  {
    q: "Is customer data exposed?",
    a: "No raw customer, order, or revenue fields are sent on-chain. The Coston2 FCE proof sends an opaque order digest to an active TEE, which reads the private record inside the extension and returns only the minimal domain-bound payout result.",
  },
  {
    q: "What happens if a sale is refunded?",
    a: "A refunded sale is a valid evaluation that pays zero and is marked settled. An infrastructure-unknown result is different: settlement rejects it and leaves the digest retryable. Neither path can move commission value.",
  },
  {
    q: "Is this live money?",
    a: "No. Jorqeth is deployed on Coston2 and uses a test token with no cash value. The proof covers a live FCE instruction, an active simulated TEE ActionResult, and an on-chain payout. Hardware-backed production attestation and a real commerce connector remain separate deployment requirements.",
  },
  {
    q: "How is the amount calculated?",
    a: "A fixed-rate floor formula: the eligible net order amount times the agreed rate, rounded down. In the live Coston2 FCE proof that is floor(100.000000 times 20 percent) = exactly 20.000000 mUSD. The signed result, settlement event, payout, and escrow state all agree.",
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
