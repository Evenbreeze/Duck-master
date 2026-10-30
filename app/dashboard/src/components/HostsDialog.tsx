import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Badge,
  Box,
  Button,
  Select as ChakraSelect,
  Checkbox,
  Container,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  IconButton,
  InputGroup,
  InputRightElement,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Switch,
  Text,
  Tooltip,
  VStack,
  chakra,
  useToast,
} from "@chakra-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  DocumentDuplicateIcon,
  InformationCircleIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  proxyALPN,
  proxyFingerprint,
  proxyHostSecurity,
} from "constants/Proxies";
import { useHosts } from "contexts/HostsContext";
import { motion } from "framer-motion";
import { FC, useEffect, useState } from "react";
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
} from "react-hook-form";
import "slick-carousel/slick/slick-theme.css";
import "slick-carousel/slick/slick.css";
import { z } from "zod";
import { useDashboard } from "../contexts/DashboardContext";
import { DeleteIcon } from "./DeleteUserModal";
import { Icon } from "./Icon";
import { Input as CustomInput } from "./Input";

export const DuplicateIcon = chakra(DocumentDuplicateIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export const UpIcon = chakra(ArrowUpIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

export const DownIcon = chakra(ArrowDownIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const Select = chakra(ChakraSelect, {
  baseStyle: {
    bg: "white",
    _dark: {
      bg: "gray.700",
    },
  },
});

const Input = chakra(CustomInput, {
  baseStyle: {
    bg: "white",
    _dark: {
      bg: "gray.700",
    },
  },
});

const ModalIcon = chakra(LinkIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});

const InfoIcon = chakra(InformationCircleIcon, {
  baseStyle: {
    w: 4,
    h: 4,
    color: "gray.400",
    cursor: "pointer",
  },
});

const hostsSchema = z.record(
  z.string().min(1),
  z.array(
    z.object({
      remark: z.string().min(1, "备注必填"),
      address: z.string().min(1, "地址必填"),
      port: z
        .string()
        .or(z.number())
        .nullable()
        .transform((value) => {
          if (typeof value === "number") return value;
          if (value !== null && !isNaN(parseInt(value)))
            return Number(parseInt(value));
          return null;
        }),
      path: z.string().nullable(),
      sni: z.string().nullable(),
      host: z.string().nullable(),
      mux_enable: z.boolean().default(false),
      allowinsecure: z.boolean().nullable().default(false),
      is_disabled: z.boolean().default(true),
      fragment_setting: z.string().nullable(),
      noise_setting: z.string().nullable(),
      random_user_agent: z.boolean().default(false),
      security: z.string(),
      alpn: z.string(),
      fingerprint: z.string(),
      use_sni_as_host: z.boolean().default(false),
    })
  )
);

const Error = chakra(FormErrorMessage, {
  baseStyle: {
    color: "red.400",
    display: "block",
    textAlign: "left",
    w: "100%",
  },
});

type AccordionInboundType = {
  hostKey: string;
  isOpen: boolean;
  toggleAccordion: () => void;
};

const AccordionInbound: FC<AccordionInboundType> = ({
  hostKey,
  isOpen,
  toggleAccordion,
}) => {
  const { inbounds } = useDashboard();
  const inbound = [...inbounds.values()]
    .flat()
    .filter((inbound) => inbound.tag === hostKey)[0];

  const form = useFormContext<z.infer<typeof hostsSchema>>();
  const {
    fields: hosts,
    append: addHost,
    remove: removeHost,
    insert: insertHost,
    move: moveHost,
  } = useFieldArray({
    control: form.control,
    name: hostKey,
  });
  const { errors } = form.formState;
  const accordionErrors = errors[hostKey];
  const handleAddHost = () => {
    addHost({
      host: "",
      sni: "",
      port: null,
      path: null,
      address: "",
      remark: "",
      mux_enable: false,
      allowinsecure: false,
      is_disabled: false,
      fragment_setting: "",
      noise_setting: "",
      random_user_agent: false,
      security: "inbound_default",
      alpn: "",
      fingerprint: "",
      use_sni_as_host: false,
    });
  };
  const duplicateHost = (index: number) => {
    if (index < 0 || index >= hosts.length) return;
    const hostToDuplicate = hosts[index];
    insertHost(index + 1, hostToDuplicate);
  };
  useEffect(() => {
    if (accordionErrors && !isOpen) {
      toggleAccordion();
    }
  }, [accordionErrors]);

  const moveHostPosition = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index > 0) {
      moveHost(index, index - 1);
    } else if (direction === "down" && index < hosts.length - 1) {
      moveHost(index, index + 1);
    }
  };

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
        >
          {hostKey}
        </Text>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel px={2} pb={2}>
        <VStack gap={3}>
          {hosts.map((host, index) => {
            return (
              <motion.div
                key={host.id}
                layout
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  layout: { type: "spring", stiffness: 500, damping: 30 },
                  opacity: { duration: 0.1 },
                }}
                id={host.id}
                whileDrag={{ scale: 1.05, zIndex: 10 }}
                style={{
                  width: "100%",
                }}
              >
                <VStack
                  id={host.id}
                  key={host.id}
                  border="1px solid"
                  _dark={{ borderColor: "gray.600", bg: "#273142" }}
                  _light={{ borderColor: "gray.200", bg: "#fcfbfb" }}
                  p={2}
                  w="full"
                  borderRadius="4px"
                >
                  <HStack w="100%" alignItems="flex-start">
                    <FormControl
                      position="relative"
                      zIndex={10}
                      isInvalid={
                        !!(accordionErrors && accordionErrors[index]?.remark)
                      }
                    >
                      <InputGroup>
                        <Input
                          {...form.register(hostKey + "." + index + ".remark")}
                          size="sm"
                          borderRadius="4px"
                          placeholder="备注"
                        />
                        <InputRightElement>
                          <Popover isLazy placement="right">
                            <PopoverTrigger>
                              <Box mt="-8px">
                                <InfoIcon />
                              </Box>
                            </PopoverTrigger>
                            <Portal>
                              <PopoverContent>
                                <PopoverArrow />
                                <PopoverCloseButton />
                                <PopoverBody>
                                  <Box fontSize="xs">
                                    <Text pr="20px">
                                      {"使用这些变量使其可以动态替换"}
                                    </Text>
                                    <Text>
                                      <Badge>
                                        {"{"}SERVER_IP{"}"}
                                      </Badge>{" "}
                                      {"当前服务器的 IP 地址"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}SERVER_IPV6{"}"}
                                      </Badge>{" "}
                                      {"当前服务器的 IPv6 地址"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}USERNAME{"}"}
                                      </Badge>{" "}
                                      {"用户的用户名"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}DATA_USAGE{"}"}
                                      </Badge>{" "}
                                      {"用户当前流量情况"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}DATA_LEFT{"}"}
                                      </Badge>{" "}
                                      {"用户剩余流量情况"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}DATA_LIMIT{"}"}
                                      </Badge>{" "}
                                      {"用户的流量限制"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}DAYS_LEFT{"}"}
                                      </Badge>{" "}
                                      {"用户的剩余天数"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}EXPIRE_DATE{"}"}
                                      </Badge>{" "}
                                      {"用户的有效期"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}JALALI_EXPIRE_DATE{"}"}
                                      </Badge>{" "}
                                      {"用户阳历有效日期"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}TIME_LEFT{"}"}
                                      </Badge>{" "}
                                      {"用户剩余时间"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}STATUS_TEXT{"}"}
                                      </Badge>{" "}
                                      {"用户状态"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}STATUS_EMOJI{"}"}
                                      </Badge>{" "}
                                      {"用户状态作为表情符号 (✅,⌛️,🪫,❌,🔌)"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}PROTOCOL{"}"}
                                      </Badge>{" "}
                                      {"代理协议（例如 VMess）"}
                                    </Text>
                                    <Text mt={1}>
                                      <Badge>
                                        {"{"}TRANSPORT{"}"}
                                      </Badge>{" "}
                                      {"代理传输方法（例如 ws）"}
                                    </Text>
                                  </Box>
                                </PopoverBody>
                              </PopoverContent>
                            </Portal>
                          </Popover>
                        </InputRightElement>
                      </InputGroup>
                      {accordionErrors && accordionErrors[index]?.remark && (
                        <Error>{accordionErrors[index]?.remark?.message}</Error>
                      )}
                    </FormControl>
                  </HStack>
                  <FormControl
                    isInvalid={
                      !!(accordionErrors && accordionErrors[index]?.address)
                    }
                  >
                    <InputGroup>
                      <Input
                        size="sm"
                        borderRadius="4px"
                        placeholder="地址（如 example.com）"
                        {...form.register(hostKey + "." + index + ".address")}
                      />
                      <InputRightElement>
                        <Popover isLazy placement="right">
                          <PopoverTrigger>
                            <Box mt="-8px">
                              <InfoIcon />
                            </Box>
                          </PopoverTrigger>
                          <Portal>
                            <PopoverContent>
                              <PopoverArrow />
                              <PopoverCloseButton />
                              <PopoverBody>
                                <Box fontSize="xs">
                                  <Text pr="20px">{"使用这些变量使其可以动态替换"}</Text>
                                  <Text>
                                    <Badge>
                                      {"{"}SERVER_IP{"}"}
                                    </Badge>{" "}
                                    {"当前服务器的 IP 地址"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}SERVER_IPV6{"}"}
                                    </Badge>{" "}
                                    {"当前服务器的 IPv6 地址"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}USERNAME{"}"}
                                    </Badge>{" "}
                                    {"用户的用户名"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}DATA_USAGE{"}"}
                                    </Badge>{" "}
                                    {"用户当前流量情况"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}DATA_LEFT{"}"}
                                    </Badge>{" "}
                                    {"用户剩余流量情况"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}DATA_LIMIT{"}"}
                                    </Badge>{" "}
                                    {"用户的流量限制"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}DAYS_LEFT{"}"}
                                    </Badge>{" "}
                                    {"用户的剩余天数"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}EXPIRE_DATE{"}"}
                                    </Badge>{" "}
                                    {"用户的有效期"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}JALALI_EXPIRE_DATE{"}"}
                                    </Badge>{" "}
                                    {"用户阳历有效日期"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}TIME_LEFT{"}"}
                                    </Badge>{" "}
                                    {"用户剩余时间"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}STATUS_TEXT{"}"}
                                    </Badge>{" "}
                                    {"用户状态"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}STATUS_EMOJI{"}"}
                                    </Badge>{" "}
                                    {"用户状态作为表情符号 (✅,⌛️,🪫,❌,🔌)"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}PROTOCOL{"}"}
                                    </Badge>{" "}
                                    {"代理协议（例如 VMess）"}
                                  </Text>
                                  <Text mt={1}>
                                    <Badge>
                                      {"{"}TRANSPORT{"}"}
                                    </Badge>{" "}
                                    {"代理传输方法（例如 ws）"}
                                  </Text>
                                </Box>
                              </PopoverBody>
                            </PopoverContent>
                          </Portal>
                        </Popover>
                      </InputRightElement>
                    </InputGroup>
                    {accordionErrors && accordionErrors[index]?.address && (
                      <Error>{accordionErrors[index]?.address?.message}</Error>
                    )}
                  </FormControl>

                  <Accordion w="full" allowToggle>
                    <AccordionItem border="0">
                      <div style={{ display: "flex", alignItems: "center" }}>
                        <AccordionButton
                          display="flex"
                          px={0}
                          py={1}
                          borderRadius={3}
                          _hover={{ bg: "transparent" }}
                        >
                          <Text
                            flex="3"
                            align="start"
                            fontSize="xs"
                            color="gray.600"
                            _dark={{ color: "gray.500" }}
                            pl={1}
                          >
                            {"高级选项"}
                            <AccordionIcon fontSize="sm" ml={1} />
                          </Text>

                          <Container flex="1" px="0" display={"contents"}>
                            <Controller
                              control={form.control}
                              name={`${hostKey}.${index}.is_disabled`}
                              render={({ field }) => {
                                return (
                                  <Switch
                                    mx="1.5"
                                    colorScheme="primary"
                                    {...field}
                                    value={undefined}
                                    isChecked={!field.value}
                                    onChange={(e) => {
                                      console.log(e.target.checked);
                                      field.onChange(!e.target.checked);
                                    }}
                                  />
                                );
                              }}
                            />
                            <Tooltip label="删除" placement="top">
                              <IconButton
                                aria-label="删除"
                                size="sm"
                                colorScheme="red"
                                variant="ghost"
                                onClick={removeHost.bind(null, index)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </Container>
                        </AccordionButton>
                        <Tooltip label="复制" placement="top">
                          <IconButton
                            aria-label="复制"
                            size="sm"
                            colorScheme="white"
                            variant="ghost"
                            onClick={() => duplicateHost(index)}
                          >
                            <DuplicateIcon />
                          </IconButton>
                        </Tooltip>
                        {index < hosts.length - 1 && (
                          <Tooltip label="下移" placement="top">
                            <IconButton
                              aria-label="下移"
                              size="sm"
                              colorScheme="white"
                              variant="ghost"
                              onClick={() => moveHostPosition(index, "down")}
                            >
                              <DownIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                        {index > 0 && (
                          <Tooltip label="上移" placement="top">
                            <IconButton
                              aria-label="上移"
                              size="sm"
                              colorScheme="white"
                              variant="ghost"
                              onClick={() => moveHostPosition(index, "up")}
                            >
                              <UpIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </div>
                      <AccordionPanel w="full" p={1}>
                        <VStack key={index} w="full" borderRadius="4px">
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors && accordionErrors[index]?.port
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              justifyContent="space-between"
                              gap={1}
                              m="0"
                            >
                              <span>{"端口"}</span>
                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {"默认情况下，主机使用入站端口的默认端口。如果此主机是一个服务器，用于从与您的服务器端口不同的端口转发流量，则可以设置自定义端口。例如，服务器可能会将来自端口 8443 的流量转发到您入站服务器的默认端口。"}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder={String(inbound.port || "8080")}
                              type="number"
                              {...form.register(
                                hostKey + "." + index + ".port"
                              )}
                            />
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(accordionErrors && accordionErrors[index]?.sni)
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{"SNI"}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {"默认情况下，主机使用入站 SNI 的默认值。如果此主机是一个服务器且 SNI 不同，则可以设置自定义 SNI。例如，服务器可能会接收带有不同 SSL 证书的流量，执行 SSL 处理并将其转发到您的入站服务器。"}
                                    </Text>
                                    <Text fontSize="xs" mt="2">
                                      使用 <Badge>*</Badge>{" "}
                                      生成随机字符串（在通配符域名中生效）
                                    </Text>
                                    <Text fontSize="xs">
                                      使用 <Badge>,</Badge>{" "}
                                      作为分隔符设置多个地址，使用时每次随机选择一个地址。
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="SNI（如 example.com）"
                              {...form.register(hostKey + "." + index + ".sni")}
                            />
                            {accordionErrors && accordionErrors[index]?.sni && (
                              <Error>
                                {accordionErrors[index]?.sni?.message}
                              </Error>
                            )}
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors && accordionErrors[index]?.host
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{"请求主机"}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {"默认情况下，如果在 Xray 配置中设置了请求主机，则使用该主机。但是，如果需要，您可以在此处设置自定义请求主机。"}
                                    </Text>
                                    <Text fontSize="xs" mt="2">
                                      使用 <Badge>*</Badge>{" "}
                                      生成随机字符串（在通配符域名中生效）
                                    </Text>
                                    <Text fontSize="xs">
                                      使用 <Badge>,</Badge>{" "}
                                      作为分隔符设置多个地址，使用时每次随机选择一个地址。
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="主机（如 example.com）"
                              {...form.register(
                                hostKey + "." + index + ".host"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.host && (
                                <Error>
                                  {accordionErrors[index]?.host?.message}
                                </Error>
                              )}
                          </FormControl>

                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors && accordionErrors[index]?.path
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{"路径"}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {"为主机用户设置路径，通常在反向代理中使用。"}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="路径（如 /vless）"
                              {...form.register(
                                hostKey + "." + index + ".path"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.path && (
                                <Error>
                                  {accordionErrors[index]?.path?.message}
                                </Error>
                              )}
                          </FormControl>

                          <FormControl height="66px">
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{"安全层"}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {"如果此主机的中间件服务器使用的安全层与入站默认值不同，则可以在此处设置自定义安全层。"}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Select
                              size="sm"
                              {...form.register(
                                hostKey + "." + index + ".security"
                              )}
                            >
                              {proxyHostSecurity.map((s) => {
                                return (
                                  <option key={s.value} value={s.value}>
                                    {s.title}
                                  </option>
                                );
                              })}
                            </Select>
                          </FormControl>

                          <FormControl height="66px">
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{"ALPN"}</span>
                            </FormLabel>
                            <Select
                              size="sm"
                              {...form.register(
                                hostKey + "." + index + ".alpn"
                              )}
                            >
                              {proxyALPN.map((s) => {
                                return (
                                  <option key={s.value} value={s.value}>
                                    {s.title}
                                  </option>
                                );
                              })}
                            </Select>
                          </FormControl>

                          <FormControl height="66px">
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{"指纹"}</span>
                            </FormLabel>
                            <Select
                              size="sm"
                              {...form.register(
                                hostKey + "." + index + ".fingerprint"
                              )}
                            >
                              {proxyFingerprint.map((s) => {
                                return (
                                  <option key={s.value} value={s.value}>
                                    {s.title}
                                  </option>
                                );
                              })}
                            </Select>
                          </FormControl>

                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.fragment_setting
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{"碎片图案"}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {"length,interval,packet (e.g. 10-100,100-200,tlshello)"}
                                    </Text>
                                    <Text fontSize="xs" pr={5} pt={2} pb={1}>
                                      {"示例："}
                                    </Text>
                                    <Text fontSize="xs" pr={5}>
                                      100-200,10-20,tlshello
                                    </Text>
                                    <Text fontSize="xs" pr={5}>
                                      100-200,10-20,1-3
                                    </Text>
                                    <Text fontSize="xs" pr={5} pt="3">
                                      {"请注意：当前特性仅支持 streisand >= 1.6.12 和 v2rayNG >= 1.8.16（自定义配置）"}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="按模式填写碎片参数"
                              {...form.register(
                                hostKey + "." + index + ".fragment_setting"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.fragment_setting && (
                                <Error>
                                  {
                                    accordionErrors[index]?.fragment_setting
                                      ?.message
                                  }
                                </Error>
                              )}
                          </FormControl>

                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.noise_setting
                              )
                            }
                          >
                            <FormLabel
                              display="flex"
                              pb={1}
                              alignItems="center"
                              gap={1}
                              justifyContent="space-between"
                              m="0"
                            >
                              <span>{"噪声模式"}</span>

                              <Popover isLazy placement="right">
                                <PopoverTrigger>
                                  <InfoIcon />
                                </PopoverTrigger>
                                <Portal>
                                  <PopoverContent p={2}>
                                    <PopoverArrow />
                                    <PopoverCloseButton />
                                    <Text fontSize="xs" pr={5}>
                                      {"packet,delay (e.g. rand:10-20,100-200)"}
                                    </Text>
                                    <Text fontSize="xs" pr={5} pt={2} pb={1}>
                                      {"示例："}
                                    </Text>
                                    <Text fontSize="xs" pr={5}>
                                      rand:10-20,10-20
                                    </Text>
                                    <Text fontSize="xs" pr={5}>
                                      rand:10-20,10-20&base64:7nQBAAABAAAAAAAABnQtcmluZwZtc2VkZ2UDbmV0AAABAAE=,10-25
                                    </Text>
                                    <Text fontSize="xs" pr={5} pt="3">
                                      {"请注意：当前特性仅支持 streisand >= 1.6.32 和 v2rayNG >= 1.8.39（自定义配置）"}
                                    </Text>
                                  </PopoverContent>
                                </Portal>
                              </Popover>
                            </FormLabel>
                            <Input
                              size="sm"
                              borderRadius="4px"
                              placeholder="按模式填写噪声参数"
                              {...form.register(
                                hostKey + "." + index + ".noise_setting"
                              )}
                            />
                            {accordionErrors &&
                              accordionErrors[index]?.noise_setting && (
                                <Error>
                                  {
                                    accordionErrors[index]?.noise_setting
                                      ?.message
                                  }
                                </Error>
                              )}
                          </FormControl>


                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.use_sni_as_host
                              )
                            }
                          >
                            <Checkbox
                              {...form.register(
                                hostKey + "." + index + ".use_sni_as_host"
                              )}
                            >
                              <FormLabel>
                                {"使用 SNI 作为请求主机"}
                              </FormLabel>
                            </Checkbox>
                            {accordionErrors &&
                              accordionErrors[index]?.use_sni_as_host && (
                                <Error>
                                  {
                                    accordionErrors[index]?.use_sni_as_host
                                      ?.message
                                  }
                                </Error>
                              )}
                        </FormControl>
                         <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.allowinsecure
                              )
                            }
                          >
                            <Checkbox
                              {...form.register(
                                hostKey + "." + index + ".allowinsecure"
                              )}
                              name={hostKey + "." + index + ".allowinsecure"}
                            >
                              <FormLabel>
                                {"允许不安全连接"}
                              </FormLabel>
                              {accordionErrors &&
                                accordionErrors[index]?.allowinsecure && (
                                  <Error>
                                    {
                                      accordionErrors[index]?.allowinsecure
                                        ?.message
                                    }
                                  </Error>
                                )}
                            </Checkbox>
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.mux_enable
                              )
                            }
                          >
                            <Checkbox
                              {...form.register(
                                hostKey + "." + index + ".mux_enable"
                              )}
                            >
                              <FormLabel>
                                {"使能够 MUX"}
                              </FormLabel>
                            </Checkbox>
                            {accordionErrors &&
                              accordionErrors[index]?.mux_enable && (
                                <Error>
                                  {accordionErrors[index]?.mux_enable?.message}
                                </Error>
                              )}
                          </FormControl>
                          <FormControl
                            isInvalid={
                              !!(
                                accordionErrors &&
                                accordionErrors[index]?.random_user_agent
                              )
                            }
                          >
                            <Checkbox
                              {...form.register(
                                hostKey + "." + index + ".random_user_agent"
                              )}
                            >
                              <FormLabel>
                                {"使用随机用户代理"}
                              </FormLabel>
                            </Checkbox>
                            {accordionErrors &&
                              accordionErrors[index]?.random_user_agent && (
                                <Error>
                                  {
                                    accordionErrors[index]?.random_user_agent
                                      ?.message
                                  }
                                </Error>
                              )}
                          </FormControl>
                        </VStack>
                      </AccordionPanel>
                    </AccordionItem>
                  </Accordion>
                </VStack>
              </motion.div>
            );
          })}
          <Button
            variant="outline"
            w="full"
            size="sm"
            color=""
            fontWeight={"normal"}
            onClick={handleAddHost}
          >
            {"添加主机"}
          </Button>
        </VStack>
      </AccordionPanel>
    </AccordionItem>
  );
};

