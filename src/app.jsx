import React, { useState, useEffect } from 'react';
import { Button, message, Tabs, Modal, Card, Space } from 'antd';
import { CloseOutlined, ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import Setting from './component/setting';
import Command from './component/command';
import SSHConnection from './component/ssh';
import { sshConnectByPassword, sshDisconnect, isSessionConnected, getUploadTaskList } from './service/invoke';
import { createSession, deleteSession, getSessionList, getServerByID, getServerBySessionKey, getSessionByKey } from './service/database';


function randomSessionKey() {
    return Math.random().toString(36).slice(2, 12);
}

function getDefaultUserPath(username) {
    if (username == 'root') {
        return "/root"
    }
    return "/home/" + username
}
var timer = null
export default function App() {
    const [messageApi, contextHolder] = message.useMessage();
    const [tabKey, setTabKey] = useState('setting');
    const [visible, setVisible] = useState(false);
    const [uploadTaskList, setUploadTaskList] = useState([]);
    const [tabs, setTabs] = useState([
        {
            key: 'setting',
            type: 'setting',
            sessionKey: 'setting',
            label: '服务器列表',
            closable: false,
        },
        {
            key: 'command',
            type: 'command',
            sessionKey: 'command',
            label: '命令行列表',
            closable: false,
        }
    ]);
    useEffect(() => {
        initSession();
    }, []);

    const initSession = async function () {
        console.log('Initializing session...');
        let result = await getSessionList();
        let newTabs = []
        for (let i = 0; i < result.length; i++) {
            let server = await getServerByID(result[i].server_id);
            if (server == null) {
                await deleteSession(result[i].id);
            }
            newTabs.push({
                key: result[i].session_key, // 使用唯一的tab key
                type: result[i].type,
                session_key: result[i].session_key,
                label: getTabName(server),
                closable: true,
            })
        }
        setTabs([...tabs, ...newTabs])
    }


    const getTabName = (data) => {
        return data.name + '-' + data.server
    }

    const handleConnect = async function (server, type = 'ssh', isTest = false) {
        console.log('Connecting to server:', server, randomSessionKey());

        // 测试连接时不显示全局loading消息，避免干扰用户体验
        if (!isTest) {
            messageApi.open({
                type: 'loading',
                content: 'Connecting...',
                duration: 0,
            });
        }

        let sessionKey = isTest ? 'test_' + randomSessionKey() : randomSessionKey();
        let connectKey = await sshConnectByPassword(sessionKey, server.server, server.port, server.username, server.password)

        if (!isTest) {
            messageApi.destroy();
        }

        if (connectKey.error != undefined && connectKey.error.length > 0) {
            if (!isTest) {
                messageApi.open({
                    type: 'error',
                    content: '连接失败：' + connectKey.error,
                });
            }
            return null
        }

        // 测试连接模式：直接返回连接结果，不创建会话或标签页
        if (isTest) {
            console.log('Test connection successful with session key:', connectKey);
            return connectKey;
        }

        if (type == "system") {
            return connectKey
        }

        console.log('Connected with session key:', connectKey);

        let sessionResult = await createSession(connectKey, server.id + '', getDefaultUserPath(server.username), type); // 添加type字段
        const newTab = {
            key: connectKey,
            type: type,
            session_key: connectKey,
            label: getTabName(server),
            closable: true,
        };
        setTabs([...tabs, newTab]);
        setTabKey(connectKey);
    }


    const handleTabChange = async (tabKey) => {
        if (tabKey == 'setting' || tabKey == 'command') {
            setTabKey(tabKey);
            return;
        }

        // 找到对应的tab对象
        const tab = tabs.find(t => t.key === tabKey);
        if (!tab) return;


        const sessionKey = tab.session_key;
        let result = await isSessionConnected(sessionKey);
        console.log('Session connected:', result);
        if (!result) {
            let server = await getServerBySessionKey(sessionKey);
            messageApi.open({
                type: 'loading',
                content: '重新连接中...',
                duration: 0,
            });
            let connectResult = await sshConnectByPassword(sessionKey, server.server, server.port, server.username, server.password);
            messageApi.destroy();
            if (connectResult.error != undefined && connectResult.error.length > 0) {
                messageApi.open({
                    type: 'error',
                    content: '连接失败：' + connectResult.error,
                });
                return;
            }
        }
        setTabKey(tabKey);
    }

    const handleTabRemove = async (targetKey) => {
        // 找到对应的tab对象
        const tabToRemove = tabs.find(tab => tab.key === targetKey);
        if (!tabToRemove) return;

        const sessionKeyToRemove = tabToRemove.session_key;

        let disconnectResult = await sshDisconnect(sessionKeyToRemove);
        console.log('Disconnected with result:', disconnectResult);
        let deleteResult = await deleteSession(sessionKeyToRemove);
        console.log('Deleted with result:', deleteResult);
        const newTabs = tabs.filter(tab => tab.key !== targetKey);
        console.log('New tabs:', newTabs);
        setTabs(newTabs);

        // If the active tab is being removed, switch to the last tab
        if (tabKey === sessionKeyToRemove) {
            setTabKey('setting');
        }
    }

    const tabItems = tabs.map((tab, index) => {
        let tabData = {
            key: tab.key,
            label: (
                <span>
                    {tab.label}
                    {tab.closable && (
                        <CloseOutlined
                            style={{ marginLeft: 8 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleTabRemove(tab.key);
                            }}
                        />
                    )}
                </span>
            )
        }
        switch (tab.type) {
            case 'setting':
                tabData.children = <Setting onConnect={handleConnect} />
                break;
            case 'command':
                tabData.children = <Command />
                break;
            default:
                tabData.children = <SSHConnection sessionKey={tab.session_key} />
                break;
        }
        return tabData;
    });

    
    const showUploadTaskList = async () => {
        setVisible(true);
        toUploadTaskList();
    }
    const toUploadTaskList = async () => {
        if (!visible) return;
        setTimeout(async () => {
            let result = await getUploadTaskList();
            if (result.error != undefined) {
                console.log(result)
                return;
            }
            console.log('Upload task list:', result);
            setUploadTaskList(result.reverse());
            toUploadTaskList();
        }, 1000)
    }

    return (
        <div style={{ padding: '0 10px' }}>
            <Tabs
                items={tabItems}
                activeKey={tabKey}
                onChange={handleTabChange}
                tabBarExtraContent={
                    <Space>
                        <Button onClick={showUploadTaskList} type='link'>上传任务</Button>
                        <Button onClick={showUploadTaskList} type='link'>下载任务</Button>
                    </Space>
                }
            >
            </Tabs>
            {contextHolder}
            <Modal
                title="上传任务列表"
                open={visible}
                onCancel={() => {setVisible(false)}}
                footer={null}
                width={'60%'}
                style={{ width: '80%' }}
            >
                <Download data={uploadTaskList} />
            </Modal>
        </div>
    );
}

function Download(props) {
    if (props.data.length == 0) {
        return (
            <div>
                <p>暂无上传任务</p>
            </div>
        )
    }
    return (
        <div>
            {
                props.data.map((item) => (
                    <Card title={<>
                        {item.local_file}
                        <br />
                        {item.remote_dir}
                    </>}>
                        <p>
                            上传文件：[{item.current_file_index}/{item.total_files}]{item.current_file}
                        </p>
                        <p>
                            进度：{item.upload_size}
                        </p>
                        <p>
                            状态：{item.status}
                        </p>
                        <p>
                            消息：{item.message}
                        </p>
                    </Card>
                ))
            }
        </div>
    )
}
