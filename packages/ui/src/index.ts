export { cn } from "./lib/cn.js";

// Primitives
export { Button, buttonVariants, type ButtonProps } from "./primitives/button.js";
export { IconButton, type IconButtonProps } from "./primitives/icon-button.js";
export { Field, type FieldProps } from "./primitives/field.js";
export { Card, type CardProps } from "./primitives/card.js";
export { Chip, chipVariants, type ChipProps } from "./primitives/chip.js";
export { Avatar, type AvatarProps } from "./primitives/avatar.js";
export { Icon, type IconProps } from "./primitives/icon.js";
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

// Trust-patterns (layer 3, D16) — the visual translation of the grounding architecture
export {
  CitationBlock,
  CitationBadge,
  type CitationBlockProps,
  type CitationBadgeProps,
  type CitationVerification,
} from "./trust-patterns/citation-block.js";
export { AnswerCard, type AnswerCardProps, type AnswerRole } from "./trust-patterns/answer-card.js";
export { RefusalNotice, type RefusalNoticeProps } from "./trust-patterns/refusal-notice.js";
export {
  AgentStatusBadge,
  type AgentStatusBadgeProps,
  type AgentStatus,
} from "./trust-patterns/agent-status-badge.js";
export { KpiTile, type KpiTileProps } from "./trust-patterns/kpi-tile.js";
