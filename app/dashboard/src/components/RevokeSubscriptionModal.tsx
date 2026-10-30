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
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useDashboard } from "contexts/DashboardContext";
import { FC, useState } from "react";
import { Icon } from "./Icon";

export const ResetIcon = chakra(ArrowPathIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export type RevokeSubscriptionModalProps = {};

export const RevokeSubscriptionModal: FC<RevokeSubscriptionModalProps> = () => {
  const [loading, setLoading] = useState(false);
  const { revokeSubscriptionUser: user, revokeSubscription } = useDashboard();
  const toast = useToast();
  const onClose = () => {
    useDashboard.setState({ revokeSubscriptionUser: null });
  };
  const onReset = () => {
    if (user) {
      setLoading(true);
      revokeSubscription(user)
        .then(() => {
          toast({
            title: `成功撤销用户 ${user.username} 的订阅。`,
            status: "success",
            isClosable: true,
            position: "top",
            duration: 3000,
          });
        })
        .catch(() => {
          toast({
            title: "撤销订阅失败，请稍候再试！",
            status: "error",
            isClosable: true,
            position: "top",
            duration: 3000,
          });
        })
        .finally(() => {
          setLoading(false);
        });
    }
  };
  return (
    <Modal isCentered isOpen={!!user} onClose={onClose} size="sm">
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3">
        <ModalHeader pt={6}>
          <Icon color="blue">
            <ResetIcon />
          </Icon>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        <ModalBody>
          <Text fontWeight="semibold" fontSize="lg">
            {"撤销用户订阅"}
          </Text>
          {user && (
            <Text
              mt={1}
              fontSize="sm"
              _dark={{ color: "gray.400" }}
              color="gray.600"
            >
              <>
                您确定要撤销用户 <b>{user.username}</b> 的订阅吗？
              </>
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
            colorScheme="blue"
            onClick={onReset}
            leftIcon={loading ? <Spinner size="xs" /> : undefined}
          >
            {"撤销"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
