import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  Circle,
  CircleCheck,
  CircleGauge,
  Mail,
  Pencil,
  Plus,
  RotateCw,
  Settings,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
const icons = {
  back: ArrowLeft,
  arrow: ArrowUpRight,
  calendar: CalendarDays,
  check: Check,
  circle: Circle,
  todos: CircleCheck,
  home: CircleGauge,
  mail: Mail,
  edit: Pencil,
  plus: Plus,
  refresh: RotateCw,
  settings: Settings,
  sparkles: Sparkles,
  sun: Sun,
  close: X,
};
export function Icon({
  name,
  size = 20,
}: {
  name: keyof typeof icons;
  size?: number;
}) {
  const Component = icons[name];
  return (
    <Component
      size={size}
      strokeWidth={1.75}
      aria-hidden="true"
      focusable="false"
    />
  );
}
