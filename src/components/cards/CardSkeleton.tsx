import React from 'react';

interface CardSkeletonProps {
  size?: 'small' | 'medium' | 'large';
}

export const CardSkeleton: React.FC<CardSkeletonProps> = ({ size = 'medium' }) => {
  const heightClass =
    size === 'small' ? 'h-52 w-36' : size === 'large' ? 'h-80 w-56' : 'h-68 w-44';

  return (
    <div className={`relative flex flex-col rounded-xl overflow-hidden bg-[#1D1F26] shrink-0 animate-pulse ${heightClass}`}>
      <div className="w-full flex-1 bg-zinc-800/60" />
      <div className="p-2.5 space-y-1.5 bg-[#17181D]">
        <div className="h-3.5 bg-zinc-800 rounded w-4/5" />
        <div className="h-2.5 bg-zinc-800/60 rounded w-1/2" />
      </div>
    </div>
  );
};
