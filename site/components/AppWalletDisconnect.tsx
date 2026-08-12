"use client";

import { useEffect, useState } from "react";

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function getProvider() {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { ethereum?: WalletProvider }).ethereum;
}

export default function AppWalletDisconnect() {
  const [connected, setConnected] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const provider = getProvider();
    if (!provider) return;

    let active = true;

    const syncAccounts = async () => {
      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        if (active) setConnected(Boolean(accounts?.[0]));
      } catch {
        if (active) setConnected(false);
      }
    };

    const accountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[] | undefined;
      setConnected(Boolean(accounts?.[0]));
    };

    void syncAccounts();
    provider.on?.("accountsChanged", accountsChanged);

    const interval = window.setInterval(() => void syncAccounts(), 1_500);

    return () => {
      active = false;
      window.clearInterval(interval);
      provider.removeListener?.("accountsChanged", accountsChanged);
    };
  }, []);

  async function disconnectWallet() {
    const provider = getProvider();
    setDisconnecting(true);

    try {
      // MetaMask and some EIP-1193 wallets support revoking the site's account permission.
      // If a wallet does not support it, reloading still clears Jorqeth's in-memory session.
      await provider?.request({
        method: "wallet_revokePermissions",
        params: [{ eth_accounts: {} }],
      });
    } catch {
      // Wallet permission revocation is not universal. The local app session is still cleared below.
    } finally {
      setConnected(false);
      window.location.reload();
    }
  }

  if (!connected) return null;

  return (
    <button
      type="button"
      className="btn btn--tinted"
      onClick={disconnectWallet}
      disabled={disconnecting}
    >
      {disconnecting ? "Disconnecting…" : "Disconnect wallet"}
    </button>
  );
}
