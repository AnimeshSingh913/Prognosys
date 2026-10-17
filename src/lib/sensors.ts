/** NASA C-MAPSS sensor channels (Saxena et al., 2008). */
export const SENSOR_INFO: Record<string, { symbol: string; description: string }> = {
  sensor_1: { symbol: "T2", description: "Total temperature at fan inlet" },
  sensor_2: { symbol: "T24", description: "Total temperature at LPC outlet" },
  sensor_3: { symbol: "T30", description: "Total temperature at HPC outlet" },
  sensor_4: { symbol: "T50", description: "Total temperature at LPT outlet" },
  sensor_5: { symbol: "P2", description: "Pressure at fan inlet" },
  sensor_6: { symbol: "P15", description: "Total pressure in bypass duct" },
  sensor_7: { symbol: "P30", description: "Total pressure at HPC outlet" },
  sensor_8: { symbol: "Nf", description: "Physical fan speed" },
  sensor_9: { symbol: "Nc", description: "Physical core speed" },
  sensor_10: { symbol: "epr", description: "Engine pressure ratio" },
  sensor_11: { symbol: "Ps30", description: "Static pressure at HPC outlet" },
  sensor_12: { symbol: "phi", description: "Fuel flow to Ps30 ratio" },
  sensor_13: { symbol: "NRf", description: "Corrected fan speed" },
  sensor_14: { symbol: "NRc", description: "Corrected core speed" },
  sensor_15: { symbol: "BPR", description: "Bypass ratio" },
  sensor_16: { symbol: "farB", description: "Burner fuel-air ratio" },
  sensor_17: { symbol: "htBleed", description: "Bleed enthalpy" },
  sensor_18: { symbol: "Nf_dmd", description: "Demanded fan speed" },
  sensor_19: { symbol: "PCNfR_dmd", description: "Demanded corrected fan speed" },
  sensor_20: { symbol: "W31", description: "HPT coolant bleed" },
  sensor_21: { symbol: "W32", description: "LPT coolant bleed" },
};

/** "sensor_11" -> "Sensor 11" */
export const formatSensorName = (sensor: string) => sensor.replace(/^sensor_/, "Sensor ");

export const sensorDescription = (sensor: string) => SENSOR_INFO[sensor]?.description ?? "";
