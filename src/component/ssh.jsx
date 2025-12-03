import React, { useEffect, useState } from 'react';
import { open } from "@tauri-apps/plugin-dialog";
import { Button, Space, Tabs, Modal, Table, Typography, Card, message, Progress, Dropdown, Form, AutoComplete, Spin, Alert, Popconfirm, Input, Empty, Tag, Divider } from 'antd';
import { SyncOutlined, UploadOutlined, FolderAddOutlined, CopyOutlined, DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import { sshListFiles, deleteRemoteFile, uploadRemoteFileSync, getTransferProgress, cancelFileTransfer, createRemoteDir, downloadRemoteFileSync, renameRemoteFile, catRemoteFile, k3sLoadRemoteFile, generateCSV, sshExecuteCmd } from "../service/invoke"
import lodash from 'lodash'
import { basename, join } from '@tauri-apps/api/path'
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { partial } from "filesize";
import { getSessionByKey, updateSessionPath, getCommandList } from "../service/database";
const { Link } = Typography;
const { Search } = Input;

const fileSize = partial({ base: 2, standard: "jedec" });

var CAT_FILE_SIZE_MAX = 1024 * 1024 * 2;

export default function SSHConnection({ sessionKey }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);

    const [categories, setCategories] = useState([]);
    const [activeTab, setActiveTab] = useState('all');
    const [commandList, setCommandList] = useState([]);

    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState('');
    const [quickDirs, setQuickDirs] = useState([]);

    const [showModal, setShowModal] = useState(false);
    const [keyword, setKeyworkd] = useState('')
    const [filterList, setFilterList] = useState([])
    const [handleStatus, setHandleStatus] = useState(null);
    const [action, setAction] = useState('')

    const [directoryName, setDirectoryName] = useState('')
    const [showRenameModal, setShowRenameModal] = useState(false)
    const [current, setCurrent] = useState(null)
    const [name, setName] = useState('')

    const [showRunCommandModal, setShowRunCommandModal] = useState(false)
    const [command, setCommand] = useState({
        name: '',
        command: ''
    })


    const moreAction = [
        { 'label': '重命名', 'key': 'rename' },
        { 'label': '复制路径', 'key': 'copy_path' },
        { 'label': '查看内容', 'key': 'cat' },
        { 'label': 'zip', 'key': 'compress' },
        { 'label': 'unzip', 'key': 'unzip' },
        { 'label': 'k3sLoadImage', 'key': 'k3s_image_load' },
        { 'label': '更多信息', 'key': 'more' }
    ]
    const getActionHandler = () => {
        return {
            'rename': toRename,
            'copy_path': copyPath,
            'more': moreInfo,
            'cat': catFile,
            'compress': compressFile,
            'unzip': unzipFile,
            'k3s_image_load': k3sImageLoad
        }
    }
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
            sorter: (a, b) => a.size - b.size,
        },
        {
            'title': '时间',
            'dataIndex': 'time',
            'key': 'time',
            'render': (col, record, index) => (
                <>
                    {record.date} {record.time}
                </>
            ),
            sorter: (a, b) => {
                // 假设record包含一个可以用于排序的时间戳字段，或者我们可以将date和time转换为Date对象进行比较
                return new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time);
            },
            defaultSortOrder: 'descend'
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
                            let actionHandler = getActionHandler()
                            if (actionHandler[e.key] != undefined) {
                                actionHandler[e.key](record)
                            }
                        }
                    }} size="small" trigger={'click'} placement="bottomRight">更多</Dropdown.Button>
                </Space>
            }
        }
    ]
    useEffect(() => {
        getSessionByKey(sessionKey).then(result => {
            setCurrentPath(result.path)
            listFiles(result.path);
        })
        loadCommandList();
    }, [sessionKey]);

    const loadCommandList = async () => {
        let res = await getCommandList();
        setCommandList(res);

        // Extract unique categories for AutoComplete
        const uniqueCategories = [...new Set(res.map(item => item.category))];
        setCategories(uniqueCategories);
    }

    async function generateQuickDirs(directory) {
        if (directory.length < 1 || directory == '/') {
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

    const handleSearch = (e) => {
        setKeyworkd(e.target.value)
        doFilterList(files, e.target.value)
    }

    const doFilterList = (list, value) => {
        setFilterList(list.filter(item => item.name.indexOf(value) > -1))
    }

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

    const goQuickDir = async (item) => {
        setCurrentPath(item.path)
        listFiles(item.path)
        updateSessionPath(sessionKey, item.path)
    }
    const changeDir = async (name) => {
        let newDir = currentPath + '/' + name
        if (currentPath == "/") {
            newDir = '/' + name
        }
        setCurrentPath(newDir)
        listFiles(newDir)
        updateSessionPath(sessionKey, newDir)
    }
    const refreshFiles = () => {
        listFiles(currentPath)
    }

    const toDeleteFile = (file) => {
        let tempFile = getRemoteFilePath(file.name)
        let message = `确认删除文件 ${tempFile} ?`
        if (file.is_dir) {
            message = `确认删除目录 ${tempFile} ?`
        }
        modal.confirm({
            title: message,
            onOk: async () => {
                console.log('delete file', file)
                console.log('currentPath', currentPath)
                let remoteDir = currentPath + '/' + file.name
                let result = await deleteRemoteFile(sessionKey, remoteDir)
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
                listFiles(currentPath)
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
        let result = await renameRemoteFile(sessionKey, oldPath, newPath)
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

    const catFile = async (record) => {
        if (record.size > CAT_FILE_SIZE_MAX) {
            messageApi.open({
                type: 'error',
                content: '文件超过2M，无法查看',
            });
            return
        }
        let remoteFile = getRemoteFilePath(record.name)
        let result = await catRemoteFile(sessionKey, remoteFile)
        if (result.error != undefined && result.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '查看文件失败：' + result.error,
            });
            return
        }
        modal.info({
            title: '文件内容',
            width: '50%',
            content: <Input.TextArea value={result} readOnly={true} rows={10}>{result}</Input.TextArea>
        })
    }

    const k3sImageLoad = async (record) => {
        let remoteFile = getRemoteFilePath(record.name)
        let hide = messageApi.loading({
            content: '加载中`' + record.name + '`中',
            duration: -1,
        })
        let result = await k3sLoadRemoteFile(sessionKey, remoteFile)
        hide()
        if (result.error != undefined && result.error.length > 0) {
            modal.error({
                title: '加载失败',
                width: '50%',
                content: <Input.TextArea value={result.error} readOnly={true} rows={3}>{result.error}</Input.TextArea>
            });
            return
        }
        modal.info({
            title: '加载结果',
            content: <Input.TextArea value={result} readOnly={true} rows={3}>{result}</Input.TextArea>
        })
    }

    const compressFile = async (record) => {
        // Check if file is already a zip file
        if (record.name.endsWith('.zip')) {
            messageApi.open({
                type: 'warning',
                content: '文件已经是zip格式，无需再次压缩',
            });
            return
        }

        let remoteFile = getRemoteFilePath(record.name)
        let zipFileName = record.name + '.zip'
        let zipFilePath = getRemoteFilePath(zipFileName)

        // Check if zip file already exists
        for (var i in files) {
            if (files[i].name == zipFileName) {
                messageApi.open({
                    type: 'error',
                    content: '压缩文件已存在: ' + zipFileName,
                });
                return
            }
        }

        let hide = messageApi.loading({
            content: '正在压缩 `' + record.name + '`...',
            duration: 0,
        })

        // Use zip command to compress file or directory
        let zipCommand = `cd $(dirname '${remoteFile}') && zip -r '${zipFileName}' '${record.name}'`
        let result = await sshExecuteCmd(sessionKey, zipCommand)
        hide()

        if (result.error != undefined && result.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '压缩失败: ' + result.error,
            });
            return
        }

        messageApi.open({
            type: 'success',
            content: `压缩成功: ${zipFileName}`,
        });
        refreshFiles()
    }

    const unzipFile = async (record) => {
        // Check if file is a zip file
        if (!record.name.endsWith('.zip')) {
            messageApi.open({
                type: 'warning',
                content: '只能解压zip文件',
            });
            return
        }

        let remoteFile = getRemoteFilePath(record.name)
        // Generate temp directory name (remove .zip extension and add _tmp)
        let baseName = record.name.substring(0, record.name.length - 4)
        let tmpDirName = baseName + '_tmp'

        // Check if tmp directory already exists
        for (var i in files) {
            if (files[i].name == tmpDirName) {
                messageApi.open({
                    type: 'error',
                    content: '解压目录已存在: ' + tmpDirName,
                });
                return
            }
        }

        let hide = messageApi.loading({
            content: '正在解压 `' + record.name + '`...',
            duration: 0,
        })

        // Create tmp directory and unzip file
        let tmpDirPath = getRemoteFilePath(tmpDirName)
        let unzipCommand = `cd $(dirname '${remoteFile}') && mkdir -p '${tmpDirName}' && unzip -q '${record.name}' -d '${tmpDirName}'`
        let result = await sshExecuteCmd(connectKey, unzipCommand)
        hide()

        if (result.error != undefined && result.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '解压失败: ' + result.error,
            });
            return
        }

        messageApi.open({
            type: 'success',
            content: `解压成功到目录: ${tmpDirName}`,
        });
        refreshFiles()
    }

    const listFiles = async (directory) => {
        if (directory.length < 1) {
            return
        }
        let quickDirs = await generateQuickDirs(directory)
        let remoteDir = lodash.trimEnd(directory, '/')
        if (directory == "/") {
            remoteDir = '/'
        }
        setQuickDirs(quickDirs)
        console.log('list files', quickDirs, directory)
        setLoading(true)
        let files = await sshListFiles(sessionKey, remoteDir)
        if (files.error != undefined && files.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '获取文件列表失败：' + files.error,
            });
            setLoading(false)
            return
        }
        files.sort((a, b) => {
            // 先按目录/文件类型排序，目录在前
            if (a.is_dir && !b.is_dir) {
                return -1
            }
            if (!a.is_dir && b.is_dir) {
                return 1
            }
            // 再按时间排序，最新的在前
            return new Date(b.date + ' ' + b.time) - new Date(a.date + ' ' + a.time)
        })
        for (var i in files) {
            files[i]['size_text'] = fileSize(files[i]['size'])
        }
        setLoading(false)
        setFiles(files)
        doFilterList(files, keyword)
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
        let result = await uploadRemoteFileSync(sessionKey, selectFile, remoteFile)
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
        let result = await downloadRemoteFileSync(sessionKey, locaFile, remoteFile)
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
        return currentPath + '/' + fileName
    }

    const confiremCreateDirectory = async () => {
        let remote_dir = getRemoteFilePath(directoryName)
        let result = await createRemoteDir(sessionKey, remote_dir)
        if (result.error != undefined && result.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '创建目录失败：' + result.error,
            });
            return
        }
        setDirectoryName('')
        refreshFiles()
    }

    const exportCSV = async () => {
        // Select where to save the CSV file
        let savePath = await open({
            multipart: false,
            directory: true,
        });
        if (savePath == null || savePath.length < 1) {
            return;
        }

        // Prepare data for CSV export
        const exportData = filterList.map(file => ({
            name: file.name,
            type: file.is_dir ? 'Directory' : 'File',
            size: file.size,
            size_text: file.size_text,
            date: file.date,
            time: file.time,
            user: file.user,
            group: file.group,
        }));

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const fileName = `file-list-${timestamp}.csv`;
        const filePath = await join(savePath, fileName);

        try {
            await generateCSV(exportData, filePath);
            messageApi.open({
                type: 'success',
                content: `文件列表已导出到: ${filePath}`,
            });
        } catch (error) {
            messageApi.open({
                type: 'error',
                content: '导出失败: ' + error,
            });
        }
    }
    const toCreateOperation = () => {
        form.resetFields();
        setOpen(true);
    }

    const toRunCommand = (command) => {
        setCommand(command)
        setShowRunCommandModal(true)
    }

    const doRunCommand = () => {
        console.log('do run command', command)
        sshExecuteCmd(sessionKey, command.command).then(result => {
            if (result.error != undefined && result.error.length > 0) {
                setCommand(prevState => ({ ...prevState, error: result.error }))
            } else {
                setCommand(prevState => ({ ...prevState, output: result }))
            }
        })
    }

    const goTmp = () => {
        goQuickDir({
            path: '/tmp'
        })
    }

    return <div>
        {messageCtxHandler}
        {contextHolder}
        <Card size='small' style={{ marginBottom: 10 }} >
            <div style={{ marginBottom: 15 }}>
                <Space>
                    <Button onClick={refreshFiles} icon={<SyncOutlined />}>刷新</Button>
                    <Button onClick={copyDir} icon={<CopyOutlined />}>复制路径</Button>
                    <Button icon={<UploadOutlined />} onClick={toUploadFile}>上传文件</Button>
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
                        <Button icon={<FolderAddOutlined />}>新建文件夹</Button>
                    </Popconfirm>
                    <Button icon={<ExportOutlined />} onClick={goTmp}>/tmp目录</Button>
                    <Button icon={<ExportOutlined />} onClick={exportCSV}>导出文件列表</Button>
                </Space>
                <Divider size="small"></Divider>
                <Space>
                    {commandList.map(command => <Button key={command.id} onClick={toRunCommand.bind(this, command)}>{command.category}：{command.name}</Button>)}
                </Space>
            </div>
        </Card>
        <Table dataSource={filterList}
            columns={columns}
            size="small"
            bordered={true}
            locale={{
                emptyText: <Empty description="目录为空" />
            }}
            pagination={false}
            rowKey={'name'}
            loading={loading}
            title={() => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        (数量: {filterList.length})路径：<Space split={"/"} align={'center'}>
                            <Link onClick={goQuickDir.bind(this, { path: '/' })} key={'/'}>根</Link>
                            {
                                quickDirs.map(item => {
                                    return <Link onClick={goQuickDir.bind(this, item)} key={item.path}>{item.name}</Link>
                                })
                            }
                        </Space>
                    </div>
                    <Input placeholder="搜索..." allowClear onChange={handleSearch} style={{ width: '150px' }} value={keyword} />
                </div>
            )}
            defaultSortOrder="descend"
            defaultFilteredValue={['time']}
            defaultSortKey="time" />

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

        <Modal
            title={`执行【${command.name}】确认`}
            open={showRunCommandModal}
            onOk={doRunCommand}
            onCancel={() => { setShowRunCommandModal(false) }}
            footer={null}
        >
            <p>命令：</p>
            <Input.TextArea value={command.command} readOnly={true} rows={4} />
            <p style={{ textAlign: 'right' }}>
                <Button type="primary" onClick={doRunCommand}>确认执行</Button>
            </p>
            <p>输出结果：</p>
            {command.error && <Alert
                title="Error"
                description={command.error}
                type="error"
                showIcon
            />}
            {command.output && <Input.TextArea value={command.output} readOnly={true} rows={4} placeholder='输出结果' />}
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
