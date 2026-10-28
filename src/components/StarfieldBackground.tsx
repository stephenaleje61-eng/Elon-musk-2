import React, { useMemo } from 'react';

export const StarfieldBackground: React.FC = () => {
  const stars = useMemo(() => {
    const generated = [];
    for (let i = 0; i < 85; i++) {
      // Deterministic pseudo-random layout so SSR/hydration or re-renders don't flicker
      const seed = (i * 9301 + 49297) % 233280;
      const x = ((seed / 233280) * 100).toFixed(2);
      const y = ((((seed * 7) % 233280) / 233280) * 100).toFixed(2);
      const size = (i % 3 === 0 ? 2 : 1.2);
      const delay = ((i % 9) * 0.45).toFixed(2);
      const duration = (3.2 + (i % 5) * 0.8).toFixed(2);
      generated.push({ id: i, x, y, size, delay, duration });
    }
    return generated;
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#0A0A0A]"
    >
      {/* Deep Space Blue orbital gradient */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(circle at 50% 18%, rgba(11, 20, 38, 0.92) 0%, rgba(10, 10, 10, 0.98) 65%, #0A0A0A 100%)',
        }}
      />

      {/* Subtle rocket launch horizon glow */}
      <div
        className="absolute -bottom-36 left-1/2 -translate-x-1/2 w-[900px] h-[340px] rounded-full blur-[120px] opacity-25"
        style={{
          background:
            'radial-gradient(ellipse at center, #E31937 0%, #0B1426 55%, transparent 80%)',
        }}
      />

      {/* Star field */}
      {stars.map((star) => (
        <span
          key={star.id}
          className="absolute rounded-full bg-white star-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
          }}
        />
      ))}
    </div>
  );
};
