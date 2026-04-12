import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import {
  AlertCircle,
  Inbox,
  Loader2,
  MessageSquareWarning,
  Package2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Badge as PrimitiveBadge } from '@/components/ui/badge';
import { Button as PrimitiveButton } from '@/components/ui/button';
import { Card as PrimitiveCard } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Tone = 'info' | 'success' | 'warning' | 'error' | 'neutral';
type AsyncStateKind = 'loading' | 'empty' | 'error';
type SellerButtonVariant = NonNullable<ComponentProps<typeof PrimitiveButton>['variant']> | 'danger' | 'primary';

const toneClasses: Record<Tone, string> = {
  info: 'bg-secondary text-secondary-foreground',
  success: 'bg-primary/12 text-primary',
  warning: 'bg-accent text-accent-foreground',
  error: 'bg-destructive/12 text-destructive',
  neutral: 'border-border bg-background text-muted-foreground',
};

const alertClasses: Record<Tone, string> = {
  info: 'border-secondary bg-secondary/55',
  success: 'border-primary/25 bg-primary/6',
  warning: 'border-accent bg-accent/65',
  error: 'border-destructive/20 bg-destructive/5',
  neutral: 'border-border bg-card/95',
};

function mapButtonVariant(
  variant: SellerButtonVariant | undefined,
): ComponentProps<typeof PrimitiveButton>['variant'] {
  if (!variant || variant === 'primary') return 'default';
  if (variant === 'danger') return 'destructive';
  return variant;
}

function stateMeta(kind: AsyncStateKind) {
  switch (kind) {
    case 'loading':
      return {
        icon: Loader2,
        titleClassName: 'text-foreground',
        iconClassName: 'animate-spin text-muted-foreground',
      };
    case 'error':
      return {
        icon: MessageSquareWarning,
        titleClassName: 'text-destructive',
        iconClassName: 'text-destructive',
      };
    default:
      return {
        icon: Inbox,
        titleClassName: 'text-foreground',
        iconClassName: 'text-muted-foreground',
      };
  }
}

function Badge({
  tone = 'neutral',
  className,
  variant,
  ...props
}: ComponentProps<typeof PrimitiveBadge> & { tone?: Tone }) {
  return (
    <PrimitiveBadge
      variant={variant ?? (tone === 'neutral' ? 'outline' : 'secondary')}
      className={cn(toneClasses[tone], className)}
      {...props}
    />
  );
}

function Button({
  variant,
  className,
  ...props
}: Omit<ComponentProps<typeof PrimitiveButton>, 'variant'> & {
  variant?: SellerButtonVariant;
}) {
  return (
    <PrimitiveButton
      variant={mapButtonVariant(variant)}
      className={className}
      {...props}
    />
  );
}

function Card({
  className,
  ...props
}: ComponentProps<typeof PrimitiveCard>) {
  return (
    <PrimitiveCard
      className={cn(
        'px-6 shadow-[var(--ui-shadow-sm)] ring-[color:var(--ui-border)]/80',
        className,
      )}
      {...props}
    />
  );
}

function PageLayout({
  children,
  variant = 'default',
  title,
  subtitle,
  showHeader = false,
}: {
  children: ReactNode;
  variant?: 'default' | 'gray' | 'centered';
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8',
        variant === 'centered' && 'flex min-h-[calc(100vh-8rem)] flex-col justify-center',
        variant === 'gray' && 'rounded-[var(--ui-radius-lg)] bg-background/75',
      )}
    >
      {(showHeader || title || subtitle) && (
        <PageHeader title={title ?? ''} subtitle={subtitle} />
      )}
      {children}
    </div>
  );
}

