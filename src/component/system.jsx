import React, { useEffect, useState } from 'react';
import { Button, Space, Tabs, Modal, Table, Typography, Card, message, Spin, Select, Statistic } from 'antd';
import { SyncOutlined, InfoCircleOutlined, DatabaseOutlined, BarChartOutlined, SettingOutlined, LinkOutlined } from '@ant-design/icons';
import { sshExecuteCmd } from "../service/invoke"
import lodash from 'lodash'
const { Link } = Typography;
const { Option } = Select;

const SYSTEM_INFO_COMMANDS = {
  disk: 'df -h',
  mounts: 'mount | grep -v tmpfs | grep -v proc | grep -v sysfs | grep -v devtmpfs',
  memory: 'free -h',
  services: 'systemctl list-units --type=service --state=running',
  ports: 'ss -tuln',
  cpu: 'lscpu | grep -E "Model name|Architecture|CPU\(s\):"',
  os: 'cat /etc/os-release | grep -E "NAME|VERSION"',
  uptime: 'uptime'
};

export default function SystemManagement({ sessionKey }) {
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    
    // System info states
    const [systemInfo, setSystemInfo] = useState({
        disk: [],
        mounts: [],
        memory: {},
        services: [],
        ports: [],
        cpu: {},
        os: {},
        uptime: ''
    });
    
    // 初始化加载
    useEffect(() => {
        loadSystemInfo();
    }, [sessionKey]);
    
    // 加载所有系统信息
    const loadSystemInfo = async () => {
        setLoading(true);
        try {
            // 并行加载所有系统信息
            const [diskResult, mountsResult, memoryResult, servicesResult, portsResult, cpuResult, osResult, uptimeResult] = await Promise.all([
                sshExecuteCmd(sessionKey, SYSTEM_INFO_COMMANDS.disk),
                sshExecuteCmd(sessionKey, SYSTEM_INFO_COMMANDS.mounts),
                sshExecuteCmd(sessionKey, SYSTEM_INFO_COMMANDS.memory),
                sshExecuteCmd(sessionKey, SYSTEM_INFO_COMMANDS.services),
                sshExecuteCmd(sessionKey, SYSTEM_INFO_COMMANDS.ports),
                sshExecuteCmd(sessionKey, SYSTEM_INFO_COMMANDS.cpu),
                sshExecuteCmd(sessionKey, SYSTEM_INFO_COMMANDS.os),
                sshExecuteCmd(sessionKey, SYSTEM_INFO_COMMANDS.uptime)
            ]);
            
            // 处理结果
            setSystemInfo({
                disk: parseDiskInfo(diskResult),
                mounts: parseMountsInfo(mountsResult),
                memory: parseMemoryInfo(memoryResult),
                services: parseServicesInfo(servicesResult),
                ports: parsePortsInfo(portsResult),
                cpu: parseCpuInfo(cpuResult),
                os: parseOsInfo(osResult),
                uptime: uptimeResult.trim()
            });
            
            messageApi.success('系统信息加载成功');
        } catch (error) {
            messageApi.error('加载系统信息失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };
    
    // 解析磁盘信息
    const parseDiskInfo = (output) => {
        const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('Filesystem'));
        return lines.map(line => {
            const parts = line.split(/\s+/);
            return {
                key: parts[0],
                filesystem: parts[0],
                size: parts[1],
                used: parts[2],
                available: parts[3],
                usePercent: parts[4],
                mountedOn: parts[5]
            };
        });
    };
    
    // 解析挂载信息
    const parseMountsInfo = (output) => {
        const lines = output.split('\n').filter(line => line.trim());
        return lines.map((line, index) => {
            const parts = line.split(/\s+/);
            return {
                key: index,
                device: parts[0],
                mountPoint: parts[2],
                filesystem: parts[4]
            };
        });
    };
    
    // 解析内存信息
    const parseMemoryInfo = (output) => {
        const lines = output.split('\n').filter(line => line.trim());
        const memory = {};
        
        lines.forEach(line => {
            if (line.startsWith('Mem:')) {
                const parts = line.split(/\s+/);
                memory.total = parts[1];
                memory.used = parts[2];
                memory.free = parts[3];
                memory.shared = parts[4];
                memory.buffCache = parts[5];
                memory.available = parts[6];
            }
        });
        
        return memory;
    };
    
    // 解析服务信息
    const parseServicesInfo = (output) => {
        const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('UNIT'));
        return lines.map((line, index) => {
            const parts = line.split(/\s+/);
            return {
                key: index,
                unit: parts[0],
                load: parts[1],
                active: parts[2],
                sub: parts[3],
                description: parts.slice(4).join(' ')
            };
        });
    };
    
    // 解析端口信息
    const parsePortsInfo = (output) => {
        const lines = output.split('\n').filter(line => line.trim() && !line.startsWith('State'));
        return lines.map((line, index) => {
            const parts = line.split(/\s+/);
            return {
                key: index,
                state: parts[0],
                recvQ: parts[1],
                sendQ: parts[2],
                localAddr: parts[3],
                peerAddr: parts[4],
                process: parts[5] || '-'
            };
        });
    };
    
    // 解析CPU信息
    const parseCpuInfo = (output) => {
        const lines = output.split('\n').filter(line => line.trim());
        const cpu = {};
        
        lines.forEach(line => {
            if (line.includes('Model name:')) {
                cpu.model = line.split(':')[1].trim();
            } else if (line.includes('Architecture:')) {
                cpu.architecture = line.split(':')[1].trim();
            } else if (line.includes('CPU(s):')) {
                cpu.count = line.split(':')[1].trim();
            }
        });
        
        return cpu;
    };
    
    // 解析操作系统信息
    const parseOsInfo = (output) => {
        const lines = output.split('\n').filter(line => line.trim());
        const os = {};
        
        lines.forEach(line => {
            if (line.includes('NAME=')) {
                os.name = line.split('=')[1].replace(/"/g, '');
            } else if (line.includes('VERSION=')) {
                os.version = line.split('=')[1].replace(/"/g, '');
            }
        });
        
        return os;
    };
    
    // 刷新系统信息
    const refreshSystemInfo = () => {
        loadSystemInfo();
    };
    
    // 磁盘信息表格列
    const diskColumns = [
        { title: '文件系统', dataIndex: 'filesystem', key: 'filesystem' },
        { title: '总大小', dataIndex: 'size', key: 'size' },
        { title: '已使用', dataIndex: 'used', key: 'used' },
        { title: '可用', dataIndex: 'available', key: 'available' },
        { title: '使用率', dataIndex: 'usePercent', key: 'usePercent' },
        { title: '挂载点', dataIndex: 'mountedOn', key: 'mountedOn' }
    ];
    
    // 挂载信息表格列
    const mountsColumns = [
        { title: '设备', dataIndex: 'device', key: 'device' },
        { title: '挂载点', dataIndex: 'mountPoint', key: 'mountPoint' },
        { title: '文件系统', dataIndex: 'filesystem', key: 'filesystem' }
    ];
    
    // 服务信息表格列
    const servicesColumns = [
        { title: '服务单元', dataIndex: 'unit', key: 'unit' },
        { title: '加载状态', dataIndex: 'load', key: 'load' },
        { title: '活跃状态', dataIndex: 'active', key: 'active' },
        { title: '子状态', dataIndex: 'sub', key: 'sub' },
        { title: '描述', dataIndex: 'description', key: 'description' }
    ];
    
    // 端口信息表格列
    const portsColumns = [
        { title: '状态', dataIndex: 'state', key: 'state' },
        { title: '本地地址', dataIndex: 'localAddr', key: 'localAddr' },
        { title: '远程地址', dataIndex: 'peerAddr', key: 'peerAddr' },
        { title: '进程', dataIndex: 'process', key: 'process' }
    ];
    
    return (
        <div>
            {messageCtxHandler}
            
            {/* 顶部控制栏 */}
            <Card size="small" type="inner" style={{ marginBottom: 15 }}>
                <Space>
                    <Button 
                        type="primary" 
                        icon={<SyncOutlined />} 
                        onClick={refreshSystemInfo}
                        loading={loading}
                    >
                        刷新系统信息
                    </Button>
                </Space>
            </Card>
            
            {/* 系统概览 */}
            <Card size="small" type="inner" style={{ marginBottom: 15 }} title="系统概览">
                <Spin spinning={loading}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                        <Card size="small">
                            <Statistic 
                                title="操作系统" 
                                value={systemInfo.os.name || '-'} 
                                suffix={systemInfo.os.version || ''}
                                prefix={<InfoCircleOutlined />}
                            />
                        </Card>
                        <Card size="small">
                            <Statistic 
                                title="CPU" 
                                value={systemInfo.cpu.count || '-'} 
                                suffix="核心"
                                prefix={<SettingOutlined />}
                                extra={systemInfo.cpu.model || ''}
                            />
                        </Card>
                        <Card size="small">
                            <Statistic 
                                title="内存" 
                                value={systemInfo.memory.total || '-'} 
                                suffix=""
                                prefix={<BarChartOutlined />}
                                extra={`已使用: ${systemInfo.memory.used || '-'} / 可用: ${systemInfo.memory.available || '-'}`}
                            />
                        </Card>
                        <Card size="small">
                            <Statistic 
                                title="正常运行时间" 
                                value={systemInfo.uptime || '-'}
                                prefix={<LinkOutlined />}
                            />
                        </Card>
                    </div>
                </Spin>
            </Card>
            
            {/* 详细信息标签页 */}
            <Tabs 
                activeKey={activeTab} 
                onChange={setActiveTab}
                type="card"
                items={[
                    {
                        key: 'disk',
                        label: (
                            <span>
                                <DatabaseOutlined />
                                磁盘信息
                            </span>
                        ),
                        children: (
                            <Card size="small" type="inner">
                                <Table
                                    dataSource={systemInfo.disk}
                                    columns={diskColumns}
                                    size="small"
                                    bordered={true}
                                    pagination={{ pageSize: 10 }}
                                    loading={loading}
                                />
                            </Card>
                        )
                    },
                    {
                        key: 'mounts',
                        label: (
                            <span>
                                <LinkOutlined />
                                挂载信息
                            </span>
                        ),
                        children: (
                            <Card size="small" type="inner">
                                <Table
                                    dataSource={systemInfo.mounts}
                                    columns={mountsColumns}
                                    size="small"
                                    bordered={true}
                                    pagination={{ pageSize: 10 }}
                                    loading={loading}
                                />
                            </Card>
                        )
                    },
                    {
                        key: 'services',
                        label: (
                            <span>
                                <SettingOutlined />
                                服务信息
                            </span>
                        ),
                        children: (
                            <Card size="small" type="inner">
                                <Table
                                    dataSource={systemInfo.services}
                                    columns={servicesColumns}
                                    size="small"
                                    bordered={true}
                                    pagination={{ pageSize: 10 }}
                                    loading={loading}
                                />
                            </Card>
                        )
                    },
                    {
                        key: 'ports',
                        label: (
                            <span>
                                <LinkOutlined />
                                端口占用
                            </span>
                        ),
                        children: (
                            <Card size="small" type="inner">
                                <Table
                                    dataSource={systemInfo.ports}
                                    columns={portsColumns}
                                    size="small"
                                    bordered={true}
                                    pagination={{ pageSize: 10 }}
                                    loading={loading}
                                />
                            </Card>
                        )
                    }
                ]}
            />
        </div>
    );
}