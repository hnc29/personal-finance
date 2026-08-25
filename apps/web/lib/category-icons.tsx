"use client";

/**
 * Local inline-SVG category icon system (TASK-031 §3).
 *
 * No icon dependency is added -- every glyph below is composed from plain
 * SVG primitives so it stays crisp at the small sizes used in the category
 * tree and picker rows. Icon identity is keyed by the *canonical* (English,
 * default-category) name, never by the localized display text, so the same
 * icon shows in both languages.
 */

import type { SVGProps } from "react";
import type { Language } from "./i18n";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

const Wallet = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <circle cx="16.5" cy="14" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);
const MinusCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </Svg>
);
const PlusCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
);
const Utensils = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18M16 3c-1.5 0-2.5 1.5-2.5 4v4h5" />
    <path d="M16.5 11V21" />
  </Svg>
);
const Coffee = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z" />
    <path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17" />
    <path d="M8 3c-.5 1 .5 1.5 0 3M12 3c-.5 1 .5 1.5 0 3" />
  </Svg>
);
const Basket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10h16l-1.5 9a2 2 0 0 1-2 1.7H7.5a2 2 0 0 1-2-1.7L4 10Z" />
    <path d="M8 10 10 4M16 10 14 4M9 14v4M15 14v4" />
  </Svg>
);
const Receipt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3h12v18l-2.5-1.5L13 21l-1.5-1.5L10 21l-2.5-1.5L5 21V3Z" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </Svg>
);
const Bolt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Svg>
);
const Droplet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
  </Svg>
);
const Wifi = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9c5-4 13-4 18 0M6.5 12.5c3.5-2.8 7.5-2.8 11 0M10 16c1.2-1 2.8-1 4 0" />
    <circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none" />
  </Svg>
);
const Phone = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  </Svg>
);
const Home = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 9.5V20h12V9.5" />
    <path d="M10 20v-6h4v6" />
  </Svg>
);
const Fuel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 21V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15" />
    <path d="M4 21h10M14 9h2.2L19 11.5V18a1.5 1.5 0 0 1-3 0v-3h-2" />
    <path d="M6 6h6" />
  </Svg>
);
const Car = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 16V12l2-5h12l2 5v4" />
    <path d="M4 16h16M6 16v2M18 16v2" />
    <circle cx="7.5" cy="16" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="16" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);
const Bus = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="13" rx="2" />
    <path d="M4 11h16M8 4v13M16 4v13" />
    <circle cx="7.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="19" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);
const Parking = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
  </Svg>
);
const Wrench = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6Z" />
  </Svg>
);
const ShoppingBag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 8h12l-1 12H7L6 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Svg>
);
const Shirt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3-1.5 1.5h-3L8 4Z" />
  </Svg>
);
const Monitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </Svg>
);
const Box = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
    <path d="M3 8l9 5 9-5M12 13v8" />
  </Svg>
);
const Users = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17.5" cy="9" r="2.3" />
    <path d="M15.5 14.2c2.6.3 4.5 2.6 4.5 5.3" />
  </Svg>
);
const Baby = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="7" r="4" />
    <path d="M9 8.5c1 1 5 1 6 0" />
    <path d="M5 21c0-4.5 3-8 7-8s7 3.5 7 8" />
  </Svg>
);
const Paw = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="9" r="1.6" />
    <circle cx="12" cy="6.5" r="1.6" />
    <circle cx="17" cy="9" r="1.6" />
    <path d="M12 12c-3.5 0-6 2.4-6 5a3 3 0 0 0 6 0 3 3 0 0 0 6 0c0-2.6-2.5-5-6-5Z" />
  </Svg>
);
const Heart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20 4.5 12.7a5 5 0 0 1 7-7L12 6l.5-.3a5 5 0 0 1 7 7L12 20Z" />
  </Svg>
);
const Activity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h4l2 7 4-14 2 7h6" />
  </Svg>
);
const Pill = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" />
    <path d="M9 9.5 15 15.5" />
  </Svg>
);
const Play = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7l6-3.5-6-3.5Z" fill="currentColor" stroke="none" />
  </Svg>
);
const Gamepad = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="8" width="18" height="9" rx="4" />
    <path d="M7 11v3M5.5 12.5h3" />
    <circle cx="16" cy="11.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="18" cy="13.5" r="1" fill="currentColor" stroke="none" />
  </Svg>
);
const Book = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z" />
    <path d="M4 5.5v16" />
  </Svg>
);
const Plane = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13.5 21 6l-7.5 18-2-7.5L3 13.5Z" />
  </Svg>
);
const Luggage = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="7" width="14" height="14" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 11v6M15 11v6" />
  </Svg>
);
const Gift = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="9" width="18" height="4" />
    <rect x="5" y="13" width="14" height="8" />
    <path d="M12 9v12M12 9C10 5 6.5 5 6 7c-.4 1.6 1.7 2 6 2ZM12 9c2-4 5.5-4 6-2 .4 1.6-1.7 2-6 2Z" />
  </Svg>
);
const Shield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7 3v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9V6l7-3Z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);
const Percent = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19 19 5" />
    <circle cx="7" cy="7" r="2.3" />
    <circle cx="17" cy="17" r="2.3" />
  </Svg>
);
const Briefcase = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18" />
  </Svg>
);
const TrendingUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17 9 11l4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);
const Refund = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9a8 8 0 1 1 1.5 6.5" />
    <path d="M4 4v5h5" />
  </Svg>
);
const Grid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
);

