// Shared crypto-market constants (H-09 split from CryptoMarket.jsx)
import {
  WalletOutlined,
  ExperimentOutlined,
  BarChartOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
  FireOutlined,
  LinkOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'

export const CMC_LOGO_BASE =
  'https://static.coinmarketcap.com/static-coins/icons/64px'

export const CATEGORY_TAGS = {
  'DeFi': { color: 'orange', icon: <WalletOutlined /> },
  'Layer-1': { color: 'blue', icon: <ExperimentOutlined /> },
  'Smart Contracts': { color: 'purple', icon: <ExperimentOutlined /> },
  'NFT': { color: 'magenta', icon: <BarChartOutlined /> },
  'Exchange-based': { color: 'gold', icon: <TrophyOutlined /> },
  'Privacy': { color: 'cyan', icon: <ClockCircleOutlined /> },
  'Meme': { color: 'volcano', icon: <FireOutlined /> },
  'Gaming': { color: 'green', icon: <ExperimentOutlined /> },
  'Storage': { color: 'geekblue', icon: <LinkOutlined /> },
  'AI': { color: 'pink', icon: <ThunderboltOutlined /> },
}
