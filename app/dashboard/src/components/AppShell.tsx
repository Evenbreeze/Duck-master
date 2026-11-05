import { Box, Container, ContainerProps } from "@chakra-ui/react";
import { FC, PropsWithChildren } from "react";

export const AppShell: FC<PropsWithChildren<ContainerProps>> = ({
  children,
  ...rest
}) => (
  <Box
    minH="100vh"
    bg="app.bg"
    _dark={{ bg: "app.bgDark" }}
    py={{ base: 4, md: 6 }}
    px={{ base: 3, md: 4 }}
  >
    <Container maxW="container.xl" px={0} {...rest}>
      {children}
    </Container>
  </Box>
);
