import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Alert,
  AlertDescription,
  AlertIcon,
  Badge,
  Box,
  Button,
  ButtonProps,
  chakra,
  Checkbox,
  Collapse,
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
  Tooltip,
  useToast,
  VStack,
} from "@chakra-ui/react";
import {
  EyeIcon,
  EyeSlashIcon,
  PlusIcon as HeroIconPlusIcon,
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

const PlusIcon = chakra(HeroIconPlusIcon, {
  baseStyle: {
    w: 5,
    h: 5,
    strokeWidth: 2,
  },
});

type AccordionInboundType = {
  toggleAccordion: () => void;
  node: NodeType;
};

const NodeAccordion: FC<AccordionInboundType> = ({ toggleAccordion, node }) => {
  const { updateNode, reconnectNode, regenerateProxyPorts, setDeletingNode } =
    useNodes();
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

  const { isLoading: isRegenerating, mutate: regeneratePorts } = useMutation(
    () => regenerateProxyPorts(node.id!),
    {
      onSuccess: () => {
        generateSuccessMessage("端口已更新，节点正在重连", toast);
        queryClient.invalidateQueries(FetchNodesQueryKey);
      },
      onError: (e) => {
        generateErrorMessage(e, toast, form);
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
          onRegeneratePorts={() => regeneratePorts()}
          isRegenerating={isRegenerating}
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

type AddNodeFormType = {
  toggleAccordion: () => void;
  resetAccordions: () => void;
};

const AddNodeForm: FC<AddNodeFormType> = ({
  toggleAccordion,
  resetAccordions,
}) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { addNode } = useNodes();
  const form = useForm<NodeType>({
    resolver: zodResolver(NodeSchema),
    defaultValues: {
      ...getNodeDefaultValues(),
      add_as_new_host: false,
      duck_dedicated_inbounds: true,
      duck_manual_ports: false,
    },
  });
  const { isLoading, mutate } = useMutation(addNode, {
    onSuccess: () => {
      generateSuccessMessage(
        `节点 ${form.getValues("name")} 添加成功`,
        toast
      );
      queryClient.invalidateQueries(FetchNodesQueryKey);
      form.reset();
      resetAccordions();
    },
    onError: (e) => {
      generateErrorMessage(e, toast, form);
    },
  });
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
        <Text
          as="span"
          fontWeight="medium"
          fontSize="sm"
          flex="1"
          textAlign="left"
          color="gray.700"
          _dark={{ color: "gray.300" }}
          display="flex"
          gap={1}
        >
          <PlusIcon display={"inline-block"} />{" "}
          <span>{"添加新的 Duck 节点"}</span>
        </Text>
      </AccordionButton>
      <AccordionPanel px={2} py={4}>
        <NodeForm
          form={form}
          mutate={mutate}
          isLoading={isLoading}
          submitBtnText={"添加节点"}
          btnProps={{ variant: "solid" }}
          addAsHost
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
  onRegeneratePorts?: () => void;
  isRegenerating?: boolean;
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
  onRegeneratePorts,
  isRegenerating = false,
}) => {
  const [showCertificate, setShowCertificate] = useState(false);
  const duckDedicated = form.watch("duck_dedicated_inbounds") !== false;
  const duckManual = form.watch("duck_manual_ports") === true;
  const proxyPorts = form.watch("proxy_ports");
  const { data: nodeSettings, isLoading: nodeSettingsLoading } = useQuery({
    queryKey: "node-settings",
    queryFn: () =>
      fetch<{
        min_node_version: string;
        certificate: string;
      }>("/node/settings"),
  });
  function selectText(node: HTMLElement) {
    // @ts-ignore
    if (document.body.createTextRange) {
      // @ts-ignore
      const range = document.body.createTextRange();
      range.moveToElementText(node);
      range.select();
    } else if (window.getSelection) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(node);
      selection!.removeAllRanges();
      selection!.addRange(range);
    } else {
      console.warn("Could not select text in node: Unsupported browser.");
    }
  }

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
        {nodeSettings && nodeSettings.certificate && (
          <Alert status="info" alignItems="start">
            <AlertDescription
              display="flex"
              flexDirection="column"
              overflow="hidden"
            >
              <span>{"要设置 Duck 节点，您需要在节点上设置此证书以初始化主服务器和节点之间的安全连接"}</span>
              <HStack justify="end" py={2}>
                <Button
                  as="a"
                  colorScheme="primary"
                  size="xs"
                  download="ssl_client_cert.pem"
                  href={URL.createObjectURL(
                    new Blob([nodeSettings.certificate], { type: "text/plain" })
                  )}
                >
                  {"下载证书"}
                </Button>
                <Tooltip
                  placement="top"
                  label={showCertificate ? "隐藏证书" : "显示证书"}
                >
                  <IconButton
                    aria-label={showCertificate ? "隐藏证书" : "显示证书"}
                    onClick={setShowCertificate.bind(null, !showCertificate)}
                    colorScheme="whiteAlpha"
                    color="primary"
                    size="xs"
                  >
                    {!showCertificate ? (
                      <EyeIcon width="15px" />
                    ) : (
                      <EyeSlashIcon width="15px" />
                    )}
                  </IconButton>
                </Tooltip>
              </HStack>
              <Collapse in={showCertificate} animateOpacity>
                <Text
                  bg="rgba(255,255,255,.5)"
                  _dark={{
                    bg: "rgba(255,255,255,.2)",
                  }}
                  rounded="md"
                  p="2"
                  lineHeight="1.2"
                  fontSize="10px"
                  fontFamily="Courier"
                  whiteSpace="pre"
                  overflow="auto"
                  onClick={(e) => {
                    selectText(e.target as HTMLElement);
                  }}
                >
                  {nodeSettings.certificate}
                </Text>
              </Collapse>
            </AlertDescription>
          </Alert>
        )}

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
              VLESS {proxyPorts?.vless} · VMess {proxyPorts?.vmess} · Trojan{" "}
              {proxyPorts?.trojan} · SS {proxyPorts?.ss}
            </Text>
            {isEdit && onRegeneratePorts && (
              <Button
                size="xs"
                mt={2}
                variant="outline"
                colorScheme="primary"
                isLoading={isRegenerating}
                onClick={onRegeneratePorts}
              >
                {"重新随机四协议端口"}
              </Button>
            )}
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
  const { data: nodes, isLoading } = useNodesQuery();
  const { migrateDuckInbounds } = useNodes();
  const { isLoading: isMigrating, mutate: migrateNodes } = useMutation(
    migrateDuckInbounds,
    {
      onSuccess: (data: { upgraded: number; skipped: number }) => {
        generateSuccessMessage(
          `已升级 ${data.upgraded} 个节点，跳过 ${data.skipped} 个`,
          toast
        );
        queryClient.invalidateQueries(FetchNodesQueryKey);
      },
      onError: (e) => {
        generateErrorMessage(e, toast);
      },
    }
  );

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
              {"使用 Duck-Node，您可以通过在不同的服务器上添加不同的节点来提供多节点负载。"}
            </Text>
            <Button
              size="xs"
              variant="outline"
              colorScheme="primary"
              mb={3}
              isLoading={isMigrating}
              onClick={() => migrateNodes()}
            >
              {"升级全部旧节点（四协议随机端口）"}
            </Button>
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

                <AddNodeForm
                  toggleAccordion={() => toggleAccordion((nodes || []).length)}
                  resetAccordions={() => setOpenAccordions({})}
                />
              </VStack>
            </Accordion>
          </ModalBody>
        </ModalContent>
      </Modal>
      <DeleteNodeModal deleteCallback={() => setOpenAccordions({})} />
    </>
  );
};
