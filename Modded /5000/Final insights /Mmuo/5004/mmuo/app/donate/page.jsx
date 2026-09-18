import { getSiteSettings } from "@/lib/getSettings";
import DonateAddress from "@/components/public/DonateAddress";

export const metadata = {
  title: "Support MMUO — BNB Donations",
  description: "Support MMUO's independent market research with a BNB donation."
};

export default async function DonatePage() {
  const settings = await getSiteSettings();

  return (
    <div className="container-mmuo max-w-2xl py-14 text-center">
      <h1 className="section-title mb-3">Support MMUO</h1>
      <p className="mx-auto mb-10 max-w-lg text-sm text-gray-400">{settings.donationBlurb}</p>

      <DonateAddress address={settings.bnbDonationAddress} />

      <p className="mx-auto mt-8 max-w-md text-xs text-gray-600">
        This is a simple donation address display — MMUO does not generate payment confirmations
        or receipts. Donations are voluntary support for our research and are not payment for any
        product, subscription, or guaranteed service.
      </p>
    </div>
  );
}
