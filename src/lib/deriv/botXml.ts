import type { MarketAnalysis, StrategyCandidate } from "./types";

export interface BotConfig {
  stake: number;
  martingale: number;
  takeProfit: number;
  stopLoss: number;
  duration: number;
}

export const defaultBotConfig: BotConfig = {
  stake: 1,
  martingale: 2,
  takeProfit: 10,
  stopLoss: 10,
  duration: 1,
};

function tradeTypeCategory(contractType: string): {
  cat: string;
  type: string;
  needsPrediction: boolean;
} {
  switch (contractType) {
    case "DIGITOVER":
    case "DIGITUNDER":
      return { cat: "digits", type: "overunder", needsPrediction: true };
    case "DIGITEVEN":
    case "DIGITODD":
      return { cat: "digits", type: "evenodd", needsPrediction: false };
    case "DIGITMATCH":
    case "DIGITDIFF":
      return { cat: "digits", type: "matchesdiffers", needsPrediction: true };
    default:
      return { cat: "callput", type: "risefall", needsPrediction: false };
  }
}

function esc(value: string | number): string {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function numberBlock(value: number): string {
  return `<block type="math_number"><field name="NUM">${esc(value)}</field></block>`;
}

function variableSet(name: string, value: number): string {
  return `<block type="variables_set"><field name="VAR">${esc(name)}</field><value name="VALUE">${numberBlock(value)}</value></block>`;
}

/**
 * Produces a Deriv Bot (DBot) Blockly workspace XML for one strategy.
 * The result is a starter blueprint: trade definition, purchase, and a
 * martingale-with-limits restart rule. Always review it inside DBot before running.
 */
export function generateBotXml(
  analysis: MarketAnalysis,
  strategy: StrategyCandidate,
  config: BotConfig = defaultBotConfig,
): string {
  const { cat, type, needsPrediction } = tradeTypeCategory(strategy.contractType);
  const sym = analysis.symbol;
  const prediction = strategy.barrier ?? 0;
  const isDigits = cat === "digits";

  const predictionValue = needsPrediction
    ? `<value name="PREDICTION">${numberBlock(prediction)}</value>`
    : "";

  const durationType = isDigits ? "t" : "t";

  return `<xml xmlns="https://developers.google.com/blockly/xml" collection="false">
  <variables>
    <variable id="v_stake">stake</variable>
    <variable id="v_mult">martingale</variable>
    <variable id="v_tp">take_profit</variable>
    <variable id="v_sl">stop_loss</variable>
  </variables>
  <block type="trade_definition" id="trade_def" deletable="false" movable="false" x="0" y="0">
    <statement name="TRADE_OPTIONS">
      <block type="trade_definition_market" deletable="false" movable="false">
        <field name="MARKET_LIST">${esc(sym.market)}</field>
        <field name="SUBMARKET_LIST">${esc(sym.submarket)}</field>
        <field name="SYMBOL_LIST">${esc(sym.symbol)}</field>
        <next>
          <block type="trade_definition_tradetype" deletable="false" movable="false">
            <field name="TRADETYPECAT_LIST">${esc(cat)}</field>
            <field name="TRADETYPE_LIST">${esc(type)}</field>
            <next>
              <block type="trade_definition_contracttype" deletable="false" movable="false">
                <field name="TYPE_LIST">${esc(strategy.contractType)}</field>
                <next>
                  <block type="trade_definition_candleinterval" deletable="false" movable="false">
                    <field name="CANDLEINTERVAL_LIST">60</field>
                    <next>
                      <block type="trade_definition_restartbuysell" deletable="false" movable="false">
                        <field name="TIME_MACHINE_ENABLED">FALSE</field>
                        <next>
                          <block type="trade_definition_restartonerror" deletable="false" movable="false">
                            <field name="RESTARTONERROR">TRUE</field>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </statement>
    <statement name="INITIALIZATION">
      ${variableSet("stake", config.stake).replace(
        "</block>",
        `<next>${variableSet("martingale", config.martingale).replace(
          "</block>",
          `<next>${variableSet("take_profit", config.takeProfit).replace(
            "</block>",
            `<next>${variableSet("stop_loss", config.stopLoss)}</next></block>`,
          )}</next></block>`,
        )}</next></block>`,
      )}
    </statement>
    <statement name="SUBMARKET">
      <block type="trade_definition_tradeoptions">
        <field name="DURATIONTYPE_LIST">${esc(durationType)}</field>
        <field name="CURRENCY_LIST">USD</field>
        <value name="DURATION">${numberBlock(config.duration)}</value>
        <value name="AMOUNT">
          <block type="variables_get"><field name="VAR">stake</field></block>
        </value>
        ${predictionValue}
      </block>
    </statement>
  </block>
  <block type="before_purchase" id="before_purchase" deletable="false" movable="false" x="0" y="480">
    <statement name="BEFOREPURCHASE_STACK">
      <block type="purchase">
        <field name="PURCHASE_LIST">${esc(strategy.contractType)}</field>
      </block>
    </statement>
  </block>
  <block type="after_purchase" id="after_purchase" deletable="false" movable="false" x="0" y="640">
    <statement name="AFTERPURCHASE_STACK">
      <block type="controls_if">
        <value name="IF0">
          <block type="contract_check_result">
            <field name="CHECK_RESULT">win</field>
          </block>
        </value>
        <statement name="DO0">
          ${variableSet("stake", config.stake)}
        </statement>
        <statement name="ELSE">
          <block type="variables_set">
            <field name="VAR">stake</field>
            <value name="VALUE">
              <block type="math_arithmetic">
                <field name="OP">MULTIPLY</field>
                <value name="A"><block type="variables_get"><field name="VAR">stake</field></block></value>
                <value name="B"><block type="variables_get"><field name="VAR">martingale</field></block></value>
              </block>
            </value>
          </block>
        </statement>
        <next>
          <block type="controls_if">
            <value name="IF0">
              <block type="logic_compare">
                <field name="OP">LT</field>
                <value name="A"><block type="total_profit"></block></value>
                <value name="B"><block type="variables_get"><field name="VAR">take_profit</field></block></value>
              </block>
            </value>
            <statement name="DO0">
              <block type="trade_again"></block>
            </statement>
          </block>
        </next>
      </block>
    </statement>
  </block>
</xml>
`;
}

export function botFileName(
  analysis: MarketAnalysis,
  strategy: StrategyCandidate,
): string {
  const slug = `${analysis.symbol.symbol}_${strategy.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `deriv-bot-${slug}.xml`;
}

export function downloadBot(
  analysis: MarketAnalysis,
  strategy: StrategyCandidate,
  config?: BotConfig,
) {
  const xml = generateBotXml(analysis, strategy, config);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = botFileName(analysis, strategy);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