// --- TASK-036: broader icon library for user-customizable category icons ---
// The icons above were each written to match one specific default category.
// The picker below needs many more *options* than there are default
// categories, so a category can be assigned any icon regardless of name.
const Calendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </Svg>
);
const Camera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="14" r="3.5" />
  </Svg>
);
const Music = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V5l11-2v13" />
    <circle cx="7" cy="18" r="2.3" />
    <circle cx="18" cy="16" r="2.3" />
  </Svg>
);
const Cake = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="11" width="16" height="9" rx="1" />
    <path d="M4 15h16M8 11V7M12 11V7M16 11V7" />
    <circle cx="8" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="16" cy="6" r="1" fill="currentColor" stroke="none" />
  </Svg>
);
const Cart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h2l2.4 12.4a2 2 0 0 0 2 1.6h7.2a2 2 0 0 0 2-1.6L21 8H6" />
    <circle cx="9" cy="20" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="17" cy="20" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
);
const Umbrella = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 0 1 18 0Z" />
    <path d="M12 12v7a2 2 0 0 1-4 0M12 3v1" />
  </Svg>
);
const Bed = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 19v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 19h18M5 12V7a2 2 0 0 1 2-2h3v5" />
    <path d="M13 10h4a2 2 0 0 1 2 2" />
  </Svg>
);
const Ball = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v18M3 12h18M5.5 5.5c3 3 3 10 0 13M18.5 5.5c-3 3-3 10 0 13" />
  </Svg>
);
const Beer = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9h9v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9Z" />
    <path d="M15 10h2a2 2 0 0 1 0 4h-2" />
    <path d="M8 9c0-2-1-2.5-1-4a2 2 0 0 1 4 0c0 1 .8 1 .8 2.3" />
  </Svg>
);
const Popcorn = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 9c-1-3 1.5-5 2.5-3 .5-2.5 3.5-2.5 3.5 0 1.5-2 3.5 0 2.5 3Z" />
    <path d="M7 9h10l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H9.7a1.5 1.5 0 0 1-1.5-1.3L7 9Z" />
  </Svg>
);
const Palette = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-1 2-2 0-.6-.3-1-.6-1.4-.3-.4-.4-.6-.4-1 0-1 1-1.5 2-1.5h1.5A4.5 4.5 0 0 0 21 12 9 9 0 0 0 12 3Z" />
    <circle cx="8" cy="10" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="16" cy="10" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
);
const Trophy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
    <path d="M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4" />
    <path d="M10 15h4v3h-4Z" />
    <path d="M8 21h8l-1-3H9Z" />
  </Svg>
);
const BarChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V10M10 20V4M16 20v-7M2 20h20" />
  </Svg>
);
const CreditCard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
    <rect x="5" y="14" width="6" height="2" fill="currentColor" stroke="none" />
  </Svg>
);
const Ticket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V8Z" />
    <path d="M14 6v12" />
  </Svg>
);
const Globe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
  </Svg>
);
const GraduationCap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 9 12 4l10 5-10 5L2 9Z" />
    <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M21 9v6" />
  </Svg>
);
const Cocktail = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4h16l-8 9v6M8 19h8M6.5 7h11" />
  </Svg>
);
const Tag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12 12.6 19.4a2 2 0 0 1-2.8 0L3.6 13.2a2 2 0 0 1 0-2.8L11 3h9v9Z" />
    <circle cx="15" cy="8" r="1.5" fill="currentColor" stroke="none" />
  </Svg>
);
const Envelope = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Svg>
);
const MoneyBag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 6h6l2.5 4c1.5 2.5 1.5 6-1 8.5-1.5 1.5-3.5 1.5-4.5 1.5s-3 0-4.5-1.5c-2.5-2.5-2.5-6-1-8.5L9 6Z" />
    <path d="M12 10v5" />
    <circle cx="12" cy="6" r="1.5" />
  </Svg>
);
const PiggyBank = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a6 6 0 0 1 6-6h5a5 5 0 0 1 5 5v1l2 1-2 1v1a2 2 0 0 1-2 2h-1v2h-3v-2H9v2H6v-2.5A5.5 5.5 0 0 1 4 12Z" />
    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
    <path d="M4 12H2" />
  </Svg>
);
const Truck = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="8" width="11" height="8" />
    <path d="M13 11h4l3 3v2h-3" />
    <circle cx="7" cy="18" r="1.6" />
    <circle cx="17" cy="18" r="1.6" />
  </Svg>
);
const Speaker = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <circle cx="12" cy="8" r="2.3" />
    <circle cx="12" cy="15" r="3.3" />
  </Svg>
);
const Swim = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 17c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" />
    <path d="M3 20c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0" />
    <circle cx="8" cy="7" r="2" />
    <path d="M11 12 6 9l-3 2.5" />
  </Svg>
);
const ChatBubble = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 4Z" />
  </Svg>
);
const Plant = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21v-9" />
    <path d="M12 12C8 12 5 9 5 5c4 0 7 3 7 7ZM12 12c4 0 7-3 7-7-4 0-7 3-7 7Z" />
    <rect x="7" y="18" width="10" height="3" rx="1" />
  </Svg>
);
const Dog = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="6" />
    <path d="M7 9 4 5M17 9l3-4" />
    <circle cx="9.5" cy="12.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="12.5" r="1" fill="currentColor" stroke="none" />
    <path d="M10 16c.7.7 3.3.7 4 0" />
  </Svg>
);
const Flag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4" />
    <path d="M5 4h13l-3 4 3 4H5" />
  </Svg>
);
const Folder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
  </Svg>
);
const Notebook = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 3v18M13 8h4M13 12h4M13 16h4" />
  </Svg>
);
const Windmill = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <path d="M12 12 6 7c-2-1-4 1-3 3l5 3M12 12l6-5c2-1 4 1 3 3l-5 3M12 12l5 6c1 2-1 4-3 3l-3-5M12 12l-6 4c-2 1-4-1-3-3l4-4" />
    <path d="M12 21v-4" />
  </Svg>
);
const Apple = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 8c-3 0-5 2.5-5 6 0 4 2.5 7 4.3 7 1 0 1.4-.6 2.2-.6.8 0 1.2.6 2.2.6 1.8 0 4.3-3 4.3-7 0-3.5-2-6-5-6-1 0-1.7.4-2.5.9-.3-.2.5-.6-.5-.9Z" />
    <path d="M12 8c0-2 1-3.5 2.5-4 .3 2-.8 3.6-2.5 4Z" />
  </Svg>
);
const Piano = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1" />
    <path d="M7 5v9M11 5v9M15 5v9M19 5v9M3 14h18" />
  </Svg>
);
const Microphone = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
  </Svg>
);
const Cat = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 10 3 4l5 3h8l5-3-2 6" />
    <path d="M5 10a7 7 0 0 0 14 0" />
    <circle cx="9" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="0.8" fill="currentColor" stroke="none" />
    <path d="M10 15c.7.6 3.3.6 4 0" />
  </Svg>
);

