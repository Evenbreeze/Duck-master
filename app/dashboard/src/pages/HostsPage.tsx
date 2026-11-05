import { FC } from "react";
import { HostsPanel } from "components/HostsDialog";
import { PageHeader } from "components/PageHeader";

export const HostsPage: FC = () => (
  <>
    <PageHeader
      title="Host"
      description="订阅链接里展示的地址、端口、SNI。节点保存后相关 Host 会自动更新。"
    />
    <HostsPanel />
  </>
);

export default HostsPage;
