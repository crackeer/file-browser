import React, {useEffect} from 'react';
import { createFileRoute } from '@tanstack/react-router'
import { Button, Divider, Select, Row } from 'antd';
import {getStorageList} from "../service/database";
export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  useEffect(() => {
    getStorageList('ssh').then(res => {
      console.log('storage list', res)
    })
  }, [])
  return <>
     <div style={{ padding: 20}}>
      选择数据源：
      <Select
        style={{ width: 250, display: 'inline-block', marginRight: 10 }}
        options={[
          { label: 'Option 1', value: '1' },
          { label: 'Option 2', value: '2' },
        ]}
        placeholder="Select an option"

      />
      <Button type="primary">新增</Button>
    </div>
  </>
}