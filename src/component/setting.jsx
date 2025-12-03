import React, { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Space, Radio, Input, message, Card } from 'antd';
import { getServerList, createServer, deleteServer, updateServer } from "../service/database";
import { DesktopOutlined, InfoCircleOutlined, EditOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import SystemManagement from './system';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { generateCSV, readCSV } from "../service/invoke";

export default function Setting({ onConnect }) {
    const [form] = Form.useForm();
    const [list, setList] = useState([]);
    const [open, setOpen] = useState(false)
    const [editingRecord, setEditingRecord] = useState(null);
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, msgContextHolder] = message.useMessage();

    // 系统信息Modal状态
    const [systemInfoVisible, setSystemInfoVisible] = useState(false);
    const [currentServer, setCurrentServer] = useState(null);
    const [sessionKey, setSessionKey] = useState(null);

    let columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
            render: (text, record) =>
            (<Button type="link" size="small" onClick={() => onConnect?.(record)} style={{ padding: 0 }}
                icon={<DesktopOutlined />}
            >                    {text}
            </Button>),
        },
        {
            title: 'IP',
            dataIndex: 'server',
            key: 'server'
        },
        {
            title: '端口',
            dataIndex: 'port',
            key: 'port',
        },
        {
            title: '用户名',
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: '密码',
            dataIndex: 'password',
            key: 'password',
            render: (text) => <div>*****</div>,
        },
        {
            title: '操作',
            fixed: 'right',
            key: 'action',
            render: (text, record) => {
                return <Space>
                    <Button type="link" size="small" onClick={() => showSystemInfo(record)} icon={<InfoCircleOutlined />}>
                        服务器信息
                    </Button>
                    <Button type="link" size='small' onClick={() => toEdit(record)} icon={<EditOutlined />}>编辑</Button>
                    <Button type="link" size='small' onClick={() => toCopy(record)}>复制</Button>
                    <Button type="link" size='small' onClick={() => toDelete(record)}>删除</Button>
                </Space>
            }
        },
    ];
    useEffect(() => {
        getServerList().then(res => {
            setList(res)
        })
    }, []);

    const handleAdd = () => {
        setEditingRecord(null);
        setOpen(true)
        form.resetFields()
    }

    const toEdit = (record) => {
        setEditingRecord(record);
        form.setFieldsValue({
            name: record.name,
            server: record.server,
            port: record.port,
            username: record.username,
            password: record.password,
        })
        setOpen(true)
    }

    // 测试连接功能
    const handleTestConnection = () => {
        form.validateFields().then(async (value) => {
            try {
                messageApi.loading({
                    key: 'testConnection',
                    content: '正在测试连接...',
                    duration: 0,
                });
                // 调用onConnect函数测试连接，但不打开连接窗口
                const result = await onConnect(value, null, true);
                if (result) {
                    messageApi.success({
                        key: 'testConnection',
                        content: '连接测试成功！',
                        duration: 2,
                    });
                } else {
                    messageApi.error({
                        key: 'testConnection',
                        content: '连接测试失败',
                        duration: 2,
                    });
                }
            } catch (error) {
                console.error('测试连接失败:', error);
                messageApi.error({
                    key: 'testConnection',
                    content: '连接测试失败: ' + error.message,
                    duration: 2,
                });
            }
        }).catch(info => {
            console.log('Validate Failed:', info);
        });
    }

    const handleConfirmCreare = () => {
        form.validateFields().then(async (value) => {
            console.log('Success:', value);
            setOpen(false);
            try {
                if (editingRecord) {
                    // 更新现有记录
                    await updateServer(editingRecord.id, value.name, value.server, value.port, value.username, value.password);
                    messageApi.success('更新成功');
                } else {
                    // 创建新记录
                    await createServer(value.name, value.server, value.port, value.username, value.password);
                    messageApi.success('创建成功');
                }
                let newList = await getServerList();
                setList(newList);
                setEditingRecord(null);
            } catch (error) {
                console.log('error', error);
                messageApi.open({
                    type: 'error',
                    content: (editingRecord ? '更新' : '创建') + '失败:' + error.message,
                });
                return false
            }

        }).catch(info => {
            console.log('Validate Failed:', info);
        });
    }

    var toDelete = (record) => {
        console.log('record', record, modal);
        modal.confirm({
            title: '确认删除该配置吗？',
            onOk: async () => {
                await deleteServer(record.id);
                let newList = await getServerList();
                setList(newList);
            },
        });
    }

    var toCopy = (record) => {
        form.setFieldsValue({
            name: record.name + '_copy',
            server: record.server,
            port: record.port,
            username: record.username,
            password: record.password,
        })
        setOpen(true)
    }

    // 显示系统信息Modal
    const showSystemInfo = async (record) => {
        setCurrentServer(record);
        try {
            // 连接服务器获取sessionKey
            const key = await onConnect(record, 'system', false);
            if (key) {
                setSessionKey(key);
                setSystemInfoVisible(true);
            } else {
                messageApi.error('连接服务器失败');
            }
        } catch (error) {
            messageApi.error('打开系统信息失败: ' + error.message);
        }
    }

    // 导出配置到CSV文件
    const handleExport = async () => {
        try {
            // 选择导出文件夹
            const selected = await openDialog({
                title: '选择导出文件夹',
                directory: true,
                multiple: false,
            });

            if (selected) {
                const exportPath = selected;
                const exportFileName = 'server_configs.csv';
                const exportFilePath = `${exportPath}/${exportFileName}`;

                // 准备导出数据（使用服务器列表数据）
                const exportData = list;

                // 调用generateCSV函数生成CSV文件
                await generateCSV(exportData, exportFilePath);

                messageApi.success(`配置已成功导出到：${exportFilePath}`);
            }
        } catch (error) {
            console.error('导出配置失败:', error);
            messageApi.error('导出配置失败: ' + error.message);
        }
    }

    // 从CSV文件导入配置
    const handleImport = async () => {
        try {
            // 选择CSV文件
            const selected = await openDialog({
                title: '选择CSV配置文件',
                filters: [
                    { name: 'CSV Files', extensions: ['csv'] },
                    { name: 'All Files', extensions: ['*'] }
                ],
                multiple: false,
            });

            // 如果没有选择文件，直接返回
            if (!selected) {
                return;
            }

            const importFilePath = selected;

            // 调用readCSV函数读取CSV文件内容
            const csvData = await readCSV(importFilePath);

            // 如果CSV数据为空或长度为0，直接返回
            if (!csvData || csvData.length === 0) {
                messageApi.warning('CSV文件为空或格式不正确');
                return;
            }

            // 遍历CSV数据并创建服务器配置
            let successCount = 0;
            let errorCount = 0;

            for (const item of csvData) {
                try {
                    // 检查必要字段
                    if (item.name && item.server && item.port && item.username && item.password) {
                        // 调用createServer创建服务器配置
                        await createServer(
                            item.name,
                            item.server,
                            item.port,
                            item.username,
                            item.password
                        );
                        successCount++;
                    } else {
                        console.error('数据不完整:', item);
                        errorCount++;
                    }
                } catch (error) {
                    console.error('创建服务器配置失败:', error);
                    errorCount++;
                }
            }

            // 刷新服务器列表
            let newList = await getServerList();
            setList(newList);

            // 显示导入结果
            messageApi.success(`导入完成：成功${successCount}条，失败${errorCount}条`);
        } catch (error) {
            console.error('导入配置失败:', error);
            messageApi.error('导入配置失败: ' + error.message);
        }
    }

    return <>
        <Space style={{ marginBottom: 10 }}>
            <Button type="default" size="small" onClick={handleAdd}>新增</Button>
            <Button type="default" size="small" onClick={handleExport} icon={<DownloadOutlined />}>导出</Button>
            <Button type="default" size="small" onClick={handleImport} icon={<UploadOutlined />}>导入</Button>
        </Space>
        <Table dataSource={list} columns={columns} pagination={false} bordered size='small' />

        <Modal
            title={<>${editingRecord ? '编辑配置' : '新增配置'}</>}
            closable={true}
            open={open}
            onOk={handleConfirmCreare}
            onCancel={() => {
                setOpen(false);
                setEditingRecord(null);
            }}
            footer={[
                <Button key="test" onClick={handleTestConnection}>
                    测试连接
                </Button>,
                <Button key="cancel" onClick={() => {
                    setOpen(false);
                    setEditingRecord(null);
                }}>
                    取消
                </Button>,
                <Button key="submit" type="primary" onClick={handleConfirmCreare}>
                    {editingRecord ? '更新' : '确认'}
                </Button>,
            ]}
        >
            <Form form={form} layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 17 }} initialValues={{
                port: '22', username: 'root', directory: '/tmp/'
            }}>
                <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input />
                </Form.Item>
                <Form.Item label="IP" name="server" rules={[{ required: true, message: '请输入地址' }]}>
                    <Input />
                </Form.Item>
                <Form.Item label="端口" name="port" rules={[{ required: true, message: '请输入端口' }]}>
                    <Input />
                </Form.Item>
                <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                    <Input />
                </Form.Item>
                <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}>
                    <Input type="password" />
                </Form.Item>
            </Form>
        </Modal>
        {contextHolder}
        {msgContextHolder}

        {/* 系统信息Modal */}
        <Modal
            title={`系统信息 - ${currentServer?.server || ''}`}
            open={systemInfoVisible}
            onCancel={() => setSystemInfoVisible(false)}
            footer={null}
            width={800}
            destroyOnClose
        >
            <SystemManagement sessionKey={sessionKey} />
        </Modal>
    </>
}
