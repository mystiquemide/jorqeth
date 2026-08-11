"use client";

import { useState } from "react";

const ITEMS = [
  {
    q: "What is Jorqeth?",
    a: "A way to settle creator and affiliate commissions privately and exactly. The merchant funds escrow and fixes the rule, a confidential step judges each sale against the agreed record, and the contract pays the exact commission on-chain. It settles what that agreed record shows.",
  },
  {
    q: "Do I have to trust the merchant?",
    a: "You both agree on the record source and the rule before anything runs. From there the payout is enforced by the contract, not by goodwill. The merchant can't quietly change the amount, and a result bound to the wrong chain, contract, or creator can't pay.",
  },
  {
    q: "Is my customers' data exposed?",
    a: "No. The confidential compute step returns only a minimal signed result and the exact amount. No customer field, revenue figure, or secret key appears in any result, event, or output. Order references are opaque digests. The only key in the repository is the public Anvil test account used to reproduce the signature scheme locally.",
  },
  {
    q: "What happens if a sale is refunded?",
    a: "A refunded sale is a valid evaluation that pays zero and is marked settled. It is treated differently from a case the system could not decide, which reverts and stays retryable. Neither one pays a commission.",
  },
  {
    q: "Is this live money?",
    a: "Not yet. It runs on a test network with a synthetic escrow token and synthetic records. The settlement invariant and the Flare signature scheme are real and proven. The one remaining piece is a live production attestation round trip, which is honestly labelled where it appears.",
  },
  {
    q: "How is the amount calculated?",
    a: "A fixed-rate floor formula: the eligible net order amount times the agreed rate, rounded down. In the proven run that is floor(200.000000 times 10 percent) = exactly 20.000000 mUSD. Five independent sources are checked to agree on that figure.",
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
