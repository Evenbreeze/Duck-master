import { Flex } from "@chakra-ui/react";
import { AppShell } from "components/AppShell";
import { DeleteUserModal } from "components/DeleteUserModal";
import { Footer } from "components/Footer";
import { QRCodeDialog } from "components/QRCodeDialog";
import { ResetAllUsageModal } from "components/ResetAllUsageModal";
import { ResetUserUsageModal } from "components/ResetUserUsageModal";
import { RevokeSubscriptionModal } from "components/RevokeSubscriptionModal";
import { Sidebar } from "components/Sidebar";
import { UserDialog } from "components/UserDialog";
import { DeleteNodeModal } from "components/DeleteNodeModal";
import {
  fetchInbounds,
  useDashboard,
  useSystemQuery,
} from "contexts/DashboardContext";
import { FC, useEffect } from "react";
import { Outlet } from "react-router-dom";

export const DashboardLayout: FC = () => {
  useEffect(() => {
    fetchInbounds();
    useDashboard.getState().refetchUsers();
  }, []);

  useSystemQuery();

  return (
    <AppShell>
      <Flex
        direction={{ base: "column", md: "row" }}
        align={{ md: "flex-start" }}
        minH="calc(100vh - 3rem)"
      >
        <Sidebar />
        <Flex direction="column" flex={1} minW={0}>
          <Outlet />
          <Footer mt="auto" pt={8} />
        </Flex>
      </Flex>
      <UserDialog />
      <DeleteUserModal />
      <DeleteNodeModal />
      <QRCodeDialog />
      <ResetUserUsageModal />
      <RevokeSubscriptionModal />
      <ResetAllUsageModal />
    </AppShell>
  );
};
