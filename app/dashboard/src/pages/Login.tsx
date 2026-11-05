import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  chakra,
  FormControl,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowRightOnRectangleIcon } from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import { Footer } from "components/Footer";
import { Input } from "components/Input";
import { APP_NAME } from "constants/Project";
import { FC, useEffect, useState } from "react";
import { FieldValues, useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { fetch } from "service/http";
import { removeAuthToken, setAuthToken } from "utils/authStorage";
import { ReactComponent as Logo } from "assets/logo.svg";
import { AppShell } from "components/AppShell";

const schema = z.object({
  username: z.string().min(1, "此项必填"),
  password: z.string().min(1, "此项必填"),
});

export const LogoIcon = chakra(Logo, {
  baseStyle: { w: 14, h: 14 },
});

const LoginIcon = chakra(ArrowRightOnRectangleIcon, {
  baseStyle: { w: 5, h: 5, strokeWidth: "2px" },
});

export const Login: FC = () => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    register,
    formState: { errors },
    handleSubmit,
  } = useForm({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    removeAuthToken();
    if (location.pathname !== "/login") {
      navigate("/login", { replace: true });
    }
  }, []);

  const login = (values: FieldValues) => {
    setError("");
    const formData = new FormData();
    formData.append("username", values.username);
    formData.append("password", values.password);
    formData.append("grant_type", "password");
    setLoading(true);
    fetch("/admin/token", { method: "post", body: formData })
      .then(({ access_token: token }) => {
        setAuthToken(token);
        navigate("/");
      })
      .catch((err) => {
        setError(err.response._data.detail);
      })
      .finally(() => setLoading(false));
  };

  return (
    <AppShell>
      <VStack minH="calc(100vh - 3rem)" justify="center" spacing={8}>
        <Box
          w="full"
          maxW="400px"
          mx="auto"
          p={8}
          borderRadius="2xl"
          borderWidth="1px"
          borderColor="whiteAlpha.400"
          bg="app.surface"
          _dark={{ bg: "app.surfaceDark", borderColor: "whiteAlpha.100" }}
          boxShadow="lg"
        >
          <VStack spacing={2} mb={6}>
            <LogoIcon />
            <Text fontSize="2xl" fontWeight="bold">
              {APP_NAME}
            </Text>
            <Text fontSize="sm" color="gray.500" textAlign="center">
              登录主控，管理用户、节点与订阅
            </Text>
          </VStack>
          <form onSubmit={handleSubmit(login)}>
            <VStack spacing={3}>
              <FormControl>
                <Input
                  w="full"
                  placeholder="用户名"
                  {...register("username")}
                  error={errors?.username?.message as string}
                />
              </FormControl>
              <FormControl>
                <Input
                  w="full"
                  type="password"
                  placeholder="密码"
                  {...register("password")}
                  error={errors?.password?.message as string}
                />
              </FormControl>
              {error && (
                <Alert status="error" rounded="md" fontSize="sm">
                  <AlertIcon />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button
                isLoading={loading}
                type="submit"
                w="full"
                colorScheme="primary"
                size="lg"
                leftIcon={<LoginIcon />}
              >
                登录
              </Button>
            </VStack>
          </form>
        </Box>
        <Footer />
      </VStack>
    </AppShell>
  );
};

export default Login;
