import React, { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router'
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Space, Select, Modal, Table, Typography, Card, message, Progress, Statistic, Col, Row, Spin, Alert, Popconfirm, Input, Empty } from 'antd';
import { SyncOutlined, UploadOutlined, FolderAddOutlined } from '@ant-design/icons';
import { sshConnectByPassword, sshListFiles, sshDisconnect, deleteRemoteFile, uploadRemoteFileSync, getTransferProgress, cancelFileTransfer, createRemoteDir } from "../service/invoke"
import lodash from 'lodash'
import { basename } from '@tauri-apps/api/path'
import { useSSHStore } from '../store/ssh';
import { partial } from "filesize";
const { Link } = Typography;

const fileSize = partial({ base: 2, standard: "jedec" });

export const Route = createFileRoute('/ssh')({
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
    const { getServers,
        servers, serverID, setServerID, connectKey, setConnectKey, server, quickDirs, setQuickDirs, files, setFiles, currentPath, setCurrentPath } = useSSHStore();
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [handleStatus, setHandleStatus] = useState('');
    const [handleMessage, setHandleMessage] = useState('');
    const [uploadConfig, setUploadConfig] = useState(null);
    const [count, setCount] = useState(0)
    const [total, setTotal] = useState(0)

    const  [directoryName, setDirectoryName] = useState('')
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
            'render': (col, record, index) => {
                return <Space>
                    <Button onClick={toDeleteFile.bind(this, record)} size="small" color='danger' variant="outlined">删除</Button>
                    {!record.is_dir && <Button onClick={downloadFile.bind(this, record)} size="small" color='primary' variant="outlined">下载</Button>}
                </Space>
            }
        }
    ]
    useEffect(() => {
        getServers()
    }, [])

    const gotoDir = async (item) => {
        setCurrentPath(item.path)
        listFiles(connectKey, server.config.directory, item.path)
    }

    var onChangeServer = (val) => {
        setServerID(val)
    }
    const changeDir = async (name) => {
        setCurrentPath(currentPath + '/' + name)
        listFiles(connectKey, server.config.directory, currentPath + '/' + name)
    }
    const refreshFiles = () => {
        listFiles(connectKey, server.config.directory, currentPath)
    }

    const toDeleteFile = (file) => {
        modal.confirm({
            title: '确认删除该文件(夹)吗？',
            onOk: async () => {
                console.log('delete file', file)
                console.log('currentPath', currentPath)
                let remoteDir = lodash.trimEnd(server.config.directory, '/') + '/' + lodash.trimStart(currentPath, '/') + '/' + file.name
                if (currentPath.length < 1) {
                    remoteDir = lodash.trimEnd(server.config.directory, '/') + '/' + file.name
                }
                let result = await deleteRemoteFile(connectKey, remoteDir)
                if (result.error != undefined && result.error.length > 0) {
                    messageApi.open({
                        type: 'error',
                        content: '删除失败：' + result.error,
                    });
                    return
                }
                console.log('delete result', result)
                messageApi.open({
                    type: 'success',
                    content: '删除成功',
                });
                listFiles(connectKey, server.config.directory, currentPath)
            }
        })
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
        if (files.error != undefined && files.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '获取文件列表失败：' + files.error,
            });
            setLoading(false)
            return
        }
        files.sort((a, b) => {
            if (a.is_dir && !b.is_dir) {
                return -1
            }
            if (!a.is_dir && b.is_dir) {
                return 1
            }
            return 0
        })
        for (var i in files) {
            files[i]['size_text'] = fileSize(files[i]['size'])
        }
        setLoading(false)
        setFiles(files)
    }

    var toUploadFile = async () => {
        let selectFiles = await open({
            multipart: true,
            filters: [
                {
                    name: "",
                    extensions: [],
                },
            ],
        });
        if (selectFiles == null || selectFiles.length < 1) {
            return
        }
        if (typeof selectFiles == 'string') {
            selectFiles = [selectFiles]
        }
        console.log('selectFiles', selectFiles)
        setShowModal(true)
        let interval = setInterval(updateUploadProgress, 1000)
        setTotal(selectFiles.length)
        for (var i in selectFiles) {
            console.log('upload file', selectFiles[i])
            setCount(parseInt(i) + 1)
            let fileName = await basename(selectFiles[i])
            let remoteFile = [lodash.trimEnd(server.config.directory, '/'), lodash.trimStart(currentPath, '/'), fileName].filter(part => part.length > 0).join('/')
            console.log('remoteFile', remoteFile)
            setHandleStatus('uploading')
            setUploadConfig({
                local_file: selectFiles[i],
                remote_file: remoteFile,
                current: 0,
                total: 0,
            })
            let result = await uploadRemoteFileSync(connectKey, selectFiles[i], remoteFile)
            if (result.error != undefined && result.error.length > 0) {
                messageApi.open({
                    type: 'error',
                    content: '上传文件`' + selectFiles[i] + '`失败：' + result.error,
                });
                clearInterval(interval)
                setHandleStatus('failure')
                setHandleMessage('上传已取消')
                return
            }
            refreshFiles()
        }
        await updateUploadProgress()
        clearInterval(interval)
        setHandleStatus('success')
    }

    const toCancelUpload = () => {
        if (handleStatus != 'uploading') {
            setShowModal(false)
            return
        }
        modal.confirm({
            title: '确认取消上传吗？',
            content: '上传中的文件将会被取消上传',
            onOk: async () => {
                await cancelFileTransfer()
            }
        })
    }

    const updateUploadProgress = async () => {
        let result = await getTransferProgress()
        console.log('get progress', result)
        if (result.error != undefined && result.error.length > 0) {
            console.log('get progress error', result.error)
            return
        }
        setUploadConfig(result)
    }

    const getRemoteFilePath = (fileName) => {
        return [lodash.trimEnd(server.config.directory, '/'), lodash.trimStart(currentPath, '/'), fileName].filter(part => part.length > 0).join('/')
    }

    const  downloadFile = async (record) => {
        let remoteFile = getRemoteFilePath(record.name)
        alert('下载文件:' + remoteFile)
    }
    const confiremCreateDirectory = async () => {
        let remote_dir = getRemoteFilePath(directoryName)
        let result = await createRemoteDir(connectKey, remote_dir)
        if (result.error != undefined && result.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '创建目录失败：' + result.error,
            });
            return
        }
        refreshFiles()
    }

    return <div style={{ padding: 20 }}>
        {messageCtxHandler}
        {contextHolder}
        <div>
            选择数据源：
            <Select style={{ width: '50%', display: 'inline-block', marginRight: 10 }} value={serverID} onChange={onChangeServer} disabled={connectKey.length > 0}>
                {
                    servers.map(item => {
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
        </div>
        {
            connectKey.length > 0 ? <Card size='small' type="inner">
                <div style={{ marginBottom: '10px' }}>
                    目录：
                    <Space split={"/"} align={'center'}>
                        <Link onClick={gotoDir.bind(this, { path: '' })} key={'/'}>{server != null ? server.config.directory : '/'}</Link>
                        {
                            quickDirs.map(item => {
                                return <Link onClick={gotoDir.bind(this, item)} key={item.path}>{item.name}</Link>
                            })
                        }
                    </Space>
                </div>
                <Space>
                    <Button onClick={refreshFiles} size="small" icon={<SyncOutlined />}>刷新</Button>
                    <Button size="small" icon={<UploadOutlined />} onClick={toUploadFile}>上传</Button>
                    <Popconfirm
                        title="新建文件夹"
                        description={
                            <Input value={directoryName} onChange={(e) => setDirectoryName(e.target.value)}/>
                        }
                        onConfirm={confiremCreateDirectory}
                        okText="确认"
                        cancelText="取消"
                        placement='bottom'
                        onOpenChange={() => console.log('open change')}
                    >
                        <Button size="small" icon={<FolderAddOutlined />}>新建文件夹</Button>
                    </Popconfirm>
                </Space>
            </Card> : null
        }

        <Table dataSource={files}
            columns={columns}
            size="small"
            bordered={true}
            locale={{
                emptyText : <Empty description="目录为空" />
            }}
            pagination={false} rowKey={'name'} scroll={{ y: 1000 }} footer={null} loading={loading} />
        <Modal
            title="上传文件"
            open={showModal}
            footer={null}
            width={'70%'}
            onCancel={toCancelUpload}
        >
            <p>
                <UploadMessage status={handleStatus} message={handleMessage} />
            </p>
            {
                handleStatus == 'uploading' ? <Row gutter={10}>
                    <Col span={5}>
                        <Card style={{ textAlign: 'center' }}>
                            <Statistic value={count} suffix={'/' + total} title="文件数量" />
                        </Card>
                    </Col>
                    <Col span={19}>
                        <p>本地文件：{uploadConfig?.local_file}</p>
                        <p>远程路径：{uploadConfig?.remote_file}</p>
                        <p><Progress percent={(uploadConfig?.current / uploadConfig?.total * 100).toFixed(2)} status="active" showInfo={true} /></p>
                    </Col>
                </Row> : null
            }

        </Modal>
    </div>
}

function UploadMessage(props) {
    const { status, message } = props
    if (status == 'success') {
        return <Alert message="上传完成" type="success" />
    }
    if (status == 'uploading') {
        return <Spin />
    }

    return <Alert message={message} type="error" />
}