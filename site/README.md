# Jorqeth site

This directory is the Next.js judge-facing proof viewer for the source currently committed to GitHub.

It renders the committed evidence under `site/data/` and links the positive receipt, FCC signature compatibility details, and settlement failure matrix. The mirror is checked byte-for-byte against the root `evidence/` and `spec/` files in CI.

## Important status boundary

The source in this GitHub tree is a proof viewer over a **local Anvil chain (31337)** with synthetic records. It does not contain the newer interactive Coston2 settlement journey currently served by the Vercel production deployment. That deployment was created from a local CLI worktree whose source commit is not present on GitHub and must be reconciled separately.

Production Flare Confidential Compute attestation is not connected in either claim surface and must not be inferred from the compatibility proof.

## Run

```bash
npm ci
npm run typecheck
npm run build
npm run dev
```

No environment variables are required for this committed proof viewer.
