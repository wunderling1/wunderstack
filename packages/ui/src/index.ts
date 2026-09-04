export { cn } from "./lib/cn";
export {
  createProgressQueue,
  defaultProgressGaps,
  instantProgressGaps,
  type CancelScheduled,
  type ProgressGaps,
  type ProgressItemKind,
  type ProgressQueue,
  type ProgressQueueOptions,
} from "./lib/progress-queue";
export {
  accumulateTraceItems,
  TRACE_SUMMARY,
  traceItemsFromEvent,
  traceSummaryLabel,
  type AnswerTraceChip,
  type AnswerTraceEvent,
  type AnswerTraceItem,
  type AnswerTraceStep,
  type AnswerTraceSummaryInput,
  type AnswerTraceTone,
} from "./lib/answer-trace";
export { usePacedTrace } from "./lib/use-paced-trace";
export {
  createStreamWatchdog,
  type StreamWatchdog,
  type StreamWatchdogOptions,
} from "./lib/stream-watchdog";
export {
  createScrollAnchor,
  TALL_ANCHOR_RATIO,
  type ScrollAnchor,
  type ScrollAnchorAlign,
  type ScrollAnchorMetrics,
  type ScrollAnchorOptions,
  type ScrollAnchorState,
  type ScrollCommand,
} from "./lib/scroll-anchor";
export { useScrollAnchor, type UseScrollAnchorArgs } from "./lib/use-scroll-anchor";

// Primitives
export { Button, buttonVariants, type ButtonProps, type ButtonSize } from "./primitives/button";
export { IconButton, type IconButtonProps } from "./primitives/icon-button";
export { Field, type FieldProps } from "./primitives/field";
export { Textarea, type TextareaProps } from "./primitives/textarea";
export { Card, type CardProps } from "./primitives/card";
export { Chip, chipVariants, type ChipProps } from "./primitives/chip";
export { Pill, pillVariants, type PillProps } from "./primitives/pill";
export { Avatar, type AvatarProps } from "./primitives/avatar";
export { Icon, type IconProps } from "./primitives/icon";
export { Select, type SelectProps } from "./primitives/select";
export { Checkbox, type CheckboxProps } from "./primitives/checkbox";
export {
  RadioGroup,
  Radio,
  type RadioGroupProps,
  type RadioProps,
} from "./primitives/radio-group";
export {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./primitives/accordion";
export {
  Breadcrumbs,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./primitives/breadcrumbs";
export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  type TabsProps,
  type TabsTriggerProps,
  type TabsContentProps,
} from "./primitives/tabs";
export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./primitives/table";
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
} from "./primitives/dialog";
export {
  NavPills,
  NavPill,
  navPillClassName,
  type NavPillsProps,
  type NavPillProps,
} from "./primitives/nav-pills";

// Trust-patterns (layer 3, D16) — the visual translation of the grounding architecture
export {
  CitationBlock,
  CitationBadge,
  type CitationBlockProps,
  type CitationBadgeProps,
  type CitationVerification,
} from "./trust-patterns/citation-block";
export {
  AnswerCard,
  type AnswerCardProps,
  type AnswerRole,
  type DensitySize,
} from "./trust-patterns/answer-card";
export { RefusalNotice, type RefusalNoticeProps } from "./trust-patterns/refusal-notice";
export {
  AgentStatusBadge,
  type AgentStatusBadgeProps,
  type AgentStatus,
} from "./trust-patterns/agent-status-badge";
export { KpiTile, type KpiTileProps } from "./trust-patterns/kpi-tile";
export {
  CardSection,
  type CardSectionProps,
} from "./trust-patterns/card-section";
export {
  AnswerProgress,
  type AnswerProgressProps,
  type AnswerProgressStep,
} from "./trust-patterns/answer-progress";
export { AnswerTrace, type AnswerTraceProps } from "./trust-patterns/answer-trace";
export { Composer, type ComposerProps } from "./trust-patterns/composer";

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
} from "./icons";
