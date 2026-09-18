"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";

export default function DonateAddress({ address }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail in some contexts (e.g. insecure origin) —
      // the address text is still selectable/visible either way.
    }
  }

  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <div className="mx-auto mb-6 inline-block rounded-lg bg-white p-4">
        <QRCodeSVG value={address} size={180} />
      </div>

      <div className="mb-2 inline-block rounded-full bg-gold-500/10 px-3 py-1 text-xs font-bold tracking-wide text-gold-400">
        BNB SMART CHAIN (BEP-20)
      </div>

      <div className="mb-4 break-all rounded-md border border-ink-600 bg-ink-900 px-4 py-3 font-mono text-sm text-gray-200">
        {address}
      </div>

      <button onClick={handleCopy} className="btn-gold w-full">
        {copied ? "Copied!" : "Copy Address"}
      </button>

      <p className="mt-4 text-xs text-gray-500">
        Only send BNB or BEP-20 tokens on the BNB Smart Chain network to this address. Sending
        funds on the wrong network may result in permanent loss.
      </p>
    </div>
  );
}
