import type { ClusterRow } from "@/lib/api";

export type ClusterLabel = "slow" | "moderate" | "fast";

/**
 * The API numbers clusters by mean degradation span: 0 is the slowest group and the
 * highest id is the fastest.
 */
export function labelClusters(clusters: ClusterRow[]) {
  const clusterCount = clusters.reduce((max, c) => Math.max(max, c.cluster + 1), 0);
  const label = (id: number): ClusterLabel => {
    if (clusterCount <= 1 || id === 0) return "slow";
    if (id === clusterCount - 1) return "fast";
    return "moderate";
  };

  return [...clusters]
    .sort((a, b) => b.degradation_span - a.degradation_span)
    .map((c) => ({
      machine_id: c.engine_id,
      operating_cycles: c.cycles,
      degradation_span: c.degradation_span,
      cluster: label(c.cluster),
    }));
}
