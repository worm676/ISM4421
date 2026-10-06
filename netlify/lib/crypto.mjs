// Cryptocurrencies screened by the Crypto Sweetspot view, as Yahoo symbols.
// Only coins with 200+ weeks of Yahoo history are listed (checked Oct 2026),
// since the 200 WMA needs them. Stablecoins are left out. Some Yahoo symbols
// carry a numeric suffix (UNI7083-USD) to tell same-named tokens apart.
export const CRYPTO_AS_OF = "2026-10";
export const CRYPTO = [
  ["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"], ["BNB-USD", "BNB"], ["SOL-USD", "Solana"],
  ["XRP-USD", "XRP"], ["DOGE-USD", "Dogecoin"], ["ADA-USD", "Cardano"], ["TRX-USD", "TRON"],
  ["AVAX-USD", "Avalanche"], ["LINK-USD", "Chainlink"], ["DOT-USD", "Polkadot"], ["SHIB-USD", "Shiba Inu"],
  ["LTC-USD", "Litecoin"], ["BCH-USD", "Bitcoin Cash"], ["XLM-USD", "Stellar"], ["UNI7083-USD", "Uniswap"],
  ["ATOM-USD", "Cosmos"], ["XMR-USD", "Monero"], ["ETC-USD", "Ethereum Classic"], ["HBAR-USD", "Hedera"],
  ["FIL-USD", "Filecoin"], ["APT21794-USD", "Aptos"], ["NEAR-USD", "NEAR Protocol"], ["ICP-USD", "Internet Computer"],
  ["VET-USD", "VeChain"], ["ALGO-USD", "Algorand"], ["AAVE-USD", "Aave"], ["OP-USD", "Optimism"],
  ["MKR-USD", "Maker"], ["INJ-USD", "Injective"], ["GRT6719-USD", "The Graph"], ["STX4847-USD", "Stacks"],
  ["SAND-USD", "The Sandbox"], ["MANA-USD", "Decentraland"], ["AXS-USD", "Axie Infinity"], ["XTZ-USD", "Tezos"],
  ["EOS-USD", "EOS"], ["THETA-USD", "Theta Network"], ["KAS-USD", "Kaspa"], ["CRO-USD", "Cronos"],
  ["RENDER-USD", "Render"], ["WLD-USD", "Worldcoin"], ["FET-USD", "Artificial Superintelligence Alliance"], ["QNT-USD", "Quant"],
  ["EGLD-USD", "MultiversX"], ["FLOW-USD", "Flow"], ["CHZ-USD", "Chiliz"], ["NEO-USD", "Neo"],
  ["ZEC-USD", "Zcash"], ["DASH-USD", "Dash"], ["KCS-USD", "KuCoin Token"], ["LEO-USD", "UNUS SED LEO"],
  ["OKB-USD", "OKB"], ["GT-USD", "GateToken"], ["CAKE-USD", "PancakeSwap"], ["LDO-USD", "Lido DAO"],
  ["CRV-USD", "Curve DAO"], ["SNX-USD", "Synthetix"], ["COMP5692-USD", "Compound"], ["RUNE-USD", "THORChain"],
  ["IMX10603-USD", "Immutable"],
];
