import React, { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Space, Input, message, AutoComplete, Tabs, Card } from 'antd';
import { getCommandList, createCommand, deleteCommand, updateCommand } from "../service/database";
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { generateCSV, readCSV } from "../service/invoke";


export default function Command() {
    const [form] = Form.useForm();
    const [list, setList] = useState([]);
    const [open, setOpen] = useState(false)
    const [editingRecord, setEditingRecord] = useState(null);
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, msgContextHolder] = message.useMessage();
    const [categories, setCategories] = useState([]);
    const [activeTab, setActiveTab] = useState('all');

    let columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: '分类',
            dataIndex: 'category',
            key: 'category'
        },
        {
            title: '创建时间',
            dataIndex: 'create_time',
            key: 'create_time',
        },
        {
            title: '操作',
            fixed: 'right',
            key: 'action',
            render: (text, record) => {
                return <Space>
                    <Button type="link" size='small' onClick={() => toShow(record)}>详情</Button>
                    <Button type="link" size='small' onClick={() => toEdit(record)}>编辑</Button>
                    <Button type="link" size='small' onClick={() => toCopy(record)}>复制</Button>
                    <Button type="link" size='small' onClick={() => toDelete(record)}>删除</Button>
                </Space>
            }
        },
    ];

    useEffect(() => {
        loadCommandList();
    }, []);

    const loadCommandList = async () => {
        let res = await getCommandList();
        setList(res);

        // Extract unique categories for AutoComplete
        const uniqueCategories = [...new Set(res.map(item => item.category))];
        setCategories(uniqueCategories);
    }

    const handleAdd = () => {
        setEditingRecord(null);
        setOpen(true)
        form.resetFields()
    }

    const toEdit = (record) => {
        setEditingRecord(record);
        form.setFieldsValue({
            name: record.name,
            category: record.category,
            command: record.command,
        })
        setOpen(true)
    }

    const handleConfirmCreate = () => {
        form.validateFields().then(async (value) => {
            console.log('Success:', value);
            setOpen(false);
            try {
                if (editingRecord) {
                    // 更新现有记录
                    await updateCommand(editingRecord.id, value.name, value.category, value.command);
                    messageApi.open({
                        type: 'success',
                        content: 'Command updated successfully',
                    });
                } else {
                    // 创建新记录
                    await createCommand(value.name, value.category, value.command);
                    messageApi.open({
                        type: 'success',
                        content: 'Command created successfully',
                    });
                }
                await loadCommandList();
                setEditingRecord(null);
            } catch (error) {
                console.log('error', error);
                messageApi.open({
                    type: 'error',
                    content: (editingRecord ? 'Failed to update: ' : 'Failed to create: ') + error.message,
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
            title: 'Confirm to delete this command?',
            onOk: async () => {
                await deleteCommand(record.id);

                const currentCategoryCommands = list.filter(item => item.category === activeTab);
                const willBeEmpty = activeTab !== 'all' && currentCategoryCommands.length === 1;

                await loadCommandList();

                // Switch to 'all' tab if current category becomes empty
                if (willBeEmpty) {
                    setActiveTab('all');
                }

                messageApi.open({
                    type: 'success',
                    content: 'Command deleted successfully',
                });
            },
        });
    }

    var toShow = (record) => {
        modal.info({
            title:record.name,
            width: '60%',
            content: (
                <div>
                    <Input.TextArea value={record.command} readOnly={true} rows={4} />
                </div>
            )
        });
    }

    var toCopy = (record) => {
        form.setFieldsValue({
            name: record.name + '_copy',
            category: record.category,
            command: record.command,
        })
        setOpen(true)
    }

    // 导出命令到CSV文件
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
                const exportFileName = 'commands.csv';
                const exportFilePath = `${exportPath}/${exportFileName}`;

                // 准备导出数据（使用命令列表数据）
                const exportData = list;

                // 调用generateCSV函数生成CSV文件
                await generateCSV(exportData, exportFilePath);

                messageApi.success(`命令已成功导出到：${exportFilePath}`);
            }
        } catch (error) {
            console.error('导出命令失败:', error);
            messageApi.error('导出命令失败: ' + error.message);
        }
    }

    // 从CSV文件导入命令
    const handleImport = async () => {
        try {
            // 选择CSV文件
            const selected = await openDialog({
                title: '选择CSV命令文件',
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

            // 遍历CSV数据并创建命令
            let successCount = 0;
            let errorCount = 0;

            for (const item of csvData) {
                try {
                    // 检查必要字段
                    if (item.name && item.command) {
                        // 调用createCommand创建命令
                        await createCommand(
                            item.name,
                            item.category || '未分类',
                            item.command
                        );
                        successCount++;
                    } else {
                        console.error('数据不完整:', item);
                        errorCount++;
                    }
                } catch (error) {
                    console.error('创建命令失败:', error);
                    errorCount++;
                }
            }

            // 刷新命令列表
            await loadCommandList();

            // 显示导入结果
            messageApi.success(`导入完成：成功${successCount}条，失败${errorCount}条`);
        } catch (error) {
            console.error('导入命令失败:', error);
            messageApi.error('导入命令失败: ' + error.message);
        }
    }

    return <>
        <Space style={{ marginBottom: 10 }}>
            <Button type="default" size="small" onClick={handleAdd}>新建命令</Button>
            <Button type="default" size="small" onClick={handleExport} icon={<DownloadOutlined />}>导出</Button>
            <Button type="default" size="small" onClick={handleImport} icon={<UploadOutlined />}>导入</Button>
        </Space>

        <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            tabPosition="left"
            items={[
                {
                    key: 'all',
                    label: 'All',
                    children: <Table dataSource={list} columns={columns} pagination={false} bordered size='small' />
                },
                ...categories.map(category => ({
                    key: category,
                    label: category,
                    children: <Table dataSource={list.filter(item => item.category === category)} columns={columns} pagination={false} bordered size='small' />
                }))
            ]}
        />

        <Modal
            title={<>${editingRecord ? '编辑命令' : '命令创建'}</>}
            closable={true}
            open={open}
            onOk={handleConfirmCreate}
            onCancel={() => {
                setOpen(false);
                setEditingRecord(null);
            }}
        >
            <Form form={form} layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 17 }}>
                <Form.Item label="名称" name="name" rules={[{ required: true, message: 'Please input name' }]}>
                    <Input />
                </Form.Item>
                <Form.Item label="分类" name="category" rules={[{ required: true, message: 'Please input category' }]}>
                    <AutoComplete
                        options={categories.map(cat => ({ value: cat }))}
                        placeholder="Select or create category"
                        filterOption={(inputValue, option) =>
                            option.value.toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                        }
                    />
                </Form.Item>
                <Form.Item label="命令" name="command" rules={[{ required: true, message: 'Please input command' }]}>
                    <Input.TextArea rows={4} />
                </Form.Item>
            </Form>
        </Modal>
        {contextHolder}
        {msgContextHolder}
    </>
}
