import React from 'react'
import { Card, Tabs, Tag } from 'antd'
import { BarChartOutlined, ExperimentOutlined } from '@ant-design/icons'
import { CATEGORY_TAGS } from './constants'

/**
 * Category filter tabs derived from the tags present in the fetched
 * listings (H-09 split from CryptoMarket.jsx).
 */
const CategoryTabs = ({ allTags, activeCategory, onChange }) => (
  <Card style={{ marginBottom: 16 }}>
    <Tabs
      activeKey={activeCategory}
      onChange={onChange}
      items={[
        { key: 'all', label: <span><BarChartOutlined /> Overview</span> },
        ...allTags.slice(0, 12).map(tag => {
          const catStyle = CATEGORY_TAGS[tag]
          return {
            key: tag,
            label: <span><Tag color={catStyle?.color || 'blue'}>{catStyle?.icon || <ExperimentOutlined />} {tag}</Tag></span>,
          }
        }),
      ]}
    />
  </Card>
)

export default CategoryTabs
