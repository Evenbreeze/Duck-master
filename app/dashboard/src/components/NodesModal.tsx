import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  ButtonProps,
  chakra,
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Switch,
  Text,
  Textarea,
  Tooltip,
  useToast,
  VStack,
} from "@chakra-ui/react";
import {
  SquaresPlusIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FetchNodesQueryKey,
  getNodeDefaultValues,
  NodeSchema,
  NodeType,
  useNodes,
  useNodesQuery,
} from "contexts/NodesContext";
import dayjs from "dayjs";
import { FC, ReactNode, useState } from "react";
import ReactDatePicker from "react-datepicker";
import { Controller, useForm, UseFormReturn } from "react-hook-form";
import { duckNodePortLabel } from "constants/UserSettings";
import {
  UseMutateFunction,
  useMutation,
  useQuery,
  useQueryClient,
} from "react-query";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import { Status } from "types/User";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { useDashboard } from "../contexts/DashboardContext";
import { DeleteNodeModal } from "./DeleteNodeModal";
import { DeleteIcon } from "./DeleteUserModal";
import { ReloadIcon } from "./Filters";
import { Icon } from "./Icon";
import { NodeModalStatusBadge } from "./NodeModalStatusBadge";

import { fetch } from "service/http";
import { isNodeExpired } from "utils/nodeExpiry";
import { Input } from "./Input";

const CustomInput = chakra(Input, {
  baseStyle: {
    bg: "white",
    _dark: {
      bg: "gray.700",
    },
  },
});

const ModalIcon = chakra(SquaresPlusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

type AccordionInboundType = {
  toggleAccordion: () => void;
  node: NodeType;
};

const NodeAccordion: FC<AccordionInboundType> = ({ toggleAccordion, node }) => {
  const { updateNode, reconnectNode, setDeletingNode } = useNodes();
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<NodeType>({
    defaultValues: node,
    resolver: zodResolver(NodeSchema),
  });
  const handleDeleteNode = setDeletingNode.bind(null, node);

  const { isLoading, mutate } = useMutation(updateNode, {
    onSuccess: () => {
      generateSuccessMessage("节点更新成功", toast);
      queryClient.invalidateQueries(FetchNodesQueryKey);
    },
    onError: (e) => {
      generateErrorMessage(e, toast, form);
    },
  });

  const { isLoading: isReconnecting, mutate: reconnect } = useMutation(
    reconnectNode.bind(null, node),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(FetchNodesQueryKey);
      },
    }
  );

  const expired = isNodeExpired(node.expire_at);
  const nodeStatus: Status = expired
    ? "disabled"
    : isReconnecting
      ? "connecting"
      : node.status
        ? node.status
        : "error";

  return (
    <AccordionItem
      border="1px solid"
      _dark={{ borderColor: "gray.600" }}
      _light={{ borderColor: "gray.200" }}
      borderRadius="4px"
      p={1}
      w="full"
    >
      <AccordionButton px={2} borderRadius="3px" onClick={toggleAccordion}>
        <HStack w="full" justifyContent="space-between" pr={2}>
          <Text
            as="span"
            fontWeight="medium"
            fontSize="sm"
            flex="1"
            textAlign="left"
            color="gray.700"
            _dark={{ color: "gray.300" }}
          >
            {node.name}
          </Text>
          <HStack>
            {node.xray_version && (
              <Badge
                colorScheme="blue"
                rounded="full"
                display="inline-flex"
                px={3}
                py={1}
              >
                <Text
                  textTransform="capitalize"
                  fontSize="0.7rem"
                  fontWeight="medium"
                  letterSpacing="tighter"
                >
                  Xray {node.xray_version}
                </Text>
              </Badge>
            )}
            {node.expire_at ? (
              <Text fontSize="xs" color={expired ? "red.500" : "gray.500"}>
                {expired
                  ? "已到期"
                  : `${dayjs.unix(node.expire_at).format("YYYY-MM-DD")} 到期`}
              </Text>
            ) : null}
            {node.status && (
              <NodeModalStatusBadge
                status={nodeStatus}
                compact
                extraText={expired ? "已到期" : null}
              />
            )}
          </HStack>
        </HStack>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel px={2} pb={2}>
        <VStack pb={3} alignItems="flex-start">
          {nodeStatus === "error" && !expired && (
            <Alert status="error" size="xs">
              <Box>
                <HStack w="full">
                  <AlertIcon w={4} />
                  <Text marginInlineEnd={0}>{node.message}</Text>
                </HStack>
                <HStack justifyContent="flex-end" w="full">
                  <Button
                    size="sm"
                    aria-label="重新连接节点"
                    leftIcon={<ReloadIcon />}
                    onClick={() => reconnect()}
                    disabled={isReconnecting}
                  >
                    {isReconnecting
                      ? "重连中..."
                      : "重新连接"}
                  </Button>
                </HStack>
              </Box>
            </Alert>
          )}
        </VStack>
        <NodeForm
          form={form}
          mutate={mutate}
          isLoading={isLoading}
          submitBtnText={"保存"}
          isEdit
          btnLeftAdornment={
            <Tooltip label={"删除"} placement="top">
              <IconButton
                colorScheme="red"
                variant="ghost"
                size="sm"
                aria-label="删除节点"
                onClick={handleDeleteNode}
              >
                <DeleteIcon />
              </IconButton>
            </Tooltip>
          }
        />
      </AccordionPanel>
    </AccordionItem>
  );
};

