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
  chakra,
  Checkbox,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Switch,
  Text,
  Textarea,
  Tooltip,
  useToast,
  VStack,
} from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  FetchNodesQueryKey,
  NodeSchema,
  NodeType,
  useNodes,
  useNodesQuery,
} from "contexts/NodesContext";
import dayjs from "dayjs";
import { FC, ReactNode, useMemo, useState } from "react";
import ReactDatePicker from "react-datepicker";
import { Controller, useForm, UseFormReturn } from "react-hook-form";
import {
  UseMutateFunction,
  useMutation,
  useQueryClient,
} from "react-query";
import { Status } from "types/User";
import {
  generateErrorMessage,
  generateSuccessMessage,
} from "utils/toastHandler";
import { DeleteIcon } from "components/DeleteUserModal";
import { ReloadIcon } from "components/Filters";
import { Input } from "components/Input";
import { NodeModalStatusBadge } from "components/NodeModalStatusBadge";
import { NodesUsagePanel } from "components/NodesUsagePanel";
import { PageHeader } from "components/PageHeader";
import { fetch } from "service/http";
import { isNodeExpired } from "utils/nodeExpiry";

const PROTO_KEYS = ["vless", "vmess", "trojan", "ss"] as const;
type ProtoKey = (typeof PROTO_KEYS)[number];

const PROTO_LABEL: Record<ProtoKey, string> = {
  vless: "VLESS",
  vmess: "VMess",
  trojan: "Trojan",
  ss: "Shadowsocks",
};

const CustomInput = chakra(Input, {
  baseStyle: {
    bg: "white",
    _dark: { bg: "gray.700" },
  },
});

function protocolFlagsFromNode(node: NodeType) {
  const fromApi = node.protocols ?? [];
  return {
    vless: fromApi.includes("vless") || !!node.proxy_ports?.vless,
    vmess: fromApi.includes("vmess") || !!node.proxy_ports?.vmess,
    trojan: fromApi.includes("trojan") || !!node.proxy_ports?.trojan,
    ss: fromApi.includes("ss") || !!node.proxy_ports?.ss,
  };
}

function nodeFormDefaults(node: NodeType): NodeType {
  return {
    ...node,
    protocol_flags: protocolFlagsFromNode(node),
    reality_sni: node.reality_sni ?? "www.apple.com",
  };
}