function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        <h1 className="text-[clamp(2rem,4vw,3rem)] font-bold tracking-[-0.04em] text-[var(--ui-text)]">
          {title}
        </h1>
        {subtitle ? (
          <div className="max-w-3xl text-sm text-[var(--ui-text-secondary)] sm:text-base">
            {subtitle}
          </div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-4', className)}>
      {(eyebrow || title || description || actions) && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            {eyebrow ? (
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ui-text-muted)]">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <h2 className="text-2xl font-bold tracking-[-0.03em] text-[var(--ui-text)]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <div className="max-w-3xl text-sm text-[var(--ui-text-secondary)]">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  const toneLabel: Record<Tone, string> = {
    info: 'Info',
    success: 'Ready',
    warning: 'Watch',
    error: 'Alert',
    neutral: 'Live',
  };

  return (
    <Card className="gap-4 bg-card/95">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ui-text-muted)]">
          {label}
        </div>
        <Badge tone={tone}>{toneLabel[tone]}</Badge>
      </div>
      <div className="text-3xl font-bold tracking-[-0.04em] text-[var(--ui-text)]">{value}</div>
      {hint ? (
        <div className="text-sm text-[var(--ui-text-secondary)]">{hint}</div>
      ) : null}
    </Card>
  );
}

function DataTableLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--ui-radius-lg)] border border-[var(--ui-border)] bg-card shadow-[var(--ui-shadow-sm)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

function AsyncState({
  kind,
  title,
  description,
  action,
  className,
}: {
  kind: AsyncStateKind;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const meta = stateMeta(kind);
  const Icon = meta.icon;

  return (
    <Card className={cn('items-center justify-center px-8 py-10 text-center', className)}>
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-secondary/70">
        <Icon className={cn('size-5', meta.iconClassName)} />
      </div>
      <div className="space-y-2">
        <div className={cn('text-lg font-semibold', meta.titleClassName)}>{title}</div>
        {description ? (
          <div className="mx-auto max-w-md text-sm text-muted-foreground">{description}</div>
        ) : null}
      </div>
      {action ? <div className="flex justify-center">{action}</div> : null}
    </Card>
  );
}

function Alert({
  tone = 'neutral',
  title,
  description,
  action,
  className,
}: {
  tone?: Tone;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const iconMap: Record<Tone, typeof AlertCircle> = {
    info: Package2,
    success: Package2,
    warning: MessageSquareWarning,
    error: AlertCircle,
    neutral: AlertCircle,
  };
  const Icon = iconMap[tone];

  return (
    <Card className={cn('gap-4', alertClasses[tone], className)}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 items-center justify-center rounded-2xl bg-background/80">
          <Icon className="size-4 text-foreground" />
        </div>
        <div className="space-y-1">
          <div className="font-semibold text-foreground">{title}</div>
          {description ? (
            <div className="text-sm text-muted-foreground">{description}</div>
          ) : null}
        </div>
      </div>
      {action ? <div>{action}</div> : null}
    </Card>
  );
}

function ChatLayout({
  title,
  children,
  footer,
  actions,
  height = '640px',
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  actions?: ReactNode;
  height?: CSSProperties['height'];
}) {
  return (
    <PrimitiveCard className="overflow-hidden rounded-[var(--ui-radius-lg)] bg-card text-card-foreground shadow-[var(--ui-shadow-md)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--ui-border)] px-6 py-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--ui-text-muted)]">
            Assistant
          </div>
          <div className="text-lg font-bold tracking-[-0.03em] text-[var(--ui-text)]">{title}</div>
        </div>
        {actions}
      </div>
      <div className="flex flex-col" style={{ height }}>
        <div className="hide-scrollbar flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-[var(--ui-border)] bg-background/70 px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </PrimitiveCard>
  );
}

function FormLayout({
  className,
  ...props
}: ComponentProps<'div'>) {
  return <div className={cn('grid gap-6 md:grid-cols-2', className)} {...props} />;
}

function DramsDropdown({
  id,
  options,
  value,
  onChange,
  placeholder,
}: {
  id?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder ?? 'Select an option'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export {
  Alert,
  AsyncState,
  Badge,
  Button,
  Card,
  ChatLayout,
  DataTableLayout,
  DramsDropdown,
  FormLayout,
  Input,
  PageHeader,
  PageLayout,
  Section,
  StatCard,
  Textarea,
};
