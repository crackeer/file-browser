import React, { useState } from 'react';
import { Card } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import Setting from './component/setting';
import SSHConnection from './component/ssh';
import { sshConnectByPassword, sshDisconnect } from './service/invoke';
import {createSession, deleteSession} from './service/database';

function randomSessionKey() {
  return Math.random().toString(36).slice(2, 12);
}

function getDefaultUserPath(username) {
    if(username == 'root') {
        return "/root"
    }
    return "/home/" + username
}

export default function App() {
    const [sessionKey, setSessionKey] = useState('setting');
    const [tabs, setTabs] = useState([
        {
            key: 'setting',
            label: 'Setting',
            closable: false,
        }
    ]);

    const handleConnect = async function(server) {
        console.log('Connecting to server:', server, randomSessionKey());
        let connectKey = await sshConnectByPassword(randomSessionKey(), server.server, server.port, server.username, server.password)
        if (connectKey.error != undefined && connectKey.error.length > 0) {
            messageApi.open({
                type: 'error',
                content: '连接失败：' + connectKey.error,
            });
            return
        }
        console.log('Connected with session key:', connectKey);

        await createSession(connectKey, server.id + '', getDefaultUserPath(server.username));
        const newTab = {
            key: connectKey,
            label: server.name,
            closable: true,
        };
        setTabs([...tabs, newTab]);
        setSessionKey(connectKey);
    }

    function handleTabChange(key) {
        setSessionKey(key);
    }

    const handleTabRemove = async (targetKey) => {
        await sshDisconnect(targetKey);
        await deleteSession(targetKey);
        const newTabs = tabs.filter(tab => tab.key !== targetKey);
        setTabs(newTabs);

        // If the active tab is being removed, switch to the last tab
        if (activeKey === targetKey) {
            const lastTab = newTabs[newTabs.length - 1];
            setSessionKey(lastTab?.key || 'setting');
        }
    }

    const tabItems = tabs.map(tab => ({
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
        <div style={{ padding: 20}}>
            <Card
                tabList={tabItems}
                activeTabKey={sessionKey}
                onTabChange={handleTabChange}
                footer={null}
            >
                {sessionKey === 'setting' ? <Setting onConnect={handleConnect} /> : <SSHConnection sessionKey={sessionKey} />}
            </Card>
        </div>
    );
}