type NodeFormType = FC<{
  form: UseFormReturn<NodeType>;
  mutate: UseMutateFunction<unknown, unknown, any>;
  isLoading: boolean;
  submitBtnText: string;
  btnProps?: Partial<ButtonProps>;
  btnLeftAdornment?: ReactNode;
  addAsHost?: boolean;
  isEdit?: boolean;
}>;

const NodeForm: NodeFormType = ({
  form,
  mutate,
  isLoading,
  submitBtnText,
  btnProps = {},
  btnLeftAdornment,
  addAsHost = false,
  isEdit = false,
}) => {
  const duckDedicated = form.watch("duck_dedicated_inbounds") !== false;
  const duckManual = form.watch("duck_manual_ports") === true;
  const proxyPorts = form.watch("proxy_ports");

  const buildPayload = (values: NodeType) => {
    const body: Record<string, unknown> = { ...values };
    delete body.duck_manual_ports;
    delete body.duck_dedicated_inbounds;
    if (isEdit) {
      delete body.proxy_ports;
      delete body.proxy_port;
      delete body.inbound_tags;
      delete body.duck_dedicated_inbounds;
      delete body.add_as_new_host;
      if (body.expire_at === undefined) {
        body.expire_at = null;
      }
      return body;
    }
    if (body.expire_at === undefined) {
      delete body.expire_at;
    }
    if (values.duck_dedicated_inbounds === false) {
      delete body.proxy_ports;
    } else if (!values.duck_manual_ports) {
      delete body.proxy_ports;
      delete body.proxy_port;
    } else if (values.proxy_ports) {
      body.proxy_ports = values.proxy_ports;
    }
    return body;
  };

  return (
    <form onSubmit={form.handleSubmit((v) => mutate(buildPayload(v)))}>
      <VStack>
        <HStack w="full">
          <FormControl>
            <CustomInput
              label={"名称"}
              size="sm"
              placeholder="例如 Duck-S2"
              {...form.register("name")}
              error={form.formState?.errors?.name?.message}
            />
          </FormControl>
          <HStack px={1}>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => {
                return (
                  <Tooltip
                    key={field.value}
                    placement="top"
                    label={
                      `${"状态"}: ` +
                      (field.value !== "disabled" ? "激活" : "禁用")
                    }
                    textTransform="capitalize"
                  >
                    <Box mt="6">
                      <Switch
                        colorScheme="primary"
                        isChecked={field.value !== "disabled"}
                        onChange={(e) => {
                          if (e.target.checked) {
                            field.onChange("connecting");
                          } else {
                            field.onChange("disabled");
                          }
                        }}
                      />
                    </Box>
                  </Tooltip>
                );
              }}
            />
          </HStack>
        </HStack>
        <HStack alignItems="flex-start" w="100%">
          <Box w="100%">
            <CustomInput
              label={"地址"}
              size="sm"
              placeholder="例如 51.20.12.13"
              {...form.register("address")}
              error={form.formState?.errors?.address?.message}
            />
          </Box>
        </HStack>
        {!isEdit && (
          <FormControl py={1}>
            <Checkbox
              defaultChecked
              {...form.register("duck_dedicated_inbounds")}
            >
              <FormLabel m={0}>{"四协议独立入站（VLESS/VMess/Trojan/SS，推荐）"}</FormLabel>
            </Checkbox>
          </FormControl>
        )}
        {!isEdit && duckDedicated && (
          <FormControl py={1}>
            <Checkbox {...form.register("duck_manual_ports")}>
              <FormLabel m={0}>{"自定义四协议端口（不勾选则随机）"}</FormLabel>
            </Checkbox>
          </FormControl>
        )}
        {!isEdit && duckDedicated && duckManual && (
          <HStack alignItems="flex-start" w="100%" flexWrap="wrap">
            {(["vless", "vmess", "trojan", "ss"] as const).map((key) => (
              <Box key={key} minW="45%" flex="1">
                <CustomInput
                  label={duckNodePortLabel[key]}
                  size="sm"
                  placeholder="19769"
                  {...form.register(`proxy_ports.${key}` as const)}
                />
              </Box>
            ))}
          </HStack>
        )}
        {isEdit && proxyPorts ? (
          <Box w="full" fontSize="xs" color="gray.600" _dark={{ color: "gray.400" }}>
            <Text fontWeight="medium" mb={1}>
              {"当前节点代理端口"}
            </Text>
            <Text fontFamily="mono">
              {(
                [
                  ["vless", "VLESS"],
                  ["vmess", "VMess"],
                  ["trojan", "Trojan"],
                  ["ss", "SS"],
                ] as const
              )
                .filter(([k]) => proxyPorts?.[k])
                .map(([k, label]) => `${label} ${proxyPorts?.[k]}`)
                .join(" · ") || "—"}
            </Text>
            <Text mt={1}>
              {"端口由主控分配；安装后可在面板修改节点并保存，主控会重推配置。"}
            </Text>
          </Box>
        ) : null}
        <FormControl w="full">
          <FormLabel>{"到期日期"}</FormLabel>
          <Controller
            control={form.control}
            name="expire_at"
            render={({ field }) => (
              <ReactDatePicker
                locale="zh-cn"
                dateFormat="yyyy-MM-dd"
                isClearable
                selected={
                  field.value
                    ? dayjs.unix(field.value).toDate()
                    : undefined
                }
                onChange={(date: Date | null) => {
                  if (!date) {
                    field.onChange(null);
                    return;
                  }
                  const end = dayjs(date)
                    .hour(23)
                    .minute(59)
                    .second(59);
                  field.onChange(end.unix());
                }}
                customInput={
                  <Input size="sm" borderRadius="6px" clearable={false} />
                }
              />
            )}
          />
          <Text fontSize="xs" color="gray.500" mt={1}>
            {"留空表示永不到期；到期后节点自动下线，订阅中不再包含该节点。"}
          </Text>
        </FormControl>
        <HStack alignItems="flex-start" w="100%">
        <Box>
            <CustomInput
              label={"端口"}
              size="sm"
              placeholder="62050"
              {...form.register("port")}
              error={form.formState?.errors?.port?.message}
            />
          </Box>
          <Box>
            <CustomInput
              label={"API 端口"}
              size="sm"
              placeholder="62051"
              {...form.register("api_port")}
              error={form.formState?.errors?.api_port?.message}
            />
          </Box>
          <Box>
            <CustomInput
              label={"使用系数"}
              size="sm"
              placeholder="1"
              {...form.register("usage_coefficient")}
              error={form.formState?.errors?.usage_coefficient?.message}
            />
          </Box>
        </HStack>
        {addAsHost && !duckDedicated && (
          <FormControl py={1}>
            <Checkbox {...form.register("add_as_new_host")}>
              <FormLabel m={0}>{"为每个入站请求添加此节点作为新主机"}</FormLabel>
            </Checkbox>
          </FormControl>
        )}
        <HStack w="full">
          {btnLeftAdornment}
          <Button
            flexGrow={1}
            type="submit"
            colorScheme="primary"
            size="sm"
            px={5}
            w="full"
            isLoading={isLoading}
            {...btnProps}
          >
            {submitBtnText}
          </Button>
        </HStack>
      </VStack>
    </form>
  );
};

