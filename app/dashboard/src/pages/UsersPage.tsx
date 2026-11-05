import { FC } from "react";
import { Filters } from "components/Filters";
import { PageHeader } from "components/PageHeader";
import { Statistics } from "components/Statistics";
import { UsersTable } from "components/UsersTable";

export const UsersPage: FC = () => (
  <>
    <PageHeader
      title="用户"
      description="创建账号、订阅链接与流量；节点与协议在「节点」页管理。"
    />
    <Statistics mb={4} />
    <Filters mb={4} />
    <UsersTable />
  </>
);

export default UsersPage;
