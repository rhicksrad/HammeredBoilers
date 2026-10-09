/** Hex-nut badge: a nod to the Boilermakers' machine-shop roots. */
export default function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <polygon points="32,2 58,17 58,47 32,62 6,47 6,17" fill="var(--gold)" />
      <polygon points="32,8 53,20 53,44 32,56 11,44 11,20" fill="var(--ink)" />
      <g fill="var(--gold)">
        <circle cx="32" cy="12.5" r="1.6" /><circle cx="49" cy="22" r="1.6" /><circle cx="49" cy="42" r="1.6" />
        <circle cx="32" cy="51.5" r="1.6" /><circle cx="15" cy="42" r="1.6" /><circle cx="15" cy="22" r="1.6" />
      </g>
      <text x="32" y="40.5" textAnchor="middle" fontFamily="'Barlow Condensed', 'Arial Narrow', sans-serif"
        fontWeight="800" fontSize="22" letterSpacing="-0.5" fill="var(--gold)">HB</text>
    </svg>
  )
}
