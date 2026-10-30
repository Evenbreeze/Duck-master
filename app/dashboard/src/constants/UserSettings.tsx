import { chakra, ChakraComponent} from "@chakra-ui/react";
import {
  ClockIcon,
  ExclamationCircleIcon,
  NoSymbolIcon,
  WifiIcon,
} from "@heroicons/react/24/outline";
import { ForwardRefExoticComponent, SVGProps } from "react";
import { DataLimitResetStrategy } from "types/User";

const iconProps = {
  baseStyle: {
    strokeWidth: "2px",
    w: 4,
    h: 4,
  },
};
const ActiveStatusIcon = chakra(WifiIcon, iconProps);
const DisabledStatusIcon = chakra(NoSymbolIcon, iconProps);
const LimitedStatusIcon = chakra(ExclamationCircleIcon, iconProps);
const ExpiredStatusIcon = chakra(ClockIcon, iconProps);
const On_holdStatusIcon = chakra(ClockIcon, iconProps);

export const resetStrategy: {
  label: string;
  value: DataLimitResetStrategy;
}[] = [
  { label: "无", value: "no_reset" },
  { label: "每天", value: "day" },
  { label: "每周", value: "week" },
  { label: "每月", value: "month" },
  { label: "每年", value: "year" },
];

export const userStatusLabel: Record<string, string> = {
  active: "活跃",
  disabled: "禁用",
  expired: "过期",
  limited: "受限",
  on_hold: "在线",
};

export const nodeModalStatusLabel: Record<string, string> = {
  error: "错误",
  disabled: "已禁用",
  connecting: "正在连接",
  connected: "已连接",
};

export const coreSocketLabel: Record<string, string> = {
  closed: "已关闭",
  connected: "已连接",
  connecting: "连接中...",
  not_connected: "未连接",
};

export function expiryRelativeLabel(status: string, time: string): string {
  if (status === "expires") return `${time}有效`;
  if (status === "expired") return `${time}失效`;
  return "";
}

export const duckNodePortLabel: Record<string, string> = {
  vless: "VLESS 端口",
  vmess: "VMess 端口",
  trojan: "Trojan 端口",
  ss: "Shadowsocks 端口",
};

export const statusColors: {
  [key: string]: {
    statusColor: string;
    bandWidthColor: string;
    icon: ChakraComponent<ForwardRefExoticComponent<SVGProps<SVGSVGElement>>>;
  };
} = {
  active: {
    statusColor: "green",
    bandWidthColor: "primary",
    icon: ActiveStatusIcon,
  },
  connected: {
    statusColor: "green",
    bandWidthColor: "primary",
    icon: ActiveStatusIcon,
  },
  disabled: {
    statusColor: "gray",
    bandWidthColor: "gray",
    icon: DisabledStatusIcon,
  },
  expired: {
    statusColor: "orange",
    bandWidthColor: "orange",
    icon: ExpiredStatusIcon,
  },
  on_hold: {
    statusColor: "purple",
    bandWidthColor: "purple",
    icon: On_holdStatusIcon,
  },
  connecting: {
    statusColor: "orange",
    bandWidthColor: "orange",
    icon: ExpiredStatusIcon,
  },
  limited: {
    statusColor: "red",
    bandWidthColor: "red",
    icon: LimitedStatusIcon,
  },
  error: {
    statusColor: "red",
    bandWidthColor: "red",
    icon: LimitedStatusIcon,
  },
};
