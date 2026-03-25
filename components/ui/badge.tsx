import * as React from 'react';
import { cn } from '@/lib/utils';

const variantStyles: Record<string, string> = {
  collaborative: 'bg-green-500/20 text-green-400 border-green-500/30',
  tense: 'bg-red-500/20 text-red-400 border-red-500/30',
  undecided: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  mixed: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  default: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: string;
}

const Badge = ({ className, variant = 'default', children, ...props }: BadgeProps) => (
  <div
    className={cn(
      'inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold',
      variantStyles[variant] ?? variantStyles.default,
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export { Badge };
