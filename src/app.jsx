import React, { useState, useEffect } from 'react';
import { Card, message } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import Setting from './component/setting';
import Command from './component/command';
import SSHConnection from './component/ssh';
import { sshConnectByPassword, sshDisconnect, isSessionConnected } from './service/invoke';
import { createSession, deleteSession, getSessionList, getServerByID, getServerBySessionKey } from './service/database';


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
    const [sessionKey, setSessionKey] = useState('setting');
    const [tabs, setTabs] = useState([
        {
            key: 'setting',
            label: '服务器列表',
            closable: false,
        },
        {
            key: 'command',
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
                key: result[i].session_key,
                label: server.name + result[i].id,
                closable: true,
            })
        }
        setTabs([...tabs, ...newTabs])
    }


    const handleConnect = async function (server) {
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

        let sessionResult = await createSession(connectKey, server.id + '', getDefaultUserPath(server.username));
        const newTab = {
            key: connectKey,
            label: server.name + sessionResult.lastInsertId,
            closable: true,
        };
        setTabs([...tabs, newTab]);
        setSessionKey(connectKey);
    }

    const handleTabChange = async (key) => {
        if (key == 'setting' || key == 'command') {
            setSessionKey(key);
            return;
        }
        let result = await isSessionConnected(key);
        console.log('Session connected:', result);
        if (!result) {
            let server = await getServerBySessionKey(key);
            messageApi.open({
                type: 'loading',
                content: '重新连接中...',
                duration: 0,
            });
            let connectResult = await sshConnectByPassword(key, server.server, server.port, server.username, server.password);
            messageApi.destroy();
            if (connectResult.error != undefined && connectResult.error.length > 0) {
                messageApi.open({
                    type: 'error',
                    content: '连接失败：' + connectResult.error,
                });
                return;
            }
        }
        console.log('Tab changed to:', key);
        setSessionKey(key);
    }

    const handleTabRemove = async (targetKey) => {
        let disconnectResult = await sshDisconnect(targetKey);
        console.log('Disconnected with result:', disconnectResult);
        let deleteResult = await deleteSession(targetKey);
        console.log('Deleted with result:', deleteResult);
        const newTabs = tabs.filter(tab => tab.key !== targetKey);
        console.log('New tabs:', newTabs);
        setTabs(newTabs);

        // If the active tab is being removed, switch to the last tab
        if (sessionKey === targetKey) {
            const lastTab = newTabs[newTabs.length - 1];
            setSessionKey(lastTab?.key || 'setting');
        }
    }

    const tabItems = tabs.map((tab,index) => ({
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
    }));

    return (
        <div style={{ padding: 20 }}>
            <Card
                tabList={tabItems}
                activeTabKey={sessionKey}
                onTabChange={handleTabChange}
                footer={null}
            >
                {sessionKey === 'setting' ? <Setting onConnect={handleConnect} /> : 
                 sessionKey === 'command' ? <Command /> : 
                 <SSHConnection sessionKey={sessionKey} />}
            </Card>
            {contextHolder}
        </div>
    );
}
