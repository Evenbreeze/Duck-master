import { BoxProps, HStack, Link, Text } from "@chakra-ui/react";
import { APP_NAME, REPO_URL } from "constants/Project";
import { useDashboard } from "contexts/DashboardContext";
import { FC } from "react";

export const Footer: FC<BoxProps> = (props) => {
  const { version } = useDashboard();
  const name = REPO_URL ? (
    <Link color="blue.400" href={REPO_URL}>
      {APP_NAME}
    </Link>
  ) : (
    <Text as="span" color="blue.400">
      {APP_NAME}
    </Text>
  );
  return (
    <HStack w="full" py="0" position="relative" {...props}>
      <Text
        display="inline-block"
        flexGrow={1}
        textAlign="center"
        color="gray.500"
        fontSize="xs"
      >
        {name}
        {version ? ` v${version}` : ""}
      </Text>
    </HStack>
  );
};