/** Canonical (English default-category) name -> icon renderer. */
const ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  Expenses: MinusCircle,
  Income: PlusCircle,
  "Food & Drinks": Utensils,
  Groceries: Basket,
  "Eating Out": Utensils,
  "Coffee & Drinks": Coffee,
  "Bills & Utilities": Receipt,
  Electricity: Bolt,
  Water: Droplet,
  Internet: Wifi,
  "Mobile Phone": Phone,
  Rent: Home,
  Gas: Fuel,
  Transportation: Car,
  Fuel: Fuel,
  Parking: Parking,
  "Taxi & Ride-hailing": Car,
  "Public Transport": Bus,
  "Vehicle Maintenance": Wrench,
  Shopping: ShoppingBag,
  Clothing: Shirt,
  Electronics: Monitor,
  "Personal Items": Wallet,
  Household: Box,
  "Home & Family": Home,
  "Home Maintenance": Wrench,
  Family: Users,
  Children: Baby,
  Pets: Paw,
  "Health & Fitness": Heart,
  Medical: Heart,
  Pharmacy: Pill,
  Fitness: Activity,
  Entertainment: Play,
  "Movies & Events": Play,
  Games: Gamepad,
  Subscriptions: Receipt,
  Hobbies: Play,
  Education: Book,
  Tuition: Book,
  Books: Book,
  Courses: Book,
  Travel: Luggage,
  Flights: Plane,
  Accommodation: Home,
  "Local Transport": Bus,
  Activities: Play,
  "Gifts & Donations": Gift,
  Gifts: Gift,
  Charity: Heart,
  Insurance: Shield,
  "Taxes & Fees": Percent,
  "Debt Repayment": Refund,
  "Loans Given": Wallet,
  Investments: TrendingUp,
  Crypto: TrendingUp,
  "Paid on Behalf": Users,
  "Other Expense": Grid,
  Salary: Briefcase,
  Bonus: Gift,
  "Business Income": Briefcase,
  "Investment Income": TrendingUp,
  "Crypto Gains": TrendingUp,
  Interest: Percent,
  "Gifts Received": Gift,
  Refunds: Refund,
  "Loans & Debt Collection": Wallet,
  "Collected on Behalf": Users,
  "Other Income": Grid,
};

