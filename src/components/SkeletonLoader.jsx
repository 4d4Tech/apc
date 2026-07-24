import React from 'react';

export const SkeletonLoader = ({ type }) => {
  if (type === 'card') {
    return (
      <div className="glass-card animate-pulse">
        <div className="h-6 bg-slate-700/50 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-slate-700/50 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-slate-700/50 rounded w-1/4 mb-4"></div>
        <div className="flex gap-2">
           <div className="h-8 bg-slate-700/50 rounded w-20"></div>
           <div className="h-8 bg-slate-700/50 rounded w-20"></div>
        </div>
      </div>
    );
  }

  if (type === 'tableRow') {
    return (
      <tr className="animate-pulse">
        <td><div className="h-4 bg-slate-700/50 rounded w-24"></div></td>
        <td><div className="h-4 bg-slate-700/50 rounded w-20"></div></td>
        <td><div className="h-4 bg-slate-700/50 rounded w-16"></div></td>
        <td><div className="h-4 bg-slate-700/50 rounded w-16"></div></td>
        <td><div className="h-6 bg-slate-700/50 rounded-full w-20"></div></td>
        <td><div className="h-8 bg-slate-700/50 rounded w-24"></div></td>
      </tr>
    );
  }

  // Default block
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-slate-700/50 rounded w-full mb-2"></div>
    </div>
  );
};
