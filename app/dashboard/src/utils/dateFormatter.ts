import dayjs from "dayjs";

function durationPart(n: number, unit: string): string {
  return `${Math.abs(n)}${unit}`;
}

export const relativeExpiryDate = (expiryDate: number | null | undefined) => {
  const dateInfo = { status: "", time: "" };
  if (!expiryDate) return dateInfo;

  if (
    dayjs(expiryDate * 1000)
      .utc()
      .isAfter(dayjs().utc())
  ) {
    dateInfo.status = "expires";
  } else {
    dateInfo.status = "expired";
  }

  const durationSlots: string[] = [];
  const duration = dayjs.duration(
    dayjs(expiryDate * 1000)
      .utc()
      .diff(dayjs())
  );

  if (duration.years() !== 0) {
    durationSlots.push(durationPart(duration.years(), "年"));
  }
  if (duration.months() !== 0) {
    durationSlots.push(durationPart(duration.months(), "个月"));
  }
  if (duration.days() !== 0) {
    durationSlots.push(durationPart(duration.days(), "天"));
  }
  if (durationSlots.length === 0) {
    if (duration.hours() !== 0) {
      durationSlots.push(durationPart(duration.hours(), "小时"));
    }
    if (duration.minutes() !== 0) {
      durationSlots.push(durationPart(duration.minutes(), "分钟"));
    }
  }
  dateInfo.time = durationSlots.join(" ");
  return dateInfo;
};
