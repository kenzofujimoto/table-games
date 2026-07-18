import type { Resource } from "@/game/domain/types";

import { RESOURCE_META } from "./resource-meta";

export function ResourceToken({ resource, amount, compact = false }: { resource: Resource; amount: number; compact?: boolean }) {
  const meta = RESOURCE_META[resource];
  const Icon = meta.icon;
  return <div className={`resource-token resource-token--${resource} ${compact ? "is-compact" : ""}`} title={meta.label}><span><Icon /></span><div>{!compact && <small>{meta.label}</small>}<strong>{amount}</strong></div></div>;
}
