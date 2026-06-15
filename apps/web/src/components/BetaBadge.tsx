export default function BetaBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className="inline-flex items-center rounded-full font-semibold"
      style={{
        background: 'rgba(245,158,11,0.15)',
        color: '#F59E0B',
        border: '0.5px solid rgba(245,158,11,0.3)',
        fontSize: size === 'sm' ? 10 : 12,
        padding: size === 'sm' ? '2px 8px' : '3px 10px',
        letterSpacing: '0.05em',
      }}
    >
      BETA
    </span>
  );
}
