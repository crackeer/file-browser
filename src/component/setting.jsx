import React, { use, useEffect, useState } from 'react'
import { Table, Button, Modal, Form, Space, Radio, Input, message } from 'antd';
import { getServerList, createServer, deleteServer } from "../service/database";


export default function Setting({ onConnect }) {
    const [form] = Form.useForm();
    const [list, setList] = useState([]);
    const [open, setOpen] = useState(false)
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, msgContextHolder] = message.useMessage();
    
    let columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
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
                    <Button type="link" size='small' onClick={() => onConnect?.(record)}>连接</Button>
                    <Button type="link" size='small' onClick={() => onConnect?.(record, 'k3s')}>k3s管理</Button>
                    <Button type="link" size='small' onClick={() => onConnect?.(record, 'system')}>系统信息</Button>
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
        setOpen(true)
        form.resetFields()
    }

    const handleConfirmCreare = () => {
        form.validateFields().then(async (value) => {
            console.log('Success:', value);
            setOpen(false);
            try {
                let res = await createServer(value.name, value.server, value.port, value.username, value.password);
                console.log('res', res);
                let newList = await getServerList();
                setList(newList);
            } catch (error) {
                console.log('error', error);
                messageApi.open({
                    type: 'error',
                    content: '创建失败:' + error.message,
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

    return <>
        <Space style={{marginBottom: 10}}>
            <Button type="default" size="small" onClick={handleAdd}>新增</Button>
        </Space>
        <Table dataSource={list} columns={columns} pagination={false} bordered size='small' />

        <Modal
            title={<>新增配置</>}
            closable={true}
            open={open}
            onOk={handleConfirmCreare}
            onCancel={() => {
                setOpen(false)
            }}
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
    </>
}