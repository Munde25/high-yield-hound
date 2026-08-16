import { useMemo, useState } from "react";
import { Download, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  botFileName,
  defaultBotConfig,
  downloadBot,
  generateBotXml,
  type BotConfig,
} from "@/lib/deriv/botXml";
import type { MarketAnalysis, StrategyCandidate } from "@/lib/deriv/types";

export function BotExportDialog({
  analysis,
  strategy,
  triggerLabel = "Bot file",
}: {
  analysis: MarketAnalysis;
  strategy: StrategyCandidate;
  triggerLabel?: string;
}) {
  const [config, setConfig] = useState<BotConfig>(defaultBotConfig);
  const xml = useMemo(
    () => generateBotXml(analysis, strategy, config),
    [analysis, strategy, config],
  );

  const field = (
    key: keyof BotConfig,
    label: string,
    step = "1",
    min = "0",
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={key} className="label-eyebrow">
        {label}
      </Label>
      <Input
        id={key}
        type="number"
        step={step}
        min={min}
        value={config[key]}
        onChange={(e) =>
          setConfig((c) => ({ ...c, [key]: Number(e.target.value) || 0 }))
        }
        className="num bg-background"
      />
    </div>
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-1.5">
          <FileCode2 className="size-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-sans">
            {strategy.name} — {analysis.symbol.display_name}
          </DialogTitle>
          <DialogDescription>
            Generates a Deriv Bot (DBot) workspace file. Import it in DBot via
            Bot Builder → Load → Local, then review every block and test on a
            demo account first.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          {field("stake", "Initial stake (USD)", "0.35", "0.35")}
          {field("duration", "Duration (ticks)")}
          {field("martingale", "Loss multiplier", "0.1")}
          {field("takeProfit", "Take profit (USD)", "0.5")}
        </div>

        <div className="rounded-md border border-border bg-background/60 p-3">
          <p className="label-eyebrow mb-1">Output</p>
          <p className="num text-xs text-foreground">{botFileName(analysis, strategy)}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {xml.split("\n").length} lines · contract {strategy.contractType}
            {strategy.barrier !== undefined ? ` · prediction ${strategy.barrier}` : ""}
          </p>
        </div>

        <Button
          className="w-full gap-2"
          onClick={() => {
            downloadBot(analysis, strategy, config);
            toast.success("Bot file downloaded", {
              description: "Load it in DBot and verify the blocks before running.",
            });
          }}
        >
          <Download className="size-4" />
          Download .xml
        </Button>
      </DialogContent>
    </Dialog>
  );
}
