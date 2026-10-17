import mark from '../assets/logo-mark.png'

/** Riveted badge with crossed sledgehammers: the Boilermakers' machine-shop roots. Gold on transparent. */
export default function Logo({ size = 40, className = '' }: { size?: number; className?: string }) {
  return <img className={`logo ${className}`} src={mark} width={size} height={size} alt="" draggable={false} />
}
