import { RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface ToolbarState {
  query: string;
  market: string;
  strategy: string;
  onlyEdge: boolean;
}

export function ScannerToolbar({
  state,
  markets,
  onChange,
  onRescan,
  busy,
}: {
  state: ToolbarState;
  markets: { value: string; label: string }[];
  onChange: (next: Partial<ToolbarState>) => void;
  onRescan: () => void;
  busy: boolean;
}) {
  return (
    <div className="panel flex flex-wrap items-center gap-2 p-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={state.query}
          onChange={(e) => onChange({ query: e.target.value })}
          placeholder="Filter markets…"
          className="h-9 bg-background pl-8 text-sm"
          aria-label="Filter markets"
        />
      </div>

      <Select value={state.market} onValueChange={(v) => onChange({ market: v })}>
        <SelectTrigger className="h-9 w-[170px] bg-background text-sm">
          <SelectValue placeholder="All markets" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All markets</SelectItem>
          {markets.map((m) => (
            <SelectItem key={m.value} value={m.value}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={state.strategy} onValueChange={(v) => onChange({ strategy: v })}>
        <SelectTrigger className="h-9 w-[180px] bg-background text-sm">
          <SelectValue placeholder="All strategies" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All strategy types</SelectItem>
          <SelectItem value="over_under">Over / Under</SelectItem>
          <SelectItem value="even_odd">Even / Odd</SelectItem>
          <SelectItem value="matches_differs">Matches / Differs</SelectItem>
          <SelectItem value="rise_fall">Rise / Fall</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant={state.onlyEdge ? "default" : "secondary"}
        size="sm"
        className="h-9"
        onClick={() => onChange({ onlyEdge: !state.onlyEdge })}
      >
        Positive edge only
      </Button>

      <Button
        variant="secondary"
        size="sm"
        className="h-9 gap-1.5"
        onClick={onRescan}
        disabled={busy}
      >
        <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
        Rescan
      </Button>
    </div>
  );
}
