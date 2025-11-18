import React, { useEffect, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router'
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Space, Select, Modal, Table, Typography, Card, message, Progress, Dropdown, Col, Row, Spin, Alert, Popconfirm, Input, Empty, Tag } from 'antd';
import { SyncOutlined, UploadOutlined, FolderAddOutlined, CopyOutlined } from '@ant-design/icons';
import { sshConnectByPassword, sshListFiles, sshDisconnect, deleteRemoteFile, uploadRemoteFileSync, getTransferProgress, cancelFileTransfer, createRemoteDir, downloadRemoteFileSync, renameRemoteFile } from "../service/invoke"
import lodash from 'lodash'
import { basename, join } from '@tauri-apps/api/path'
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
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
    const [handleStatus, setHandleStatus] = useState(null);
    const [action, setAction] = useState('')

    const [directoryName, setDirectoryName] = useState('')
    const [showRenameModal, setShowRenameModal] = useState(false)
    const [current, setCurrent] = useState(null)
    const [name, setName] = useState('')

    const moreAction = [
        { 'label': '重命名', 'key': 'rename' },
        { 'label': '复制路径', 'key': 'copy_path' },
        { 'label': '更多信息', 'key': 'more' }
    ]
    const columns = [
        {
            'title': '名字',
            'dataIndex': 'name',
            'key': 'name',
            'width': '30%',
            'render': (col, record, index) => {
                return <>
                    {record.is_dir ? <a href="javascript:;" onClick={changeDir.bind(this, record.name)} style={{ textDecoration: 'none' }}>{record.name}</a> : <span>{record.name}</span>}
                </>
            }
        },
        {
            'title': '大小',
            'dataIndex': 'size_text',
            'key': 'size_text',
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
            'title': '操作',
            'key': 'opt',
            'render': (col, record, index) => {
                return <Space>
                    {!record.is_dir && <Button onClick={toDownloadFile.bind(this, record)} size="small" color='primary' variant="outlined">下载</Button>}
                    <Button onClick={toDeleteFile.bind(this, record)} size="small" color='danger' variant="outlined">删除</Button>
                    <Dropdown.Button menu={{
                        items: moreAction,
                        onClick: (e) => {
                            console.log('moreAction', e)
                            if (e.key === 'rename') {
                                toRename(record)
                            } else if (e.key == 'more') {
                                moreInfo(record)
                            } else if (e.key == 'copy_path') {
                                copyPath(record)
                            }
                        }
                    }} size="small" trigger={'click'} placement="bottomRight">更多</Dropdown.Button>
                </Space>
            }
        }
    ]
    useEffect(() => {
        getServers()
    }, [])

    const moreInfo = (record) => {
        modal.info({
            title: '文件信息',
            content: <div>
                <p>用户：{record.user}</p>
                <p>分组：{record.group}</p>
                <p>权限：{record.access}</p>
            </div>
        })
    }

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

    const toRename = (record) => {
        setCurrent(record)
        setName(record.name)
        setShowRenameModal(true)
    }

    const copyPath = async (record) => {
        let currentPath = getRemoteFilePath(record.name)
        await writeText(currentPath)
        messageApi.open({
            type: 'success',
            content: '路径`' + currentPath + '`已复制到剪切板',
        });
    }
    const copyDir = async () => {
        let currentPath = getRemoteFilePath('')
        await writeText(currentPath)
        messageApi.open({
            type: 'success',
            content: '路径`' + currentPath + '`已复制到剪切板',
        });
    }

    const doRename = async () => {
        if (name == current.name) {
            setShowRenameModal(false)
            return
        }
        if (name.length < 1) {
            messageApi.open({
                type: 'error',
                content: '请输入新的名字',
            });
        }
        for (var i in files) {
            if (files[i].name == name) {
                messageApi.open({
                    type: 'error',
                    content: '文件名已存在',
                });
                return
            }
        }
        let oldPath = getRemoteFilePath(current.name)
        let newPath = getRemoteFilePath(name)
        let result = await renameRemoteFile(connectKey, oldPath, newPath)
        if (result.error != undefined && result.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '重命名失败：' + result.error,
            });
            return
        }
        messageApi.open({
            type: 'success',
            content: '重命名成功',
        });
        setShowRenameModal(false)
        refreshFiles()
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
        if (connectKey.error != undefined && connectKey.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '连接失败：' + connectKey.error,
            });
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
        let selectFile = await open({
            multipart: false,
            filters: [
                {
                    name: "",
                    extensions: [],
                },
            ],
        });
        if (selectFile == null) {
            return
        }
        setShowModal(true)
        let interval = setInterval(updateProgress, 1000)
        let fileName = await basename(selectFile)
        let remoteFile = getRemoteFilePath(fileName)
        setHandleStatus({
            status: 'transferring',
            message: '',
            local_file: selectFile,
            remote_file: remoteFile,
            current: 0,
            total: 0,
        })
        setAction('upload')
        let result = await uploadRemoteFileSync(connectKey, selectFile, remoteFile)
        if (result.error != undefined && result.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: result.error,
            });
            clearInterval(interval)
            setHandleStatus(lodash.merge(handleStatus, { status: 'error', message: result.error }))
            return
        }
        clearInterval(interval)
        await updateProgress()
        refreshFiles()
    }

    const toCancelUpload = () => {
        const { status } = handleStatus
        if (status != 'transferring') {
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

    var toDownloadFile = async (record) => {
        let selectDir = await open({
            multipart: false,
            directory: true,
        });
        if (selectDir == null || selectDir.length < 1) {
            return
        }
        setShowModal(true)
        let interval = setInterval(updateProgress, 1000)
        let locaFile = await join(selectDir, record.name)
        let remoteFile = getRemoteFilePath(record.name)
        setHandleStatus({
            local_file: locaFile,
            remote_file: remoteFile,
            status: 'transferring',
            message: '',
            current: 0,
            total: 0,
        })
        setAction('download')
        let result = await downloadRemoteFileSync(connectKey, locaFile, remoteFile)
        if (result.error != undefined && result.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: result.error,
            });
            clearInterval(interval)
            setHandleStatus(lodash.merge(handleStatus, { status: 'error', message: result.error }))
            return
        }
        clearInterval(interval)
        await updateProgress()
    }

    const updateProgress = async () => {
        let result = await getTransferProgress()
        console.log('get progress', result)
        if (result.error != undefined && result.error.length > 0) {
            console.log('get progress error', result.error)
            return
        }
        setHandleStatus(result)
    }

    const getRemoteFilePath = (fileName) => {
        return [lodash.trimEnd(server.config.directory, '/'), lodash.trimStart(currentPath, '/'), fileName].filter(part => part.length > 0).join('/')
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
            <Select style={{ width: '50%', display: 'inline-block', marginRight: 10, marginBottom: 5 }} value={serverID} onChange={onChangeServer} disabled={connectKey.length > 0}>
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
            connectKey.length > 0 ? <Card size='small' type="inner" style={{ marginBottom: 5 }}>
                <div style={{ marginBottom: '10px' }}>
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
                    <Tag color="red">文件数：{files.length}</Tag>
                    <Button onClick={refreshFiles} size="small" icon={<SyncOutlined />}>刷新</Button>
                    <Button onClick={copyDir} size="small" icon={<CopyOutlined />}>复制路径</Button>
                    <Button size="small" icon={<UploadOutlined />} onClick={toUploadFile}>上传</Button>
                    <Popconfirm
                        title="新建文件夹"
                        description={
                            <Input value={directoryName} onChange={(e) => setDirectoryName(e.target.value)} />
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
                emptyText: <Empty description="目录为空" />
            }}
            pagination={false} rowKey={'name'} scroll={{ y: 1000 }} footer={null} loading={loading} />
        <Modal
            title={action == 'upload' ? '上传文件' : '下载文件'}
            open={showModal}
            footer={null}
            width={'70%'}
            onCancel={toCancelUpload}
        >
            <HandleProgress {...handleStatus} action={action} />
        </Modal>

        <Modal
            title={<>重命名{current?.name}</>}
            closable={true}
            open={showRenameModal}
            okText="确认"
            cancelText="取消"
            width={'50%'}
            onCancel={() => { setShowRenameModal(false) }}
            onOk={doRename}
        >
            <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Modal>
    </div>
}

function HandleProgress(props) {
    const { local_file, remote_file } = props

    return <Card size='small' type="inner">
        <HandleTitle {...props} action={props.action} />
        <p>本地文件：{local_file}</p>
        <p>远程路径：{remote_file}</p>
    </Card>
}

function HandleTitle(props) {
    const { status, current, total, action } = props
    if (status == 'success') {
        return <Alert message={action == 'upload' ? '上传成功' : '下载成功'} type="success" />
    }
    if (status == 'transferring') {
        let percent = 0
        if (total > 0) {
            percent = (current / total * 100).toFixed(2)
        }
        return <Progress percent={percent} status="active" showInfo={true} />
    }

    return <Alert message={props.message} type="error" />
}
