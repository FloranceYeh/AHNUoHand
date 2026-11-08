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
  Settings2,
  X,
  RefreshCw,
  Upload,
  MapPin,
  Hash,
  Star,
  BuildingComplex,
  Building,
  ArrowUp,
  ArrowDown,
  GripVertical,
  Plus,
  LayoutGrid,
  ChevronsLeftRight,
  KeyRound,
  IdCard,
  ChevronDown,
  ArrowLeftRight,
  Bell,
  GitBranch,
  Globe2,
  ExternalLink,
  MessageCircle,
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
  message: MessageCircle,
  arrow: ArrowLeft,
  chevron: ChevronRight,
  chevronDown: ChevronDown,
  search: Search,
  spark: Sparkles,
  clock: Clock3,
  settings: Settings2,
  close: X,
  refresh: RefreshCw,
  upload: Upload,
  location: MapPin,
  hash: Hash,
  star: Star,
  buildings: BuildingComplex,
  building: Building,
  up: ArrowUp,
  down: ArrowDown,
  grip: GripVertical,
  plus: Plus,
  layoutGrid: LayoutGrid,
  leftRight: ChevronsLeftRight,
  keyRound: KeyRound,
  idCard: IdCard,
  arrowLR: ArrowLeftRight,
  bell: Bell,
  gitBranch: GitBranch,
  globe: Globe2,
  externalLink: ExternalLink,
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