const NodeAccordion: FC<{ node: NodeType }> = ({ node }) => {
  const { updateNode, reconnectNode, setDeletingNode } = useNodes();
  const queryClient = useQueryClient();
  const toast = useToast();
  const pending = !node.proxy_ports && node.status === "connecting";

  const form = useForm<NodeType>({
    defaultValues: nodeFormDefaults(node),
    resolver: zodResolver(NodeSchema),
  });

  const handleDeleteNode = setDeletingNode.bind(null, node);

  const { isLoading, mutate } = useMutation(updateNode, {
    onSuccess: () => {
      generateSuccessMessage(
        pending ? "节点已保存" : "已推送到节点，稍候看状态",
        toast
      );
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
      <AccordionButton px={2} borderRadius="3px">
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
              <Badge colorScheme="blue" rounded="full" px={3} py={1}>
                <Text fontSize="0.7rem" fontWeight="medium">
                  Xray {node.xray_version}
                </Text>
              </Badge>
            )}
            {pending && (
              <Badge colorScheme="orange" rounded="full">
                待安装
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
        {nodeStatus === "error" && !expired && (
          <Alert status="error" size="sm" mb={2}>
            <AlertIcon />
            <Box flex="1">
              <Text fontSize="sm">{node.message}</Text>
              <Button
                size="xs"
                mt={2}
                leftIcon={<ReloadIcon />}
                onClick={() => reconnect()}
                isLoading={isReconnecting}
              >
                重新连接
              </Button>
            </Box>
          </Alert>
        )}
        {pending ? (
          <Text fontSize="sm" color="gray.500">
            等待在新 VPS 上执行安装命令。需要改协议请删除此记录后重新添加。
          </Text>
        ) : (
          <NodeEditForm
            node={node}
            form={form}
            mutate={mutate}
            isLoading={isLoading}
            btnLeftAdornment={
              <Tooltip label="删除">
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
        )}
      </AccordionPanel>
    </AccordionItem>
  );
};

const NodeEditForm: FC<{
  node: NodeType;
  form: UseFormReturn<NodeType>;
  mutate: UseMutateFunction<unknown, unknown, NodeType>;
  isLoading: boolean;
  btnLeftAdornment?: ReactNode;
}> = ({ node, form, mutate, isLoading, btnLeftAdornment }) => {
  const flags = form.watch("protocol_flags") ?? protocolFlagsFromNode(form.getValues());

  const buildPayload = (values: NodeType) => {
    const protocols = PROTO_KEYS.filter((k) => flags[k]);
    const proxy_ports: Record<string, number> = {};
    for (const k of protocols) {
      const raw = values.proxy_ports?.[k];
      if (
        raw !== undefined &&
        raw !== null &&
        String(raw).trim() !== "" &&
        !Number.isNaN(Number(raw))
      ) {
        proxy_ports[k] = Number(raw);
      }
    }
    const body: NodeType = {
      id: values.id,
      name: values.name,
      address: values.address,
      port: values.port,
      api_port: values.api_port,
      usage_coefficient: values.usage_coefficient,
      expire_at: values.expire_at ?? null,
      protocols,
      proxy_ports,
      reality_sni: values.reality_sni?.trim() || undefined,
    };
    if (values.status === "disabled") {
      body.status = "disabled";
    } else if (node.status === "disabled") {
      body.status = "connecting";
    }
    return body;
  };

  return (
    <form onSubmit={form.handleSubmit((v) => mutate(buildPayload(v) as NodeType))}>
      <VStack align="stretch" spacing={3}>
        <HStack>
          <CustomInput
            label="名称"
            size="sm"
            flex={1}
            {...form.register("name")}
            error={form.formState.errors.name?.message}
          />
          <Controller
            name="status"
            control={form.control}
            render={({ field }) => (
              <Tooltip label={field.value !== "disabled" ? "启用" : "禁用"}>
                <Box pt={6}>
                  <Switch
                    colorScheme="primary"
                    isChecked={field.value !== "disabled"}
                    onChange={(e) =>
                      field.onChange(e.target.checked ? "connecting" : "disabled")
                    }
                  />
                </Box>
              </Tooltip>
            )}
          />
        </HStack>

        <CustomInput
          label="节点 IP / 域名"
          size="sm"
          placeholder="51.20.12.13"
          {...form.register("address")}
          error={form.formState.errors.address?.message}
        />

        <Box>
          <FormLabel fontSize="sm" mb={1}>
            代理协议（勾选后保存，主控会改配置并推到节点）
          </FormLabel>
          <HStack wrap="wrap" spacing={4}>
            {PROTO_KEYS.map((key) => (
              <Checkbox
                key={key}
                isChecked={!!flags[key]}
                onChange={(e) => {
                  form.setValue(`protocol_flags.${key}`, e.target.checked, {
                    shouldDirty: true,
                  });
                }}
              >
                {PROTO_LABEL[key]}
              </Checkbox>
            ))}
          </HStack>
        </Box>

        <HStack wrap="wrap" align="flex-start">
          {PROTO_KEYS.filter((k) => flags[k]).map((key) => (
            <Box key={key} minW="45%" flex={1}>
              <CustomInput
                label={`${PROTO_LABEL[key]} 端口`}
                size="sm"
                placeholder="留空则主控自动分配"
                {...form.register(`proxy_ports.${key}` as const)}
              />
            </Box>
          ))}
        </HStack>

        {flags.vless && (
          <CustomInput
            label="VLESS REALITY 伪装域名 (SNI)"
            size="sm"
            placeholder="www.apple.com"
            {...form.register("reality_sni")}
            error={form.formState.errors.reality_sni?.message}
          />
        )}

        <HStack>
          <CustomInput
            label="Agent 端口"
            size="sm"
            {...form.register("port")}
            error={form.formState.errors.port?.message}
          />
          <CustomInput
            label="Xray API 端口"
            size="sm"
            {...form.register("api_port")}
            error={form.formState.errors.api_port?.message}
          />
          <CustomInput
            label="流量系数"
            size="sm"
            {...form.register("usage_coefficient")}
          />
        </HStack>

        <FormControl>
          <FormLabel fontSize="sm">到期日</FormLabel>
          <Controller
            control={form.control}
            name="expire_at"
            render={({ field }) => (
              <ReactDatePicker
                locale="zh-cn"
                dateFormat="yyyy-MM-dd"
                isClearable
                selected={
                  field.value ? dayjs.unix(field.value).toDate() : undefined
                }
                onChange={(date: Date | null) => {
                  if (!date) {
                    field.onChange(null);
                    return;
                  }
                  field.onChange(
                    dayjs(date).hour(23).minute(59).second(59).unix()
                  );
                }}
                customInput={
                  <Input size="sm" borderRadius="6px" clearable={false} />
                }
              />
            )}
          />
        </FormControl>

        <HStack w="full">
          {btnLeftAdornment}
          <Button
            flex={1}
            type="submit"
            colorScheme="primary"
            size="sm"
            isLoading={isLoading}
          >
            保存并推送到节点
          </Button>
        </HStack>
      </VStack>
    </form>
  );
};

export const NodesPage: FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [installCommand, setInstallCommand] = useState("");
  const [enrollName, setEnrollName] = useState("");
  const [enrollProtocols, setEnrollProtocols] = useState({
    vless: true,
    vmess: false,
    trojan: false,
    ss: false,
  });
  const { data: nodes, isLoading } = useNodesQuery();
  const { enrollNode } = useNodes();

  const enrollBusy = useMemo(
    () => !enrollName.trim() || !Object.values(enrollProtocols).some(Boolean),
    [enrollName, enrollProtocols]
  );

  return (
    <>
      <PageHeader
        title="节点"
        description="新 VPS 用安装命令接入；已连线节点可改协议、端口与 REALITY 伪装域，保存即同步。"
      />

      <Box
        p={4}
        borderWidth="1px"
        borderRadius="xl"
        bg="white"
        _dark={{ bg: "gray.750", borderColor: "gray.600" }}
        mb={6}
      >
        <Text fontWeight="semibold" fontSize="sm" mb={3}>
          添加节点
        </Text>
              <CustomInput
                label="节点名称"
                size="sm"
                mb={2}
                placeholder="香港-01"
                value={enrollName}
                onChange={(e) => setEnrollName(e.target.value)}
              />
              <FormLabel fontSize="sm">安装时启用的协议</FormLabel>
              <HStack wrap="wrap" spacing={4} mb={3}>
                {PROTO_KEYS.map((key) => (
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
                    {PROTO_LABEL[key]}
                  </Checkbox>
                ))}
              </HStack>
              <Button
                size="sm"
                colorScheme="primary"
                w="full"
                isDisabled={enrollBusy}
                onClick={async () => {
                  const protocols = PROTO_KEYS.filter((p) => enrollProtocols[p]);
                  try {
                    const res = await enrollNode(enrollName.trim(), protocols);
                    const portsLine = res.proxy_ports
                      ? `# 端口 ${JSON.stringify(res.proxy_ports)} · Agent ${res.service_port}/${res.api_port}\n`
                      : "";
                    setInstallCommand(portsLine + res.install_command);
                    queryClient.invalidateQueries(FetchNodesQueryKey);
                    generateSuccessMessage("复制下面命令到新 VPS 执行", toast);
                  } catch (e) {
                    generateErrorMessage(e, toast);
                  }
                }}
              >
                生成安装命令
              </Button>
              {installCommand ? (
                <Textarea
                  mt={2}
                  fontSize="xs"
                  rows={4}
                  readOnly
                  value={installCommand}
                  onFocus={(e) => e.target.select()}
                />
              ) : null}
      </Box>

      <Text fontWeight="semibold" fontSize="sm" mb={3}>
        节点列表
      </Text>
      {isLoading && <Text fontSize="sm">加载中…</Text>}

      <Accordion w="full" allowToggle mb={8}>
        <VStack w="full">
          {!isLoading &&
            nodes?.map((node) => (
              <NodeAccordion key={node.id ?? node.name} node={node} />
            ))}
        </VStack>
      </Accordion>

      <NodesUsagePanel />
    </>
  );
};

export default NodesPage;
