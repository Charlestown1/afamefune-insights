import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-mmuo flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="font-display text-6xl font-bold text-gray-700">404</div>
      <p className="mt-3 text-gray-400">This page could not be found.</p>
      <Link href="/" className="btn-gold mt-6">Back to Home</Link>
    </div>
  );
}
