import {
  Button,
  chakra,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Text,
  useToast,
} from "@chakra-ui/react";
import { FC, useState } from "react";
import { DocumentMinusIcon } from "@heroicons/react/24/outline";
import { Icon } from "./Icon";
import { useDashboard } from "contexts/DashboardContext";
export const ResetIcon = chakra(DocumentMinusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export type DeleteUserModalProps = {};

export const ResetAllUsageModal: FC<DeleteUserModalProps> = () => {
  const [loading, setLoading] = useState(false);
  const { isResetingAllUsage, onResetAllUsage, resetAllUsage } = useDashboard();
  const toast = useToast();
  const onClose = () => {
    onResetAllUsage(false);
  };
  const onReset = () => {
    setLoading(true);
    resetAllUsage()
      .then(() => {
        toast({
          title: "所有统计重置完成。",
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .catch(() => {
        toast({
          title: "重置失败，请稍候再试！",
          status: "error",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .finally(() => {
        setLoading(false);
      });
  };
  return (
    <Modal isCentered isOpen={isResetingAllUsage} onClose={onClose} size="sm">
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3">
        <ModalHeader pt={6}>
          <Icon color="red">
            <ResetIcon />
          </Icon>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        <ModalBody>
          <Text fontWeight="semibold" fontSize="lg">
            {"重置所有用户的数据使用情况"}
          </Text>
          {isResetingAllUsage && (
            <Text
              mt={1}
              fontSize="sm"
              _dark={{ color: "gray.400" }}
              color="gray.600"
            >
              {"此操作将清除所有用户统计，您确定要执行此操作吗？ 这不能被撤消！"}
            </Text>
          )}
        </ModalBody>
        <ModalFooter display="flex">
          <Button size="sm" onClick={onClose} mr={3} w="full" variant="outline">
            {"取消"}
          </Button>
          <Button
            size="sm"
            w="full"
            colorScheme="red"
            onClick={onReset}
            leftIcon={loading ? <Spinner size="xs" /> : undefined}
          >
            {"重置"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
