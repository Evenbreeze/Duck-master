import { Center, CircularProgress } from "@chakra-ui/react";
import { DashboardLayout } from "layouts/DashboardLayout";
import { lazy, Suspense, type ComponentType } from "react";
import { createHashRouter } from "react-router-dom";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";
import { Login } from "./Login";
import { UsersPage } from "./UsersPage";

function lazyPage(
  factory: () => Promise<{ default: ComponentType }>
): ComponentType {
  const Page = lazy(factory);
  return function LazyPage() {
    return (
      <Suspense
        fallback={
          <Center py={16}>
            <CircularProgress isIndeterminate color="primary.400" />
          </Center>
        }
      >
        <Page />
      </Suspense>
    );
  };
}

const NodesPage = lazyPage(() => import("./NodesPage"));
const HostsPage = lazyPage(() => import("./HostsPage"));
const TelegramPage = lazyPage(() => import("./TelegramPage"));
const SystemPage = lazyPage(() => import("./SystemPage"));

const fetchAdminLoader = () =>
  fetch("/admin", {
    headers: { Authorization: `Bearer ${getAuthToken()}` },
  });

export const router = createHashRouter([
  {
    path: "/",
    element: <DashboardLayout />,
    loader: fetchAdminLoader,
    errorElement: <Login />,
    children: [
      { index: true, element: <UsersPage /> },
      { path: "nodes", element: <NodesPage /> },
      { path: "hosts", element: <HostsPage /> },
      { path: "telegram", element: <TelegramPage /> },
      { path: "system", element: <SystemPage /> },
    ],
  },
  {
    path: "/login/",
    element: <Login />,
  },
]);
