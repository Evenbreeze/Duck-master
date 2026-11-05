import {
  Box,
  CircularProgress,
  Heading,
  Text,
  VStack,
  useColorMode,
} from "@chakra-ui/react";
import { FilterUsageType } from "contexts/DashboardContext";
import { useNodes } from "contexts/NodesContext";
import dayjs from "dayjs";
import { FC, Suspense, useEffect, useState } from "react";
import ReactApexChart from "react-apexcharts";
import { UsageFilter, createUsageConfig } from "./UsageFilter";

export const NodesUsagePanel: FC = () => {
  const { fetchNodesUsage } = useNodes();
  const { colorMode } = useColorMode();
  const usageTitle = "节点流量";
  const [usage, setUsage] = useState(createUsageConfig(colorMode, usageTitle));
  const [usageFilter, setUsageFilter] = useState("1m");

  const fetchUsageWithFilter = (query: FilterUsageType) => {
    fetchNodesUsage(query).then((data) => {
      const labels: string[] = [];
      const series: number[] = [];
      for (const entry of data.usages ?? []) {
        series.push(entry.uplink + entry.downlink);
        labels.push(entry.node_name);
      }
      setUsage(createUsageConfig(colorMode, usageTitle, series, labels));
    });
  };

  useEffect(() => {
    fetchUsageWithFilter({
      start: dayjs().utc().subtract(30, "day").format("YYYY-MM-DDTHH:00:00"),
    });
  }, []);

  return (
    <Box
      p={4}
      borderWidth="1px"
      borderRadius="xl"
      bg="white"
      _dark={{ bg: "gray.750", borderColor: "gray.600" }}
    >
      <Heading size="sm" mb={4}>
        流量分布
      </Heading>
      <VStack gap={4} align="stretch">
        <UsageFilter
          defaultValue={usageFilter}
          onChange={(filter, query) => {
            setUsageFilter(filter);
            fetchUsageWithFilter(query);
          }}
        />
        <Box w="full" maxW="360px" mx="auto">
          <Suspense fallback={<CircularProgress isIndeterminate />}>
            <ReactApexChart
              options={usage.options}
              series={usage.series}
              type="donut"
              height={320}
            />
          </Suspense>
        </Box>
        {!usage.series?.[0]?.length && (
          <Text fontSize="sm" color="gray.500" textAlign="center">
            暂无流量数据
          </Text>
        )}
      </VStack>
    </Box>
  );
};