/** Neutral fallback for anything not in ICONS (never a bare dot/bullet). */
function FallbackIcon(p: IconProps) {
  return <Grid {...p} />;
}

export function iconForCategory(
  name: string,
): (p: IconProps) => React.ReactElement {
  return ICONS[name] ?? FallbackIcon;
}

// --- TASK-036: icon *registry* -- every icon addressable by a stable string
// key, so a category can store a chosen key (``Category.icon``) instead of
// only ever getting the name-inferred default above. ---
const ICON_REGISTRY: Record<string, (p: IconProps) => React.ReactElement> = {
  Wallet, MinusCircle, PlusCircle, Utensils, Coffee, Basket, Receipt, Bolt,
  Droplet, Wifi, Phone, Home, Fuel, Car, Bus, Parking, Wrench, ShoppingBag,
  Shirt, Monitor, Box, Users, Baby, Paw, Heart, Activity, Pill, Play,
  Gamepad, Book, Plane, Luggage, Gift, Shield, Percent, Briefcase,
  TrendingUp, Refund, Grid,
  Calendar, Camera, Music, Cake, Cart, Umbrella, Bed, Ball, Beer, Popcorn,
  Palette, Trophy, BarChart, CreditCard, Ticket, Globe, GraduationCap,
  Cocktail, Tag, Envelope, MoneyBag, PiggyBank, Truck, Speaker, Swim,
  ChatBubble, Plant, Dog, Flag, Folder, Notebook, Windmill, Apple, Piano,
  Microphone, Cat,
};

const COMPONENT_TO_KEY = new Map<(p: IconProps) => React.ReactElement, string>(
  Object.entries(ICON_REGISTRY).map(([key, Component]) => [Component, key]),
);

/** Canonical category name -> icon *key* (derived from ICONS above, so the
 * two never drift apart). */
const DEFAULT_ICON_KEY_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(ICONS).map(([name, Component]) => [
    name,
    COMPONENT_TO_KEY.get(Component) ?? "Grid",
  ]),
);

/** Every icon key, grouped for the picker UI. A key may appear in more than
 * one group where it plausibly fits both; every registry key appears at
 * least once so nothing is unreachable from the picker. */
