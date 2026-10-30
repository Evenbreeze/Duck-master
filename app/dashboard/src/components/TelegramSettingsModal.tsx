import {
  Alert,
  AlertIcon,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  useToast,
} from "@chakra-ui/react";
import { useDashboard } from "contexts/DashboardContext";
import { FC, useEffect, useState } from "react";
import { fetch } from "service/http";

type TelegramSettings = {
  token_configured: boolean;
  admin_ids: number[];
  logger_channel_id: number;
  proxy_url: string;
};

export const TelegramSettingsModal: FC = () => {
  const toast = useToast();
  const isOpen = useDashboard((s) => s.isEditingTelegram);
  const onClose = () => useDashboard.setState({ isEditingTelegram: false });

  const [apiToken, setApiToken] = useState("");
  const [adminIds, setAdminIds] = useState("");
  const [loggerChannelId, setLoggerChannelId] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetch<TelegramSettings>("/telegram/settings")
      .then((data) => {
        setTokenConfigured(data.token_configured);
        setAdminIds(data.admin_ids.join(", "));
        setLoggerChannelId(
          data.logger_channel_id ? String(data.logger_channel_id) : ""
        );
        setProxyUrl(data.proxy_url || "");
        setApiToken("");
      })
      .catch(() => {
        toast({ title: "加载失败", status: "error" });
      });
  }, [isOpen, toast]);

  const onSave = async () => {
    const ids = adminIds
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => parseInt(s, 10))
      .filter((n) => !Number.isNaN(n));

    setLoading(true);
    try {
      await fetch("/telegram/settings", {
        method: "PUT",
        body: JSON.stringify({
          api_token: apiToken.trim() || null,
          admin_ids: ids,
          logger_channel_id: loggerChannelId
            ? parseInt(loggerChannelId, 10)
            : 0,
          proxy_url: proxyUrl.trim(),
        }),
      });
      toast({
        title: "已保存",
        description: "保存后请在服务器执行 duck restart 使机器人生效",
        status: "success",
        duration: 8000,
      });
      onClose();
    } catch {
      toast({ title: "保存失败", status: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{"Telegram 机器人"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Alert status="info" mb={4} fontSize="sm">
            <AlertIcon />
            {"保存后请在服务器执行 duck restart 使机器人生效"}
          </Alert>
          <FormControl mb={4}>
            <FormLabel>{"Bot Token"}</FormLabel>
            <Input
              type="password"
              placeholder={
                tokenConfigured ? "已配置，输入新 Token 可更换" : ""
              }
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
            />
            <FormHelperText>{"留空表示不修改已保存的 Token"}</FormHelperText>
          </FormControl>
          <FormControl mb={4}>
            <FormLabel>{"管理员 Telegram ID"}</FormLabel>
            <Input
              value={adminIds}
              onChange={(e) => setAdminIds(e.target.value)}
              placeholder="123456789"
            />
            <FormHelperText>{"多个用英文逗号分隔，@userinfobot 可查自己的 ID"}</FormHelperText>
          </FormControl>
          <FormControl mb={4}>
            <FormLabel>{"日志频道 ID"}</FormLabel>
            <Input
              value={loggerChannelId}
              onChange={(e) => setLoggerChannelId(e.target.value)}
              placeholder={"可选"}
            />
          </FormControl>
          <FormControl mb={2}>
            <FormLabel>{"代理地址"}</FormLabel>
            <Input
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder={"可选"}
            />
          </FormControl>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>
            {"取消"}
          </Button>
          <Button colorScheme="primary" isLoading={loading} onClick={onSave}>
            {"保存"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
