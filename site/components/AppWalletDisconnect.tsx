"use client";

import { useEffect, useState } from "react";
import { coston2 } from "@/lib/jorqeth";

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
  const [busy, setBusy] = useState<"connect" | "disconnect">();
  const [connectFailed, setConnectFailed] = useState(false);

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

  async function connectWallet() {
    const provider = getProvider();
    setConnectFailed(false);

    if (!provider) {
      setConnectFailed(true);
      return;
    }

    setBusy("connect");
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.[0]) throw new Error("No wallet account returned.");

      const current = Number.parseInt(
        (await provider.request({ method: "eth_chainId" })) as string,
        16,
      );

      if (current !== coston2.id) {
        try {
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x72" }],
          });
        } catch {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x72",
                chainName: coston2.name,
                nativeCurrency: coston2.nativeCurrency,
                rpcUrls: coston2.rpcUrls.default.http,
                blockExplorerUrls: [coston2.blockExplorers.default.url],
              },
            ],
          });
        }
      }

      setConnected(true);
    } catch {
      setConnected(false);
      setConnectFailed(true);
    } finally {
      setBusy(undefined);
    }
  }

  async function disconnectWallet() {
    const provider = getProvider();
    setBusy("disconnect");

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

  if (!connected) {
    return (
      <button
        type="button"
        className="btn btn--primary"
        onClick={connectWallet}
        disabled={busy === "connect"}
        title={connectFailed ? "Open an EVM wallet such as MetaMask and try again." : undefined}
      >
        {busy === "connect" ? "Connecting…" : connectFailed ? "Try connect again" : "Connect wallet"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="btn btn--tinted"
      onClick={disconnectWallet}
      disabled={busy === "disconnect"}
    >
      {busy === "disconnect" ? "Disconnecting…" : "Disconnect wallet"}
    </button>
  );
}
