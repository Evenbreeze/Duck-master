import {
  Box,
  Flex,
  IconButton,
  Text,
  VStack,
  useColorMode,
  chakra,
} from "@chakra-ui/react";
import {
  ArrowLeftOnRectangleIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  LinkIcon,
  MoonIcon,
  ServerStackIcon,
  SunIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";
import { ReactComponent as Logo } from "assets/logo.svg";
import { APP_NAME } from "constants/Project";
import useGetUser from "hooks/useGetUser";
import { FC } from "react";
import { Link, NavLink } from "react-router-dom";
import { updateThemeColor } from "utils/themeColor";

const LogoMark = chakra(Logo, { baseStyle: { w: 9, h: 9 } });

const NAV = [
  { to: "/", label: "用户", icon: UsersIcon, end: true },
  { to: "/nodes", label: "节点", icon: ServerStackIcon },
  { to: "/hosts", label: "Host", icon: LinkIcon },
  { to: "/telegram", label: "Telegram", icon: ChatBubbleLeftRightIcon },
  { to: "/system", label: "系统", icon: Cog6ToothIcon },
] as const;

export const Sidebar: FC = () => {
  const { colorMode, toggleColorMode } = useColorMode();
  const { userData, getUserIsSuccess, getUserIsPending } = useGetUser();
  const sudo =
    !getUserIsPending && getUserIsSuccess ? userData.is_sudo : false;

  const linkStyle = (isActive: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 3,
    px: 3,
    py: 2.5,
    borderRadius: "lg",
    fontSize: "sm",
    fontWeight: isActive ? "semibold" : "medium",
    color: isActive ? "primary.700" : "gray.600",
    bg: isActive ? "primary.50" : "transparent",
    _dark: {
      color: isActive ? "primary.200" : "gray.400",
      bg: isActive ? "whiteAlpha.100" : "transparent",
    },
    _hover: {
      bg: isActive ? undefined : "blackAlpha.50",
      _dark: { bg: isActive ? undefined : "whiteAlpha.50" },
    },
    transition: "background 0.15s",
  });

  return (
    <Flex
      direction="column"
      w={{ base: "full", md: "240px" }}
      flexShrink={0}
      p={4}
      mr={{ md: 6 }}
      mb={{ base: 4, md: 0 }}
      borderRadius="2xl"
      borderWidth="1px"
      borderColor="whiteAlpha.400"
      bg="app.surface"
      _dark={{ bg: "app.surfaceDark", borderColor: "whiteAlpha.100" }}
      minH={{ md: "calc(100vh - 3rem)" }}
    >
      <Flex align="center" gap={3}>
        <LogoMark />
        <Box>
          <Text fontWeight="bold" fontSize="md">
            {APP_NAME}
          </Text>
          <Text fontSize="xs" color="gray.500">
            主控
          </Text>
        </Box>
      </Flex>

      <VStack align="stretch" spacing={1} mt={8} flex={1}>
        {(sudo ? [...NAV] : [NAV[0]]).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : undefined}
            style={{ textDecoration: "none" }}
          >
            {({ isActive }) => (
              <Box as="span" sx={linkStyle(isActive)}>
                <item.icon width={18} height={18} />
                {item.label}
              </Box>
            )}
          </NavLink>
        ))}
      </VStack>

      <Flex
        mt={4}
        pt={4}
        borderTopWidth="1px"
        borderColor="blackAlpha.100"
        justify="space-between"
      >
        <IconButton
          size="sm"
          variant="ghost"
          aria-label="主题"
          icon={
            colorMode === "light" ? (
              <MoonIcon width={18} height={18} />
            ) : (
              <SunIcon width={18} height={18} />
            )
          }
          onClick={() => {
            updateThemeColor(colorMode === "dark" ? "light" : "dark");
            toggleColorMode();
          }}
        />
        <Link to="/login">
          <IconButton
            size="sm"
            variant="ghost"
            aria-label="退出"
            icon={<ArrowLeftOnRectangleIcon width={18} height={18} />}
          />
        </Link>
      </Flex>
    </Flex>
  );
};
