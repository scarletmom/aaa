import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" {...props}>
      {children}
    </svg>
  );
}

export const SearchIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const MoonIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </Svg>
);

export const SunIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const PlayIcon = (props: IconProps) => (
  <Svg size={18} {...props}>
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M10 8.5v7l6-3.5z" fill="currentColor" />
  </Svg>
);

export const PlaySolidIcon = (props: IconProps) => (
  <Svg size={14} {...props}>
    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
  </Svg>
);

export const ChevronIcon = (props: IconProps) => (
  <Svg size={18} {...props}>
    <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const LinkIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const CheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const MailIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="5" width="18" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M3.5 6l8.5 7 8.5-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </Svg>
);

export const PrintIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M7 9V3.5h10V9M7 17H4.5V9h15v8H17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <rect x="7" y="14" width="10" height="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </Svg>
);

export const ArrowDownIcon = (props: IconProps) => (
  <Svg size={14} {...props}>
    <path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CloseIcon = (props: IconProps) => (
  <Svg size={18} {...props}>
    <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);

export const EyeIcon = (props: IconProps) => (
  <Svg size={20} {...props}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </Svg>
);

export const EyeOffIcon = (props: IconProps) => (
  <Svg size={20} {...props}>
    <path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.6 6.9C4 8.6 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.5-1.2M9.9 9.9a3 3 0 0 0 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.5 3.5l17 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const KeyIcon = (props: IconProps) => (
  <Svg size={26} {...props}>
    <circle cx="15.5" cy="8.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M12.3 11.7L4 20M6.5 17.5l2 2M9 15l2 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="16.5" cy="7.5" r="1.2" fill="currentColor" />
  </Svg>
);

export const CopyIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </Svg>
);

export const WarningIcon = (props: IconProps) => (
  <Svg size={20} {...props}>
    <path d="M12 3.5L2.5 20h19z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M12 10v4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="17.2" r="1.1" fill="currentColor" />
  </Svg>
);


export const VolumeIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const MutedIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const ThumbUpIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M7 10v10H4.5A1.5 1.5 0 0 1 3 18.5v-7A1.5 1.5 0 0 1 4.5 10zM7 10l3.6-6.3A2.4 2.4 0 0 1 15 5v4h3.9a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.7 20H7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </Svg>
);

export const ImageIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="8.5" cy="9.5" r="1.7" fill="currentColor" />
    <path d="M3.5 17l5-5 4 4 2.5-2.5 5.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </Svg>
);

export const HomeIcon = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <Svg size={22} {...props}>
    <path
      d="M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </Svg>
);

export const CloudPlayIcon = (props: IconProps) => (
  <Svg size={22} {...props}>
    <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 9.5a4.5 4.5 0 0 1-.5 9z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M10.5 11.2v4.6l3.8-2.3z" fill="currentColor" />
  </Svg>
);

export const UserIcon = (props: IconProps) => (
  <Svg size={22} {...props}>
    <circle cx="12" cy="8.5" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M4.5 20c.9-3.6 3.9-5.6 7.5-5.6s6.6 2 7.5 5.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);
