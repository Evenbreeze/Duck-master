import { Box, Heading, Text, HStack } from "@chakra-ui/react";
import { FC, ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export const PageHeader: FC<Props> = ({ title, description, actions }) => (
  <HStack
    justify="space-between"
    align="flex-start"
    mb={6}
    flexWrap="wrap"
    gap={3}
  >
    <Box>
      <Heading size="md" fontWeight="bold">
        {title}
      </Heading>
      {description ? (
        <Text mt={1} fontSize="sm" color="gray.500" maxW="2xl">
          {description}
        </Text>
      ) : null}
    </Box>
    {actions ? <Box flexShrink={0}>{actions}</Box> : null}
  </HStack>
);
