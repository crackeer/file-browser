import React, { useState, useEffect } from 'react';
import { Card, message, Tabs } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import Setting from './component/setting';
import Command from './component/command';
import SSHConnection from './component/ssh';
import K3sManagement from './component/k3s';
import SystemManagement from './component/system';
import { sshConnectByPassword, sshDisconnect, isSessionConnected } from './service/invoke';
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

export default function App() {
    const [messageApi, contextHolder] = message.useMessage();
    const [tabKey, setTabKey] = useState('setting');
    const [tabs, setTabs] = useState([
        {
            key: 'setting',
            type : 'setting',
            sessionKey: 'setting',
            label: '服务器列表',
            closable: false,
        },
        {
            key: 'command',
            type : 'command',
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
                type : result[i].type,
                session_key : result[i].session_key,
                label: getTabName(result[i].type, server.name, result[i].id),
                closable: true,
            })
        }
        setTabs([...tabs, ...newTabs])
    }

    
    const getTabName = (type, name, id) => {
        if (type === 'k3s') {
            return '(K3s)' + name
        } else if (type === 'system') {
            return  '(System)' + name
        } else {
            return '(File)' + name + '-'
        }
    }

    const handleConnect = async function (server, type = 'ssh') {
        console.log('Connecting to server:', server, randomSessionKey());
        messageApi.open({
            type: 'loading',
            content: 'Connecting...',
            duration: 0,
        });
        let connectKey = await sshConnectByPassword(randomSessionKey(), server.server, server.port, server.username, server.password)
        messageApi.destroy();
        if (connectKey.error != undefined && connectKey.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '连接失败：' + connectKey.error,
            });
            return
        }
        console.log('Connected with session key:', connectKey);

        let sessionResult = await createSession(connectKey, server.id + '', getDefaultUserPath(server.username), type); // 添加type字段
        const newTab = {
            key: connectKey,
            type : type,
            session_key : connectKey,
            label: getTabName(type, server.name, sessionResult.id),
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

    const tabItems = tabs.map((tab,index) => {
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
            case 'k3s':
                tabData.children = <K3sManagement sessionKey={tab.session_key} />
                break;
            case 'system':
                tabData.children = <SystemManagement sessionKey={tab.session_key} />
                break;
            default:
                tabData.children = <SSHConnection sessionKey={tab.session_key} />
                break;
        }
        return tabData;
    });

    return (
        <div style={{ padding: 20 }}>
            <Card
                tabList={tabItems}
                activeTabKey={tabKey}
                onTabChange={handleTabChange}
                footer={null}
            >
            </Card>
            {contextHolder}
        </div>
    );
}