export const NodesDialog: FC = () => {
  const { isEditingNodes, onEditingNodes } = useDashboard();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [openAccordions, setOpenAccordions] = useState<any>({});
  const [installCommand, setInstallCommand] = useState("");
  const [enrollProtocols, setEnrollProtocols] = useState({
    vless: true,
    vmess: false,
    trojan: false,
    ss: false,
  });
  const { data: nodes, isLoading } = useNodesQuery();
  const { enrollNode } = useNodes();

  const onClose = () => {
    setOpenAccordions({});
    onEditingNodes(false);
  };

  const toggleAccordion = (index: number | string) => {
    if (openAccordions[String(index)]) {
      delete openAccordions[String(index)];
    } else openAccordions[String(index)] = {};

    setOpenAccordions({ ...openAccordions });
  };

  return (
    <>
      <Modal isOpen={isEditingNodes} onClose={onClose}>
        <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
        <ModalContent mx="3" w="fit-content" maxW="3xl">
          <ModalHeader pt={6}>
            <Icon color="primary">
              <ModalIcon color="white" />
            </Icon>
          </ModalHeader>
          <ModalCloseButton mt={3} />
          <ModalBody w="440px" pb={6} pt={3}>
            <Text mb={3} opacity={0.8} fontSize="sm">
              {
                "协议在此勾选；端口与 Agent 口由主控分配并写入安装命令。装好后用户/订阅/Host 均在主控操作，节点只跑代理。"
              }
            </Text>
            <FormControl mb={2}>
              <FormLabel fontSize="sm">{"节点协议"}</FormLabel>
              <HStack wrap="wrap" spacing={4}>
                {(
                  [
                    ["vless", "VLESS"],
                    ["vmess", "VMess"],
                    ["trojan", "Trojan"],
                    ["ss", "SS"],
                  ] as const
                ).map(([key, label]) => (
                  <Checkbox
                    key={key}
                    isChecked={enrollProtocols[key]}
                    onChange={(e) =>
                      setEnrollProtocols((s) => ({
                        ...s,
                        [key]: e.target.checked,
                      }))
                    }
                  >
                    {label}
                  </Checkbox>
                ))}
              </HStack>
            </FormControl>
            <Button
              size="sm"
              colorScheme="primary"
              mb={2}
              w="full"
              onClick={async () => {
                const name = window.prompt("新节点名称（如 香港-01）");
                if (!name?.trim()) return;
                const protocols = (
                  Object.entries(enrollProtocols) as [
                    keyof typeof enrollProtocols,
                    boolean
                  ][]
                )
                  .filter(([, on]) => on)
                  .map(([p]) => p);
                if (!protocols.length) {
                  generateErrorMessage(new Error("请至少勾选一种协议"), toast);
                  return;
                }
                try {
                  const res = await enrollNode(name.trim(), protocols);
                  const portsLine = res.proxy_ports
                    ? `# 主控分配端口: ${JSON.stringify(res.proxy_ports)} agent ${res.service_port}/${res.api_port}\n`
                    : "";
                  setInstallCommand(portsLine + res.install_command);
                  queryClient.invalidateQueries(FetchNodesQueryKey);
                  generateSuccessMessage("已生成安装命令，复制到新 VPS 执行", toast);
                } catch (e) {
                  generateErrorMessage(e, toast);
                }
              }}
            >
              {"生成节点安装命令"}
            </Button>
            {installCommand ? (
              <Textarea
                mb={3}
                fontSize="xs"
                rows={3}
                readOnly
                value={installCommand}
                onFocus={(e) => e.target.select()}
              />
            ) : null}
            {isLoading && "加载中..."}

            <Accordion
              w="full"
              allowToggle
              index={Object.keys(openAccordions).map((i) => parseInt(i))}
            >
              <VStack w="full">
                {!isLoading &&
                  nodes &&
                  nodes.map((node, index) => {
                    return (
                      <NodeAccordion
                        toggleAccordion={() => toggleAccordion(index)}
                        key={node.name}
                        node={node}
                      />
                    );
                  })}

              </VStack>
            </Accordion>
          </ModalBody>
        </ModalContent>
      </Modal>
      <DeleteNodeModal deleteCallback={() => setOpenAccordions({})} />
    </>
  );
};
