import { BrickWall, Gem, Sprout, Trees, Wheat } from "lucide-react";

export const RESOURCE_META = {
  wood: { label: "Madeira", icon: Trees, color: "#4ea370" },
  brick: { label: "Tijolo", icon: BrickWall, color: "#d47755" },
  wool: { label: "Lã", icon: Sprout, color: "#9acb78" },
  grain: { label: "Trigo", icon: Wheat, color: "#e5bf59" },
  ore: { label: "Minério", icon: Gem, color: "#8795a5" },
} as const;
