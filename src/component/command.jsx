import React, { useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Space, Input, message, AutoComplete, Tabs, Card } from 'antd';
import { getCommandList, createCommand, deleteCommand } from "../service/database";


export default function Command() {
    const [form] = Form.useForm();
    const [list, setList] = useState([]);
    const [open, setOpen] = useState(false)
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
        setOpen(true)
        form.resetFields()
    }

    const handleConfirmCreate = () => {
        form.validateFields().then(async (value) => {
            console.log('Success:', value);
            setOpen(false);
            try {
                await createCommand(value.name, value.category, value.command);
                await loadCommandList();
                messageApi.open({
                    type: 'success',
                    content: 'Command created successfully',
                });
            } catch (error) {
                console.log('error', error);
                messageApi.open({
                    type: 'error',
                    content: 'Failed to create: ' + error.message,
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

    return <>
        <Space style={{ marginBottom: 10 }}>
            <Button type="default" size="small" onClick={handleAdd}>新建命令</Button>
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
            title={<>命令创建</>}
            closable={true}
            open={open}
            onOk={handleConfirmCreate}
            onCancel={() => {
                setOpen(false)
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