export const HostsDialog: FC = () => {
  const { isEditingHosts, onEditingHosts, refetchUsers, inbounds } =
    useDashboard();
  const { isLoading, hosts, fetchHosts, isPostLoading, setHosts } = useHosts();
  const toast = useToast();
  const [openAccordions, setOpenAccordions] = useState<any>({});

  useEffect(() => {
    if (isEditingHosts) fetchHosts();
  }, [isEditingHosts]);
  const form = useForm<z.infer<typeof hostsSchema>>({
    resolver: zodResolver(hostsSchema),
  });

  useEffect(() => {
    if (hosts && isEditingHosts) {
      form.reset(hosts);
    }
  }, [hosts]);

  const onClose = () => {
    setOpenAccordions({});
    onEditingHosts(false);
  };
  const handleFormSubmit = (hosts: z.infer<typeof hostsSchema>) => {
    setHosts(hosts)
      .then(() => {
        toast({
          title: "设置保存成功",
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
        refetchUsers();
      })
      .catch((err) => {
        if (err?.response?.status === 409 || err?.response?.status === 400) {
          toast({
            title: err.response?._data?.detail,
            status: "error",
            isClosable: true,
            position: "top",
            duration: 3000,
          });
        }
        if (err?.response?.status === 422) {
          Object.keys(err.response._data.detail).forEach((key) => {
            toast({
              title: err.response._data.detail[key] + " (" + key + ")",
              status: "error",
              isClosable: true,
              position: "top",
              duration: 3000,
            });
          });
        }
      });
  };

  const toggleAccordion = (index: number) => {
    if (openAccordions[String(index)]) {
      delete openAccordions[String(index)];
    } else openAccordions[String(index)] = {};

    setOpenAccordions({ ...openAccordions });
  };

  return (
    <Modal isOpen={isEditingHosts} onClose={onClose}>
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3" w="fit-content" maxW="3xl">
        <ModalHeader pt={6}>
          <Icon color="primary">
            <ModalIcon color="white" />
          </Icon>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        <ModalBody w="440px" pb={3} pt={3}>
          <FormProvider {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)}>
              <Text mb={3} opacity={0.8} fontSize="sm">
                {"使用此设置，您可以为每个入站分配特定的地址。"}
              </Text>
              {isLoading && "加载中..."}
              {!isLoading &&
                hosts &&
                (Object.keys(hosts).length > 0 ? (
                  <Accordion
                    w="full"
                    allowToggle
                    allowMultiple
                    index={Object.keys(openAccordions).map((i) => parseInt(i))}
                  >
                    <VStack w="full">
                      {Object.keys(hosts).map((hostKey, index) => {
                        return (
                          <AccordionInbound
                            toggleAccordion={() => toggleAccordion(index)}
                            isOpen={openAccordions[String(index)]}
                            key={hostKey}
                            hostKey={hostKey}
                          />
                        );
                      })}
                    </VStack>
                  </Accordion>
                ) : (
                  "No inbound found. Please check your Xray config file."
                ))}

              <HStack justifyContent="flex-end" py={2}>
                <Button
                  variant="solid"
                  mt="2"
                  type="submit"
                  colorScheme="primary"
                  size="sm"
                  px={5}
                  isLoading={isPostLoading}
                  disabled={isPostLoading}
                >
                  {"保存"}
                </Button>
              </HStack>
            </form>
          </FormProvider>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};
