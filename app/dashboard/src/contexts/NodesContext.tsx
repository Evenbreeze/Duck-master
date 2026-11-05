import { useQuery } from "react-query";
import { useLocation } from "react-router-dom";
import { fetch } from "service/http";
import { z } from "zod";
import { create } from "zustand";
import { fetchInbounds, FilterUsageType } from "./DashboardContext";

const portField = z.union([
  z.number().min(1).max(65535),
  z.string().transform((v) => (v === "" ? undefined : parseInt(v, 10))),
  z.nan().transform(() => undefined),
]);

export const DuckProxyPortsSchema = z.object({
  vless: portField,
  vmess: portField,
  trojan: portField,
  ss: portField,
});

export const NodeSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  port: z
    .number()
    .min(1)
    .or(z.string().transform((v) => parseFloat(v))),
  api_port: z
    .number()
    .min(1)
    .or(z.string().transform((v) => parseFloat(v))),
  xray_version: z.string().nullable().optional(),
  id: z.number().nullable().optional(),
  status: z
    .enum(["connected", "connecting", "error", "disabled"])
    .nullable()
    .optional(),
  message: z.string().nullable().optional(),
  add_as_new_host: z.boolean().optional(),
  duck_dedicated_inbounds: z.boolean().optional(),
  duck_manual_ports: z.boolean().optional(),
  usage_coefficient: z.number().or(z.string().transform((v) => parseFloat(v))),
  proxy_port: portField.optional(),
  proxy_ports: DuckProxyPortsSchema.optional(),
  inbound_tags: z.string().optional(),
  expire_at: z.number().nullable().optional(),
  protocols: z
    .array(z.enum(["vless", "vmess", "trojan", "ss"]))
    .optional(),
  reality_sni: z.string().max(253).optional(),
  protocol_flags: z
    .object({
      vless: z.boolean().optional(),
      vmess: z.boolean().optional(),
      trojan: z.boolean().optional(),
      ss: z.boolean().optional(),
    })
    .optional(),
});

export type NodeType = z.infer<typeof NodeSchema>;

export type NodeUpdatePayload = {
  id?: number | null;
  name: string;
  address: string;
  usage_coefficient: number;
  expire_at?: number | null;
  protocols?: ("vless" | "vmess" | "trojan" | "ss")[];
  proxy_ports?: Record<string, number>;
  reality_sni?: string;
  status?: NodeType["status"];
};

export const getNodeDefaultValues = (): NodeType => ({
  name: "",
  address: "",
  port: 62050,
  api_port: 62051,
  xray_version: "",
  usage_coefficient: 1,
  duck_dedicated_inbounds: true,
  duck_manual_ports: false,
  expire_at: null,
});

export const FetchNodesQueryKey = "fetch-nodes-query-key";

export type NodeStore = {
  nodes: NodeType[];
  enrollNode: (
    name: string,
    protocols: ("vless" | "vmess" | "trojan" | "ss")[]
  ) => Promise<{
    install_command: string;
    node_id: number;
    protocols: string[];
    proxy_ports: Record<string, number>;
    service_port: number;
    api_port: number;
  }>;
  fetchNodes: () => Promise<NodeType[]>;
  fetchNodesUsage: (query: FilterUsageType) => Promise<{
    usages: {
      node_id?: number | null;
      node_name: string;
      uplink: number;
      downlink: number;
    }[];
  }>;
  updateNode: (node: NodeUpdatePayload) => Promise<unknown>;
  reconnectNode: (node: NodeType) => Promise<unknown>;
  deletingNode?: NodeType | null;
  deleteNode: () => Promise<unknown>;
  setDeletingNode: (node: NodeType | null) => void;
};

export const useNodesQuery = () => {
  const { pathname } = useLocation();
  const onNodesPage = pathname.includes("nodes");
  return useQuery({
    queryKey: FetchNodesQueryKey,
    queryFn: useNodes.getState().fetchNodes,
    refetchInterval: onNodesPage ? 5000 : undefined,
    refetchOnWindowFocus: false,
    onSuccess: (nodes) => {
      if (nodes?.some((n) => n.inbound_tags)) {
        fetchInbounds();
      }
    },
  });
};

export const useNodes = create<NodeStore>((set, get) => ({
  nodes: [],
  enrollNode(name, protocols) {
    return fetch("/node/enroll", { method: "POST", body: { name, protocols } });
  },
  fetchNodes() {
    return fetch("/nodes");
  },
  fetchNodesUsage(query: FilterUsageType) {
    return fetch("/nodes/usage", { query });
  },
  updateNode(body) {
    return fetch(`/node/${body.id}`, {
      method: "PUT",
      body,
    });
  },
  setDeletingNode(node) {
    set({ deletingNode: node });
  },
  reconnectNode(body) {
    return fetch(`/node/${body.id}/reconnect`, {
      method: "POST",
    });
  },
  deleteNode: () => {
    return fetch(`/node/${get().deletingNode?.id}`, {
      method: "DELETE",
    });
  },
}));
