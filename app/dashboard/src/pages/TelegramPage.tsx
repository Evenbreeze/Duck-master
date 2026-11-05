import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Textarea,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { PageHeader } from "components/PageHeader";
import { FC, useEffect, useState } from "react";
import { fetch } from "service/http";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";

type TelegramSettings = {
  api_token: string;
  admin_ids: number[];
  logger_channel_id: number;
  proxy_url: string;
};

export const TelegramPage: FC = () => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<TelegramSettings>({
    api_token: "",
    admin_ids: [],
    logger_channel_id: 0,
    proxy_url: "",
  });
  const [adminIdsText, setAdminIdsText] = useState("");

  useEffect(() => {
    fetch<TelegramSettings>("/telegram/settings")
      .then((data) => {
        setForm(data);
        setAdminIdsText((data.admin_ids || []).join(", "));
      })
      .catch((e) => generateErrorMessage(e, toast));
  }, [toast]);

  const onSave = async () => {
    setLoading(true);
    try {
      const admin_ids = adminIdsText
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => parseInt(s, 10))
        .filter((n) => !Number.isNaN(n));
      await fetch("/telegram/settings", {
        method: "PUT",
        body: {
          ...form,
          admin_ids,
          logger_channel_id: Number(form.logger_channel_id) || 0,
        },
      });
      generateSuccessMessage("已保存", toast);
    } catch (e) {
      generateErrorMessage(e, toast);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Telegram"
        description="Bot 通知。保存后若 Bot 未生效：duck restart"
      />
      <Box
        maxW="lg"
        p={6}
        borderWidth="1px"
        borderRadius="xl"
        bg="white"
        _dark={{ bg: "gray.750", borderColor: "gray.600" }}
      >
        <VStack spacing={4} align="stretch">
          <FormControl>
            <FormLabel>Bot Token</FormLabel>
            <Input
              value={form.api_token}
              onChange={(e) =>
                setForm((f) => ({ ...f, api_token: e.target.value }))
              }
              placeholder="123456:ABC..."
            />
          </FormControl>
          <FormControl>
            <FormLabel>管理员 Telegram ID</FormLabel>
            <Textarea
              value={adminIdsText}
              onChange={(e) => setAdminIdsText(e.target.value)}
              rows={2}
              placeholder="多个 ID 用逗号分隔"
            />
          </FormControl>
          <FormControl>
            <FormLabel>日志频道 ID（可选）</FormLabel>
            <Input
              type="number"
              value={form.logger_channel_id || ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  logger_channel_id: parseInt(e.target.value, 10) || 0,
                }))
              }
            />
          </FormControl>
          <FormControl>
            <FormLabel>代理 URL（可选）</FormLabel>
            <Input
              value={form.proxy_url}
              onChange={(e) =>
                setForm((f) => ({ ...f, proxy_url: e.target.value }))
              }
              placeholder="socks5://127.0.0.1:1080"
            />
          </FormControl>
          <Button colorScheme="primary" isLoading={loading} onClick={onSave}>
            保存
          </Button>
        </VStack>
      </Box>
    </>
  );
};

export default TelegramPage;