export const ICON_GROUPS: { label: { en: string; vi: string }; keys: string[] }[] = [
  { label: { en: "Money & finance", vi: "Tài chính" }, keys: ["Wallet", "MoneyBag", "PiggyBank", "CreditCard", "BarChart", "TrendingUp", "Percent", "Refund", "Tag", "Receipt", "Briefcase"] },
  { label: { en: "Food & drinks", vi: "Ăn uống" }, keys: ["Utensils", "Coffee", "Basket", "Cake", "Beer", "Cocktail", "Popcorn", "Apple"] },
  { label: { en: "Bills & home", vi: "Hóa đơn & Nhà cửa" }, keys: ["Bolt", "Droplet", "Wifi", "Phone", "Home", "Box", "Bed", "Envelope"] },
  { label: { en: "Transport", vi: "Di chuyển" }, keys: ["Car", "Bus", "Fuel", "Parking", "Wrench", "Truck", "Plane", "Luggage"] },
  { label: { en: "Shopping", vi: "Mua sắm" }, keys: ["ShoppingBag", "Cart", "Shirt", "Monitor", "Gift"] },
  { label: { en: "Family & pets", vi: "Gia đình & Thú cưng" }, keys: ["Users", "Baby", "Paw", "Dog", "Cat", "Plant"] },
  { label: { en: "Health", vi: "Sức khỏe" }, keys: ["Heart", "Pill", "Activity", "Swim"] },
  { label: { en: "Entertainment", vi: "Giải trí" }, keys: ["Play", "Gamepad", "Music", "Piano", "Microphone", "Speaker", "Camera", "Ticket", "Ball", "Trophy", "ChatBubble", "Palette"] },
  { label: { en: "Education", vi: "Giáo dục" }, keys: ["Book", "GraduationCap", "Notebook", "Folder"] },
  { label: { en: "Travel & events", vi: "Du lịch & Sự kiện" }, keys: ["Umbrella", "Globe", "Calendar", "Flag", "Windmill"] },
  { label: { en: "Other", vi: "Khác" }, keys: ["Shield", "Grid", "MinusCircle", "PlusCircle"] },
];

/** Short bilingual label per icon key, used as the picker's aria-label /
 * tooltip -- these describe the glyph itself (like a symbol name), not
 * category content, so they stay out of the category-name i18n audit. */
