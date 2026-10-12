import type { HostVerdict } from "../shared/host";

export interface StartProfile {
  id: string;
  label: string;
  expectedGb: number;
  peakGb: number;
}

export const startProfiles: StartProfile[] = [
  { id: "emulator", label: "Android emulator", expectedGb: 3.5, peakGb: 26.6 },
  {
    id: "nest-watch",
    label: "Backend with auto-reload (nest --watch)",
    expectedGb: 1.5,
    peakGb: 1.6,
  },
  {
    id: "backend-plain",
    label: "Backend without auto-reload (node dist/main)",
    expectedGb: 0.35,
    peakGb: 0.4,
  },
  { id: "tsc-watch", label: "tsc watch pair (protocol and client)", expectedGb: 1.6, peakGb: 1.8 },
  { id: "expo-metro", label: "Expo/Metro web server", expectedGb: 1.4, peakGb: 1.6 },
  { id: "gradle", label: "Gradle and Kotlin build", expectedGb: 4, peakGb: 4.5 },
];

export function verdictFor(
  totalGb: number,
  availableGb: number,
  expectedGb: number,
  peakGb: number,
): HostVerdict {
  const floor = Math.min(8, totalGb * 0.128);
  const reserve = Math.min(5, totalGb * 0.08);
  const comfort = Math.min(10, totalGb * 0.16);
  if (availableGb < floor) return "avoid";
  const freeAfter = availableGb - expectedGb;
  if (freeAfter < reserve) return "avoid";
  if (freeAfter >= comfort && availableGb - peakGb >= reserve) return "fits";
  return "tight";
}
