import { useMemo, useState } from "react";
import type { DashboardData } from "../../core/types";
import { Categories } from "./Categories";
import { DashboardFooter, DataNotes } from "./DataNotes";
import { Heatmap } from "./Heatmap";
import { Hero } from "./Hero";
import { KeyStats } from "./KeyStats";
import { MonthlyChart } from "./MonthlyChart";
import { MostRewatched } from "./MostRewatched";
import { TopChannels } from "./TopChannels";
import type { Mode } from "./model";
import "./dashboard.css";
import "./charts.css";
import "./lists.css";

interface DashboardProps {
  data: DashboardData;
  warnings: string[];
}

export function Dashboard({ data, warnings }: DashboardProps) {
  const [period, setPeriod] = useState("all");
  const [mode, setMode] = useState<Mode>("est");
  const periods = useMemo(() => ["all", ...data.years.filter((y) => y !== "all" && data.views[y])], [data]);
  const view = data.views[period] ?? data.views.all;
  const isUb = mode === "ub";

  return (
    <>
      <main className="dash">
        <h1 className="visually-hidden" tabIndex={-1}>
          Your YouTube watch time
        </h1>
        <Hero
          summary={view.summary}
          period={period}
          periods={periods}
          mode={mode}
          onPeriod={setPeriod}
          onMode={setMode}
        />
        <KeyStats summary={view.summary} isUb={isUb} />
        <MonthlyChart monthly={view.monthly} isAll={period === "all"} mode={mode} period={period} />
        <div className="duo">
          <Heatmap heatmap={view.heatmap} summary={view.summary} period={period} isUb={isUb} />
          <Categories categories={view.categories} isUb={isUb} />
        </div>
        <div className="lists">
          <TopChannels channels={view.topChannels} estimateHours={view.summary.estimateHours} isUb={isUb} />
          <MostRewatched videos={view.topVideos} isUb={isUb} />
        </div>
        <DataNotes summary={view.summary} warnings={warnings} />
      </main>
      <DashboardFooter />
    </>
  );
}
