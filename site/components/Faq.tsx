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
    a: "The committed proof uses synthetic merchant records and puts no raw customer or revenue fields on-chain. The target Flare Confidential Compute flow is designed to evaluate real private records inside a TEE and return only a minimal result, but that production FCC round trip is not connected in this repository yet.",
  },
  {
    q: "What happens if a sale is refunded?",
    a: "A refunded sale is a valid evaluation that pays zero and is marked settled. An infrastructure-unknown result is different: settlement rejects it and leaves the digest retryable. Neither path can move commission value.",
  },
  {
    q: "Is this live money?",
    a: "No. The proof committed in this GitHub tree runs on a local Anvil chain with a synthetic mUSD token and synthetic records. The current Vercel production UI has a separate Coston2 testnet flow, but its source commit is not present on GitHub and production FCC attestation is not connected.",
  },
  {
    q: "How is the amount calculated?",
    a: "A fixed-rate floor formula: the eligible net order amount times the agreed rate, rounded down. In the committed proof that is floor(200.000000 times 10 percent) = exactly 20.000000 mUSD, with five evidence sources checked for agreement.",
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
