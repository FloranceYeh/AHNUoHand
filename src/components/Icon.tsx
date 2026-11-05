import {
  ArrowLeft,
  Bolt,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Grid2X2,
  House,
  MessageCircleMore,
  Search,
  School,
  Sparkles,
} from "lucide-react";

const icons = {
  home: House,
  grid: Grid2X2,
  person: CircleUserRound,
  calendar: CalendarDays,
  school: School,
  bolt: Bolt,
  book: BookOpen,
  event: CalendarRange,
  chat: MessageCircleMore,
  arrow: ArrowLeft,
  chevron: ChevronRight,
  search: Search,
  spark: Sparkles,
  clock: Clock3,
};

interface IconProps {
  name: keyof typeof icons | string;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 24, className }: IconProps) {
  const Component = icons[name as keyof typeof icons] ?? Sparkles;
  return (
    <Component
      size={size}
      className={className}
      strokeWidth={1.8}
      aria-hidden="true"
    />
  );
}
