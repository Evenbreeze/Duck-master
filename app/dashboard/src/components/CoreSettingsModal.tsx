import {
  Badge,
  Box,
  Button,
  chakra,
  CircularProgress,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  Tooltip,
  useToast,
  useColorMode
} from "@chakra-ui/react";
import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import { joinPaths } from "@remix-run/router";
import classNames from "classnames";
import { useCoreSettings } from "contexts/CoreSettingsContext";
import { useDashboard } from "contexts/DashboardContext";
import debounce from "lodash.debounce";
import { FC, useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { coreSocketLabel } from "constants/UserSettings";
import { useMutation } from "react-query";
import { ReadyState } from "react-use-websocket";
import { useWebSocket } from "react-use-websocket/dist/lib/use-websocket";
import { getAuthToken } from "utils/authStorage";
import { Icon } from "./Icon";
import { JsonEditor } from "./JsonEditor";
import "./JsonEditor/themes.js";
import { useNodesQuery } from "contexts/NodesContext";

export const MAX_NUMBER_OF_LOGS = 500;

const UsageIcon = chakra(Cog6ToothIcon, {
  baseStyle: {
    w: 5,
    h: 5,
  },
});
export const ReloadIcon = chakra(ArrowPathIcon, {
  baseStyle: {
    w: 4,
    h: 4,
  },
});

export const FullScreenIcon = chakra(ArrowsPointingOutIcon, {
  baseStyle: {
    w: 4,
    h: 4,
  },
});
export const ExitFullScreenIcon = chakra(ArrowsPointingInIcon, {
  baseStyle: {
    w: 3,
    h: 3,
  },
});

const getStatus = (status: string) => {
  return {
    [ReadyState.CONNECTING]: "connecting",
    [ReadyState.OPEN]: "connected",
    [ReadyState.CLOSING]: "closed",
    [ReadyState.CLOSED]: "closed",
    [ReadyState.UNINSTANTIATED]: "closed",
  }[status];
};

const getWebsocketUrl = (nodeID: string) => {
  try {
    let baseURL = new URL(
      import.meta.env.VITE_BASE_API.startsWith("/")
        ? window.location.origin + import.meta.env.VITE_BASE_API
        : import.meta.env.VITE_BASE_API
    );

    return (
      (baseURL.protocol === "https:" ? "wss://" : "ws://") +
      joinPaths([
        baseURL.host + baseURL.pathname,
        !nodeID ? "/core/logs" : `/node/${nodeID}/logs`,
      ]) +
      "?interval=1&token=" +
      getAuthToken()
    );
  } catch (e) {
    console.error("Unable to generate websocket url");
    console.error(e);
    return null;
  }
};

let logsTmp: string[] = [];
const CoreSettingModalContent: FC = () => {

  const { colorMode } = useColorMode();

  const { data: nodes } = useNodesQuery();
  const disabled = false;
  const [selectedNode, setNode] = useState<string>("");

  const handleLog = (id: string, title: string) => {
    if (id === selectedNode) return;
    else if (id === "host") {
      setNode("");
      setLogs([]);
    } else {
      setNode(id);
      setLogs([]);
    }
  };

  const { isEditingCore } = useDashboard();
  const {
    fetchCoreSettings,
    updateConfig,
    isLoading,
    config,
    isPostLoading,
    version,
    restartCore,
  } = useCoreSettings();
  const logsDiv = useRef<HTMLDivElement | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const toast = useToast();
  const form = useForm({
    defaultValues: { config: config || {} },
  });

  useEffect(() => {
    if (config) form.setValue("config", config);
  }, [config]);

  useEffect(() => {
    if (isEditingCore) fetchCoreSettings();
  }, [isEditingCore]);
  "".startsWith;
  const scrollShouldStayOnEnd = useRef(true);
  const updateLogs = useCallback(
    debounce((logs: string[]) => {
      const isScrollOnEnd =
        Math.abs(
          (logsDiv.current?.scrollTop || 0) -
            (logsDiv.current?.scrollHeight || 0) +
            (logsDiv.current?.offsetHeight || 0)
        ) < 10;
      if (logsDiv.current && isScrollOnEnd)
        scrollShouldStayOnEnd.current = true;
      else scrollShouldStayOnEnd.current = false;
      if (logs.length < 40) setLogs(logs);
    }, 300),
    []
  );

  const { readyState } = useWebSocket(getWebsocketUrl(selectedNode), {
    onMessage: (e: any) => {
      logsTmp.push(e.data);
      if (logsTmp.length > MAX_NUMBER_OF_LOGS)
        logsTmp = logsTmp.splice(0, logsTmp.length - MAX_NUMBER_OF_LOGS);
      updateLogs([...logsTmp]);
    },
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 1000,
  });

  useEffect(() => {
    if (logsDiv.current && scrollShouldStayOnEnd.current)
      logsDiv.current.scrollTop = logsDiv.current?.scrollHeight;
  }, [logs]);

  useEffect(() => {
    return () => {
      logsTmp = [];
    };
  }, []);

  const status = getStatus(readyState.toString());

  const { mutate: handleRestartCore, isLoading: isRestarting } =
    useMutation(restartCore);

  const handleOnSave = ({ config }: any) => {
    updateConfig(config)
      .then(() => {
        toast({
          title: "核心设置更新成功",
          status: "success",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      })
      .catch((e) => {
        let message = "配置有误, 请检查";
        if (typeof e.response._data.detail === "object")
          message =
            e.response._data.detail[Object.keys(e.response._data.detail)[0]];
        if (typeof e.response._data.detail === "string")
          message = e.response._data.detail;

        toast({
          title: message,
          status: "error",
          isClosable: true,
          position: "top",
          duration: 3000,
        });
      });
  };
  const editorRef = useRef<HTMLDivElement>(null);
  const [isFullScreen, setFullScreen] = useState(false);
  const handleFullScreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setFullScreen(false);
    } else {
      editorRef.current?.requestFullscreen();
      setFullScreen(true);
    }
  };
  return (
    <form onSubmit={form.handleSubmit(handleOnSave)}>
      <ModalBody>
        <FormControl>
          <HStack justifyContent="space-between" alignItems="flex-start">
            <FormLabel>
              {"配置"}{" "}
              {isLoading && <CircularProgress isIndeterminate size="15px" />}
            </FormLabel>
            <HStack gap={0}>
              <Tooltip label="Xray 版本" placement="top">
                <Badge height="100%" textTransform="lowercase">
                  {version && `v${version}`}
                </Badge>
              </Tooltip>
            </HStack>
          </HStack>
          <Box position="relative" ref={editorRef} minHeight="300px">
            <Controller
              control={form.control}
              name="config"
              render={({ field }) => (
                <JsonEditor json={config} onChange={field.onChange} />
              )}
            />
            <IconButton
              size="xs"
              aria-label="全屏"
              variant="ghost"
              position="absolute"
              top="2"
              right="4"
              onClick={handleFullScreen}
            >
              {!isFullScreen ? <FullScreenIcon /> : <ExitFullScreenIcon />}
            </IconButton>
          </Box>
        </FormControl>
        <FormControl mt="4">
          <HStack
            justifyContent="space-between"
            style={{ paddingBottom: "1rem" }}
          >
            <HStack>
              {nodes?.[0] && (
                <Select
                  size="sm"
                  style={{ width: "auto" }}
                  disabled={disabled}
                  bg={disabled ? "gray.100" : "transparent"}
                  _dark={{
                    bg: disabled ? "gray.600" : "transparent",
                  }}
                  sx={{
                    option: {
                      backgroundColor: colorMode === "dark" ? "#222C3B" : "white"
                    }
                  }}
                  onChange={(v) =>
                    handleLog(
                      v.currentTarget.value,
                      v.currentTarget.selectedOptions[0].text
                    )
                  }
                >
                  <option key={"host"} value={"host"} defaultChecked>
                    Master
                  </option>
                  {nodes &&
                    nodes.map((s) => {
                      return (
                        <option key={s.address} value={String(s.id)}>
                          {s.name}
                        </option>
                      );
                    })}
                </Select>
              )}
              <FormLabel className="w-au">{"日志"}</FormLabel>
            </HStack>
            <Text as={FormLabel}>
              {coreSocketLabel[status ?? "not_connected"] ?? status}
            </Text>
          </HStack>
          <Box
            border="1px solid"
            borderColor="gray.300"
            bg="#F9F9F9"
            _dark={{
              borderColor: "gray.500",
              bg: "#2e3440",
            }}
            borderRadius={5}
            minHeight="200px"
            maxHeight={"250px"}
            p={2}
            overflowY="auto"
            ref={logsDiv}
          >
            {logs.map((message, i) => (
              <Text fontSize="xs" opacity={0.8} key={i} whiteSpace="pre-line">
                {message}
              </Text>
            ))}
          </Box>
        </FormControl>
      </ModalBody>
      <ModalFooter>
        <HStack w="full" justifyContent="space-between">
          <HStack>
            <Box>
              <Button
                size="sm"
                leftIcon={
                  <ReloadIcon
                    className={classNames({
                      "animate-spin": isRestarting,
                    })}
                  />
                }
                onClick={() => handleRestartCore()}
              >
                {isRestarting ? "重启中..." : "重启核心"}
              </Button>
            </Box>
          </HStack>

          <HStack>
            <Button
              size="sm"
              variant="solid"
              colorScheme="primary"
              px="5"
              type="submit"
              isDisabled={isLoading || isPostLoading}
              isLoading={isPostLoading}
            >
              {"保存"}
            </Button>
          </HStack>
        </HStack>
      </ModalFooter>
    </form>
  );
};
export const CoreSettingsModal: FC = () => {
  const { isEditingCore } = useDashboard();
  const onClose = useDashboard.setState.bind(null, { isEditingCore: false });

  return (
    <Modal isOpen={isEditingCore} onClose={onClose} size="3xl">
      <ModalOverlay bg="blackAlpha.300" backdropFilter="blur(10px)" />
      <ModalContent mx="3" w="full">
        <ModalHeader pt={6}>
          <HStack gap={2}>
            <Icon color="primary">
              <UsageIcon color="white" />
            </Icon>
            <Text fontWeight="semibold" fontSize="lg">
              {"核心设置"}
            </Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton mt={3} />
        <CoreSettingModalContent />
      </ModalContent>
    </Modal>
  );
};
