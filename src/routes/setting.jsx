import React, { use, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Table, Button, Modal, Form, Space, Radio, Input } from 'antd';
import { getStorageList, createStorage, deleteStorage } from "../service/database";

export const Route = createFileRoute('/setting')({
    component: Setting,
})

const options = [
    { label: 'SSH', value: 'ssh' },
    { label: 'FTP', value: 'ftp' },
    { label: 'S3', value: 's3' },
];

function Setting() {
    const [form] = Form.useForm();
    const [activeKey, setActiveKey] = useState("ssh");
    const [list, setList] = useState([]);
    const [open, setOpen] = useState(false)
    const [modal, contextHolder] = Modal.useModal();
    let columns = [
        {
            title: '名称',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: 'IP地址',
            dataIndex: ['config', 'address'],
            key: 'address',
        },
        {
            title: '端口',
            dataIndex: ['config', 'port'],
            key: 'port',
        },
        {
            title: '用户名',
            dataIndex: ['config', 'username'],
            key: 'username',
        },

        {
            title: '操作',
            fixed: 'right',
            key: 'action',
            render: (text, record) => {
                return <Space>
                    <Button type="link" size='small'>复制</Button>
                    <Button type="link" size='small' onClick={() => toDelete(record)}>删除</Button>
                </Space>
            }
        },
    ];
    useEffect(() => {
        getStorageList(activeKey).then(res => {
            console.log('res', res);
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
            let res = await createStorage(value.name, activeKey, {
                address: value.address,
                port: value.port,
                username: value.username,
                password: value.password,
            });
            let newList = await getStorageList(activeKey);
            setList(newList);
        }).catch(info => {
            console.log('Validate Failed:', info);
        });
    }

    var toDelete = (record) => {
        console.log('record', record, modal);
        modal.confirm({
            title: '确认删除该配置吗？',
            onOk: async () => {
                // await deleteStorage(record.id);
                await deleteStorage(record.id);
                let newList = await getStorageList(activeKey);
                setList(newList);
            },
        });
    }

    return <>
        <div style={{ margin: '0 auto', textAlign: 'center' }}>
            <Radio.Group
                options={options}
                defaultValue="Apple"
                value={activeKey}
                optionType="button"
                buttonStyle="solid"
                style={{ padding: '10px 5px' }}
                onChange={e => setActiveKey(e.target.value)}
            />
            <Button type="default" style={{ marginLeft: 10 }} onClick={handleAdd}>新增</Button>
        </div>
        <Table dataSource={list} columns={columns} pagination={false} bordered size='small' style={{ padding: '0 30px' }} />

        <Modal
            title={<>新增{activeKey}配置</>}
            closable={true}
            open={open}
            onOk={handleConfirmCreare}
            onCancel={() => {
                setOpen(false)
            }}
        >
            <Form form={form} layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 17 }} initialValues={{
                port: '22', username: 'root'
            }}>
                <Form.Item label="名称" name="name" rules={[{ required: true, message: '请输入名称' }]}>
                    <Input />
                </Form.Item>
                <Form.Item label="IP" name="address" rules={[{ required: true, message: '请输入地址' }]}>
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
    </>
}

function SSH() {
    return <div>SSH 设置</div>
}