const ICON_LABELS: Record<string, { en: string; vi: string }> = {
  Wallet: { en: "Wallet", vi: "Ví" }, MinusCircle: { en: "Expense", vi: "Chi tiêu" },
  PlusCircle: { en: "Income", vi: "Thu nhập" }, Utensils: { en: "Food", vi: "Ăn uống" },
  Coffee: { en: "Coffee", vi: "Cà phê" }, Basket: { en: "Groceries", vi: "Chợ/Siêu thị" },
  Receipt: { en: "Bill", vi: "Hóa đơn" }, Bolt: { en: "Electricity", vi: "Điện" },
  Droplet: { en: "Water", vi: "Nước" }, Wifi: { en: "Internet", vi: "Internet" },
  Phone: { en: "Phone", vi: "Điện thoại" }, Home: { en: "Home", vi: "Nhà" },
  Fuel: { en: "Fuel", vi: "Xăng dầu" }, Car: { en: "Car", vi: "Ô tô" },
  Bus: { en: "Bus", vi: "Xe buýt" }, Parking: { en: "Parking", vi: "Đỗ xe" },
  Wrench: { en: "Repair", vi: "Sửa chữa" }, ShoppingBag: { en: "Shopping", vi: "Mua sắm" },
  Shirt: { en: "Clothing", vi: "Quần áo" }, Monitor: { en: "Electronics", vi: "Đồ điện tử" },
  Box: { en: "Household", vi: "Đồ gia dụng" }, Users: { en: "Family", vi: "Gia đình" },
  Baby: { en: "Children", vi: "Trẻ em" }, Paw: { en: "Pets", vi: "Thú cưng" },
  Heart: { en: "Health", vi: "Sức khỏe" }, Activity: { en: "Fitness", vi: "Thể dục" },
  Pill: { en: "Pharmacy", vi: "Dược phẩm" }, Play: { en: "Entertainment", vi: "Giải trí" },
  Gamepad: { en: "Games", vi: "Trò chơi" }, Book: { en: "Education", vi: "Giáo dục" },
  Plane: { en: "Flight", vi: "Chuyến bay" }, Luggage: { en: "Travel", vi: "Du lịch" },
  Gift: { en: "Gift", vi: "Quà tặng" }, Shield: { en: "Insurance", vi: "Bảo hiểm" },
  Percent: { en: "Fees/Interest", vi: "Phí/Lãi" }, Briefcase: { en: "Business", vi: "Công việc" },
  TrendingUp: { en: "Investment", vi: "Đầu tư" }, Refund: { en: "Refund", vi: "Hoàn tiền" },
  Grid: { en: "Other", vi: "Khác" },
  Calendar: { en: "Calendar", vi: "Lịch" }, Camera: { en: "Camera", vi: "Máy ảnh" },
  Music: { en: "Music", vi: "Âm nhạc" }, Cake: { en: "Cake", vi: "Bánh kem" },
  Cart: { en: "Cart", vi: "Giỏ hàng" }, Umbrella: { en: "Umbrella", vi: "Ô dù" },
  Bed: { en: "Accommodation", vi: "Chỗ ở" }, Ball: { en: "Sports", vi: "Thể thao" },
  Beer: { en: "Beer", vi: "Bia" }, Popcorn: { en: "Movies", vi: "Xem phim" },
  Palette: { en: "Art", vi: "Nghệ thuật" }, Trophy: { en: "Award", vi: "Giải thưởng" },
  BarChart: { en: "Statistics", vi: "Thống kê" }, CreditCard: { en: "Card", vi: "Thẻ" },
  Ticket: { en: "Ticket", vi: "Vé" }, Globe: { en: "Global", vi: "Toàn cầu" },
  GraduationCap: { en: "Tuition", vi: "Học phí" }, Cocktail: { en: "Bar", vi: "Quán bar" },
  Tag: { en: "Discount", vi: "Giảm giá" }, Envelope: { en: "Mail", vi: "Thư từ" },
  MoneyBag: { en: "Cash", vi: "Tiền mặt" }, PiggyBank: { en: "Savings", vi: "Tiết kiệm" },
  Truck: { en: "Delivery", vi: "Vận chuyển" }, Speaker: { en: "Audio", vi: "Âm thanh" },
  Swim: { en: "Swimming", vi: "Bơi lội" }, ChatBubble: { en: "Chat", vi: "Trò chuyện" },
  Plant: { en: "Plant", vi: "Cây cảnh" }, Dog: { en: "Dog", vi: "Chó" },
  Flag: { en: "Event", vi: "Sự kiện" }, Folder: { en: "Documents", vi: "Tài liệu" },
  Notebook: { en: "Notebook", vi: "Sổ tay" }, Windmill: { en: "Utilities", vi: "Tiện ích" },
  Apple: { en: "Fruit", vi: "Trái cây" }, Piano: { en: "Piano", vi: "Piano" },
  Microphone: { en: "Karaoke", vi: "Karaoke" }, Cat: { en: "Cat", vi: "Mèo" },
};

/** Resolve the icon key a category should render: its own custom pick, or
 * the name-based default, or a neutral fallback. */
export function resolveIconKey(category: { name: string; icon?: string | null }): string {
  if (category.icon && ICON_REGISTRY[category.icon]) return category.icon;
  return DEFAULT_ICON_KEY_BY_NAME[category.name] ?? "Grid";
}

export function iconLabel(language: Language, key: string): string {
  const meta = ICON_LABELS[key];
  if (!meta) return key;
  return language === "vi" ? meta.vi : meta.en;
}

/** All addressable icon keys (union of every group, deduplicated), for
 * anything that needs the full flat list. */
export const ICON_KEYS: string[] = Array.from(new Set(ICON_GROUPS.flatMap(g => g.keys)));

/** Render an icon by its registry key directly (picker swatches, etc.). */
export function IconGlyph({ iconKey, ...rest }: { iconKey: string } & IconProps) {
  const Icon = ICON_REGISTRY[iconKey] ?? Grid;
  return <Icon {...rest} />;
}

/** Render a category's icon: its own custom pick if set, else the
 * name-based default. Pass the category (or a `{name, icon}` shape) so a
 * per-category override is honored wherever categories are drawn. */
export function CategoryIcon({ name, icon, ...rest }: { name: string; icon?: string | null } & IconProps) {
  const key = resolveIconKey({ name, icon });
  const Icon = ICON_REGISTRY[key] ?? Grid;
  return <Icon {...rest} />;
}
