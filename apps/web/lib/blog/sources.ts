import type { BlogSource } from "@/lib/blog/types";

const sources = [
  { id: "bitcoin-dev", title: "Bitcoin Developer Documentation", url: "https://developer.bitcoin.org/" },
  { id: "bitcoin-core", title: "Bitcoin Core", url: "https://github.com/bitcoin/bitcoin" },
  { id: "bitcoin-paper", title: "Bitcoin: A Peer-to-Peer Electronic Cash System", url: "https://bitcoin.org/bitcoin.pdf" },
  { id: "lightning", title: "Lightning Network Specifications", url: "https://github.com/lightning/bolts" },
  { id: "investor-gov", title: "Investor.gov", url: "https://www.investor.gov/" },
  { id: "finra", title: "FINRA Investor Insights", url: "https://www.finra.org/investors" },
  { id: "telegram-bot-api", title: "Telegram Bot API", url: "https://core.telegram.org/bots/api#sendmessage" },
  { id: "cftc", title: "CFTC Learn and Protect", url: "https://www.cftc.gov/LearnAndProtect" },
  { id: "cme", title: "CME Group Education", url: "https://www.cmegroup.com/education.html" },
  { id: "talib", title: "TA-Lib Technical Analysis Library", url: "https://ta-lib.org/" },
  { id: "cfa", title: "CFA Institute Research and Policy Center", url: "https://rpc.cfainstitute.org/" },
  { id: "sec-backtest", title: "SEC Investor Bulletin: Performance Claims", url: "https://www.sec.gov/oiea/investor-alerts-and-bulletins/ib_performanceclaims" },
  { id: "ftc", title: "Federal Trade Commission Scam Advice", url: "https://consumer.ftc.gov/scams" },
  { id: "fbi", title: "FBI Cryptocurrency Investment Fraud", url: "https://www.ic3.gov/PSA/2024/PSA240912" },
  { id: "cisa", title: "CISA Phishing Guidance", url: "https://www.cisa.gov/secure-our-world/recognize-and-report-phishing" },
  { id: "eip20", title: "ERC-20 Token Standard", url: "https://eips.ethereum.org/EIPS/eip-20" },
  { id: "eip2612", title: "ERC-2612 Permit Extension", url: "https://eips.ethereum.org/EIPS/eip-2612" },
  { id: "ethereum-security", title: "Ethereum Security", url: "https://ethereum.org/en/security/" },
  { id: "fsb", title: "Financial Stability Board Crypto-assets", url: "https://www.fsb.org/work-of-the-fsb/financial-innovation-and-structural-change/crypto-assets/" },
  { id: "pcaob", title: "PCAOB Investor Advisory on Proof of Reserve Reports", url: "https://pcaobus.org/news-events/news-releases/news-release-detail/office-of-the-investor-advocate-issues-investor-advisory-on-proof-of-reserve-reports" },
  { id: "coinbase-orders", title: "Coinbase Advanced Order Types", url: "https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/order-types" },
  { id: "coinbase-market-data", title: "Coinbase Exchange Market Data", url: "https://docs.cdp.coinbase.com/exchange/docs/websocket-overview" },
  { id: "kraken-orders", title: "Kraken Order Types", url: "https://support.kraken.com/hc/en-us/sections/200577136-order-types" },
  { id: "kraken-futures", title: "Kraken Derivatives Documentation", url: "https://docs.kraken.com/api/docs/futures-api/trading-settings/general" },
  { id: "tradingview-indicators", title: "TradingView Technical Indicators", url: "https://www.tradingview.com/support/folders/43000547458-technical-indicators/" },
  { id: "bollinger", title: "Bollinger Bands Official Rules", url: "https://www.bollingerbands.com/bollinger-band-rules" },
  { id: "kaiko", title: "Kaiko Data Methodology", url: "https://www.kaiko.com/collections/methodologies" },
  { id: "ledger", title: "Ledger Academy Security", url: "https://www.ledger.com/academy" },
  { id: "trezor", title: "Trezor Knowledge Base", url: "https://trezor.io/learn" },
  { id: "metamask", title: "MetaMask Security Alerts", url: "https://support.metamask.io/stay-safe/protect-yourself/" },
  { id: "ethereum-bridges", title: "Ethereum Bridges", url: "https://ethereum.org/en/bridges/" },
  { id: "ap-bitcoin", title: "Associated Press Bitcoin Coverage", url: "https://apnews.com/hub/bitcoin" },
  { id: "bip32", title: "BIP 32: Hierarchical Deterministic Wallets", url: "https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki" },
  { id: "bip173", title: "BIP 173: Bech32 Addresses", url: "https://github.com/bitcoin/bips/blob/master/bip-0173.mediawiki" },
  { id: "bip350", title: "BIP 350: Bech32m", url: "https://github.com/bitcoin/bips/blob/master/bip-0350.mediawiki" },
  { id: "pardo", title: "The Evaluation and Optimization of Trading Strategies", url: "https://www.wiley.com/en-us/The+Evaluation+and+Optimization+of+Trading+Strategies%2C+2nd+Edition-p-9780470128015" },
  { id: "nber-ta", title: "NBER Foundations of Technical Analysis", url: "https://www.nber.org/papers/w7613" },
  { id: "nyfed-support", title: "Federal Reserve Bank of New York Technical Analysis Study", url: "https://www.newyorkfed.org/research/staff_reports/sr4.html" },
  { id: "eip721", title: "ERC-721 Non-Fungible Token Standard", url: "https://eips.ethereum.org/EIPS/eip-721" },
  { id: "eip1155", title: "ERC-1155 Multi Token Standard", url: "https://eips.ethereum.org/EIPS/eip-1155" },
  { id: "coinbase-funding", title: "Coinbase Perpetual Futures", url: "https://help.coinbase.com/en/coinbase/trading-and-funding/derivatives/futures/perpetual-futures" },
  { id: "coinbase-transfers", title: "Coinbase Exchange Deposits and Withdrawals", url: "https://help.coinbase.com/en/exchange/crypto-transfers/depositing-and-withdrawing" },
  { id: "coinbase-fees", title: "Coinbase Exchange Fees", url: "https://help.coinbase.com/en/exchange/trading-and-funding/exchange-fees" },
  { id: "kraken-fees", title: "Kraken Fee Schedule", url: "https://www.kraken.com/features/fee-schedule" },
  { id: "sec-custody", title: "Investor.gov Crypto Asset Custody Bulletin", url: "https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/crypto-asset-custody" },
  { id: "korean-fsc", title: "Korean Financial Services Commission Fraud Warning", url: "https://www.fsc.go.kr/edu/news/83658?curPage=8&srchCtgry=&srchKey=&srchText=" },
] as const satisfies readonly BlogSource[];

const sourceById: ReadonlyMap<string, BlogSource> = new Map(sources.map((source) => [source.id, source]));

export function resolveBlogSources(ids: readonly string[]): readonly BlogSource[] {
  return ids.map((id) => {
    const source = sourceById.get(id);
    if (!source) throw new Error(`Unknown blog source: ${id}`);
    return source;
  });
}
