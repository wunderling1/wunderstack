export { cn } from "./lib/cn.js";

// Primitives
export { Button, buttonVariants, type ButtonProps, type ButtonSize } from "./primitives/button.js";
export { IconButton, type IconButtonProps } from "./primitives/icon-button.js";
export { Field, type FieldProps } from "./primitives/field.js";
export { Textarea, type TextareaProps } from "./primitives/textarea.js";
export { Card, type CardProps } from "./primitives/card.js";
export { Chip, chipVariants, type ChipProps } from "./primitives/chip.js";
export { Pill, pillVariants, type PillProps } from "./primitives/pill.js";
export { Avatar, type AvatarProps } from "./primitives/avatar.js";
export { Icon, type IconProps } from "./primitives/icon.js";
export { Select, type SelectProps } from "./primitives/select.js";
export { Checkbox, type CheckboxProps } from "./primitives/checkbox.js";
export {
  RadioGroup,
  Radio,
  type RadioGroupProps,
  type RadioProps,
} from "./primitives/radio-group.js";
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./primitives/accordion.js";
export {
  Breadcrumbs,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./primitives/breadcrumbs.js";
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsProps,
  type TabsTriggerProps,
  type TabsContentProps,
} from "./primitives/tabs.js";
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./primitives/table.js";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  type DialogContentProps,
} from "./primitives/dialog.js";
export {
  NavPills,
  NavPill,
  navPillClassName,
  type NavPillsProps,
  type NavPillProps,
} from "./primitives/nav-pills.js";

// Trust-patterns (layer 3, D16) — the visual translation of the grounding architecture
export {
  CitationBlock,
  CitationBadge,
  type CitationBlockProps,
  type CitationBadgeProps,
  type CitationVerification,
} from "./trust-patterns/citation-block.js";
export {
  AnswerCard,
  type AnswerCardProps,
  type AnswerRole,
  type DensitySize,
} from "./trust-patterns/answer-card.js";
export { RefusalNotice, type RefusalNoticeProps } from "./trust-patterns/refusal-notice.js";
export {
  AgentStatusBadge,
  type AgentStatusBadgeProps,
  type AgentStatus,
} from "./trust-patterns/agent-status-badge.js";
export { KpiTile, type KpiTileProps } from "./trust-patterns/kpi-tile.js";
export {
  CardSection,
  type CardSectionProps,
} from "./trust-patterns/card-section.js";
export {
  AnswerProgress,
  type AnswerProgressProps,
  type AnswerProgressStep,
} from "./trust-patterns/answer-progress.js";
export { Composer, type ComposerProps } from "./trust-patterns/composer.js";

export {
  Activity,
  Bot,
  Building2,
  ChartLine,
  Menu,
  MessageCircle,
  Settings,
  X,
  type LucideIcon,
} from "./icons.js";
