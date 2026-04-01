import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import clsx from "clsx";

interface ScoreCardProps {
  title: string;
  score: number;
  trend: "up" | "down" | "stable";
  address: string;
}

export default function ScoreCard({ title, score, trend, address }: ScoreCardProps) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-emerald-500" : trend === "down" ? "text-red-500" : "text-gray-400";
  const scoreColor = score >= 80 ? "text-emerald-500" : score >= 60 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{address}</p>
        </div>
        <TrendIcon size={18} className={trendColor} />
      </div>
      <div className={clsx("text-4xl font-bold mt-3", scoreColor)}>{score}</div>
      <div className="mt-3 h-2 bg-gray-100 rounded-full">
        <div
          className={clsx("h-2 rounded-full transition-all", score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500")}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-2">종합 인사이트 점수 / 100</p>
    </div>
  );
}
