import React, { useState } from 'react';
import { Check } from 'lucide-react';

interface FounderAvatarProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showVerified?: boolean;
  isOnline?: boolean;
}

const PORTRAIT_URL = '/src/assets/images/founder_space_portrait_1793205192263.jpg';

export const FounderAvatar: React.FC<FounderAvatarProps> = ({
  size = 'md',
  showVerified = true,
}) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = {
    sm: 'w-9 h-9',
    md: 'w-11 h-11',
    lg: 'w-14 h-14',
    xl: 'w-20 h-20',
  }[size];

  const badgeSizeClasses = {
    sm: 'w-3.5 h-3.5 -bottom-0.5 -right-0.5',
    md: 'w-4 h-4 -bottom-0.5 -right-0.5',
    lg: 'w-5 h-5 bottom-0 right-0',
    xl: 'w-6 h-6 bottom-0.5 right-0.5',
  }[size];

  return (
    <div className="relative inline-flex items-center justify-center shrink-0 select-none">
      <div
        className={`${sizeClasses} rounded-full p-[1.5px] bg-gradient-to-b from-[#FFFFFF] via-[#A1A1A6] to-[#52525B] shadow-[0_0_20px_rgba(161,161,166,0.35)] overflow-hidden`}
      >
        <div className="w-full h-full rounded-full overflow-hidden bg-[#0B1426] flex items-center justify-center">
          {!imgError ? (
            <img
              src={PORTRAIT_URL}
              alt="Elon Musk — Starbase Command"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#0B1426] to-[#0A0A0A] flex items-center justify-center text-white font-display font-bold text-xs tracking-wider">
              EM
            </div>
          )}
        </div>
      </div>

      {showVerified && (
        <span
          title="Verified Starbase Direct Line"
          className={`${badgeSizeClasses} absolute rounded-full bg-[#E31937] border border-[#FFFFFF] flex items-center justify-center text-white shadow-[0_0_8px_rgba(227,25,55,0.8)]`}
        >
          <Check className="w-2.5 h-2.5 stroke-[3]" />
        </span>
      )}
    </div>
  );
};
