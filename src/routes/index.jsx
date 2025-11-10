import React, { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router'
import { Button, Divider, Select, Row } from 'antd';
import { getStorageList } from "../service/database";
export const Route = createFileRoute('/')({
    component: Index,
})

function Index() {
    const [list, setList] = useState([]);
    const [serverID, setServerID] = useState(0);
    useEffect(() => {
        getStorageList('ssh').then(res => {
            setList(res)
            if (res.length > 0) {
                setServerID(res[0].id)
            }
        })
    }, [])

    var connectSSH = () => {
        console.log(serverID)
    }
    return <>
        <div style={{ padding: 20 }}>
            选择数据源：
            <Select
                style={{ width: 300, display: 'inline-block', marginRight: 10 }} value={serverID} onChange={(val) => {
                    setServerID(val)
                }}>
                {
                    list.map(item => {
                        return <Select.Option value={item.id}>{item.name}</Select.Option>
                    })
                }
                </Select>
            <Button type="primary" onClick={connectSSH}>连接</Button>
        </div>
    </>
}