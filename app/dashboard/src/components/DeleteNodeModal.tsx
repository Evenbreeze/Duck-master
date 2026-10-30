import {
  Button,
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
import { FetchNodesQueryKey, useNodes } from "contexts/NodesContext";
import { FC } from "react";
import { useMutation, useQueryClient } from "react-query";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { DeleteIcon, DeleteUserModalProps } from "./DeleteUserModal";
import { Icon } from "./Icon";

export const DeleteNodeModal: FC<DeleteUserModalProps> = ({
  deleteCallback,
}) => {
  const { deleteNode, deletingNode, setDeletingNode } = useNodes();
  const toast = useToast();
  const queryClient = useQueryClient();
  const onClose = () => {
    setDeletingNode(null);
  };

  const { isLoading, mutate: onDelete } = useMutation(deleteNode, {
    onSuccess: () => {
      generateSuccessMessage(
        `节点 ${deletingNode && deletingNode.name} 删除成功`,
        toast
      );
      setDeletingNode(null);
      queryClient.invalidateQueries(FetchNodesQueryKey);
      deleteCallback && deleteCallback();
    },
    onError: (e) => {
      generateErrorMessage(e, toast);
    },
  });

  return (
    <Modal isCentered isOpen={!!deletingNode} onClose={onClose} size="sm">
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3">
        <ModalHeader pt={6}>
          <Icon color="red">
            <DeleteIcon />
          </Icon>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        <ModalBody>
          <Text fontWeight="semibold" fontSize="lg">
            {"删除节点"}
          </Text>
          {deletingNode && (
            <Text
              mt={1}
              fontSize="sm"
              _dark={{ color: "gray.400" }}
              color="gray.600"
            >
              <>
                您确实要删除 <b>{deletingNode.name}</b> 节点吗？
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
            colorScheme="red"
            onClick={() => onDelete()}
            leftIcon={isLoading ? <Spinner size="xs" /> : undefined}
          >
            {"删除"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
