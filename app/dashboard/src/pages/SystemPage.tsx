import { FC } from "react";
import { CoreSettingsPanel } from "components/CoreSettingsModal";
import { PageHeader } from "components/PageHeader";

export const SystemPage: FC = () => (
  <>
    <PageHeader
      title="系统"
      description="主控 Xray 配置、日志与核心重启。日常运维优先用「节点」页。"
    />
    <CoreSettingsPanel />
  </>
);

export default SystemPage;
