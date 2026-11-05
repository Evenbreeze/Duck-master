import {
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Textarea,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { useDashboard } from "contexts/DashboardContext";
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

export const TelegramSettingsModal: FC = () => {
  const toast = useToast();
  const isOpen = useDashboard((s) => s.isEditingTelegram);
  const onClose = () => useDashboard.setState({ isEditingTelegram: false });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<TelegramSettings>({
    api_token: "",
    admin_ids: [],
    logger_channel_id: 0,
    proxy_url: "",
  });
  const [adminIdsText, setAdminIdsText] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    fetch<TelegramSettings>("/telegram/settings")
      .then((data) => {
        setForm(data);
        setAdminIdsText((data.admin_ids || []).join(", "));
      })
      .catch((e) => generateErrorMessage(e, toast));
  }, [isOpen, toast]);

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
      generateSuccessMessage("已保存，请 duck restart 使 Bot 生效", toast);
      onClose();
    } catch (e) {
      generateErrorMessage(e, toast);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent mx={3}>
        <ModalHeader>{"Telegram 通知"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>{"Bot Token"}</FormLabel>
              <Input
                value={form.api_token}
                onChange={(e) =>
                  setForm((f) => ({ ...f, api_token: e.target.value }))
                }
                placeholder="123456:ABC..."
              />
            </FormControl>
            <FormControl>
              <FormLabel>{"管理员 Telegram ID（逗号分隔）"}</FormLabel>
              <Textarea
                value={adminIdsText}
                onChange={(e) => setAdminIdsText(e.target.value)}
                rows={2}
                placeholder="123456789"
              />
            </FormControl>
            <FormControl>
              <FormLabel>{"日志频道 ID（可选）"}</FormLabel>
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
              <FormLabel>{"代理 URL（可选）"}</FormLabel>
              <Input
                value={form.proxy_url}
                onChange={(e) =>
                  setForm((f) => ({ ...f, proxy_url: e.target.value }))
                }
                placeholder="socks5://127.0.0.1:1080"
              />
            </FormControl>
          </VStack>
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
