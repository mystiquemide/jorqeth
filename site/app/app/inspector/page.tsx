import Link from "next/link";
import { usd, deployment, payout, ledger, jorqethSpec } from "@/lib/evidence";

// The authenticity boundary, in the order the contract checks it. Each step maps
// to a real reject vector from the negative proof, so the "what breaks it" column
// is grounded, not illustrative.
const BOUNDARY = [
  {
    n: "01",
    title: "Signed by a registered node",
    desc: "The result must carry a signature from a compute node in the on-chain TEE registry. An unknown key fails immediately.",
    breaks: "untrusted_signer",
  },
  {
    n: "02",
    title: "Bound to this chain and contract",
    desc: "The signed domain must match this chain id and this settlement contract. A result minted for anywhere else cannot pay here.",
    breaks: "wrong_domain_chain",
  },
  {
    n: "03",
    title: "Amount and recipient intact",
    desc: "The amount and creator are inside the signed payload. Change either after signing and verification breaks at the boundary.",
    breaks: "tampered_amount",
  },
  {
    n: "04",
    title: "Fresh and unspent",
    desc: "The result must be within its validity window and not already settled. Expired or replayed results are refused.",
    breaks: "replay",
  },
  {
    n: "05",
    title: "Payable code only",
    desc: "Only an eligible result pays. Ineligible pays zero and settles; an undecided or error result reverts and stays retryable.",
    breaks: "infrastructure_unknown",
  },
];

export default function Inspector() {
  const d = deployment();
  const { order } = payout();
  const rows = ledger();
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  const eip = (jorqethSpec as unknown as { eip712: { domainName: string; domainVersion: string } }).eip712;

  return (
    <>
      <div className="crumb">
        <Link href="/app">Dashboard</Link> <span>/</span> Proof inspector
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <div className="panel__title">The authenticity boundary</div>
            <div className="panel__sub">
              Every payout clears these checks in order. Each links to the real path that fails it.
            </div>
          </div>
          <span className="pill pill--paid"><span className="pd" />ELIGIBLE result passed all five</span>
        </div>

        <div className="steps-v">
          {BOUNDARY.map((b) => {
            const r = byLabel[b.breaks];
            return (
              <div className="step-v" key={b.n}>
                <div className="step-v__i">{b.n}</div>
                <div style={{ minWidth: 0 }}>
                  <div className="step-v__t">{b.title}</div>
                  <div className="step-v__d">{b.desc}</div>
                  {r && (
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className={`pill pill--${r.category}`}><span className="pd" />What breaks it: {r.title}</span>
                      <span className="t-err">{r.error}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>Signing domain</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Domain name</span><span className="kv__v">{eip.domainName}</span></div>
            <div className="kv__row"><span className="kv__k">Domain version</span><span className="kv__v">{eip.domainVersion}</span></div>
            <div className="kv__row"><span className="kv__k">Verifier mode</span><span className="kv__v">{d.verifierMode}</span></div>
            <div className="kv__row"><span className="kv__k">TEE registry</span><span className="kv__v mono">{d.teeRegistry}</span></div>
            <div className="kv__row"><span className="kv__k">TEE id</span><span className="kv__v mono">{d.teeId}</span></div>
            <div className="kv__row"><span className="kv__k">Extension id</span><span className="kv__v mono">{d.extensionId}</span></div>
          </div>
        </div>

        <div className="panel">
          <div className="panel__title" style={{ marginBottom: 16 }}>What the result carries</div>
          <div className="kv">
            <div className="kv__row"><span className="kv__k">Order digest</span><span className="kv__v mono">{order.orderDigest}</span></div>
            <div className="kv__row"><span className="kv__k">Eligibility</span><span className="kv__v">{order.eligibility}</span></div>
            <div className="kv__row"><span className="kv__k">Instruction id</span><span className="kv__v mono">{order.instructionId}</span></div>
            <div className="kv__row"><span className="kv__k">Settlement</span><span className="kv__v mono">{d.settlement}</span></div>
            <div className="kv__row"><span className="kv__k">FCC verifier</span><span className="kv__v mono">{d.fccVerifier}</span></div>
          </div>
          <div className="callout" style={{ marginTop: 16 }}>
            <b>No private data here.</b> The order reference is an opaque digest. No customer field,
            revenue figure, or key ever enters a result or event.
          </div>
        </div>
      </div>

      <div className="callout">
        <b>Honest status.</b> The verifier runs in {d.verifierMode}. The signature scheme is the real
        Flare one, proven byte-for-byte against the official sources. The remaining piece is a fully
        live production attestation round trip. See every guarded path on the{" "}
        <Link href="/app/activity" style={{ color: "var(--jade-deep)" }}>settlement matrix</Link>.
      </div>
    </>
  );
}
