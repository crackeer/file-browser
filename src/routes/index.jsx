import React, { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router'
import { Button, Space, Select, Modal, Table, Typography, Divider } from 'antd';
import { getStorageList } from "../service/database";
import { sshConnectByPassword, sshListFiles, sshDisconnect } from "../service/invoke"
import lodash from 'lodash'
const { Link } = Typography;
export const Route = createFileRoute('/')({
    component: Index,
})

async function generateQuickDirs(directory) {
    if (directory.length < 1) {
        return []
    }
    let sep = '/';
    let parts = directory.split(sep)
    let list = []
    for (var i = 0; i < parts.length; i++) {
        if (parts[i].length > 0) {
            list.push({
                path: parts.slice(0, i + 1).join(sep),
                name: parts[i]
            })
        }
    }
    return list
}

function Index() {
    const [list, setList] = useState([]);
    const [serverID, setServerID] = useState(0);
    const [server, setServer] = useState(null);
    const [connectKey, setConnectKey] = useState('');
    const [modal, contextHolder] = Modal.useModal();
    const [loading, setLoading] = useState(false);
    const [currentPath, setCurrentPath] = useState('');
    const [files, setFiles] = useState([])
    const [quickDirs, setQuickDirs] = useState([])
    const columns = [
        {
            'title': '名字',
            'dataIndex': 'name',
            'key': 'name',
            'width': '30%',
            'render': (col, record, index) => (
                record.is_dir ? <a href="javascript:;" onClick={changeDir.bind(this, record.name)} style={{ textDecoration: 'none' }}>{record.name}</a> : <span>{record.name}</span>
            )
        },
        {
            'title': '权限',
            'dataIndex': 'access',
            'key': 'access',
        },
        {
            'title': '时间',
            'dataIndex': 'time',
            'key': 'month',
            'render': (col, record, index) => (
                <>
                    {record.month} {record.day} {record.time}
                </>
            )

        },
        {
            'title': '大小',
            'dataIndex': 'size_text',
            'key': 'size_text',
        },
        {
            'title': '用户',
            'dataIndex': 'user',
            'key': 'user',
        },
        {
            'title': '操作',
            'key': 'opt',
            'align': 'center',
            'render': (col, record, index) => {
                return <Space>
                    <Button onClick={toDeleteFile.bind(this, record)} size="mini" type='text' status="danger">删除</Button>
                </Space>
            }
        }
    ]
    useEffect(() => {
        getStorageList('ssh').then(res => {
            setList(res)
            if (res.length > 0) {
                setServerID(res[0].id)
                setServer(res[0])
            }
        })
    }, [])
    const gotoDir = async (item) => {
        setCurrentPath(item.path)
        listFiles(connectKey, server.config.directory, item.path)
    }

    var onChangeServer = (val) => {
        setServerID(val)
        for (var i = 0; i < list.length; i++) {
            if (list[i].id == val) {
                setServer(list[i])
            }
        }
    }
    const changeDir = async (name) => {
        setCurrentPath(currentPath + '/' + name)
        listFiles(connectKey, server.config.directory, currentPath + '/' + name)
    }


    const toDeleteFile = (file) => {
        console.log(file)
    }

    const disconnectSSH = async () => {
        console.log('disconnectSSH')
        await sshDisconnect(connectKey)
        setConnectKey('')
        setCurrentPath('')
        setFiles([])
        setQuickDirs([])
    }

    var connectSSH = async () => {
        let connectKey = await sshConnectByPassword("ssh-" + server.id, server.config.address, server.config.port, server.config.username, server.config.password)
        if (connectKey == undefined) {
            modal.error({
                content: '连接失败',
            })
            return
        }
        setConnectKey(connectKey)
        setCurrentPath('')
        listFiles(connectKey, server.config.directory, '')
    }

    const listFiles = async (key, basePath, relativePath) => {
        if (key.length < 1) {
            return
        }
        let quickDirs = await generateQuickDirs(relativePath)
        let remoteDir = lodash.trimEnd(basePath, '/') + '/' + lodash.trimStart(relativePath, '/')
        setQuickDirs(quickDirs)
        setLoading(true)
        let files = await sshListFiles(key, remoteDir)
        setLoading(false)
        console.log('files', files)
        setFiles(files)
    }

    return <div style={{ padding: 20 }}>
        <div>
            选择数据源：
            <Select style={{ width: '50%', display: 'inline-block', marginRight: 10 }} value={serverID} onChange={onChangeServer} disabled={connectKey.length > 0}>
                {
                    list.map(item => {
                        return <Select.Option value={item.id}>{item.name} - {item.config.address} - {item.config.directory}</Select.Option>
                    })
                }
            </Select>
            {
                serverID > 0 && connectKey.length < 1 ? <Button type="primary" onClick={connectSSH}>连接</Button> : null
            }
            {
                connectKey.length > 0 && <Button type="primary" onClick={disconnectSSH}>断开</Button>
            }
            {contextHolder}
        </div>
        <Divider />
        {
            connectKey.length > 0 ? <div style={{ marginBottom: 10 }}>
                <Space split={"/"} align={'center'} style={{ marginRight: '0', marginBottom: '10px' }}>
                    <Link onClick={gotoDir.bind(this, { path: '' })} key={'/'}>{server != null ? server.config.directory : '/'}</Link>
                    {
                        quickDirs.map(item => {
                            return <Link onClick={gotoDir.bind(this, item)} key={item.path}>{item.name}</Link>
                        })
                    }
                </Space>

            </div> : null
        }
        <Table dataSource={files}
            columns={columns}
            size="small"
            pagination={false} rowKey={'name'} scroll={{ y: 1000 }} footer={null} loading={loading} />

    </div>
}