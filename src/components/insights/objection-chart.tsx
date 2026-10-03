"use client";

import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/format";

export type ChartGroup = { category: string; label: string; count: number; valueInr: number; share: number };

const SELECTED = "#e9563f";
const RESTING = "#cdbfb3";

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartGroup }[] }) {
  if (!active || !payload?.length) return null;
  const group = payload[0].payload;
  return <div className="mk-tooltip">
    <strong>{group.label}</strong>
    <div>{group.count} {group.count === 1 ? "deal" : "deals"} · {formatINR(group.valueInr)}</div>
    <div className="meta">{Math.round(group.share * 100)}% of stalled deals · click to open</div>
  </div>;
}

/** One series (deal count per stall category): one hue, the selected bar in ember, value + ₹ label at the bar tip. */
export function ObjectionChart({ groups, selected, onSelect }: { groups: ChartGroup[]; selected: string | null; onSelect: (category: string) => void }) {
  const height = groups.length * 38 + 16;
  const max = Math.max(1, ...groups.map((group) => group.count));
  return <div className="mk-chart" style={{ height }} role="img" aria-label={`Stalled deals by objection: ${groups.map((group) => `${group.label} ${group.count}`).join(", ")}`}>
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 96, bottom: 4, left: 0 }} barCategoryGap={10} style={{ cursor: "pointer" }} onClick={(state) => { const index = Number(state?.activeTooltipIndex); if (Number.isInteger(index) && groups[index]) onSelect(groups[index].category); }}>
        <XAxis type="number" hide domain={[0, max]} allowDecimals={false} />
        <YAxis type="category" dataKey="label" width={176} tickLine={false} axisLine={{ stroke: "#e9e0d5" }} tick={{ fill: "#4f4843", fontSize: 13 }} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(233, 86, 63, .06)" }} />
        <Bar dataKey="count" barSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {groups.map((group) => <Cell key={group.category} fill={group.category === selected ? SELECTED : RESTING} />)}
          <LabelList dataKey="count" position="right" offset={8} content={(props) => {
            const { x, y, width, height: barHeight, index } = props as { x: number; y: number; width: number; height: number; index: number };
            const group = groups[index];
            if (!group) return null;
            const isSelected = group.category === selected;
            return <text x={Number(x) + Number(width) + 8} y={Number(y) + Number(barHeight) / 2} dominantBaseline="central" fontSize={12} fill={isSelected ? "#201a17" : "#736a65"} fontWeight={isSelected ? 700 : 500}>
              {group.count} · {formatINR(group.valueInr)}
            </text>;
          }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
