export default function DisclaimerBox({ text }) {
  return (
    <div className="card border-ink-600 p-5 text-xs leading-relaxed text-gray-400">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">
        Risk Disclaimer
      </div>
      {text}
    </div>
  );
}
