import { z } from "zod";
import { fetch } from "service/http";

/**
 * API contract for GET /api/system.
 * Keep in sync with app/models/system.py (SystemStats).
 */
export const SystemStatsSchema = z.object({
  version: z.string(),
  mem_total: z.number(),
  mem_used: z.number(),
  cpu_cores: z.number(),
  cpu_usage: z.number(),
  total_user: z.number(),
  online_users: z.number(),
  users_active: z.number(),
  users_on_hold: z.number(),
  users_disabled: z.number(),
  users_expired: z.number(),
  users_limited: z.number(),
  incoming_bandwidth: z.number(),
  outgoing_bandwidth: z.number(),
  incoming_bandwidth_speed: z.number(),
  outgoing_bandwidth_speed: z.number(),
});

export type SystemStats = z.infer<typeof SystemStatsSchema>;

export function fetchSystemStats(): Promise<SystemStats> {
  return fetch("/system").then((body) => SystemStatsSchema.parse(body));
}
