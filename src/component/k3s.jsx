import React, { useEffect, useState } from 'react';
import { Button, Space, Tabs, Modal, Table, Typography, Card, message, Spin, Dropdown, Input, Empty, Select } from 'antd';
import { SyncOutlined} from '@ant-design/icons';
import { sshExecuteCmd } from "../service/invoke"
import lodash from 'lodash'
const { Link } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export default function K3sManagement({ sessionKey }) {
    const [modal, contextHolder] = Modal.useModal();
    const [messageApi, messageCtxHandler] = message.useMessage();
    const [loading, setLoading] = useState(false);
    
    // K3s specific states
    const [namespaces, setNamespaces] = useState([]);
    const [currentNamespace, setCurrentNamespace] = useState('default');
    const [apiResources, setApiResources] = useState([]);
    const [selectedResource, setSelectedResource] = useState('pods');
    const [resourceData, setResourceData] = useState([]);
    const [filteredData, setFilteredData] = useState([]);
    const [resourceColumns, setResourceColumns] = useState([]);
    const [resourceDetails, setResourceDetails] = useState(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [showRawYamlModal, setShowRawYamlModal] = useState(false);
    const [rawYaml, setRawYaml] = useState('');
    const [loadingYaml, setLoadingYaml] = useState(false);
    const [searchText, setSearchText] = useState('');
    
    // 初始化加载
    useEffect(() => {
        loadNamespaces();
    }, [sessionKey]);
    
    // 当namespace改变时，重新加载资源
    useEffect(() => {
        if (currentNamespace) {
            loadApiResources();
        }
    }, [currentNamespace]);
    
    // 当选择的资源类型改变时，重新加载数据
    useEffect(() => {
        if (currentNamespace && selectedResource) {
            loadResourceData();
        }
    }, [currentNamespace, selectedResource]);
    
    // 搜索过滤逻辑
    useEffect(() => {
        if (!searchText) {
            setFilteredData(resourceData);
        } else {
            const filtered = resourceData.filter(item => 
                item.name.toLowerCase().includes(searchText.toLowerCase())
            );
            setFilteredData(filtered);
        }
    }, [searchText, resourceData]);
    
    // 加载所有namespace
    const loadNamespaces = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 'k3s kubectl get namespaces -o json');
            if (result.error) {
                messageApi.error('获取namespace列表失败: ' + result.error);
                setLoading(false);
                return;
            }
            
            const namespaces = JSON.parse(result).items.map(ns => ns.metadata.name);
            setNamespaces(namespaces);
            
            // 如果默认namespace存在，则设置为当前namespace
            if (namespaces.includes('default')) {
                setCurrentNamespace('default');
            } else if (namespaces.length > 0) {
                setCurrentNamespace(namespaces[0]);
            }
        } catch (error) {
            messageApi.error('处理namespace数据失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };
    
    // 加载固定的API资源列表
    const loadApiResources = async () => {
        try {
            // 默认只展示固定的资源类型
            const fixedResources = ['pods', 'services', 'deployments', 'statefulsets', 'ingressroutes', "configmaps"];
            
            setApiResources(fixedResources);
            
            // 只有在selectedResource为空时才设置默认值，避免切换namespace时重置
            if (!selectedResource) {
                setSelectedResource('pods');
            }
        } catch (error) {
            messageApi.error('处理API资源数据失败: ' + error.message);
        }
    };
    
    // 加载指定资源的数据
    const loadResourceData = async () => {
        setLoading(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get ${selectedResource} -n ${currentNamespace} -o json`);
            
            if (result.error) {
                messageApi.error(`获取${selectedResource}数据失败: ` + result.error);
                setResourceData([]);
                setResourceColumns([]);
                setLoading(false);
                return;
            }
            
            const data = JSON.parse(result);
            if (data.items && Array.isArray(data.items)) {
                // 处理资源数据，提取公共字段
                const items = processResourceItems(data.items);
                setResourceData(items);
                setFilteredData(items);
                
                // 动态生成表格列
                const columns = generateResourceColumns(items);
                setResourceColumns(columns);
            } else {
                messageApi.warning(`没有找到${selectedResource}的数据`);
                setResourceData([]);
                setFilteredData([]);
                setResourceColumns([]);
            }
        } catch (error) {
            messageApi.error('处理资源数据失败: ' + error.message);
            setResourceData([]);
            setFilteredData([]);
            setResourceColumns([]);
        } finally {
            setLoading(false);
        }
    };
    
    // 处理资源项，提取关键信息
    const processResourceItems = (items) => {
        return items.map(item => {
            // 提取基本信息
            const baseInfo = {
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                age: calculateAge(item.metadata.creationTimestamp),
                _raw: item // 保存原始数据用于查看详情
            };
            
            // 根据资源类型提取额外信息
            switch(selectedResource) {
                case 'pods':
                    return {
                        ...baseInfo,
                        status: item.status.phase,
                        ready: item.status.containerStatuses ? 
                            item.status.containerStatuses.filter(c => c.ready).length + '/' + item.status.containerStatuses.length : 
                            '0/0',
                        restarts: item.status.containerStatuses ? 
                            item.status.containerStatuses.reduce((sum, c) => sum + (c.restartCount || 0), 0) : 
                            0,
                        node: item.spec.nodeName || '-'  
                    };
                case 'services':
                    return {
                        ...baseInfo,
                        type: item.spec.type,
                        clusterIP: item.spec.clusterIP || '-',
                        ports: item.spec.ports ? 
                            item.spec.ports.map(p => `${p.port}:${p.targetPort}`).join(', ') : 
                            '-'
                    };
                case 'deployments':
                case 'statefulsets':
                case 'daemonsets':
                    return {
                        ...baseInfo,
                        ready: item.status.readyReplicas || 0 + '/' + (item.status.replicas || 0),
                        upToDate: item.status.updatedReplicas || 0,
                        available: item.status.availableReplicas || 0,
                        age: calculateAge(item.metadata.creationTimestamp)
                    };
                case 'configmaps':
                case 'secrets':
                    return {
                        ...baseInfo,
                        data: Object.keys(item.data || {}).length
                    };
                case 'ingressroutes':
                    return {
                        ...baseInfo,
                        namespace: item.metadata.namespace,
                        host: item.spec.routes ? item.spec.routes[0]?.match?.host || '-' : '-',
                        service: item.spec.routes ? item.spec.routes[0]?.services[0]?.name || '-' : '-',
                        port: item.spec.routes ? item.spec.routes[0]?.services[0]?.port || '-' : '-'
                    };
                default:
                    // 对于其他资源类型，尝试提取一些通用信息
                    return {
                        ...baseInfo,
                        labels: item.metadata.labels ? Object.entries(item.metadata.labels).map(([k, v]) => `${k}=${v}`).join(', ') : '-'
                    };
            }
        });
    };
    
    // 生成表格列配置
    const generateResourceColumns = (items) => {
        if (!items || items.length === 0) return [];
        
        // 获取第一个项目的所有键，过滤掉namespace和_raw
        const firstItem = items[0];
        const keys = Object.keys(firstItem).filter(key => key !== '_raw' && key !== 'namespace');
        
        // 基础列配置
        const columns = keys.map(key => {
            let title = key.charAt(0).toUpperCase() + key.slice(1);
            
            // 自定义一些列的渲染方式
            if (key === 'name') {
                return {
                    title: '名称',
                    dataIndex: key,
                    key: key,
                    render: (text, record) => (
                        <a href="javascript:void(0)" onClick={() => showResourceDetails(record)}>
                            {text}
                        </a>
                    )
                };
            }
            
            return {
                title: title,
                dataIndex: key,
                key: key
            };
        });
        
        // 添加操作列
        columns.push({
            title: '操作',
            key: 'actions',
            render: (_, record) => {
                const actions = [
                    <Button size="small" onClick={() => showResourceDetails(record)} key="details">
                        详情
                    </Button>,
                    <Button size="small" onClick={() => showResourceYaml(record.name)} key="yaml">
                        YAML
                    </Button>
                ];
                
                // 为pod、deploy、svc添加删除功能
                if (['pods', 'deployments', 'services'].includes(selectedResource)) {
                    actions.push(
                        <Button 
                            size="small" 
                            danger 
                            onClick={() => deleteResource(record.name)} 
                            key="delete"
                        >
                            删除
                        </Button>
                    );
                }
                
                // 为deploy添加rollout功能
                if (selectedResource === 'deployments') {
                    actions.push(
                        <Dropdown
                            menu={{
                                items: [
                                    { key: 'restart', label: '重启', onClick: () => rolloutRestart(record.name) },
                                    { key: 'history', label: '历史', onClick: () => rolloutHistory(record.name) },
                                    { key: 'status', label: '状态', onClick: () => rolloutStatus(record.name) }
                                ]
                            }}
                            trigger={['click']}
                            key="rollout"
                        >
                            <Button size="small">
                                滚动更新 <span style={{ marginLeft: '4px' }}>▼</span>
                            </Button>
                        </Dropdown>
                    );
                }
                
                return <Space>{actions}</Space>;
            }
        });
        
        return columns;
    };
    
    // 显示资源详情
    const showResourceDetails = (record) => {
        setResourceDetails(record._raw);
        setShowDetailsModal(true);
    };
    
    // 显示资源的YAML
    const showResourceYaml = async (resourceName) => {
        setLoadingYaml(true);
        try {
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl get ${selectedResource} ${resourceName} -n ${currentNamespace} -o yaml`);
            
            if (result.error) {
                messageApi.error('获取YAML失败: ' + result.error);
                return;
            }
            
            setRawYaml(result);
            setShowRawYamlModal(true);
        } catch (error) {
            messageApi.error('处理YAML数据失败: ' + error.message);
        } finally {
            setLoadingYaml(false);
        }
    };
    
    // 删除资源
    const deleteResource = async (resourceName) => {
        Modal.confirm({
            title: `确定要删除${selectedResource} ${resourceName}吗？`,
            content: '此操作不可恢复，请谨慎操作。',
            okText: '确定',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    setLoading(true);
                    let result = await sshExecuteCmd(sessionKey, 
                        `k3s kubectl delete ${selectedResource} ${resourceName} -n ${currentNamespace}`);
                    
                    if (result.error) {
                        messageApi.error(`删除${selectedResource}失败: ` + result.error);
                    } else {
                        messageApi.success(`删除${selectedResource}成功`);
                        // 重新加载资源数据
                        await loadResourceData();
                    }
                } catch (error) {
                    messageApi.error('处理删除操作失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        });
    };
    
    // 滚动更新-重启
    const rolloutRestart = async (resourceName) => {
        try {
            setLoading(true);
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl rollout restart deployment ${resourceName} -n ${currentNamespace}`);
            
            if (result.error) {
                messageApi.error('重启部署失败: ' + result.error);
            } else {
                messageApi.success('重启部署成功');
                // 重新加载资源数据
                await loadResourceData();
            }
        } catch (error) {
            messageApi.error('处理重启操作失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };
    
    // 滚动更新-历史
    const rolloutHistory = async (resourceName) => {
        try {
            setLoading(true);
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl rollout history deployment ${resourceName} -n ${currentNamespace}`);
            
            if (result.error) {
                messageApi.error('获取部署历史失败: ' + result.error);
            } else {
                Modal.info({
                    title: `${resourceName} 部署历史`,
                    content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>,
                    width: '80%'
                });
            }
        } catch (error) {
            messageApi.error('处理部署历史操作失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };
    
    // 滚动更新-状态
    const rolloutStatus = async (resourceName) => {
        try {
            setLoading(true);
            let result = await sshExecuteCmd(sessionKey, 
                `k3s kubectl rollout status deployment ${resourceName} -n ${currentNamespace}`);
            
            if (result.error) {
                messageApi.error('获取部署状态失败: ' + result.error);
            } else {
                Modal.info({
                    title: `${resourceName} 部署状态`,
                    content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result}</pre>,
                    width: '80%'
                });
            }
        } catch (error) {
            messageApi.error('处理部署状态操作失败: ' + error.message);
        } finally {
            setLoading(false);
        }
    };
    
    // 计算资源创建时间到现在的时间差
    const calculateAge = (timestamp) => {
        const now = new Date();
        const created = new Date(timestamp);
        const diffMs = now - created;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffDays > 0) return `${diffDays}d`;
        if (diffHours > 0) return `${diffHours}h`;
        if (diffMins > 0) return `${diffMins}m`;
        return '刚刚';
    };
    
    // 刷新当前资源数据
    const refreshResourceData = () => {
        loadResourceData();
    };
    
    // 执行自定义命令
    const executeCustomCommand = () => {
        Modal.confirm({
            title: '执行自定义kubectl命令',
            content: (
                <TextArea 
                    rows={4} 
                    placeholder="输入kubectl命令，例如: get pods -A"
                    id="custom-command"
                />
            ),
            onOk: async () => {
                const command = document.getElementById('custom-command').value;
                if (!command) {
                    messageApi.warning('请输入命令');
                    return;
                }
                
                setLoading(true);
                try {
                    const fullCommand = command.startsWith('k3s ') ? command : `k3s kubectl ${command}`;
                    let result = await sshExecuteCmd(sessionKey, fullCommand);
                    
                    Modal.info({
                        title: '命令执行结果',
                        content: <pre style={{ whiteSpace: 'pre-wrap' }}>{result.error || result}</pre>,
                        width: '80%'
                    });
                } catch (error) {
                    messageApi.error('执行命令失败: ' + error.message);
                } finally {
                    setLoading(false);
                }
            }
        });
    };
    
    return (
        <div>
            {messageCtxHandler}
            {contextHolder}
            
            <Card size="small" type="inner" style={{ marginBottom: 15 }}>
                <Space>
                    <span>Namespace:</span>
                    <Select
                        value={currentNamespace}
                        onChange={setCurrentNamespace}
                        style={{ width: 200 }}
                        loading={loading}
                    >
                        {namespaces.map(ns => (
                            <Option key={ns} value={ns}>{ns}</Option>
                        ))}
                    </Select>
                    
                    <Button 
                        type="primary" 
                        icon={<SyncOutlined />} 
                        onClick={refreshResourceData}
                    >
                        刷新
                    </Button>
                    
                    <Button 
                        
                        onClick={executeCustomCommand}
                    >
                        执行命令
                    </Button>
                </Space>
            </Card>
            
            {/* 垂直Tabs布局 */}
            <div style={{ display: 'flex', gap: '16px' }}>
                {/* 左侧垂直Tabs */}
                <div style={{ width: '120px' }}>
                    <Tabs
                        activeKey={selectedResource}
                        onChange={setSelectedResource}
                        type="card"
                        tabPosition="left"
                        style={{ height: '400px' }}
                    >
                        {apiResources.map(resource => (
                            <Tabs.TabPane 
                                tab={resource} 
                                key={resource}
                            />
                        ))}
                    </Tabs>
                </div>
                
                {/* 右侧资源列表表格 */}
                <div style={{ flex: 1 }}>
                    {/* 搜索框 */}
                    <div style={{ marginBottom: '16px' }}>
                        <Input
                            placeholder="按名称搜索"
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            allowClear
                            style={{ width: '200px' }}
                        />
                    </div>
                    
                    <Table
                        dataSource={filteredData}
                        columns={resourceColumns}
                        size="small"
                        bordered={true}
                        locale={{
                            emptyText: <Empty description="没有找到资源数据" />
                        }}
                        pagination={false}
                        rowKey={'name'}
                        scroll={{ y: '400px' }}
                        loading={loading}
                    />
                </div>
            </div>
            
            {/* 资源详情模态框 */}
            <Modal
                title={`${selectedResource} 详情: ${resourceDetails?.metadata?.name}`}
                open={showDetailsModal}
                onCancel={() => setShowDetailsModal(false)}
                footer={null}
                width={'80%'}
            >
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {JSON.stringify(resourceDetails, null, 2)}
                </pre>
            </Modal>
            
            {/* 资源YAML模态框 */}
            <Modal
                title={`${selectedResource} YAML: ${resourceDetails?.metadata?.name}`}
                open={showRawYamlModal}
                onCancel={() => setShowRawYamlModal(false)}
                footer={null}
                width={'80%'}
            >
                <Spin spinning={loadingYaml}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {rawYaml}
                    </pre>
                </Spin>
            </Modal>
        </div>
    );
}