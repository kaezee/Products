import type { CSSProperties } from "react";
import {
  LayoutDashboard,
  Library as LibraryIcon,
  FileText,
  CalendarClock,
  Share2,
  NotebookPen,
  Settings,
  Sun,
  Contrast,
  Moon,
  Monitor,
  CircleUser,
  LogOut,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  X,
  Undo2,
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  PanelRight,
  GripVertical,
  Lock,
  LockOpen,
  BookOpen,
  CalendarDays,
  Clock3,
  TriangleAlert,
  Users,
  MapPin,
  Type as TypeIcon,
  Drama,
  PenLine,
  Feather,
  Crosshair,
  Waypoints,
  Link2,
  Eye,
  ArrowUpDown,
  HelpCircle,
  Maximize2,
  Minimize2,
  type LucideIcon,
} from "lucide-react";

// One icon library for the whole app. Every icon is drawn from Lucide (stroke
// based, 24-unit grid) and rendered through <Icon>, so sizing and stroke weight
// stay uniform everywhere — no more mismatched unicode glyphs at random sizes.
const REGISTRY = {
  // rail / navigation
  overview: LayoutDashboard,
  library: LibraryIcon,
  manuscript: FileText,
  timeline: CalendarClock,
  relationships: Share2,
  notes: NotebookPen,
  settings: Settings,
  // appearance cycle (paper → white → dark → system)
  "theme-paper": Sun,
  "theme-white": Contrast,
  "theme-dark": Moon,
  "theme-system": Monitor,
  account: CircleUser,
  logout: LogOut,
  // actions / affordances
  search: Search,
  plus: Plus,
  edit: Pencil,
  trash: Trash2,
  chevron: ChevronRight,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  close: X,
  undo: Undo2,
  arrow: ArrowRight,
  jump: ArrowUpRight,
  check: Check,
  done: CircleCheck,
  panel: PanelRight,
  grip: GripVertical,
  lock: Lock,
  unlock: LockOpen,
  book: BookOpen,
  calendar: CalendarDays,
  clock: Clock3,
  alert: TriangleAlert,
  cast: Users,
  place: MapPin,
  words: TypeIcon,
  drama: Drama,
  write: PenLine,
  feather: Feather,
  // relationship chip bar (RELATIONSHIPSBUILD.md §1)
  crosshair: Crosshair,   // centre on
  waypoints: Waypoints,   // how far out
  tone: Contrast,         // tone
  link: Link2,            // kinds of connection
  eye: Eye,               // point of view
  sort: ArrowUpDown,      // ordered by
  help: HelpCircle,       // legend
  expand: Maximize2,      // enter focus mode
  shrink: Minimize2,      // exit focus mode
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

// Sizes are role-based, not ad hoc. Callers pick a role; the module owns the px.
export const ICON_SIZE = { sm: 14, md: 16, lg: 18, xl: 20 } as const;

export function Icon({
  name,
  size = ICON_SIZE.md,
  strokeWidth = 1.75,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const Glyph = REGISTRY[name];
  return <Glyph size={size} strokeWidth={strokeWidth} className={className} style={style} aria-hidden />;
}
